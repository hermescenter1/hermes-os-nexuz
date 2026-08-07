# Phase 97 — Architecture & Delivered Implementation

> This software provides compliance-control evidence and workflows.
> **It does not constitute legal advice or automatic certification.** A pack marked
> `READY` means its manifest was generated consistently from one database snapshot —
> nothing more.

Companion to `phase97-existing-state-matrix.md`. Phase 97 is **implemented and delivered**
(Draft PR #43, awaiting owner review, stacked on Draft PR #42). The design below is the
delivered design, not a proposal; §12 documents the final evidence-pack + Operations
Center implementation. Sections 1–11 record the incremental design history that led to it.

## 1. Stack & branch facts

```
agent/phase95-ai-governance-model-assurance
  ↓  agent/phase95-runtime-enforcement
  ↓  agent/phase96-commercialisation-billing-entitlements   fa461f1c
  ↓  agent/phase96-compliance-hotfix-integration            50888bd  (PR #42, Draft)
  ↓  agent/phase97-compliance-privacy-legal-readiness       50888bd  (base)
```

- Integration PR #42 is open (Draft) with the hotfix forward-ported by a real merge
  commit + one disclosed cross-platform LF hygiene commit. Local validation is fully
  green (tsc 0, lint 0, 5441 tests pass, build 0, both offline evals OK, env gate 0).
- CI does not auto-run on these bases (ci.yml is `PR → main` only); local validation
  is the record.

## 2. Design principles (non-negotiable)

- **Server-authoritative & fail-closed.** Reuse `requireComplianceOrgScope` /
  `requirePlatformSuperadmin`; never trust client `organizationId`.
- **Reuse before adding.** Extend `PrivacyRequest`, `LegalDocument`, `ConsentRecord`,
  `ProcessingActivity`, `DataExportRequest`, `DataDeletionRequest`, `AuditLog`. Add new
  models only for genuinely-absent concepts (LegalHold, Subprocessor, DataTransfer,
  ComplianceIncident, RetentionPolicy, ExportDownloadToken).
- **Additive, non-destructive migration only.** New nullable columns, new tables, new
  enum values. No edits to applied migrations. Legacy NULL rows quarantined, never
  back-filled with invented values.
- **No invented legal facts.** Durations, deadlines, lawful bases, notification
  decisions, contract/approval states default to `CONFIGURATION_REQUIRED` /
  `LEGAL_REVIEW_REQUIRED` and fail closed in evidence generation.
- **Destructive execution disabled by default.** Retention/erasure/export prod execution
  gated behind env flags that default false, following the OpenBao disabled-by-default
  pattern. This phase ships planners + dry-run + test-only adapters only.
- **Do not weaken** Phase 95 AI-governance, Phase 96 billing/entitlements, or the PR #41
  hotfix boundaries. Transfer register may *reference* Phase 95 provider-policy but a
  Phase-95 denial always wins.

## 3. Proposed data model (single additive migration)

Extend (additive nullable columns / new enum values):
- `ProcessingActivity`: `status`, `approvalState`, `reviewDate`, `riskClassification`,
  `specialCategory Boolean?`, `automatedDecision Boolean?`, `internationalTransfer Boolean?`,
  `dataOwner`, `systemOwner`, `subjectCategories Json?`, `sourceSystems Json?`,
  `destinationSystems Json?`, `retentionPolicyId?`.
- `PrivacyRequest`: extend `PrivacyRequestType` (+`RECTIFICATION`,`RESTRICTION`,`OBJECTION`,
  `OTHER`; keep legacy 5 as aliases in a mapping layer), extend `PrivacyRequestStatus`
  (+the intermediate states), add `assignedOrgById?`, `assignedAt?`, `assignedById?`,
  `acknowledgementDueAt?`, `identityVerificationDueAt?`, `responseDueAt?`, `extensionDueAt?`,
  `responsiblePersonId?`. Unassigned public submissions stay `organizationId = null`
  (platform triage queue); tenant queries always predicate `id + organizationId`.
- `LegalDocument`: add `LegalDocumentLifecycle` enum + `lifecycle` col + `supersededById?`.
- `DataExportRequest`: add `ExportStatus` lifecycle + `manifestKey?`, `schemaVersion?`,
  `tokenHash?`, wire `expiresAt`.
- `DataDeletionRequest`: add `planJson?`, `idempotencyKey?`, `approvedById?`, `approvedAt?`.

New models (all org-scoped except global-template cases; all with the standard
`organizationId`, `status`, `approvalState`, `createdAt/updatedAt`, and the indexes in
Part N): `RetentionPolicy`, `LegalHold`, `Subprocessor`, `DataTransfer`,
`ComplianceIncident`, `ExportDownloadToken` (hashed token, single-use, short TTL).

Migration name (proposed): `20260804000000_phase97_compliance_control_plane` — additive
only; validated against fresh DB, legacy-populated upgrade, and second-deploy idempotency.

## 4. Permissions (org axis — `src/lib/org/rbac.ts`)

Add minimal `OrgPermission` values, mapped OWNER + `COMPLIANCE_MANAGER` (+ ADMIN where
appropriate): `compliance:view/manage`, `privacy_requests:view/manage`,
`legal_documents:view/manage/publish`, `retention:view/manage`, `legal_hold:view/manage`,
`exports:view/approve`, `incidents:view/manage`, `evidence_packs:generate`. The
platform-only `privacy_requests:assign_platform` maps to `requirePlatformSuperadmin`
(triage of unassigned requests), never to an org role.

## 5. State machine & deadline policy

- Privacy-request transitions defined as an explicit allow-list map (from→[to]); the
  PATCH route rejects any transition not in the map (no arbitrary strings). Legacy 4
  statuses map onto the extended set so existing rows remain valid.
- Deadline clocks are **configuration-driven**. With no configured policy,
  `DEADLINE_POLICY_STATUS = CONFIGURATION_REQUIRED` and no due dates are generated. No
  statutory duration is hard-coded.

## 6. Export / erasure / retention safety

- Export: state machine `REQUESTED→…→READY→EXPIRED/REVOKED/FAILED`; server-owned subject
  identity; scope = subject + org only; excludes secrets/tokens/credentials/foreign audit;
  manifest + schema version + timestamp + auto-expiry; download via short-lived single-use
  hashed token, server-side ownership check, audited. Prod execution flag default false.
- Erasure: planning engine classifies each related record
  (`DELETE_ALLOWED/ANONYMISE_REQUIRED/RETENTION_REQUIRED/LEGAL_HOLD/DEPENDENCY_BLOCKED/
  MANUAL_REVIEW_REQUIRED/NOT_SUBJECT_DATA`); execution requires approved plan +
  idempotency key + no active hold + test adapter. Prod execution flag default false.
- Retention: policy registry (data class, trigger, duration config, action, approval,
  hold behaviour, dry-run). Missing duration/approval → `CONFIGURATION_REQUIRED`.
  Evaluation dry-run by default; destructive execution behind a default-false env flag.
- **Invariants:** `LEGAL_HOLD_PROTECTED_DELETION=0`, `UNAPPROVED_ERASURE_EXECUTION=0`,
  `CROSS_TENANT_EXPORT_RECORD=0`, `EXPORT_SECRET_LEAK=0`.

## 7. Owner / legal decision register (must be resolved by owner/counsel)

| # | Decision | Default until decided |
|---|---|---|
| 1 | Authoritative relationship: `PrivacyRequest` vs `DataExport/DataDeletion` records | Proposal: PrivacyRequest = lifecycle; export/erasure = child jobs |
| 2 | Lawful-basis values per processing activity | `LEGAL_REVIEW_REQUIRED` |
| 3 | Retention durations & actions per data class | `CONFIGURATION_REQUIRED` |
| 4 | Privacy-request statutory deadlines (ack/verify/response/extension) | `CONFIGURATION_REQUIRED` (no clock) |
| 5 | Subprocessor contract & review status; transfer classification | `REVIEW_REQUIRED` |
| 6 | Incident notification decisions | `NOTIFICATION_DECISION_REQUIRED` (never automated) |
| 7 | Enable production export execution | disabled (flag false) |
| 8 | Enable production erasure execution | disabled (flag false) |
| 9 | Enable destructive retention execution | disabled (flag false) |
| 10 | Consent purpose taxonomy (which optional purposes exist) | necessary-only defaults; optional = deny |
| 11 | Broaden CI triggers so stacked PRs run Actions | out of scope unless approved |

## 8. Proposed commit / PR plan (Part T)

1. `feat(compliance): add processing inventory and privacy lifecycle`
2. `feat(compliance): add legal lifecycle and consent evidence`
3. `feat(compliance): add retention holds and erasure planning`
4. `feat(compliance): add export and transfer governance`
5. `feat(compliance): add incidents and evidence packs`
6. `feat(ui): add multilingual compliance operations center`
7. `test(compliance): add Phase 97 assurance gates`
8. `docs(compliance): document Phase 97 control plane`

Phase 97 Draft PR: base `agent/phase96-compliance-hotfix-integration`, head
`agent/phase97-compliance-privacy-legal-readiness`. Do not mark ready. Do not merge.
Do not deploy.

## 9. Safety posture (unchanged through this phase)

```
PROVIDER_CONTACTED=False
PRODUCTION_CONTACTED=False
DESTRUCTIVE_RETENTION_EXECUTED=False
PRODUCTION_EXPORT_EXECUTED=False
PRODUCTION_ERASURE_EXECUTED=False
DEPLOYED=False
MERGED=False
LEGAL_CERTIFICATION_CLAIMED=False
```

## 10. Governed compliance incidents — evidence & closure integrity

Migrations `20260820000014` (base workflow) and `20260820000015` (evidence-integrity
hardening) define a tenant-owned incident control plane. The runtime source of truth
for cross-plane reconstruction remains the Phase 92 observability facilities; an
incident only **references** that timeline by `correlationId`.

- **Authoritative membership-bound ownership.** `ownerId` / `assignedToId` are org
  member user ids bound by a composite FK `(organizationId, ownerId) →
  OrganizationMember(organizationId, userId)` (RESTRICT). Generic create/update can
  never assign an owner; assignment is a dedicated route
  (`POST /api/compliance/incidents/[id]/assignment`, `manage_compliance_incidents`)
  that locks the incident, then resolves + locks the membership (FOR SHARE) and
  requires `status = ACTIVE`. Closure re-reads the owner's membership transactionally,
  so a now-inactive/removed owner no longer satisfies closure.
- **Immutable tenant-bound timeline.** `ComplianceIncidentEvent` binds to its incident
  by a composite FK `(complianceIncidentId, organizationId) → ComplianceIncident(id,
  organizationId)` (RESTRICT, non-cascading) plus an Organization FK; `actorId` is NOT
  NULL with a closed `actorClass` (PLATFORM | ORGANIZATION_MEMBER); a `BEFORE UPDATE OR
  DELETE` trigger rejects any mutation. An incident with timeline evidence cannot be
  hard-deleted, and there is no incident DELETE route.
- **Decision evidence versioning.** A high-authority decision state requires a SHA-256
  `decisionEvidenceHash` in the request and a positive monotonic `decisionVersion`
  (DB CHECKs); the `DECISION_RECORDED` timeline event carries the same hash + version +
  `outcome = RECORDED`. A non-decision state must clear the current hash (no stale,
  seemingly-valid evidence). `decisionVersion` never decreases; invalidation preserves
  it as lineage and the next valid decision receives `version + 1`.
- **Decision invalidation.** Reassessment out of a decision state and the explicit
  reopen both clear the current decision evidence atomically (reopen also sets
  `assessmentStatus = IN_ASSESSMENT`, clears resolution/closure attribution and appends
  `REOPENED` with `outcome = INVALIDATED`). A reopened incident requires a completely
  new decision before RESOLVED/CLOSED; the closure gate validates current evidence, not
  the status string.
- **IncidentAction as blocker authority.** `ComplianceIncidentAction` (closed
  priority/status/actionCode, tenant-bound parent FK) is the single source of truth for
  closure blocking; `openBlockerCount` is only a transactionally-reconciled cache. Any
  OPEN action blocks RESOLVED/CLOSED (closure reads the authoritative OPEN count under
  the incident lock); resolving a HIGH/CRITICAL action requires an evidence hash;
  resolving a missing/terminal/foreign action is uniformly not-found.
- **LegalHold ↔ closure lock ordering.** One global order —
  `ComplianceIncident → OrganizationMember → LegalHold → ComplianceIncidentAction`.
  Incident closure and INCIDENT-scoped hold activation/release both lock the incident
  first, so they linearise and an incident CLOSED with an ACTIVE hold can never persist;
  activation is refused unless the incident is still in an active working state.
- **No automatic external notification.** The workflow records containment /
  remediation / notification-decision **evidence** only. It never sends email/webhooks,
  contacts customers/regulators/providers, executes containment, alters subject data, or
  invents a legal deadline / jurisdiction / notification duty / breach verdict.
- **Fail-closed migration.** `20260820000015` is additive/strengthening (no DROP TABLE /
  DROP COLUMN / TRUNCATE / DELETE / auto-repair). A classification-count-only preflight
  aborts (counts + closed labels only, never row content) when any pre-existing row
  would violate a new constraint — invalid actor, parent-org mismatch, incomplete
  decision evidence, invalid ownership binding, invalid incident-hold binding, or a
  blocker-cache mismatch.

## 11. Incident lineage + concurrency-proof hardening

Migration `20260820000016` and the incident persistence layer close the remaining
incident-lineage and concurrency-proof gaps.

- **LegalHold authoritative parent snapshot.** An INCIDENT-scoped activation/release
  never trusts the parent read before the transaction. The caller pre-reads only a
  candidate + expected snapshot; under lock the candidate incident is locked FIRST,
  then the hold, then the FULL hold is re-read and must EXACTLY match the expected
  {status, scopeType, incidentId, updatedAt} — otherwise the binding moved
  (HOLD_BINDING_CHANGED) and the operation rolls back for a fresh retry WITHOUT locking
  a second incident. Only explicit allow-listed fields are written (never a generic
  spread), with a post-lock time.
- **Action-event same-parent binding.** An ACTION timeline event references its action
  by the composite FK (actionId, organizationId, complianceIncidentId) →
  ComplianceIncidentAction(id, organizationId, complianceIncidentId), so an ACTION event
  can only reference an action of its OWN incident (cross-incident / foreign-tenant /
  missing action references are rejected by PostgreSQL).
- **Authoritative timeline actor provenance.** Every timeline actor and every action
  creator/updater is bound to an actual same-org OrganizationMember by a composite FK;
  the actorClass vocabulary is failed closed to the only implemented + enforced class,
  ORGANIZATION_MEMBER (the unenforced PLATFORM option is removed — a future platform
  actor requires an explicit authoritative design).
- **Post-lock authoritative evidence time.** Every state change captures
  `clock_timestamp()` AFTER all its locks are held and uses that single value for the
  incident state, the action/hold and the timeline event; no route-created Date reaches
  persisted evidence, and a timeline event's createdAt equals its incident's updatedAt.
- **Deterministic concurrency barriers.** The real-PostgreSQL suite proves both
  orderings of action-vs-closure, hold-activation-vs-closure, hold-release-vs-closure
  and decision-vs-reassessment with explicit held-lock barriers (a transaction holds a
  row lock; the racing operation provably blocks; the ordering is forced, never left to
  scheduler luck), asserting the final persisted state, versions, hashes and hold/action
  states after each ordering.
- **Fail-closed migration.** `20260820000016` is additive/strengthening (only the weak
  FK/CHECK being strengthened is dropped and replaced); a classification-count-only
  preflight aborts on any pre-existing cross-incident action event, timeline actor
  without membership, action without a creator, or creator without membership.

## 12. Full LegalHold mutation linearization

Every LegalHold write — not only the incident-scoped transition — is linearized by a
governed, row-locked persistence op. The PATCH route is no longer the authoritative
lifecycle/mutability boundary: it authenticates, authorizes, parses strict input,
performs a candidate pre-read (to route + reject a combined edit-plus-transition),
selects the op, maps closed result codes and writes AuditLog only after the op commits.
No route-created `Date` reaches an evidence write; `updateLegalHoldForOrg` is no longer
called from the route. No new migration is required — the existing FKs/CHECKs suffice.

- **Governed edit (`editLegalHoldForOrg`).** One transaction: `SELECT … FOR UPDATE` the
  hold, re-read the full authoritative row, require the pre-read snapshot ({status,
  scopeType, incidentId, updatedAt}) to still match (else `HOLD_CHANGED_RETRY`), decide
  mutability from the LOCKED status (terminal → `HOLD_IMMUTABLE`; ACTIVE → `reviewDate`
  only, else `ACTIVE_HOLD_IMMUTABLE`; PROPOSED → material), revalidate the complete
  candidate scope fail-closed on any scope change (`INVALID_SCOPE`), capture
  `clock_timestamp()` after the lock, write exactly the allow-listed fields under an
  exact status predicate, and return the exact `fieldsWritten`.
- **Governed non-incident transition (`transitionLegalHoldForOrg`).** Same locked
  re-read + snapshot revalidation, then the exact edge is validated on the LOCKED status
  (`INVALID_HOLD_TRANSITION` for any other pair); PROPOSED→ACTIVE, ACTIVE→RELEASED and
  PROPOSED→CANCELLED only; ACTIVE/RELEASE of an INCIDENT-scoped hold is refused here (it
  belongs to the incident-ordered path); activation revalidates the complete locked
  scope (`INVALID_LEGAL_HOLD_ACTIVATION`); post-lock `clock_timestamp()` for all
  attribution; exact `fieldsWritten`.
- **Lock order.** Pure edit and non-incident transition lock **LegalHold** only;
  INCIDENT-scoped ACTIVE/RELEASE keeps the **ComplianceIncident → LegalHold** order via
  `applyIncidentScopedHoldTransition`. LegalHold is never locked before an incident.
- **Deterministic barriers.** The real-PostgreSQL suite proves both orderings of
  material-edit-vs-activation, review-edit-vs-release and activation-vs-cancellation, plus
  duplicate-activation linearization, with explicit held-lock barriers (a transaction
  holds the hold row lock; the racing governed op provably blocks; the ordering is forced),
  asserting the final persisted row after each ordering. Terminal-mutation rejection,
  out-of-order transitions, incomplete-scope activation, tenant-scoped not-found and the
  post-lock evidence time (committed `updatedAt` equals the activation's `approvedAt`) are
  proven directly against the DB.
- **Audit accuracy.** `fieldsUpdated` is always the op's committed `fieldsWritten`; a
  rejected/conflicted/stale mutation produces no success AuditLog event.

---

## 12. Delivered evidence packs + Compliance Operations Center (final)

This section documents the delivered implementation. It supersedes any "proposed"
language above.

### 12.1 Migrations (all additive/strengthening; 00–16 never modified)

`20260820000000` … `20260820000016` — processing inventory, privacy-request lifecycle,
retention + legal-hold integrity, legal-document lifecycle + publication/acceptance races,
governed subject export + binding + delivery, governed subject erasure + approval binding,
subprocessor/transfer governance + provider-scope binding, compliance incidents + evidence
integrity + lineage integrity.

`20260820000017_phase97_compliance_evidence_packs` — governed evidence packs:
`ComplianceEvidencePack` + `ComplianceEvidencePackItem`; closed-vocabulary CHECKs
(lifecycle, readiness, scope, scope/target consistency, lowercase-SHA-256 manifest/item
hash, READY-manifest completeness, generated + revocation attribution completeness,
non-negative itemCount, positive sequence, safe schema-version); composite same-org FKs
(item→pack, and scope→ComplianceIncident / ProcessingActivity / PrivacyRequest, all
RESTRICT); a `BEFORE UPDATE` trigger making a READY pack's evidence immutable (only a
governed `REVOKED`/`EXPIRED` transition preserving every evidence field is allowed) and a
`BEFORE UPDATE OR DELETE` trigger making every item append-only; a fail-closed
classification-count-only preflight where a new constraint touches an existing table.
Tenant-safe `@@unique([id, organizationId])` added to `ProcessingActivity` and
`PrivacyRequest` so the composite scope FKs can bind.

### 12.2 Models

`ComplianceEvidencePack` — id, organizationId, lifecycle
(`REQUESTED|GENERATING|READY|FAILED|REVOKED|EXPIRED`), readiness
(`COMPLETE|REVIEW_REQUIRED|CONFIGURATION_REQUIRED|INSUFFICIENT_EVIDENCE`), scopeType
(`ORGANIZATION|INCIDENT|PROCESSING_ACTIVITY|PRIVACY_REQUEST`), schemaVersion, idempotencyKey,
explicit nullable targets, requestedBy/At, snapshotAt, generatedBy/At, manifestHash
(lowercase SHA-256), manifestJson (canonical manifest), itemCount, failureCode, revokedBy/At,
expiresAt, timestamps. `ComplianceEvidencePackItem` — id, organizationId, evidencePackId,
sequence, entityType, entityId, evidenceCode, evidenceStatus, evidenceHash (lowercase
SHA-256), sourceVersion, sourceUpdatedAt, safeMetadata, createdAt.

### 12.3 Permissions (Organization RBAC)

`view_compliance_evidence` = `[OWNER, ADMIN, MANAGER]`;
`generate_compliance_evidence` = `[OWNER]`; `revoke_compliance_evidence` = `[OWNER]`
(generation and revocation are accountable acts, OWNER-only, like approve/decide/close).

### 12.4 API routes (all `requireComplianceOrgScope`, tenant-predicated, uniform NOT_FOUND)

- `GET  /api/compliance/evidence-packs` — list (view).
- `POST /api/compliance/evidence-packs` — request + generate (generate).
- `GET  /api/compliance/evidence-packs/[id]` — pack + items (view).
- `GET  /api/compliance/evidence-packs/[id]/manifest` — canonical manifest + hash +
  lifecycle; `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` (view).
- `POST /api/compliance/evidence-packs/[id]/revoke` — governed revocation (revoke).

No public / unauthenticated evidence route exists. Client organizationId, actor, lifecycle,
readiness, snapshotAt, generatedAt, manifestHash, itemCount and evidence items are rejected
by the strict schema.

### 12.5 Generation, canonicalization + readiness

Generation runs ONE interactive `RepeatableRead` transaction: lock the REQUESTED pack
`FOR UPDATE`; capture `snapshotAt = transaction_timestamp()` (snapshot IDENTITY —
deliberately different from the post-lock `clock_timestamp()` used for lifecycle evidence
times); read all governed evidence through org-predicated queries that select SAFE columns
only; build safe projections; hash each item's canonical projection
(`sha256(stableStringify(item))`, reusing `export-package.stableStringify`); dedup by hash;
sort deterministically; assign contiguous sequence; build the canonical manifest and its
`manifestHash`; insert items; finalize the pack to `READY` atomically. A concurrent
finalizer surfaces as a serialization error / optimistic `count!==1` and returns the
already-finalized pack (one finalization only). On genuine failure a separate transaction
records a closed `failureCode`; no partial items are ever committed. Readiness is the
fail-closed fold `CONFIGURATION_REQUIRED > INSUFFICIENT_EVIDENCE > REVIEW_REQUIRED >
COMPLETE`; an empty pack is `INSUFFICIENT_EVIDENCE`, never a silent COMPLETE. Determinism:
same snapshot + same data → same manifestHash; input/item order and duplicate items never
change the hash; a stored pack's hash never changes when source data later changes.

### 12.6 Safe evidence projections + forbidden content

Pure projection builders for ProcessingActivity, RetentionPolicy, LegalHold, Subprocessor,
DataTransfer, LegalDocument, ComplianceIncident, provider policy (Phase 95), entitlement
override (Phase 96), PrivacyRequest lifecycle, DataExportRequest / DataDeletionRequest
governance, plus count-only aggregates and a closed UNSUPPORTED marker. Items carry only
identifiers, versions, timestamps, counts, booleans, closed classifications and hashes.
NEVER emitted: PrivacyRequest email/description, IP/user-agent, subject/candidate identity,
consent raw identifiers, legal-document body/title, contract text, incident
`sensitiveSummary` (only `summaryCode`), raw AuditLog metadata, raw SecurityEvent / Phase 92
log content, provider configuration / API key / OpenBao data, session/token/download-token
values, export archive contents, erasure subject data / `planJson`, or unrestricted free
text. Safe columns are selected upstream so forbidden columns never enter the process.

### 12.7 Immutability, revocation, tenant isolation, lock ordering

READY manifests + all items are immutable (DB triggers). Revocation locks the pack
`FOR UPDATE`, validates `READY → REVOKED`, derives revokedBy/revokedAt server-side,
preserves the manifest + items, audits after commit. There is no hard-delete and no generic
DELETE endpoint. Every query/mutation is predicated on `(id, organizationId)`; a foreign or
unknown id is uniform NOT_FOUND; composite same-org FKs make a cross-tenant target
impossible at the database. Lock order within the pack transaction is pack-then-items;
earlier incident/hold lock orders are unchanged.

### 12.8 Compliance Operations Center (trilingual)

Server pages under `/[locale]/compliance/{,processing-activities,privacy-requests,
legal-documents,retention,legal-holds,subprocessors,data-transfers,incidents,evidence-packs}`
render a shared client that fetches from the server-gated `/api/compliance/*` endpoints
(RBAC on the server; a 401/403 renders the localized unauthorized state). Lifecycle/
readiness/status badges; explicit configuration-required and legal-review-required states;
evidence-pack create + detail + client-side manifest verification (recompute SHA-256 of the
canonical manifest and compare to the recorded hash) + governed revoke with accessible
confirmation; incident lifecycle without `sensitiveSummary` leakage; RTL for Persian, LTR
for English/German (direction from the locale layout); logical `text-start`/`text-end`
alignment; loading/empty/error/unauthorized states. No destructive-execution control is
exposed. All strings live in the `complianceCenter` namespace with strict FA/EN/DE parity
(gate-enforced; genuine German, zero English carryover, no Persian contamination).

### 12.9 Assurance, CI, backup, rollback, disabled functions

`npm run eval:phase97` (offline, deterministic, fail-closed) runs a fourteen-group invariant
suite + secret-leak scan and the compliance unit suites;
`.github/workflows/phase97-compliance-assurance.yml` adds an offline job (generate,
db:validate, tsc, lint, eval:phase95/96/97, npm test, build, adversarial static checks, safe
JSON artifact) and a `pgvector/pgvector:pg16` PostgreSQL job (fresh deploy through migration
17, second-deploy idempotency, db:validate, the compliance `*.pg.test.ts` suite). No deploy
step, no SSH, no Production hostname/secret. Back up the evidence-pack tables with the rest
of the tenant data; evidence is RESTRICT-owned so an organization holding a pack cannot be
hard-deleted. Rollback of migration 17 is only by an explicit new migration; a READY pack is
never un-generated, only revoked. Destructive retention, production export and production
erasure remain DISABLED by default and are not exposed by this phase. This software is not
legal advice or certification.
