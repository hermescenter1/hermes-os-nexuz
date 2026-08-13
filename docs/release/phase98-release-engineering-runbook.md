# Hermes OS — Phase 98 Release Engineering Runbook

Status: **Phase 98** · Owner: Application/release owner + Platform/SRE ·
Companion to `docs/release/disaster-recovery-runbook.md`,
`docs/release/incident-response-runbook.md` and
`docs/release/adr-phase98-release-strategy.md`.

Scope: how a Hermes OS production release is built, gated, rolled out, rolled
back, and versioned for `hermes-web` under the canonical Compose project
**`hermes`**. This document does not change the existing manual-only deploy
pipeline (`.github/workflows/deploy.yml`, `workflow_dispatch` + protected
`production` environment, pinned SHA) — it documents the Phase 98 release
engineering control plane that gates and journals that pipeline.

---

## 1. Release gates (fail-closed, in order)

A release must pass every gate below **before** any candidate container is
started against Production. Any gate failure blocks the release; none of
these gates may be bypassed to "get a release out."

### 1.1 Migration release gate

`scripts/dr/migration-gate.mjs` (`evaluateMigrationGate`) compares the
migration set the release will deploy against the migration set of the
currently-deployed release base (by SHA-256 of each `migration.sql`):

- **Historical mutation — unconditional block.** If any already-applied
  migration's SQL changed or disappeared between the release base and the
  target, `deployBlocked = true` regardless of anything else. Prisma
  migrations are append-only; a mutated/missing historical migration means
  the deployed database's migration history can no longer be trusted to
  match source.
- **New migration classification** (`scripts/dr/migration-sql-classify.mjs`,
  pure static analysis of `migration.sql`, comments stripped first):
  - `ADDITIVE_COMPATIBLE` — no dangerous pattern matched.
  - `FORWARD_ONLY_REQUIRES_BACKUP` — e.g. `ADD CONSTRAINT ... UNIQUE/FOREIGN
    KEY`, `SET NOT NULL`, `CREATE UNIQUE INDEX`, `ADD COLUMN ... NOT NULL`
    without a `DEFAULT`, an unbounded `UPDATE ... SET` without `WHERE`.
  - `BREAKING_OR_UNKNOWN` — e.g. `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`,
    `DELETE FROM`, `ALTER COLUMN ... TYPE`, `RENAME COLUMN`,
    `ALTER TABLE ... RENAME TO`, `DROP TYPE`, `DROP DATABASE`, `DROP SCHEMA`,
    or a new migration folder whose `migration.sql` is unreadable (treated as
    unknown, i.e. unsafe by default). **Unconditional block** — a
    `BREAKING_OR_UNKNOWN` migration never auto-deploys; a human must
    explicitly accept the risk out of band (and record that decision in the
    release manifest/journal).

### 1.2 Pre-migration verified-encrypted-backup gate (fail-closed)

`preMigrationBackupRequired = true` whenever `migrationClassification !==
NO_MIGRATION` (i.e. any new migration at all, even `ADDITIVE_COMPATIBLE`,
requires a fresh pre-migration backup — additive migrations are still schema
changes worth a restore point). The release **must not proceed to the migrate
step** (blue/green §2, step 3) until:

1. A fresh PostgreSQL backup has been taken and verified:
   ```bash
   HERMES_BACKUP_KEY_FILE=/secure/path/hermes-backup.key \
   HERMES_BACKUP_KEY_ID=<key-id> \
   bash scripts/backup-postgres.sh
   ```
2. The resulting `.hbk` artifact's `.meta.json` sidecar shows
   `"verified":true, "partial":false`.
3. The artifact reference (name + `transportSha256`) is recorded as the
   release's `backupArtifactRef` in the release journal (§4).

**Fail-closed conditions — the release is blocked, not merely warned, if:**

- No backup was taken for a release that ships any new migration.
- `verify-backup.sh` or `hbk.mjs verify` failed on the taken backup.
- `HERMES_BACKUP_KEY_FILE`/`HERMES_BACKUP_KEY_ID` are unset (the backup script
  itself already fails closed on this — see
  `docs/release/disaster-recovery-runbook.md`).
- The migration gate (§1.1) reports `deployBlocked: true` for any reason.

### 1.3 Release manifest gate

`scripts/dr/release-manifest.mjs` (`validateReleaseManifest`) rejects a
manifest, and therefore blocks the release, if:

- `targetGitSha` is not a 40-hex-char commit SHA.
- `previousGoodGitSha` is missing or not a 40-hex-char commit SHA
  (`RELEASE_WITHOUT_PREVIOUS_GOOD_SHA` / `INVALID_PREVIOUS_GOOD_GIT_SHA`) — a
  release with no proven rollback target is never allowed to start.
- `releaseVersion` is missing.
- `requiredHealthEndpoints` is empty (`RELEASE_WITHOUT_HEALTH_GATE`) — a
  release with no defined health gate is never allowed to start.
- `appRollbackClassification` is missing.
- The manifest contains anything that looks like a secret (recursive scan for
  `PASSWORD`/`SECRET`/`TOKEN`/`PRIVATE KEY`, credentialed connection strings,
  or a high-entropy hex/base64 blob under a key name suggestive of a secret) —
  `CONFIG_SECRET_VALUE_IN_MANIFEST`. `targetGitSha`, `previousGoodGitSha`,
  `schemaFingerprint` and `configurationManifestHash` are explicitly
  allowlisted as expected 40-hex-looking non-secret values.

---

## 2. Blue/green rollout sequence (`hermes-web`, `-p hermes`)

Decision record: `docs/release/adr-phase98-release-strategy.md` —
**BLUE_GREEN, application service only.** One canonical Compose project
`hermes`; PostgreSQL, Redis and Nginx are never duplicated; only the
`hermes-web` application container runs two colors (candidate + active)
during a rollout, both pointed at the same authoritative data stores.

The sequence is orchestrated by `scripts/dr/blue-green.mjs`
(`runBlueGreenRelease`), driven by an adapter that implements
`startCandidate`/`healthCheck`/`cutover`/`activeColor`/`retire` against the
Compose/Nginx primitives below, and tracked through the state machine in
`scripts/dr/release-state.mjs`.

### 2.1 Candidate build (state `INIT → CANDIDATE_BUILT`)

```bash
docker compose -p hermes -f docker-compose.prod.yml build hermes-web
# Start the inactive color (adapter.startCandidate) without touching the edge:
docker compose -p hermes -f docker-compose.prod.yml up -d --no-deps \
  --scale hermes-web=2 hermes-web   # or an equivalent blue/green container-name scheme
```

If the candidate fails to start, `CANDIDATE_START_FAILED` is returned and the
previous-good color remains untouched and active — no user impact.

### 2.2 Health gate BEFORE cutover (state `CANDIDATE_BUILT → CANDIDATE_HEALTHY`)

The candidate **must** pass its readiness probe (`/api/health/ready` against
the candidate container directly, not through the edge) before anything else
happens. An unhealthy candidate returns `UNHEALTHY_CANDIDATE_NO_CUTOVER`; the
candidate is retired and the previous-good color is never touched.

```bash
docker exec <candidate-container> curl -sf http://localhost:3000/api/health/ready
```

### 2.3 Migrate at the correct point (state `CANDIDATE_HEALTHY → MIGRATED → CUTOVER`)

Migration runs **only after** the candidate is confirmed healthy and **only
after** the pre-migration backup gate (§1.2) has passed, and **before**
cutover:

```bash
docker compose -p hermes -f docker-compose.prod.yml exec hermes-web \
  npx prisma migrate deploy
```

If there is no new migration, the state machine takes the `migrate_skip`
transition straight to `CUTOVER` — no unnecessary `migrate deploy` invocation.
If the migration itself fails, treat as `migrate_fail → ROLLED_BACK`: the
candidate is discarded, the previous-good color remains active, and the
pre-migration backup taken in §1.2 is the recovery point if any partial schema
change needs to be undone (DR runbook §Postgres).

### 2.4 Atomic Nginx cutover (state `CUTOVER`)

The edge (Nginx) is atomically repointed at the new candidate — e.g. via an
`upstream` config reload (`nginx -s reload`) against a config file that names
the candidate's container, never a mid-request partial switch. Active-color
state is recorded in the release-state journal (§4) so a stale/ambiguous
color state fails closed rather than guessing which color is live.

```bash
# Regenerate the upstream block to point at the healthy candidate, then:
docker exec hermes-nginx-1 nginx -s reload
```

If cutover itself fails, `CUTOVER_FAILED → ROLLED_BACK`: the previous-good
color remains the one Nginx was already pointed at.

### 2.5 Soak (state `CUTOVER → SOAK`)

Post-cutover health is re-checked. If it fails, the outcome depends on the
rollback classification (§3) — never a blind auto-rollback:

- `APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA` → atomic cutover back to the previous
  color, `POST_CUTOVER_ROLLED_BACK`.
- Otherwise → `POST_CUTOVER_INCIDENT`: `FAILED` state, escalate per the
  incident-response runbook §3.12. **The database is never auto-restored.**

### 2.6 Retire previous (state `SOAK → RETIRED_PREVIOUS`)

Once soak is confirmed healthy, the previous color is retired
(`adapter.retire(previousColor)`) — stop and remove its container, keeping
the shared volumes untouched. This is the terminal success state,
`RELEASED`.

---

## 3. Deterministic rollback

Rollback decisions are never ad hoc — they follow the classification computed
by `scripts/dr/release-state.mjs` (`classifyRollback`):

| `migrationClassification` | `appRollbackProven` | Result |
|---|---|---|
| `NO_MIGRATION` | — | `APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA` — no schema change shipped, old app code is always compatible. |
| `ADDITIVE_COMPATIBLE` / `FORWARD_ONLY_REQUIRES_BACKUP` | `true` | `APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA` — an app-only rollback has been rehearsed/proven to run correctly forward against the new schema. |
| `ADDITIVE_COMPATIBLE` / `FORWARD_ONLY_REQUIRES_BACKUP` | `false` | `APP_ROLLBACK_REQUIRES_DB_RESTORE` — app-only rollback not proven safe; treat as an incident requiring a DB-restore decision. |
| `BREAKING_OR_UNKNOWN` | — | `RELEASE_ROLLBACK_BLOCKED` — never auto-rollback; escalate to a human-decided recovery plan. |

Rollback execution (`scripts/dr/blue-green.mjs` `rollbackToPrevious`):

- `RELEASE_ROLLBACK_BLOCKED` → `ROLLBACK_BLOCKED`, no action taken; escalate.
- `APP_ROLLBACK_REQUIRES_DB_RESTORE` → `ROLLBACK_REQUIRES_DB_RESTORE`, no
  action taken; this is an operator incident decision (DB restore per the DR
  runbook, or a forward fix), never an automatic action.
- Otherwise → atomic `cutover(previousColor)`, `ROLLED_BACK`.

**Never auto-restore the Production database on a deploy failure.** A
DB-restore-backed rollback is always an explicit, human-authorized action
following the disaster-recovery runbook, never a side effect of a release
tool.

Hermes migrations are **forward-only** — there are no down-migrations. Schema
rollback, when required, means restoring PostgreSQL from the encrypted
pre-migration backup taken in §1.2, not reversing the migration SQL.

---

## 4. Release manifest & release-state journal

### 4.1 Release manifest

Built with `scripts/dr/release-manifest.mjs` (`buildReleaseManifest`) — a
fixed, deterministic field set (`manifestVersion`, `releaseVersion`,
`targetGitSha`, `previousGoodGitSha`, `createdAt`, `applicationImageRef`,
`schemaFingerprint`, `migrationList`, `migrationHashes`,
`migrationClassification`, `migrationRehearsalResult`,
`preMigrationBackupRequired`, `appRollbackClassification`,
`configurationManifestHash`, `releaseChecklistVersion`,
`changelogEntryPresent`, `releaseStrategy`, `requiredHealthEndpoints`),
hashed with the shared canonical-JSON codec
(`releaseManifestSha256` = SHA-256 of the canonical form, so two
structurally-equal manifests always hash identically regardless of field
order). Only safe/derived fields are ever populated — `applicationImageRef`
must be an actual image digest/ref, not merely a source SHA claiming to be a
reproducible build. Validated against §1.3 before a release proceeds.

### 4.2 Release-state journal

`scripts/dr/release-journal.mjs` — a small, dependency-free, append-only,
local log: one `ReleaseJournalEntry` per release attempt
(`releaseId`, `targetGitSha`, `previousGoodGitSha`, `manifestHash`,
`strategy`, `migrationClassification`, `backupArtifactRef`, `startedAt`,
`cutoverAt`, `result`, `activeImageRef`, `rollbackResult`). Writes are atomic
(write-to-temp, then rename over the real path, safe on both POSIX and NTFS),
so a reader never observes a half-written journal. The journal never contains
secret values — only non-secret metadata (git SHAs, hashes, refs, timestamps,
outcome strings). This is the record an operator reads during an incident to
reconstruct what happened without needing credentials.

---

## 5. Version tag policy

`scripts/dr/version-changelog.mjs` (`validateTagPolicy`):

- **SemVer only:** `vMAJOR.MINOR.PATCH` (e.g. `v1.2.3`). Anything else is
  `VERSION_TAG_POLICY:INVALID_SEMVER`.
- **`v1.0.0` is reserved for Phase 100.** Phase 98 releases must not tag
  `v1.0.0` — choose an appropriate pre-1.0 or patch/minor version consistent
  with the current release line. Phase 100 supplies the gate that must precede
  that tag: `v1.0.0` may be cut only when `npm run eval:phase100:closure`
  reports `GA_RELEASE_READY=YES` on the exact release commit
  (see `phase100-ga-closure-contract.md`).
- The tag's commit must be `git merge-base --is-ancestor`-reachable from
  `main` (`reachableFromMain`) — never release from a stray branch.
- The tag must have a matching `## [vX.Y.Z]` (or `## vX.Y.Z`) section in the
  changelog (`validateChangelogHasVersion`), otherwise
  `VERSION_TAG_POLICY:NO_MATCHING_CHANGELOG_SECTION`.
- The tag's bare version must equal the release manifest's `releaseVersion`
  (`VERSION_TAG_POLICY:MANIFEST_VERSION_MISMATCH` otherwise) — the manifest
  and the tag can never silently drift apart.
- **Deploy always resolves an exact commit SHA, never a mutable tag** — the
  existing deploy pipeline already pins the exact SHA
  (`.github/workflows/deploy.yml`); the tag is a human-readable release
  marker, not the deploy target.

## 6. Changelog policy

- Ongoing work accumulates under a `## [Unreleased]` (or `## Unreleased`)
  header (`extractUnreleasedSection`).
- Cutting a release moves that content under a new `## [vX.Y.Z]` header
  matching the release tag, satisfying §5's changelog-section requirement.
- The release manifest's `changelogEntryPresent` field must be `true` before
  the manifest can be considered complete for a tagged release.

---

## 7. How the assurance workflow gates a release

`.github/workflows/phase98-dr-release-assurance.yml` runs on every PR to
`main` (and the Phase 97 stacked base) — deploy-free, Production-free,
read-only-permissions, no secrets, no SSH, no Production host contact. It is
a prerequisite gate for merging release-engineering or DR changes, not the
Production deploy itself:

- **`phase98-offline`** — installs deps, generates the Prisma client,
  validates the schema, type-checks, lints, checks the configuration
  inventory is up to date and secret-free (`npm run config:inventory:check`),
  runs the Phase 95/96/97/98 offline evaluations, the focused Phase 98
  unit/integration tests, the full test suite, the production build, and the
  adversarial production-safety static review
  (`scripts/dr/production-safety-check.mjs`).
- **`phase98-encrypted-pg`** — a real PostgreSQL 16 rehearsal of the
  encrypted backup/restore mechanism (`phase98-encrypted-pg-rehearsal.mjs`)
  and the migration gate + rollback rehearsal
  (`phase98-migration-rollback-rehearsal.mjs`), against disposable,
  CI-only containers.
- **`phase98-full-stack`** — uploads/documents backup+restore rehearsal
  (`phase98-uploads-rehearsal.mjs`), the release rollback rehearsal exercising
  the blue/green mechanism (`phase98-release-rollback-rehearsal.mjs`), and a
  full-node recovery rehearsal against a disposable Compose project whose
  resources are namespaced `hermes98`/`hermes98test_` so they can never touch
  the canonical Production project `hermes`
  (`phase98-full-node-recovery.mjs`).

All gates are hard (no `continue-on-error`). A release-engineering or DR
change that does not pass all three jobs is not mergeable through normal
branch protection, and the mechanisms this workflow proves (migration gate,
pre-migration backup requirement, blue/green health-gated rollout,
deterministic rollback classification, full-node recovery) are exactly the
mechanisms a Production release is expected to exercise manually via the
existing `workflow_dispatch` deploy pipeline and the procedures in this
runbook. This CI workflow proves the **mechanism**; it does not itself deploy
to, or gate, a specific Production release — that remains the
Application/release owner's manual, protected-environment action.
