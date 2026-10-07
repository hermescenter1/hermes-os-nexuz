# OD-A — BASELINE DECISION BRIEF

For owner decision. Prepared 2026-10-05. Read-only; nothing created.
Supersedes the OD-A summary in `OPEN-DECISIONS.md` with measured detail.

---

## 0. NEW MEASUREMENT — `main` IS AMBIGUOUS, AND ONE READING IS A TRAP

This was found while preparing this brief and it changes the wording of the
decision.

```
HEAD  (feature/hris-workforce-foundation)  153b8617  2026-10-04  PR #115
origin/main                                153b8617  2026-10-04  PR #115
local main                                 fb41cb7e  2026-09-14  PR #96
```

```
local main  ..  origin/main   =  59 commits BEHIND
origin/main ..  local main    =   0 commits ahead
```

> **`git branch feature/factory-connection-center main` would silently base HFCC
> on a tree from 2026-09-14 and drop 59 commits** — including Phase 113 public
> identity (PR #112), the Sprint 1C-A SEO hotfix (PR #113), the ATS go-live work
> (PR #115) and the dependency-audit CI change (PR #116).
>
> **Wherever this brief says "main", it means `origin/main` = `153b8617`.**
> The local `main` ref is stale and must be fast-forwarded or bypassed
> explicitly.

A useful corollary: the current branch `feature/hris-workforce-foundation` is at
**exactly `origin/main`** in commit terms (0 divergence). Its entire difference
from `origin/main` is **uncommitted working-tree content**. So basing HFCC on
`origin/main` loses no commit that the HRIS lane has — it only avoids that
lane's 75 uncommitted entries.

### Facts re-verified on `origin/main` for this brief

| Fact | Value |
|---|---|
FC1 present (`src/lib/industrial/factory-contract/`) | **absent** |
FC1 v2 routes (`src/app/api/industrial/v2/`) | **absent** |
i18n leaves, en | **8128** (79 namespaces) |
`otEdge` pinned in a `LEAF_COUNTS` table | **no** — consistent with the approved OD-E |

---

## 1. THE PROBLEM, RESTATED

The brief asked for the baseline that contains **FC1 + Combined Integration**,
and forbade guessing. Measured answer: **no git branch contains either.**

```
origin/main @153b8617     git, PR base.  NO FC1.  NO Combined.
      |
      |  (never merged — no PR, no branch)
E:\h110-r3c\repo          COPY, not a git repository
                          Combined Integration, digest 5a224b9d
                          45 paths UNCOMMITTED
                          ceiling: INTEGRATION_REVIEW_READY
                          open blocker: FACTORY-AVAIL-1
      |
      |  robocopy (3 243 files, COPY == BASELINE, manifest 61a1f20d)
C:\h110-fc1\repo          COPY, not a git repository
                          + FC1 Factory Contract v2, digest 2777ad47 (64 paths)
                          + migration 20260924000000_h110_fc1_factory_contract_v2
                          verdict: READY_FOR_LAB_INTEGRATION  (LAB ONLY)
                          carried risks: OI-FC1-19, OI-FC1-24
                          pack sha256 86e0448b… (1205 files)
      |
C:\h110-fc1i\repo         the frozen reference named in the brief
```

Everything of value in FC1 and Combined is therefore **content-addressed but not
version-controlled**: digests and review packs exist, git history does not.

---

## 2. THE FOUR OPTIONS

### A1 — base on `origin/main` (153b8617) · **RECOMMENDED**

HFCC Tier A only. FC1 excluded from scope.

| | |
|---|---|
**Technical** | The only git-addressable base. Equals the PR base, so a future PR has a clean, conflict-free diff. All 12 new models, the state machine, intake plane, tag import, provisioning, FAT and evidence work on `origin/main` as designed — nothing in Tier A depends on FC1. i18n floor = 8128, `otEdge` unpinned, matching the approved OD-E exactly. |
**Security** | **Strongest.** The HFCC review judges HFCC code only. No unreviewed credential-plane code is imported, so no finding can be attributed to the wrong lane. The known FC1 security lessons (F-020 outage-as-401, F-021 revoked-key, D-6, D-7) are carried as **design requirements with their own negative controls** (`SECURITY-THREAT-MODEL.md` §5–§6) rather than as inherited code — which means they get tested in HFCC's own context instead of being assumed fixed. |
**Operational** | Lowest risk. Reviewable, revertable, mergeable. The feature gate means it can even be merged while held. No interaction with the live HRIS lane. |
**Cost** | HFCC ships with single-slot credential rotation (one `apiKeyId`, a cutover not an overlap), no DB-level `(gateway, sequenceId)` dedup, and HFCC-computed rather than server-assigned `REPLAY`. Each is a **declared, UI-visible limitation**, not a silent downgrade — specified in `FACTORY-CONNECTION-CENTER-ARCHITECTURE.md` §7. |

### A2 — build a branch from `C:\h110-fc1\repo`

| | |
|---|---|
**Technical** | Imports 64 uncommitted FC1 paths **plus** Combined's 45, as a single unreviewed commit with no history. The FC1 tree was built on a Combined copy, so the import is 109 paths of two different lanes fused together. One extra migration (`20260924000000_…`) lands out of chronological order relative to `20261004120000_hris05_…`. |
**Security** | **Weakest, and the objection is structural, not stylistic.** FC1 contains credential-plane code (`credentials.ts`, `key-route-guard.ts`, `management-session.ts`, `legacy-binding.ts`, `auth-outage.ts`) that has **never been reviewed on `main`**. Merging it inside an HFCC review means one review is accountable for two security surfaces, and any HFCC verdict silently inherits FC1's `READY_FOR_LAB_INTEGRATION` cap and Combined's open `FACTORY-AVAIL-1`. A reviewer reading a green HFCC result would reasonably believe the credential plane had been qualified for factory use. It has not. |
**Operational** | Cannot be cleanly reverted — unpicking FC1 from HFCC afterwards means separating two lanes inside one commit. Also drops the 59 commits after 2026-09-24 unless rebased, since the Combined copy predates them. |
**Verdict** | **Not recommended.** This is the option that converts a documented HOLD into an undocumented one. |

### A3 — land FC1 on `origin/main` first, then branch HFCC

| | |
|---|---|
**Technical** | Correct long-term sequence. FC1 becomes a real branch with a real PR and real CI. HFCC then starts from a base that genuinely contains it, and Tier B becomes available from slice 1. |
**Security** | **Equal to A1 for HFCC, and better for the platform.** Each surface is reviewed by the review that owns it. The outstanding FC1 items (browser gate already PASS; `FACTORY-AVAIL-1`; `OI-FC1-19`, `OI-FC1-24`) get adjudicated explicitly instead of inherited. |
**Operational** | Costs a full separate review cycle **before HFCC starts**, on a 109-path import that must be rebased across 59 commits. FC1's migration must be renumbered or reconciled against `20261004120000_hris05_…`, and the i18n delta (FC1 added 7 leaves on a 7808-leaf catalogue; `origin/main` is now 8128) must be re-derived, not replayed. |
**Verdict** | **Recommended only if Tier B is required for the first HFCC release.** Otherwise it serialises two large reviews for capability HFCC does not yet need. |

### A4 — base on `feature/hris-workforce-foundation`

**Rejected on measurement, not preference.**

- 75 uncommitted foreign entries, growing during this audit (74 → 75).
- A foreign session is running **`npm run build` / `next build` in this tree right
  now** (PIDs 8596, 6376), on top of the earlier `tsc`. It writes `.next/`.
- It modifies **every single file HFCC must also modify.** Measured
  file-by-file against `HEAD`:

  | File HFCC must touch | HFCC's reason | HRIS lane status |
  |---|---|---|
  | `prisma/schema.prisma` | 12 new models (slice 3) | **MODIFIED** |
  | `prisma/__tests__/phase102-migration-safety.test.ts` | declare the new migration, F-033 (slice 3) | **MODIFIED** |
  | `messages/en.json` | `otEdge.*` leaves (slice 2) | **MODIFIED** |
  | `messages/fa.json` | `otEdge.*` leaves (slice 2) | **MODIFIED** |
  | `messages/de.json` | `otEdge.*` leaves (slice 2) | **MODIFIED** |
  | `src/i18n/__tests__/german-final-gate.test.ts` | the catalogue total, lines 584 + 628 (slice 2) | **MODIFIED** |
  | `src/lib/org/rbac.ts` | six permission keys + role matrix (slice 2) | **MODIFIED** |

  **Seven for seven.** There is no HFCC file in slices 2 or 3 that the HRIS lane
  is not already editing, including the two gate-pin lines that the approved
  OD-E/E1 designates as HFCC's *only* test-file edit — and which the HRIS lane
  has already rewritten to accept its own +34.
- Commit-wise it is identical to `origin/main`, so it offers **no commit benefit
  whatsoever** over A1 — only its dirt.

---

## 3. COMPARISON

| | A1 `origin/main` | A2 from FC1 copy | A3 FC1 first | A4 HRIS branch |
|---|---|---|---|---|
git-addressable base | ✅ | ❌ | ✅ | ✅ |
clean PR diff | ✅ | ❌ | ✅ | ❌ |
HFCC review judges HFCC only | ✅ | ❌ | ✅ | ❌ |
imports unreviewed credential code | no | **yes** | no | no |
inherits a foreign HOLD | no | **yes** | no | no |
collides with the live HRIS lane | no | no | no | **yes** |
Tier B (v2 ingest, key overlap) | later | yes | yes | later |
revertable | ✅ | ❌ | ✅ | ❌ |
time before slice 1 | **none** | days | **a full review cycle** | none |
**overall risk** | **lowest** | highest | low but slow | unacceptable |

---

## 4. RECOMMENDATION

> **A1 — base `feature/factory-connection-center` on `origin/main` (153b8617).**
> Deliver HFCC Tier A. Treat FC1 as a separate lane, to be landed on its own
> merits via A3 if and when Tier B is wanted.

Three reasons, in order of weight:

1. **It keeps the security accountability boundary intact.** A2 is the only
   option where a green HFCC verdict could be read as qualifying code that no
   review ever qualified for factory use. That is the failure mode this
   programme has repeatedly paid for, and it is not worth the convenience.
2. **Tier A genuinely does not need FC1.** The whole design was written against
   `origin/main` for this reason. FC1 adds the v2 ingest contract and
   overlapping key rotation — upgrades, not prerequisites.
3. **It is free.** A1 and A4 start from the same commit. A1 simply declines the
   75 uncommitted foreign entries and the running build.

### Exact commands, for when authorisation is given — NOT RUN

```bash
# NOTE: `main` is 59 commits stale. Use origin/main explicitly.
git fetch origin
git branch feature/factory-connection-center origin/main      # = 153b8617
git worktree add C:/h110-factory-connection-center feature/factory-connection-center
```

`C:` not `E:` — `E:` was measured at ~97 % full (OD-L).

---

## 5. HOST STATE — IDLE PRECONDITION HAS MOVED FURTHER AWAY

Re-measured 2026-10-05, after the OD-E decision. **Four separate foreign
workloads**, up from two at audit start:

| PID | MB | What |
|---|---|---|
| **11476** | 217 | `C:\h110-fc1i-harness-v2-r2-1\qualification\run-qualification.cjs --work C:\h110-fc1i-hv2-r2-1-independent\work\SUITE-FRESH` — the R2.1 independent requalification has **progressed from inventory to the qualification suite itself**. Still running. |
| **8596 + 6376** | 8 + 32 | `npm run build` → `next build` **inside `E:\hermes-os-nexuz`** — NEW since the first check, and it writes `.next/` in this tree |
| **28080 + 9040 + 26012** | 15 + 18 + 151 | Phase 114 Industrial Brain V2 **mutation testing** (M01–M48, N01–N54) + vitest in `E:\hermes-phase114` |
| **6008** | 126 | vitest in `E:\hermes-f2-documents` |

> The idle precondition is **further from satisfied than at audit start**, not
> closer. This is not the owner's to grant and it is not something I can work
> around: a build, a mutation run and a qualification suite competing for this
> host is exactly the condition under which the Combined lane's gate 07 had to
> be re-armed with bounded waits after two `NOT_RUN` attempts.

---

## 6. WHAT IS STILL REQUIRED TO START

| # | Requirement | Status |
|---|---|---|
1 | `FACTORY_CONNECTION_CENTER_IMPLEMENTATION_AUTHORIZED` | **not given** |
2 | **OD-A** — this brief | **awaiting owner** |
3 | OD-L — worktree path (`C:\h110-factory-connection-center` recommended) | open, low-cost |
4 | Host idle | **FAILING — and worse than before (§5)** |
5 | OD-C, OD-D, OD-F, OD-G | open; needed by slice 3, not slice 1 |

Closed: **OD-E** (E1, `otEdge`, 2026-10-05).

Items 1 and 2 are the owner's. Item 4 is nobody's to decide — it must simply
become true.
