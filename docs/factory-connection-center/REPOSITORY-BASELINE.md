# REPOSITORY-BASELINE.md

Hermes Factory Connection Center (HFCC) — Phase 0, read-only audit.
Audit date: 2026-10-05. Auditor: Claude Opus 5, session 15a653ec.
Nothing in this audit modified, staged, reset or deleted any file.

---

## 1. HOST STATE — QUALIFICATION IS ACTIVE

The owner's constraint required checking for active heavy processing **before**
anything else. That check was run first. Result: **heavy processing IS active.**

Measured via `Get-CimInstance Win32_Process` at 2026-10-05 ~08:51 local:

| PID | Working set | Command line | Interpretation |
|---|---|---|---|
| 11712 | **924 MB** | `node inventory.cjs C:/h110-fc1i-harness-v2-r2-1 C:/h110-fc1i-hv2-r2-1-independent/logs/inventory-R2-1-PRE.json` | **The Harness V2 R2.1 INDEPENDENT REQUALIFICATION is running right now.** It is reading the frozen R2.1 lane and writing a PRE inventory into a new independent lane directory. |
| 24060 | 86 MB | `npx tsc --noEmit -p .` | A TypeScript check, **foreign session** |
| 12528 | 186 MB | `node .../typescript/bin/tsc --noEmit -p .` | The same check's worker, resolved inside `E:\hermes-os-nexuz\node_modules` — i.e. **it is typechecking THIS working directory** |
| 20820 / 20836 / 18484 / 20792 / 21756 / 20428 | 10–36 MB | `@sethdouglasford/mcp-figma` | MCP servers, not qualification |

### Consequences, enforced in this phase

1. The owner's conditional applies in full: **read-only audit, architecture,
   data model, threat model, UX specification and execution plan only.**
   No build, no test, no Prisma migration, no Docker, no heavy execution was
   started, and none will be until the owner issues
   `FACTORY_CONNECTION_CENTER_IMPLEMENTATION_AUTHORIZED`.
2. A second, separate hazard was found that the brief did not anticipate:
   a `tsc --noEmit -p .` is running **against the primary working directory
   `E:\hermes-os-nexuz` itself**, which means a foreign session is actively
   working in this exact tree. See §3.

---

## 2. FROZEN REFERENCE PATHS — READ-ONLY, UNTOUCHED

All four declared reference paths exist and were opened read-only (directory
listing only). None was modified.

| Path | Exists | Git repo? | Notes |
|---|---|---|---|
| `C:\h110-fc1i\repo` | yes | **NO — not a git repository** | A frozen *copy* of a tree, not a branch. Contains the FC1 implementation. |
| `C:\h110-fc1i-evidence` | yes | n/a | `VERDICT.md`, `RUN-PLAN.md`, stages 1/3/6, phases 1/6/7/8/9 |
| `C:\h110-fc1i-harness-v2-r2-1` | yes | n/a | R2.1 remediation lane; `QUALIFICATION-R2-1.json`, `SHA256-MANIFEST.txt` (257 KB) |
| `C:\h110-fc1i-hv2-r2-independent` | yes | n/a | The **R2** independent requalification (completed 2026-10-02). |

> **Audit note — a path the brief did not list.** The brief protects
> `C:\h110-fc1i-hv2-r2-independent`. The *active* process is writing to
> `C:\h110-fc1i-hv2-r2-1-independent` (note the extra `-1`). That directory is
> **not** in the brief's protected list but is plainly a live qualification
> output. It is treated here as read-only and was not opened.

---

## 3. PRIMARY REPOSITORY — `E:\hermes-os-nexuz`

```
branch      : feature/hris-workforce-foundation
HEAD        : 153b8617e764474e00f37f9424125e8e8da2c0e1
              2026-10-04 06:29:25 +0100
              "Merge pull request #115 from hermescenter1/feature/ats-production-go-live"
origin/main : 153b8617  (identical to HEAD in commits)
local main  : fb41cb7e  2026-09-14  PR #96  -- 59 COMMITS STALE
```

> **`main` is ambiguous here, and one reading is a trap.** The local `main` ref
> sits 59 commits behind `origin/main`:
> `git rev-list --count main..origin/main` = **59**, and
> `origin/main..main` = **0**.
> `git branch <new> main` would silently base work on a 2026-09-14 tree,
> dropping Phase 113 (PR #112), the Sprint 1C-A SEO hotfix (PR #113), the ATS
> go-live work (PR #115) and the dependency-audit CI change (PR #116).
> **Everywhere this pack says "base on main", it means `origin/main` =
> `153b8617`.** See `OD-A-BASELINE-DECISION-BRIEF.md` §0.
>
> Corollary: `feature/hris-workforce-foundation` is at **exactly `origin/main`**
> in commit terms. Its whole difference is uncommitted working-tree content —
> so basing HFCC on `origin/main` forfeits no commit, only the dirt.

### 3.1 Working tree is DIRTY — and the changes are NOT mine

`git status --porcelain` reports **74 entries**, measured as:

```
 57  M   modified, unstaged
 17  ??  untracked
```

> **Measurement caveat — `git status --porcelain` collapses untracked
> directories.** Those 17 untracked entries expand to **23 actual files** under
> `--untracked-files=all`. A count taken from the default porcelain output
> understates the real change volume. (This repository has been caught by that
> collapse before — Delivery D.0.)

Together they are a coherent, in-progress feature lane — **HRIS / ERP workforce
foundation** — belonging to the foreign session identified in §1. The untracked
side is unambiguous about ownership: it includes
`prisma/migrations/20261004120000_hris05_erp_tenant_isolation/`,
`src/lib/erp/{tenant,active-organization,page-scope,schemas,ops-schemas,http,operations}.ts`,
`src/lib/idempotency/`, `src/components/erp/Erp{ModuleUnavailable,OrganizationChooser,ScopeNotice}.tsx`
and `vitest.hris05-postgres.config.ts`.

Representative modified paths:

- `prisma/schema.prisma`
- `prisma/__tests__/phase102-migration-safety.test.ts`
- `messages/{de,en,fa}.json`
- `src/app/[locale]/erp/**` (17 pages)
- `src/app/api/erp/**` (15 route handlers)
- `src/components/erp/**`, `src/components/business-operations/**`
- `src/i18n/__tests__/**`
- `docs/security/phase99-route-security-inventory.json`

**Corroborating evidence that this is live foreign work, not an abandoned
stash:** the newest migration on disk is `20261004120000_hris05_erp_tenant_isolation`
(dated 2026-10-04, matching the branch name), and the i18n leaf pin inside
`src/i18n/__tests__/german-final-gate.test.ts` has *already been bumped* in the
working tree to match the dirty catalogue (see §3.2).

**Therefore: this working tree is NOT an acceptable baseline for HFCC.**
Nothing here was staged, reset, stashed, checked out or discarded.

### 3.2 i18n baseline — committed vs. working tree

Measured by parsing the catalogues (`git show HEAD:messages/<l>.json` vs. disk):

| Catalogue | top-level namespaces | leaves |
|---|---|---|
| `HEAD` en / fa / de | 79 / 79 / 79 | **8128 / 8128 / 8128** (exact three-way parity) |
| Working tree en | 79 | **8162** (+34, the HRIS lane) |

The leaf total is pinned in the i18n gate tests. Pin sites, measured twice —
once by targeted grep and once by an independent repository-wide grep, which
agree:

**The catalogue-wide total is pinned in exactly ONE file, on TWO lines:**

- `src/i18n/__tests__/german-final-gate.test.ts:584` → `expect(allEn.length).toBe(8162)`
- `src/i18n/__tests__/german-final-gate.test.ts:628` → `.toBe(8162)`

Nothing in `scripts/`, `.github/`, `prisma/`, `src/app/` or `src/lib/` pins a
catalogue total.

**Separately**, four files carry *per-namespace* `LEAF_COUNTS` tables plus a
wave-total assertion. These bite **only if HFCC adds leaves to one of their
targeted namespaces**:

| file | pinned namespaces | wave total |
|---|---|---|
| `german-final-gate.test.ts:23` | multiSite, caseStudio, digitalTwin, **industrial**, unknownCenter, automation, documents, analytics, platform, storage | 267 |
| `german-enterprise-wave.test.ts:42` | crm, billing, apiPlatform, adminDocuments, org, admin, erp, siteSecurity, adminDocumentSearch, adminAccess | 532 |
| `german-intelligence-wave.test.ts:42` | brain, copilot, ke, knowledgeGraph, predictive, knowledgeStudio, industrialBrainReport, knowledge | 546 |
| `german-operations-wave.test.ts:20` | dashboard, assetMaintenance, engineeringDocuments, businessOps, … | — |

> **`otEdge` appears in NONE of these four tables; `industrial` appears in the
> first.** This is decisive for the namespace choice (`OPEN-DECISIONS.md` OD-E):
> nesting HFCC under `otEdge` touches **two lines in one file**, whereas nesting
> under `industrial` would additionally require bumping a per-namespace count
> *and* the `267` wave-total assertion.
>
> This measurement also sharpens the standing *"the leaf count is pinned in SIX
> files"* lore: at **this** baseline the catalogue total lives in one file, and
> the other pins are namespace-scoped. Re-measure on the chosen baseline rather
> than trusting either number.

Both `8162` pins are **already the dirty value** — the foreign session has
edited the gate to accept its own +34. On a clean baseline the pin to honour is
whatever that baseline carries, and HFCC's own leaves must be added on top of
that number in **every** pin site. This is the known *"the leaf count is pinned
in SIX files"* hazard; it must be re-measured on the chosen baseline and never
copied from this document.

### 3.3 Worktrees — 77 registered

`git worktree list` returns **77** worktrees. Three share HEAD `153b8617`
(`E:/hermes-os-nexuz` itself, plus detached `E:/hermes-baseline-153` and
`E:/hermes-depcheck-153`). The rest are historical phase lanes.

**No HFCC worktree was created.** Per the owner's instruction, no branch and no
worktree will be created until the baseline is confirmed.

### 3.4 Migrations

`prisma/migrations/` holds **81 migration directories** + `migration_lock.toml`
(82 entries). The six newest:

```
20260827000000_phase109_cui2_r8_worker_lease
20260923000000_ats_b2_s1_orchestration_and_review
20260924000000_phase112_immutable_reasoning_run
20260925000000_ats_m1_position_management
20260925120000_f2_document_tenant_fk
20261004120000_hris05_erp_tenant_isolation
```

Naming convention: `YYYYMMDDHHMMSS_snake_case_slug`.

> **Gate hazard (carried from the FC1 lane, finding F-033):** the Phase 102
> migration gate — `prisma/__tests__/phase102-migration-safety.test.ts` plus the
> CI migration list — **must declare every new migration**. That test file is
> itself currently modified by the foreign session.
> `npm run gate:phase102:migrations` and `gate:phase102:applied-migrations` exist.

### 3.5 Available validation scripts

Enumerated from `package.json`. Relevant to HFCC:

```
lint  build  start  test
db:generate  db:validate  db:migrate  db:migrate:prod
gate:phase102:migrations  gate:phase102:applied-migrations
gate:phase997:migrations  gate:phase997:safety  gate:phase997:candidate
security:phase99:inventory  security:phase99:inventory:check
gate:dependency-audit  config:inventory:check
```

> **Correction to the standing CLAUDE.md validation sequence:** there is
> **no `typecheck` script** in `package.json`. The documented
> `npm run typecheck` does not exist and will fail. TypeScript must be checked
> with `npx tsc --noEmit -p .` directly — which is also exactly what the foreign
> session is currently running, so it must not be run concurrently in this tree.

---

## 4. THE DECISIVE FINDING — FC1 AND COMBINED INTEGRATION ARE NOT IN ANY BRANCH

The owner required: *"determine which baseline contains FC1 and Combined
Integration. Do not pick a branch by guessing."* Resolved by direct measurement.

### 4.1 What main HEAD (153b8617) does NOT have

```
src/lib/industrial/factory-contract/   → does not exist
src/app/api/industrial/v2/             → does not exist
```

`git ls-files 'src/lib/industrial/*'` lists 30 tracked files; **none** is a
factory-contract file.

### 4.2 Where FC1 actually lives

`C:\h110-fc1i\repo` — **not a git repository** — contains the full
implementation:

```
src/lib/industrial/factory-contract/
  auth-outage.ts   credentials.ts     db-types.ts   digest.ts
  ingest-v2.ts     jcs.ts             key-route-guard.ts
  legacy-binding.ts  limits.ts        management-session.ts
  provenance.ts    refusal-audit.ts   sequence.ts   streams.ts
  thresholds.ts    time.ts            v2-schema.ts  __tests__/
src/app/api/industrial/v2/{telemetry,gateways}
```

### 4.3 The provenance chain

```
main @153b8617                      ← git. NO FC1, NO Combined.
   |
   | (never merged)
E:\h110-r3c\repo                    ← COPY, no git.
   Combined Integration, digest 5a224b9d..., 45 paths UNCOMMITTED
   verdict INTEGRATION_REVIEW_READY (2026-09-24)
   pack df2df239...  (E:\h110-r3c-pack)
   |
   | robocopy (3 243 files, COPY == BASELINE, manifest 61a1f20d)
C:\h110-fc1\repo                    ← COPY, no git.
   + FC1 Factory Contract v2, FINAL digest 2777ad47... (64 paths)
   + migration 20260924000000_h110_fc1_factory_contract_v2 (76 -> 77)
   verdict CORE_FACTORY_CONTRACT_READY_FOR_LAB_INTEGRATION (2026-09-25, LAB ONLY)
   pack sha256 86e0448bb893f043676135716550bc51ee5df5ea3494a21c0d3c2af2a716e27b
        (1205 files)
   |
C:\h110-fc1i\repo                   ← the frozen reference the brief names
```

### 4.4 Verdict on baseline selection

> **There is no branch, anywhere in the 77 worktrees, that contains FC1 +
> Combined Integration.** Both exist only as untracked working copies on `C:`
> and `E:`, verified by content digest and review packs, never committed.

This is a **blocking baseline decision for the owner**, recorded as `OD-A` in
`OPEN-DECISIONS.md`. HFCC must not silently assume FC1 is present: every HFCC
design in this pack is therefore written against **`main`** as the mandatory
floor, with FC1 integration treated as an explicitly optional, separately
authorised layer (see `FACTORY-CONNECTION-CENTER-ARCHITECTURE.md` §7).

Additional constraints bearing on the decision:

- FC1's highest verdict is `READY_FOR_LAB_INTEGRATION` — **lab only**, explicitly
  *not* pilot, factory or production ready.
- The Combined tree's ceiling is `INTEGRATION_REVIEW_READY`, with open blocker
  `FACTORY-AVAIL-1`.
- The FC1 lane carries `OI-FC1-19` and `OI-FC1-24` as measured risks.
- `LAB_INTEGRATION_HOLD` and `HARNESS-RELIABILITY-1` are recorded as unchanged.

---

## 5. PROPOSED (NOT CREATED) IMPLEMENTATION LOCATION

Nothing below has been created. These are proposals awaiting approval.

| Item | Proposal | Rationale |
|---|---|---|
| Branch | `feature/factory-connection-center` | matches the repo's `feature/<slug>` convention |
| Base | **to be decided — `OPEN-DECISIONS.md` OD-A** | must not be `feature/hris-workforce-foundation` |
| Worktree | `C:\h110-factory-connection-center` | `C:` not `E:` — **`E:` was measured at 97 % full** during the FC1 lane; a worktree + `node_modules` + `.next` will not fit safely |
| Phase 0 docs | `docs/factory-connection-center/` (this directory) | docs-only, additive, zero product bytes |

**Recommended base: `main`.** It is the only git-addressable tree, it is the PR
base, and it is the only option that does not import an uncommitted, lab-only,
HOLD-capped tree into a new production feature. If the owner wants FC1 in scope,
the correct sequence is to land FC1 on `main` through its own review first, and
only then branch HFCC — not to fork HFCC from an untracked copy.

---

## 6. CONFLICT REPORT WITH OTHER SESSIONS

| # | Conflict | Severity | Mitigation applied in Phase 0 |
|---|---|---|---|
| C-1 | R2.1 independent requalification active (PID 11712) | **BLOCKING** | No build/test/migration/Docker started. Implementation withheld pending authorisation. |
| C-2 | `tsc --noEmit -p .` running inside `E:\hermes-os-nexuz` (PIDs 24060, 12528) | **BLOCKING for this tree** | No TypeScript run started here; none of the 74 modified paths touched. |
| C-3 | 74 uncommitted HRIS/ERP entries (57 modified + 17 untracked → 23 files) in the primary tree | **HIGH** | Not staged, not reset, not stashed. HFCC must not be built in this tree. |
| C-4 | i18n leaf pin already bumped to 8162 while `HEAD` is 8128 | **MEDIUM** | Pin must be re-measured on the chosen baseline, never copied. |
| C-5 | `prisma/schema.prisma` and `phase102-migration-safety.test.ts` both modified by the foreign session — the exact two files an HFCC migration must also touch | **HIGH** | Guarantees a merge conflict if HFCC branches from this tree. Reinforces "base on `main`". |
| C-6 | A live qualification lane `C:\h110-fc1i-hv2-r2-1-independent` not named in the brief's read-only list | **MEDIUM** | Treated as read-only; not opened. |

---

## 7. WHAT PHASE 0 CHANGED

```
Product code modified ......... 0 files
Migrations created ............ 0
Branches created .............. 0
Worktrees created ............. 0
Commits ....................... 0
Pushes ........................ 0
Files staged / reset / deleted  0
Frozen evidence touched ....... 0
```

Added: 13 new untracked documents under `docs/factory-connection-center/`.
They are additive and contain no product bytes. See `PRESERVATION-MANIFEST.txt`.
