# BASELINE-FREEZE.md

HFCC design freeze record. **Authoritative.**
Frozen 2026-10-05 by Claude Opus 5, session 15a653ec, on owner decisions
**OD-A = A1 APPROVED** and **OD-E = E1 APPROVED**.

Verdict: `FACTORY_CONNECTION_CENTER_DESIGN_READY_FOR_IMPLEMENTATION_AUTHORIZATION`

Nothing was created, built, tested, migrated, committed or pushed to produce
this record. It is measurement only.

---

## 1. THE FROZEN BASELINE — FULL IMMUTABLE ANCHORS

```
BASELINE_REF          origin/main (at design freeze)
BASELINE_COMMIT_SHA   153b8617e764474e00f37f9424125e8e8da2c0e1
BASELINE_TREE_SHA     71e9cbfc2b9db28cda165481ed0664652917391c
BASELINE_PARENT_1     67865f05a49973c2406d52c24a1f70d9c5d5d95d
BASELINE_PARENT_2     76476f93fe719b1f7fa516908cbd7f215ac03e29
BASELINE_DATE         2026-10-04 06:29:25 +0100
BASELINE_SUBJECT      Merge pull request #115 from hermescenter1/feature/ats-production-go-live
BASELINE_SIGNED       yes — gpgsig present, committer GitHub <noreply@github.com>
```

`BASELINE_COMMIT_SHA` is the **full 40-hex** object name (length verified = 40).

### FORBIDDEN BASE — recorded so it cannot be used by mistake

```
LOCAL_MAIN_SHA        fb41cb7eb0e973ad1d6f199b53eff4714a0f7283
LOCAL_MAIN_DATE       2026-09-14 08:14:20 +0100   (PR #96)
LOCAL_MAIN_LAG        59 commits behind origin/main
```

> **`git branch feature/factory-connection-center main` IS FORBIDDEN.**
> It would base HFCC on a 2026-09-14 tree and drop 59 commits, including
> Phase 113 (PR #112), the Sprint 1C-A SEO hotfix (PR #113), the ATS go-live
> work (PR #115) and the dependency-audit CI change (PR #116).
> The base must be named by its **full SHA**, not by any branch ref.

### Verification at authorised execution — owner requirement 2

Run **before** creating anything. Every line must match this record:

```bash
git fetch origin

# 1. the base must be the frozen commit, named by full SHA
git rev-parse 153b8617e764474e00f37f9424125e8e8da2c0e1^{commit}
# expect: 153b8617e764474e00f37f9424125e8e8da2c0e1

# 2. its tree must match -- catches a rewritten or substituted commit
git rev-parse 153b8617e764474e00f37f9424125e8e8da2c0e1^{tree}
# expect: 71e9cbfc2b9db28cda165481ed0664652917391c

# 3. report whether origin/main has MOVED since the freeze -- do not act on it
git rev-parse origin/main
git rev-list --count 153b8617e764474e00f37f9424125e8e8da2c0e1..origin/main
```

**If `origin/main` has moved, the baseline does NOT change.** Per owner
requirement 2 the frozen commit remains the base, the drift is reported, and any
rebase or move to a newer commit is **a separate owner decision**. Silent
re-anchoring is prohibited.

---

## 2. BASELINE FINGERPRINTS — SO THE BASE CAN BE PROVEN, NOT ASSUMED

Measured directly from commit `153b8617`, not from the working tree.

### 2.1 FC1 absence — confirms Tier A scope (owner requirement 4)

```
src/lib/industrial/factory-contract/   ABSENT at baseline
src/app/api/industrial/v2/             ABSENT at baseline
```

Verify: `git ls-tree -r --name-only 153b8617 -- src/lib/industrial/factory-contract src/app/api/industrial/v2`
→ must return **nothing**.

### 2.2 i18n at baseline — the OD-E/E1 starting numbers

| | en | fa | de |
|---|---|---|---|
| catalogue total | **8128** | **8128** | **8128** |
| top-level namespaces | 79 | 79 | 79 |
| **`otEdge` leaves** | **397** | **397** | **397** |

Catalogue-total pin at baseline, in `src/i18n/__tests__/german-final-gate.test.ts`:

```
line 584   expect(allEn.length).toBe(8128);
line 628   ).toBe(8128);
```

> **These are the clean numbers.** The current working tree shows 8162 and a pin
> already edited to 8162 — that is the HRIS lane's +34 and it must **not** be
> carried into HFCC. HFCC's arithmetic is `8128 + N`, and `otEdge` grows from
> `397 + N`, where every one of the N leaves is a descendant of `otEdge.*`.

### 2.3 Migrations at baseline

```
prisma/migrations entries   81  (80 migrations + migration_lock.toml)
newest migration            20260925120000_f2_document_tenant_fk
```

> Note: the working tree has **82** entries because the HRIS lane added
> `20261004120000_hris05_erp_tenant_isolation`, which is **untracked** and
> therefore **not** at the baseline. HFCC's migration timestamp must be chosen
> against the baseline's newest (`20260925120000`), and must be re-checked for
> ordering if the HRIS migration later lands on `origin/main`.

### 2.4 Blob SHAs of the seven files HFCC will modify

Recorded so that, at implementation time, it can be proven the HFCC worktree
started from untouched copies — and so any later divergence is attributable.

| file | blob SHA at baseline | HFCC's reason to touch it |
|---|---|---|
`prisma/schema.prisma` | `073cdbddd0591f0d6e3494a5d3643dd8acc78d99` | 12 new models (slice 3) |
`prisma/__tests__/phase102-migration-safety.test.ts` | `0bd46d613162c9be7f03cafe8eabbf70a7425e71` | declare the new migration, F-033 (slice 3) |
`messages/en.json` | `0f702e7d6a7b5776164107e8acd54a0de48f8cd3` | `otEdge.*` leaves (slice 2) |
`messages/fa.json` | `5397780aa32a713d7ad91aa9ce854e199b7231a7` | `otEdge.*` leaves (slice 2) |
`messages/de.json` | `bf995aaeca9e6a97a8653c11c884ec079d5abe9c` | `otEdge.*` leaves (slice 2) |
`src/i18n/__tests__/german-final-gate.test.ts` | `1a6deb54eac7c2bc79b555a6b84f8d934d66c85a` | catalogue total 584 + 628 (slice 2) |
`src/lib/org/rbac.ts` | `f8c817d8e514c44e3fe8073850dd5ce292a75afa` | six permission keys + role matrix (slice 2) |

Verify any one with `git rev-parse 153b8617:<path>`.

---

## 3. CONTAMINATION BARRIER — OWNER REQUIREMENT 3

**Nothing uncommitted, staged or untracked from the current working tree or the
HRIS lane may enter the HFCC worktree.**

At freeze time the primary tree `E:\hermes-os-nexuz` carries **75 foreign
entries** (57 modified + 18 untracked, the untracked expanding to ~23 files),
belonging to the live HRIS/ERP lane. All seven files in §2.4 are among them.

Because `git worktree add` from a **commit SHA** materialises only committed
content, the barrier is satisfied structurally: an uncommitted file in another
worktree cannot appear in a new one. The barrier only needs active enforcement
for the **one** deliberate transfer in §4.

Prohibited without exception: `git stash` + apply, `git checkout <other-branch> -- <path>`,
copying any of the 75 entries, and copying `node_modules/` or `.next/` from the
primary tree (a foreign `next build` is currently writing `.next/` there).

### Verification after worktree creation

```bash
cd C:/h110-factory-connection-center
git status --porcelain          # expect: ONLY docs/factory-connection-center/
git rev-parse HEAD              # expect: 153b8617e764474e00f37f9424125e8e8da2c0e1
git rev-parse HEAD^{tree}       # expect: 71e9cbfc2b9db28cda165481ed0664652917391c
```

---

## 4. DOCUMENT TRANSFER — OWNER REQUIREMENT 6

> **A declared carve-out from requirement 3.** The 15 Phase 0 documents are
> themselves untracked files in the contaminated tree. Requirement 6 explicitly
> authorises transferring them; requirement 3 forbids everything else. Both hold
> only if the transfer is **exact and verified**, which is why the manifest
> exists. This tension is stated plainly so a later session neither blocks on it
> nor uses it as licence to carry anything else across.

Transfer procedure, when authorised:

```
1  Create the worktree from the full baseline SHA (§1). Verify §3.
2  Copy ONLY docs/factory-connection-center/  -- the directory, nothing above it,
   no sibling, no node_modules, no .next.
3  Re-hash every file in the destination.
4  Compare against PRESERVATION-MANIFEST.txt.
   Any mismatch, any missing file, any EXTRA file => the transfer FAILED.
   Do not proceed. Do not "fix" by re-copying over a partial result.
5  Record the verification result in the implementation evidence.
```

The manifest is the transfer's acceptance test. It lists 14 hashed documents;
`PRESERVATION-MANIFEST.txt` itself is the 15th and is deliberately unlisted
(a manifest cannot contain its own hash) — hash it separately and record the
value independently.

---

## 5. BINDING CONSTRAINTS CARRIED INTO IMPLEMENTATION

| # | Owner requirement | Where it is already specified |
|---|---|---|
1 | base = the exact immutable commit; never `local main` | §1 of this record |
2 | verify the full SHA before acting; no silent re-anchoring | §1, verification block |
3 | no uncommitted/staged/untracked content from this tree or the HRIS lane | §3 |
4 | **no FC1 code in Tier A**; F-020, F-021, D-6, D-7 implemented and tested as **independent HFCC requirements and negative controls** | `SECURITY-THREAT-MODEL.md` §5–§6; tests `N-ING-08` (F-020: outage ⇒ **503**, never 401), `N-CRED-06` (F-021: revoked binding revokes its key on **every** path, probed against every industrial route), `N-CRED-08` (D-6: a legacy binding accepts only a key with exactly `industrial.write`), `T-21` + `N-CRED-06` (D-7: revoke on every path); mutants `M-20`, `M-21` |
5 | Tier B / FC1 integration only after an independent FC1 verdict **and** a separate owner decision | `FACTORY-CONNECTION-CENTER-ARCHITECTURE.md` §7 — Tier B is already isolated and optional |
6 | docs transferred with a valid manifest, uncontaminated | §4 |
7 | i18n under the existing `otEdge` namespace | `OPEN-DECISIONS.md` OD-E (CLOSED); baseline numbers in §2.2 |

### Tier A degradations that are now locked in by requirement 4

Because FC1 is excluded, HFCC Tier A ships with these **declared, UI-visible**
limitations — never silent:

- Credential rotation is **single-slot** (one `IndustrialGateway.apiKeyId`): a
  cutover, not an overlap window. The UI states this.
- There is **no DB-level `(gatewayId, sequenceId)` dedup** at the baseline (the
  schema documents it as deferred). Duplicates are **detected and displayed**,
  never claimed impossible.
- `REPLAY` is computed by HFCC's own read contract from `receivedAt` vs
  `timestamp`, not assigned by an FC1 server contract — with the same display
  rule: **`REPLAY` is never LIVE**.

---

## 6. HOST GATE — `IDLE_CONFIRMED` IS NOT YET TRUE

Owner condition: no branch, no worktree, no product/migration/test/catalogue
change, no build/test/Prisma/Docker/qualification, no commit/push/merge/deploy
until the host is `IDLE_CONFIRMED`.

Last measurement, 2026-10-05 — **four concurrent foreign workloads**:

| PID | MB | Workload |
|---|---|---|
11476 | 217 | R2.1 **independent requalification**, now running `qualification\run-qualification.cjs --work C:\h110-fc1i-hv2-r2-1-independent\work\SUITE-FRESH` (progressed from the inventory phase) |
8596 + 6376 | 8 + 32 | `npm run build` → `next build` **inside `E:\hermes-os-nexuz`** (writes `.next/`) |
28080 + 9040 + 26012 | 15 + 18 + 151 | Phase 114 Brain V2 **mutation run** (M01–M48, N01–N54) + vitest in `E:\hermes-phase114` |
6008 | 126 | vitest in `E:\hermes-f2-documents` |

### `IDLE_CONFIRMED` definition — all must hold, measured not assumed

```
1  no process matching  run-qualification | inventory.cjs   (R2.1 lane)
2  no process matching  next build | npm run build
3  no process matching  vitest | run-mutations
4  no process matching  tsc --noEmit        in E:\hermes-os-nexuz
5  docker info succeeds  (check FIRST after any long wait -- Docker Desktop
                          has died overnight in this programme before)
6  free space verified on C:  (E: measured ~97 % full -- OD-L)
```

Measurement command used for 1–4 (note the escaped `$_`; in Git Bash an
unescaped `$_` is mangled to `unsetenv.CommandLine`):

```bash
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.Name -match 'node|tsc' } | Select-Object ProcessId,CommandLine | Format-Table -AutoSize -Wrap"
```

---

## 7. WHAT REMAINS

| # | Requirement | Status |
|---|---|---|
1 | OD-A | **CLOSED — A1 APPROVED** |
2 | OD-E | **CLOSED — E1 APPROVED** |
3 | OD-L — worktree path | **settled by OD-A**: `C:\h110-factory-connection-center` |
4 | `FACTORY_CONNECTION_CENTER_IMPLEMENTATION_AUTHORIZED` | **NOT ISSUED** |
5 | `IDLE_CONFIRMED` | **NOT TRUE** — §6 |
6 | OD-C, OD-D, OD-F, OD-G | open; needed by **slice 3**, not slice 1 |
7 | OD-I (shadow-window floor), OD-J (FAT witness) | open; needed by slices 12 / 13 |
8 | OD-H, OD-K | open; OD-K deliberately scoped out pending a legal answer |

Items 4 and 5 are the two hard gates. Item 4 is the owner's to issue; item 5 is
nobody's to decide — it must simply become true, and it is currently **further
from true than at audit start**.

---

## 8. FREEZE STATEMENT

```
Product code modified ......................... 0
Prisma schema modified ........................ 0
Migrations created ............................ 0
i18n catalogues modified ...................... 0
Test files modified ........................... 0
Branches created .............................. 0
Worktrees created ............................. 0
Commits / pushes / merges / deploys ........... 0
Builds / tests / Prisma / Docker / qualification 0
Files staged, reset, stashed or deleted ....... 0
Frozen evidence modified ...................... 0
Foreign session files touched ................. 0
```

The design is **FROZEN** at the hashes in `PRESERVATION-MANIFEST.txt`.

```
FACTORY_CONNECTION_CENTER_DESIGN_READY_FOR_IMPLEMENTATION_AUTHORIZATION
```
