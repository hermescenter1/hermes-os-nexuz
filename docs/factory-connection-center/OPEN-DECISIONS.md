# OPEN-DECISIONS.md

Decisions only the owner can make. Each has a recommendation; **none has been
acted on.** `OD-A` is blocking.

---

## OD-A — THE BASELINE — **CLOSED: APPROVED A1 (owner, 2026-10-05)**

> **OWNER DECISION, RECORDED.** Option **A1 APPROVED**. HFCC Tier A is built in
> an independent worktree on the frozen commit obtained from `origin/main` at
> design freeze.
>
> ```
> BASELINE_COMMIT_SHA  153b8617e764474e00f37f9424125e8e8da2c0e1
> BASELINE_TREE_SHA    71e9cbfc2b9db28cda165481ed0664652917391c
> branch               feature/factory-connection-center
> worktree             C:\h110-factory-connection-center
> ```
>
> Binding requirements, as issued:
> 1. Base = that **exact immutable commit**. **`local main` must not be used**
>    (it is `fb41cb7e`, 59 commits stale).
> 2. At authorised execution, retrieve and verify the full SHA from the audit
>    record first. **If `origin/main` has moved, the baseline does not change
>    silently** — any rebase or move is a separate owner decision.
> 3. No uncommitted, staged or untracked file from the current working tree or
>    the HRIS lane enters the HFCC worktree.
> 4. **No FC1 code in Tier A.** FC1's security findings **F-020, F-021, D-6 and
>    D-7** must be implemented and tested as **independent HFCC requirements
>    with their own negative controls**.
> 5. Tier B and any future FC1 integration require an independent FC1 verdict
>    **and** a separate owner decision.
> 6. `docs/factory-connection-center` transferred to the independent worktree
>    with a valid manifest, uncontaminated by the 75 foreign entries.
> 7. OD-E also binding: i18n strings under the existing `otEdge` namespace.
>
> Full anchors, fingerprints, verification commands, the contamination barrier
> and the `IDLE_CONFIRMED` definition are recorded in **`BASELINE-FREEZE.md`**,
> which is authoritative for all of the above.
>
> This closes OD-A. It is **not** an implementation authorisation —
> `FACTORY_CONNECTION_CENTER_IMPLEMENTATION_AUTHORIZED` has not been issued, and
> the host is not `IDLE_CONFIRMED`.
>
> OD-L is settled as a consequence: the worktree is `C:\h110-factory-connection-center`.

The analysis that produced the recommendation is retained below for the record.

### Original analysis

**The finding.** `REPOSITORY-BASELINE.md` §4 establishes by measurement that
**no branch, in any of the 77 worktrees, contains FC1 + Combined Integration.**
Both exist only as untracked working copies:

```
main @153b8617        git.  NO factory-contract/, NO /api/industrial/v2/
E:\h110-r3c\repo      copy, no git.  Combined, digest 5a224b9d, INTEGRATION_REVIEW_READY
C:\h110-fc1\repo      copy, no git.  + FC1, digest 2777ad47, READY_FOR_LAB_INTEGRATION
```

The brief asked me to identify the baseline containing both and not to guess.
The honest answer is that there is none.

**Options.**

| | Base | Consequence |
|---|---|---|
**A1 (recommended)** | `main` | Only git-addressable option. The PR base. HFCC is Tier A (architecture §7) and does not depend on FC1. Clean history, no imported HOLD. |
A2 | a new branch built from `C:\h110-fc1\repo` | Imports 64 uncommitted paths whose highest verdict is **lab only**, plus Combined's open blocker `FACTORY-AVAIL-1`, plus `OI-FC1-19`/`OI-FC1-24`. Mixes two reviews into one. HFCC inherits a HOLD it did not earn. |
A3 | land FC1 on `main` first (its own PR and review), then branch HFCC | Correct long-term sequence. Costs a separate review cycle before HFCC starts. |
A4 | `feature/hris-workforce-foundation` (the current branch) | **Rejected.** 74 uncommitted foreign files, a live `tsc` on the tree, and `prisma/schema.prisma` + the Phase 102 gate test both already modified — guaranteed conflict on exactly the two files HFCC must touch. |

**Recommendation: A1**, with A3 as the path if FC1 is wanted in scope.
Reasoning: HFCC's whole Tier-A design works on `main`; FC1 adds the v2 ingest
contract and overlapping key rotation, which are upgrades, not prerequisites. A2
would make a single review responsible for both an unmerged lab-only contract
and a new production feature, and would make any HFCC verdict inherit FC1's cap.

**`FACTORY_CONNECTION_CENTER_IMPLEMENTATION_AUTHORIZED` alone is not enough
to start.** OD-A must be answered too, because slice 1 begins with
`git branch <name> <base>`.

---

## OD-B — `manage_gateway_credentials` vs `provision_factory_gateway`

FC1 introduced `manage_gateway_credentials`; it is **not on `main`**. HFCC Tier A
proposes `provision_factory_gateway`.

| | Option |
|---|---|
**B1 (recommended)** | HFCC adds `provision_factory_gateway`. If FC1 later lands, **reconcile** — make one an alias of the other, or migrate. |
B2 | HFCC adds `manage_gateway_credentials` itself, matching FC1's name, to pre-empt a future merge conflict. |

**Recommendation: B1.** The names are not synonyms: FC1's covers credential
management; HFCC's covers credential issuance *plus* package build *plus*
revocation of a factory connection. Adopting FC1's name for a broader capability
would make the permission's name lie about its scope. Two permissions that
coexist without reconciliation, however, is the worse outcome — so reconciliation
is part of the decision, not a follow-up.

---

## OD-C — THE TAG MODEL

`main` already has **six** tag-shaped models (`AssetTag`, `RegistryAssetTag`,
`AutomationTag`, `EdmsTag`, `ArticleTag`, `MediaTag`). HFCC wants a seventh.

| | Option |
|---|---|
**C1 (recommended)** | New `FactoryTagDefinition` + `FactoryTagImport`. Justification: `AutomationTag` holds tags *discovered* from a TIA export; HFCC holds tags the plant *declares for collection*, with collection parameters (`sampleIntervalMs`, `expectedMin/Max`, `criticality`, `enabled`) that `AutomationTag` does not carry. Different lifecycle, different source of truth. |
C2 | Extend `AutomationTag` with the collection columns and an `origin` discriminator. Fewer tables; couples HFCC to the engineering-import pipeline and to `EngineeringProject` as a required parent. |
C3 | Add `sourceType = FACTORY_TAG_LIST` to `EngineeringImport` and reuse it wholesale. Reuses the proven upload shape; but `EngineeringImport` has no `requestId`, no preview/commit two-phase flow and no row-level error report. |

**Recommendation: C1**, and the justification above should be recorded in the
schema comment so a future reviewer does not read it as duplication. The
`FactoryTagImport` field shape is deliberately copied from `EngineeringImport`
so the two remain comparable and the proven controls are not re-derived.

---

## OD-D — INVITATION MODEL

`AccessInvite` has the right shape (`tokenHash @unique`, four-state lifecycle,
`expiresAt`, `usedAt`) but **is not tenant-bound**: no `organizationId`, no
`siteId`, a free-text `role`, and `createdByUserId` is a loose reference with no
FK.

| | Option |
|---|---|
**D1 (recommended)** | New `FactoryInvitation`, following `AccessInvite`'s hashing and lifecycle, adding `organizationId` + `requestId` scoping, a real FK on the creator, and `useCount`/`lastUseIp` for replay evidence. |
D2 | Add nullable `organizationId`/`requestId` to `AccessInvite` and reuse it. Changes a model used by the sales/lead flow; a nullable tenant column on a shared invite table is a standing isolation hazard. |

**Recommendation: D1.** HFCC's invitation crosses the platform's highest-risk new
trust boundary (an external party with no account reaching tenant data).
It should not share a table with customer-access invites.

---

## OD-E — i18n NAMESPACE — **CLOSED: APPROVED E1 (owner, 2026-10-05)**

> **OWNER DECISION, RECORDED.** Option **E1 APPROVED**: all HFCC i18n strings
> nest under the **existing `otEdge`** namespace.
>
> Owner's stated basis:
> - `otEdge` is the correct semantic owner of Gateway, Relay, Collector,
>   Provisioning and OT connectivity.
> - `otEdge` is not pinned in any namespace-level `LEAF_COUNTS` table.
> - Expected change surface: the three language catalogues + the two
>   catalogue-total assertions in `german-final-gate.test.ts`.
> - **No new namespace.** **Do not use `industrial`.**
>
> Binding consequences for implementation:
> - Every HFCC leaf is a descendant of `otEdge.*`.
> - `TRANSLATED_NS` needs **no** new entry (`otEdge` is already registered).
> - **No** per-namespace `LEAF_COUNTS` table is touched.
> - The only test-file edit is the catalogue total at
>   `src/i18n/__tests__/german-final-gate.test.ts:584` and `:628`,
>   **re-measured on the baseline OD-A selects** (`origin/main` carries 8128).
> - `otEdge` is held to **zero German carryover**, so every new leaf must be
>   genuinely German and genuinely Persian — no allowlist entry.
>
> This decision closes OD-E only. It is **not** an implementation authorisation.
> Verdict unchanged: `FACTORY_CONNECTION_CENTER_DESIGN_READY_FOR_OWNER_REVIEW`.

The analysis that produced the recommendation is retained below for the record.

### Original analysis

**Measured cost of each option** (`REPOSITORY-BASELINE.md` §3.2 — verified by two
independent greps):

| | Option | Files to touch |
|---|---|---|
**E1 (recommended)** | Nest under the existing **`otEdge`** namespace. Already in the German catalogue's `TRANSLATED_NS`, already held to zero carryover. **`otEdge` is in NONE of the four per-namespace `LEAF_COUNTS` tables.** | the 3 catalogues + **2 lines in 1 test file** |
E2 | Nest under the existing **`industrial`** namespace. | the 3 catalogues + the 2 total lines + **a per-namespace count AND the `267` wave-total** in `german-final-gate.test.ts` |
E3 | A new top-level `factoryConnection` namespace. Cleanest conceptual separation. | the 3 catalogues + the 2 total lines + **`TRANSLATED_NS` registration** + a new namespace entry |

**Recommendation: E1.** The semantic fit is good (HFCC *is* OT edge onboarding),
and it is also measurably the cheapest: it is the only option that touches no
per-namespace table and no `TRANSLATED_NS` entry. The i18n gate coupling is the
single most reliable source of late rework in this repository, and E1 minimises
the surface it can act on.

---

## OD-F — ONE REQUEST PER SITE?

`FactoryIntegrationRequest` proposes `@@unique([organizationId, siteId])`.
Correct while a request is live; it blocks legitimate re-integration after
`REVOKED`.

| | Option |
|---|---|
**F1 (recommended)** | Replace with a **partial unique index** on non-terminal states only: `CREATE UNIQUE INDEX ... WHERE state NOT IN ('REVOKED')`. Allows a history of attempts; forbids two live requests per site. Requires **raw SQL** in the migration — Prisma cannot express it declaratively. |
F2 | Keep the full unique constraint and archive a revoked request to a separate table. Simpler constraint; adds an archive table and a copy step, and splits the audit history across two tables. |
F3 | Drop uniqueness entirely; enforce "one live request" in application code. Simplest schema; the weakest guarantee — exactly the kind of invariant that should be at the database. |

**Recommendation: F1.** This also settles the URL key question
(`UX-INFORMATION-ARCHITECTURE.md` §2): with F1, `siteId` is not a unique key,
which confirms `[requestId]` as the route parameter.

> **Trap:** partial unique indexes are checked **per statement**. A transaction
> relying on a deferrable exclusion constraint needs `SET CONSTRAINTS ALL
> DEFERRED` inside it.

---

## OD-G — NETWORK PROFILE: `Json` OR NORMALISED?

`FactoryNetworkProfile` proposes `Json` arrays for subnets, VLANs and NTP
servers, every element Zod-validated on write.

| | Option |
|---|---|
**G1 (recommended)** | `Json` + Zod validation. Small, naturally-unbounded lists; no per-element queries are needed. |
G2 | Child tables per subnet / VLAN / NTP server. Enables per-element audit ("who added this subnet, when") and per-element queries. Three more tables for data that is only ever read as a whole. |

**Recommendation: G1**, unless the owner wants per-element audit attribution —
which is a legitimate OT-governance requirement. If a plant's change-management
process needs to show who added which subnet, G2 is correct and the cost is
justified. **This is the one decision here that depends on a process fact I do
not have.**

---

## OD-H — EXTERNAL ANCHORING OF THE AUDIT CHAIN

The hash chain (`STATE-MACHINE.md` §4) is **tamper-evident, not
tamper-proof**: it detects alteration by anyone who cannot also rewrite every
subsequent row and the stored head. A database administrator can.

| | Option |
|---|---|
**H1 (recommended for now)** | Keep it internal. Describe it accurately as tamper-**evident** in all three locales. Out of scope for this phase. |
H2 | Sign each transition with a server key. Needs a signing key and rotation — and Hermes' secret provider is **resolve-only**, with no writable store. |
H3 | Anchor the head hash to an external timestamping authority or notary. Genuine third-party verifiability; an external dependency and a cost. |

**Recommendation: H1**, with the wording control treated as mandatory. If an
evidence pack will be relied on by a customer in a commercial or regulatory
context, H3 becomes a real requirement and should be raised then — not quietly
implied by the word "immutable".

---

## OD-I — SHADOW WINDOW MINIMUM

T-12 (`SHADOW_COLLECTING` → `FAT_PENDING`) requires a minimum shadow window.
**I have no engineering basis for a number.** The factory-readiness lane
recorded thresholds as explicitly *not final*.

| | Option |
|---|---|
I1 | A fixed platform default (e.g. 72 h) |
I2 | Per-request, operator-set at `DRAFT`, with a platform floor |
**I3 (recommended)** | I2 — operator-set with a floor — **and the chosen value recorded in the evidence pack** |

**Recommendation: I3.** A single platform number cannot be right for both a
slow thermal process and a fast packaging line. What matters for evidence is not
the number but that the number was *chosen, attributed and recorded*.
**The floor value itself still needs the owner's input.**

---

## OD-J — WHO MAY BE A FAT WITNESS?

T-13 requires an operator and a witness; T-14 requires `signer ≠ operator`.

| | Option |
|---|---|
J1 | Witness must be a Hermes user with `execute_factory_fat` |
J2 | Witness may be an external plant representative, recorded by name + role without an account |
**J3 (recommended)** | Both, with the witness **kind** recorded (`INTERNAL` / `EXTERNAL`) and shown in the evidence pack |

**Recommendation: J3.** In real commissioning the witness is very often the
plant's own engineer, who has no Hermes account. Forcing J1 would push people to
record a colleague as witness — which defeats the control entirely. Recording
the kind keeps the evidence honest about what kind of attestation it is.

---

## OD-K — EVIDENCE PACK RETENTION AND ERASURE

The pack contains plant network topology, tag lists and contact details.

Open questions I cannot answer from the repository:

- How long is a pack retained?
- Does a tenant offboarding delete it, or is it retained as a commissioning
  record?
- How does this interact with the existing compliance/privacy surface
  (`ComplianceEvidencePack`, the data-request and GDPR routes)?
- Do `FactoryContact` rows fall under the existing data-subject erasure path?

**No recommendation.** This needs a legal and commercial answer, not a technical
one. It is also a known sharp edge: the ATS go-live lane was **blocked** because
retention values were unverifiable and `CANDIDATE_ERASED` turned out to be a
refusal code rather than a status. HFCC should not repeat that by assuming a
retention policy exists.

**Deliberately scoped out of the slices in `IMPLEMENTATION-SLICES.md`** so it
cannot silently become an undeclared assumption. If the answer is "the same as
the compliance evidence pack", that is a one-line decision and a reuse; if it is
anything else, it is its own slice.

---

## OD-L — WORKTREE LOCATION AND DISK

`E:` was measured at **~97 % full** during the FC1 lane. A worktree plus
`node_modules` plus `.next` is several gigabytes.

| | Option |
|---|---|
**L1 (recommended)** | `C:\h110-factory-connection-center`, matching the brief's own suggestion |
L2 | `E:\hermes-factory-connection-center` — only if free space is verified first |

**Recommendation: L1.** Disk headroom on the chosen drive must be **measured**
in slice 1 (precondition P-6), not assumed.

---

## SUMMARY

| id | Decision | Recommendation | Blocking? |
|---|---|---|---|
~~**OD-A**~~ | ~~baseline branch~~ | **CLOSED — A1 APPROVED, `153b8617…` in `C:\h110-factory-connection-center`** | **resolved** |
OD-B | permission naming | `provision_factory_gateway` + reconcile later | no |
OD-C | tag model | new `FactoryTagDefinition` + `FactoryTagImport` | needed by slice 3 |
OD-D | invitation model | new `FactoryInvitation` | needed by slice 3 |
~~OD-E~~ | ~~i18n namespace~~ | **CLOSED — E1 APPROVED, `otEdge`** | **resolved** |
OD-F | one request per site | partial unique index | needed by slice 3 |
OD-G | network profile shape | `Json` + Zod, unless per-element audit is required | needed by slice 3 |
OD-H | audit anchoring | internal; say tamper-**evident** | no |
OD-I | shadow window floor | operator-set with a floor — **floor value needed** | needed by slice 12 |
OD-J | FAT witness | internal or external, kind recorded | needed by slice 13 |
OD-K | pack retention / erasure | **no recommendation — needs a legal answer** | scoped out |
~~OD-L~~ | ~~worktree location~~ | **SETTLED by OD-A — `C:\h110-factory-connection-center`** | **resolved** |

**Minimum to start slice 1: ~~OD-A~~, ~~OD-L~~ — both CLOSED.**
**Minimum to start slice 2: ~~OD-E~~ — CLOSED.**
**Minimum to start slice 3: OD-C, OD-D, OD-F, OD-G — still open.**

Closed 2026-10-05: **OD-A** (A1, commit `153b8617…`), **OD-E** (E1, `otEdge`),
**OD-L** (settled by OD-A).

**No open decision blocks slice 1 any more.** The two remaining gates are not
decisions in this register:

1. `FACTORY_CONNECTION_CENTER_IMPLEMENTATION_AUTHORIZED` — **not issued**
2. `IDLE_CONFIRMED` — **not true** (`BASELINE-FREEZE.md` §6)
