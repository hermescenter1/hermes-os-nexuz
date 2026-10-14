# Hermes OS — Privileged Route Classification (S0-B-04)

**Program:** Hermes Security Dragon
**Addresses:** `S0-B-04` — what do `TENANT_ADMIN: 0` and `OWNER_ONLY: 0` actually mean?
**Produced:** 2026-10-10
**Verdict:** `CLASSIFIER_LIMITATION` — see §17.

---

## 1. Scope

Static and test-evidence only. No request was sent to any environment, no exploit was written, no database was
contacted, no product file was changed, and the classifier itself was **not** modified. The goal was never to
raise a number; it was to find out what the authorization model actually says.

`S0-B-03` remains open and untouched by this document.

---

## 2. Source lock

| Field | Value |
|---|---|
| Worktree | `E:\hermes-security-dragon` |
| Branch | `feature/hermes-security-dragon` |
| Source SHA | `bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2` |
| `HEAD` at audit | `e7f7851447afccf169ae1ef88f716b5ca62ef5e8` |
| `origin/main` | `e9961048` — ahead of the lock; no merge, rebase or cherry-pick performed |
| Worktree before | clean apart from the uncommitted B-03 document, whose hash was verified unchanged |
| Product bytes changed | **0** |

---

## 3. Definitions

Fixed before counting anything, because every miscount in this area comes from conflating two of these.

| Term | Definition used here |
|---|---|
| **PUBLIC** | No authenticated identity required. |
| **AUTHENTICATED_USER** | An identity is established; nothing about a tenant is enforced. |
| **TENANT_MEMBER** | Membership of the acting organization is enforced; no elevated privilege. |
| **SITE_MEMBER** | Access to a specific industrial site is enforced, independent of org role. |
| **TENANT_ADMIN** | Execution requires an **administrative privilege within the organization** — enforced by role, permission, helper or service-layer policy. A permission qualifies **only if no non-administrative role holds it**. |
| **OWNER_ONLY** | Execution requires the organization **OWNER**; `ADMIN` and every other role are refused. Qualifies only when `ADMIN` lacks the permission **and** API enforcement is demonstrated. |
| **PLATFORM_ADMIN** | Platform/global authority (session superadmin or scoped platform key) — **not** a tenant role. |
| **RESOURCE_OWNER_ONLY** | The caller must own the specific record (document, case, memory). This is **data ownership**, not the tenant `OWNER` role. |
| **UI_ONLY** | A control that hides or shows an element without a corresponding API check. |

Two rules were applied throughout:

- The word *owner* alone proves nothing. `RESOURCE_OWNER_ONLY` (the creator of a row) and `OWNER_ONLY` (the
  organization's OWNER role) are different categories and were never merged.
- The name `ADMIN` alone proves nothing. `TENANT_ADMIN` required a traced enforcement path to a decision point.

---

## 4. Existing classifier architecture

`scripts/security/phase99/route-inventory.mjs`, read in full.

| Property | Finding |
|---|---|
| Input | `src/app/api/**/route.ts`, plus three declared-surface lists (health, webhook, public) |
| **Unit of counting** | **one `(apiPath, method)` handler** — `extractHandlers` finds exported `GET`/`POST`/`PATCH`/`PUT`/`DELETE` and classifies each |
| Evidence source | `guardEvidence(body, moduleSource)` — a regex `\b<token>\s*\(` against the handler body, plus one level of module-local helper resolution (`localHelperNames` + `helperBodyHasToken`) |
| Token table | `GUARD_TOKENS`, each entry `{ token, scope }` |
| **Scopes available** | **exactly three: `tenant`, `user`, `platform`** |
| Comment handling | `stripComments` runs first, so commented-out guards do not count |
| Multiple guards | all are collected; `scopes` becomes a `Set`, and precedence decides |
| Output | `classification`, `authEvidence` (sorted tokens), `declaredSurface`, `tenantScoped`, `mutates` |

### 4.1 Precedence, verbatim from `classifyHandler` (lines 466-508)

```
1. declared HEALTH_SURFACE            → INTERNAL_HEALTH
2. declared WEBHOOK_SURFACE           → WEBHOOK
3. declared PUBLIC_SURFACE            → PUBLIC_READ | PUBLIC_WRITE  (by method)
4. apiPath startsWith "/api/admin/"   → PLATFORM_ADMIN if any scope, else UNKNOWN
5. scopes.has("platform")             → PLATFORM_ADMIN
6. scopes.has("tenant")               → TENANT_MEMBER     ← terminal
7. scopes.has("user")                 → AUTHENTICATED_USER
8. otherwise                          → UNKNOWN  (fails readiness)
```

### 4.2 What the classifier cannot see, by construction

- **The arguments of a guard.** It matches `requirePermission(` as a token; it never reads *which* permission was
  passed. The same is true of `requireComplianceOrgScope(req, "<permission>", "<audit op>")`.
- **A second check later in the same handler.** Precedence returns at the first matching scope.
- **Role-to-permission mapping.** `src/lib/org/rbac.ts` is never consulted.
- **Service- or repository-layer enforcement.** It reads route files and one level of module-local helpers only.
- **Boolean-field enforcement.** A derived capability such as `canViewCompensation` carries no token at all.
- **Per-action privilege inside one handler** — see §11.1, which is the deepest limitation.

Positive properties worth recording: comments are stripped before matching, module-local helper delegation **is**
resolved one level deep, and an undeclared surface with no evidence fails to `UNKNOWN` rather than to a
permissive default.

---

## 5. Why `TENANT_ADMIN` is currently zero

Not because the estate lacks tenant-admin operations. **Because no code path can emit the value.**

```
git grep -n "TENANT_ADMIN\|OWNER_ONLY" -- scripts/security/
```

returns exactly four kinds of site, and **none of them is a detector**:

| Site | Role |
|---|---|
| `route-inventory.mjs:76-77` | membership of the closed `CLASSIFICATIONS` set |
| `generate-inventory.mjs:37` | the `classificationSet` written into the JSON schema |
| `route-inventory.mjs:540` | a `tenantScoped` boolean that *tests for* them — a permanently dead branch |
| `tenant-predicates.mjs:517` | a `TENANT_CLASSES` set that includes them — never matched |

`classifyHandler` returns one of eight values and neither of these two is among them. `GUARD_TOKENS` offers no
scope that could reach them: there is no `tenant-admin` scope and no `owner` scope.

**Finding PRIV-01.** `TENANT_ADMIN` and `OWNER_ONLY` are **declared vocabulary with no detector**. The zeros are a
structural impossibility, not a measurement. Any reader — human or gate — who takes them as "no such routes
exist" is misled.

**Finding PRIV-02.** `requirePermission` — the repository's primary privilege mechanism, present in **120 route
files** at **168 call sites** — is registered at scope `tenant`. Every permission-gated handler therefore lands on
`TENANT_MEMBER` at precedence step 6 regardless of how privileged the permission is. The flattening is total: one
category absorbs three distinct tiers.

---

## 6. Why `OWNER_ONLY` is currently zero

Same mechanical reason as §5, and additionally: **no API route in the repository contains a direct role
comparison at all.**

```
git grep -nE 'role\s*===?\s*"(OWNER|ADMIN)"|\["OWNER"|includes\((ctx|scope|actor|member)\.role' \
  -- 'src/app/api/**/route.ts'
→ no matches
```

A token- or literal-matching classifier cannot find role logic in routes because there is none to find. Every
privilege decision is delegated to `requirePermission(role, permission)` or to a composed helper. The three
direct comparisons that exist live in `src/lib/`:

| Site | Purpose |
|---|---|
| `src/lib/org/rbac.ts:322` | `assignableRoles` — the role-promotion clamp |
| `src/lib/erp/active-organization.ts:85` | `canViewCompensation: role === "OWNER"` — an OWNER-only capability as a boolean |
| `src/lib/compliance/erasure-targets.ts:169` | identifies the OWNER for erasure exclusion |

---

## 7. RBAC role-to-permission matrix

`OrgRole` = `OWNER | ADMIN | MANAGER | ENGINEER | VIEWER | BILLING_ADMIN | MEMBER` (`src/lib/org/types.ts:6`).

`src/lib/org/rbac.ts` declares **71 permissions**. Grouped by the role set that holds each:

### 7.1 OWNER-only permissions — 13

```
delete_org                     transfer_ownership            approve_legal_documents
publish_legal_documents        approve_exports               approve_erasures
execute_erasures               approve_transfer_governance    decide_compliance_incidents
close_compliance_incidents     generate_compliance_evidence   revoke_compliance_evidence
view_erp_compensation
```

### 7.2 OWNER + ADMIN only permissions — 15

```
update_org                     remove_member                 change_role
run_industrial_automation_org_wide                            manage_processing_activities
manage_privacy_requests        manage_retention              manage_legal_hold
manage_legal_documents         manage_exports                manage_erasures
manage_transfer_governance     manage_compliance_incidents   view_erp
manage_erp
```

**So the policy model does define both tiers.** The question is only whether they are enforced at the API.

Reproduce: the extraction script is in §18.

---

## 8. Direct role-check inventory

| Surface | Direct role comparisons |
|---|---|
| `src/app/api/**/route.ts` | **0** |
| `src/lib/**` (enforcement) | **3** — listed in §6 |

`DIRECT_ROLE_CHECKS_TOTAL: 3`, none of them in a route.

---

## 9. Permission-based privileged-route inventory

Counting **semantic operations**, where an operation is one (handler, action) pair with its own permission check.

| Tier | Operations | Enforced where |
|---|---|---|
| **OWNER_ONLY** | **9** | 7 route files, all under `/api/compliance/` |
| **TENANT_ADMIN** | **50** | ~30 route files — 26 ERP, 2 organization, the rest compliance |
| TENANT_MEMBER-tier | 111 | the remainder |

### 9.1 The nine OWNER_ONLY operations

| Permission | Route file | Current Phase 99 class |
|---|---|---|
| `approve_exports` | `compliance/exports/[id]/route.ts` | `TENANT_MEMBER` |
| `approve_erasures` | `compliance/erasures/[id]/route.ts` | `TENANT_MEMBER` |
| `execute_erasures` | `compliance/erasures/[id]/route.ts` | `TENANT_MEMBER` |
| `approve_transfer_governance` | `compliance/subprocessors/[id]/route.ts` | `TENANT_MEMBER` |
| `approve_transfer_governance` | `compliance/transfers/[id]/route.ts` | `TENANT_MEMBER` |
| `decide_compliance_incidents` | `compliance/incidents/[id]/assessment/route.ts` | `TENANT_MEMBER` |
| `close_compliance_incidents` | `compliance/incidents/[id]/route.ts` | `TENANT_MEMBER` |
| `generate_compliance_evidence` | `compliance/evidence-packs/route.ts` | `TENANT_MEMBER` |
| `revoke_compliance_evidence` | `compliance/evidence-packs/[id]/revoke/route.ts` | `TENANT_MEMBER` |
| `approve_legal_documents` · `publish_legal_documents` | `compliance/legal-documents/entries/[id]/route.ts` | `PLATFORM_ADMIN` |

The last row classifies as `PLATFORM_ADMIN` because that handler also calls `requirePlatformSuperadmin`, which
wins at precedence step 5. The OWNER-only permission check is still invisible.

### 9.2 Three OWNER-only permissions with no route consumer

`delete_org`, `transfer_ownership` and `view_erp_compensation` appear **nowhere in `src/` except the PERMISSIONS
table** — verified with `git grep` excluding `rbac.ts` and tests.

| Permission | Finding |
|---|---|
| `delete_org` | `src/app/api/organizations/[orgId]/route.ts` exports only `GET` and `PATCH`. **There is no `DELETE` handler**, so organization deletion is not exposed over the API at all. Declared-but-unimplemented, not a gap. |
| `transfer_ownership` | No consumer, and §12 shows nobody can assign the `OWNER` role either. **Ownership cannot be transferred through the API.** A policy observation for S1, not a vulnerability. |
| `view_erp_compensation` | **Is enforced**, but not as a permission — see §10.2. |

**Finding PRIV-03.** Three OWNER-only permissions are declared without a `requirePermission` consumer. Two are
genuinely unimplemented operations; the third is enforced through a different mechanism. A permission table that
contains entries no route consults invites a false sense of coverage.

---

## 10. Helper and service-layer enforcement

### 10.1 `requireComplianceOrgScope` — permission as an argument

`src/lib/compliance/authz.ts`, used by **35 route files**. Signature:

```ts
requireComplianceOrgScope(req: NextRequest, perm: OrgPermission, operation = "compliance.admin")
```

It is strongly fail-closed, and that is worth recording as a positive control:

| Condition | Result |
|---|---|
| no session cookie / unverifiable token | `401 AUTHENTICATION_REQUIRED`, logged |
| session revoked (`isPayloadSessionActive`) | `401 SESSION_INACTIVE`, logged |
| Prisma unavailable or query error | `503 OWNER_CONTEXT_UNAVAILABLE` |
| membership ambiguous across orgs | `409 ACTIVE_ORGANIZATION_REQUIRED`, logged |
| no active organization | refused, logged |
| organization identity | resolved **server-side** from `ACTIVE` `OrganizationMember` rows — never from client input |

The classifier registers the **token** at scope `tenant` and cannot read the `perm` argument. So a route demanding
`execute_erasures` (OWNER-only) and a route demanding `view_compliance` (broad) are indistinguishable to it.

### 10.2 `canViewCompensation` — an OWNER-only control with no token at all

`src/lib/erp/active-organization.ts:85` derives `canViewCompensation: role === "OWNER"` onto the ERP scope, and
`src/lib/erp/tenant.ts:51` carries it on `ErpScope`. It is then consumed at **30+ sites** in `src/lib/erp/db.ts`
and `src/lib/erp/operations.ts`:

- financial fields are **nulled, never zeroed** when the capability is absent — `costRate`, `budget`,
  `actualCost`, `unitCost`, and financial KPI `value`/`target`;
- a `financialsVisible` flag is returned so the client knows the difference between "zero" and "withheld";
- three sites **throw `ErpError(403, "FORBIDDEN")`** outright: `db.ts:159`, `operations.ts:527`,
  `operations.ts:891`.

**Finding PRIV-04.** This is a **second, entirely different enforcement mechanism** — a derived boolean on a scope
object, enforced in the repository layer. It has no guard token, no permission call at the route, and no textual
signature of any kind. A token-matching classifier cannot detect it even in principle, and a future one that
inspects `requirePermission` arguments still would not find it.

---

## 11. Handler-by-handler candidate table

Representative rather than exhaustive at row level: the 59 privileged operations fall into five enforcement
shapes, and every member of a shape shares the same answer. Divergences are named.

| # | Route · method | Operation | Auth guard | Tenant guard | Permission guard | Guard location | Allowed roles | Denied | Org binding | Client-controlled privileged input | Enforcement verdict | Phase 99 class | Expected class | Mismatch |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `PATCH /api/compliance/exports/[id]` · `action=approve` | approve an export | `verifyAccessToken` + `isPayloadSessionActive` | `requireComplianceOrgScope(…, "view_exports")` | `requirePermission(scope.role, "approve_exports")` | route body, per action | OWNER | ADMIN, MANAGER, ENGINEER, VIEWER, BILLING_ADMIN, MEMBER | server-derived | none | `OWNER_ONLY_ENFORCED` | `TENANT_MEMBER` | `OWNER_ONLY` | **false negative** |
| 2 | same handler · other actions | update an export | same | same | `requirePermission(scope.role, "manage_exports")` | route body, per action | OWNER, ADMIN | all others | server-derived | none | `TENANT_ADMIN_ENFORCED` | `TENANT_MEMBER` | **false negative** |
| 3 | `PATCH /api/compliance/incidents/[id]` · `close`/`reopen` | close an incident | same | `requireComplianceOrgScope(…, "view_compliance_incidents")` | `requirePermission(scope.role, ACTION_PERMISSION[action])` → `close_compliance_incidents` | route body, per action, via a map | OWNER | all others | server-derived | `action` (clamped to the map's keys) | `OWNER_ONLY_ENFORCED` | `TENANT_MEMBER` | **false negative** |
| 4 | `POST /api/compliance/incidents/[id]/assessment` · `action=decide` | decide an assessment | same | same | ternary → `decide_compliance_incidents` | route body, per action | OWNER | all others | server-derived | `action` | `OWNER_ONLY_ENFORCED` | `TENANT_MEMBER` | **false negative** |
| 5 | `POST /api/compliance/erasures/[id]/execute` | execute an erasure | same | `requireComplianceOrgScope(…, "execute_erasures")` | the permission **is** the helper's argument | helper | OWNER | all others | server-derived | none | `OWNER_ONLY_ENFORCED` | `TENANT_MEMBER` | **false negative** |
| 6 | `POST /api/compliance/evidence-packs` | generate an evidence pack | same | `requireComplianceOrgScope(…, "generate_compliance_evidence")` | helper argument | helper | OWNER | all others | server-derived | none | `OWNER_ONLY_ENFORCED` | `TENANT_MEMBER` | **false negative** |
| 7 | `PATCH /api/compliance/legal-documents/entries/[id]` | approve / publish | `verifyAccessToken` + `requirePlatformSuperadmin` | `requireComplianceOrgScope` | `requirePermission(…, "approve_legal_documents" / "publish_legal_documents")` | route body | platform superadmin **and** OWNER | all others | server-derived | none | `PLATFORM_ADMIN_ENFORCED` **and** `OWNER_ONLY_ENFORCED` | `PLATFORM_ADMIN` | both | partially correct — the OWNER tier is invisible |
| 8 | `PATCH /api/organizations/[orgId]/members/[memberId]` · role branch | change a member's role | `requireOrgActor` | `requireOrgActor(req, orgId)` | `requirePermission(ctx.role, "change_role")` **+** `assignableRoles(ctx.role).includes(body.role)` | route body | OWNER, ADMIN | all others | path `orgId`, verified by `requireOrgActor` | `body.role` — **clamped**, see §12 | `TENANT_ADMIN_ENFORCED` | `TENANT_MEMBER` | **false negative** |
| 9 | `PATCH /api/organizations/[orgId]/route.ts` | update org settings | `requireOrgActor` | `requireOrgActor` | `requirePermission(ctx.role, "update_org")` | route body | OWNER, ADMIN | all others | path `orgId`, verified | none | `TENANT_ADMIN_ENFORCED` | `TENANT_MEMBER` | **false negative** |
| 10 | 26 × `/api/erp/**` | ERP read and write | `getCurrentUser` + `can(role,"admin")` | `getActiveOrganizationContext()` | `requirePermission(scope.role, "view_erp" / "manage_erp")` | route body | OWNER, ADMIN | all others | server-derived from the session-bound active-organization row | none | `TENANT_ADMIN_ENFORCED` | `TENANT_MEMBER` | **false negative** ×50 handlers |
| 11 | ERP compensation fields | read financials | as row 10 | as row 10 | **none** — `canViewCompensation` boolean | repository layer | OWNER | ADMIN and below | as row 10 | none | `OWNER_ONLY_ENFORCED` | `TENANT_MEMBER` | **false negative, undetectable** |
| 12 | `POST /api/compliance/privacy-requests/[id]/assign` | assign a request to an org | `requirePlatformSuperadmin` | n/a — platform authority | n/a | route body | platform superadmin | everyone else | **`body.organizationId`** | yes, by design | `PLATFORM_ADMIN_ENFORCED` | `PLATFORM_ADMIN` | **correct** |

### 11.1 Why a handler-level classifier cannot be made accurate here

Rows 1 and 2 are the **same handler**. Rows 3 and 4 select their permission from an action map or a ternary at
runtime. So one `(path, method)` pair legitimately spans `TENANT_MEMBER`, `TENANT_ADMIN` and `OWNER_ONLY`
depending on the request body.

**Finding PRIV-05.** The classifier's **unit of counting is wrong for this codebase**, not merely its token table.
The repository's privilege boundary is **per action**, chosen inside the handler from an
`ACTION_PERMISSION` map; a per-handler classification cannot represent that even with a perfect detector. Any
future classifier must count `(path, method, action)` and read the permission argument, or it must stop claiming
to describe privilege at all.

---

## 12. Negative-control review

Each of these was checked because its absence is a common real defect. **All pass.**

| Control | Result |
|---|---|
| Administrative route with no `requirePermission` | none found among the privileged candidates |
| UI hidden but API ungated | the ERP and compliance surfaces enforce at the API; `canViewCompensation` is enforced in the **repository**, not only in the client |
| Helper called but its result ignored | not observed — every call site inspected branches on `.ok` / `!scope.ok` and returns |
| Permission checked after the write | not observed — in rows 1-10 the check precedes the mutation; `db.ts:159` and `operations.ts:527` throw before touching data |
| Fallback on guard failure | none — refusals return, they do not continue |
| **Role taken from the client** | accepted in 3 places, **clamped in all 3**: `members/[memberId]` → `assignableRoles(ctx.role).includes(body.role)` else 403; `invitations` → `VALID_ORG_ROLES` membership (400) **and** `assignableRoles` (403), defaulting to `ENGINEER` when omitted; `admin/access-requests/[id]/approve` → `isInvitableRole(body.role)` |
| **Can ADMIN promote to OWNER?** | **No.** `assignableRoles("ADMIN")` = `["MANAGER","ENGINEER","VIEWER","BILLING_ADMIN"]` — ADMIN cannot even assign ADMIN |
| **Can anyone assign OWNER?** | **No.** `assignableRoles("OWNER")` = `["ADMIN","MANAGER","ENGINEER","VIEWER","BILLING_ADMIN"]`. No role can assign `OWNER` by any route |
| Can the last OWNER be removed? | `remove_member` is OWNER+ADMIN; no "last owner" invariant was found in the route. **Recorded as an ambiguity**, not a finding — the OWNER role being unassignable means a removed OWNER could leave an org without one |
| Ownership transfer without step-up | the operation does not exist (§9.2) |
| Platform-admin mistaken for tenant-admin | checked in row 12 — `requirePlatformSuperadmin` is correctly platform-scoped, and the client-supplied `organizationId` is the intended parameter of a platform operation, validated to exist |
| `organizationId` from the client on a tenant route | **none** — every tenant route derives it from the actor (row 12 is a platform route) |
| IDOR in member management | `requireOrgActor(req, orgId)` verifies the actor's membership of the path organization before any member operation |
| database vs session mode divergence | `requireComplianceOrgScope` returns `503` when Prisma is unavailable — it does **not** fall back. The ERP layer behaves the same. Contrast with DB-F1 elsewhere in the estate |
| Tests covering only the success path | **not assessable** — see §16, PRIV-07 |

One defence-in-depth note: `VALID_ORG_ROLES` in the invitations route **does** include `"OWNER"`. It is harmless
only because the second clamp rejects it. The in-file comment records that this is a Phase SECURITY-8 fix for a
real prior defect — "an ADMIN could mint an OWNER invitation" — so the clamp is load-bearing and must not be
removed.

---

## 13. Classifier false negatives

| Category | Count | Nature |
|---|---|---|
| `OWNER_ONLY` operations classified as something else | **9** (+2 in the legal-documents handler shown as `PLATFORM_ADMIN`) | permission passed as an argument, or selected per action |
| `TENANT_ADMIN` operations classified `TENANT_MEMBER` | **50** | same mechanism |
| `OWNER_ONLY` enforcement with no textual signature at all | the ERP compensation capability | derived boolean in the repository layer |

`CLASSIFIER_FALSE_NEGATIVES: 59` privileged operations, plus one whole enforcement mechanism.

## 14. Classifier false positives

**None found.** Every classification examined was either correct or under-stated. Specifically:

- no handler classified `TENANT_MEMBER` turned out to be unauthenticated or cross-tenant;
- no handler classified `PLATFORM_ADMIN` turned out to be tenant-scoped;
- `PLATFORM_ADMIN: 135` was not re-audited handler by handler in this phase and is **not** asserted correct — it
  was simply not contradicted.

One stale token is worth recording: `GUARD_TOKENS` registers **`requireActor`**, a guard that does not exist
anywhere in the codebase (0 definitions, 0 uses — the same phantom `CLAUDE.md` names). It can never match, so it
is inert, but it signals the token table has drifted from the code.

**Finding PRIV-06.** The classifier's token table contains at least one dead token and lacks the two scopes its
own output schema advertises. It is maintained by hand with no mechanism tying it to the enforcement helpers it
claims to track.

---

## 15. Policy ambiguities

| ID | Ambiguity | Why it needs a decision, not a measurement |
|---|---|---|
| **A-1** | No role can assign `OWNER`, and `transfer_ownership` has no implementation. An organization's OWNER is effectively immutable through the API. | Is that the intended governance model, or an unimplemented feature? It also means an org whose OWNER is removed cannot regain one without direct database access. |
| **A-2** | `remove_member` is OWNER+ADMIN and no "last OWNER" invariant was found in the route. | Combined with A-1, an ADMIN removing the sole OWNER would leave the organization with no OWNER and therefore no holder of the 13 OWNER-only permissions. Not demonstrated as reachable; needs a policy answer and then a test. |
| **A-3** | `view_erp_compensation` exists in the permission table but enforcement uses `role === "OWNER"` directly. | Two sources of truth for one rule. Which is authoritative, and should the permission be wired or removed? |
| **A-4** | `delete_org` is declared with no implementation. | Is organization deletion intended to exist? If yes it needs step-up authentication and an audited path before it is built. |

---

## 16. Security findings

| ID | Finding | Evidence |
|---|---|---|
| **PRIV-01** | `TENANT_ADMIN` and `OWNER_ONLY` are declared vocabulary with **no detector**. `classifyHandler` cannot emit either. The zeros are structurally impossible to be anything else. | §5 |
| **PRIV-02** | `requirePermission` (120 route files, 168 call sites) is registered at scope `tenant`, so every permission-gated handler flattens to `TENANT_MEMBER` regardless of privilege. | §5 |
| **PRIV-03** | Three OWNER-only permissions have no `requirePermission` consumer: `delete_org` and `transfer_ownership` are unimplemented operations; `view_erp_compensation` is enforced by another mechanism. | §9.2 |
| **PRIV-04** | The ERP compensation boundary is enforced as a derived boolean in the repository layer, with **no textual signature any token-matching classifier could detect**. | §10.2 |
| **PRIV-05** | The classifier's **unit of counting** is wrong for this codebase: privilege is per **action**, selected inside the handler from an `ACTION_PERMISSION` map. One `(path, method)` pair spans three tiers. | §11.1 |
| **PRIV-06** | The `GUARD_TOKENS` table is hand-maintained, lacks the two scopes its schema advertises, and contains a dead token (`requireActor`) for a guard that does not exist. | §14 |
| **PRIV-07** | Negative-test coverage for unauthorised roles could **not** be assessed: the two targeted classifier tests could not be executed in this worktree (§18). Absence of evidence, not evidence of absence. | §18 |

**No critical bypass was found.** Severity for PRIV-01 … PRIV-07 is deferred to S1. Nothing here is a
confidentiality or authorization *failure*: every privileged operation examined was **correctly enforced**. The
defect is that the instrument used to report on them cannot see them — which matters because Gate C and the
Phase 99 assurance reports consume that instrument's output.

---

## 17. Deterministic verdict

```
B04_VERDICT: CLASSIFIER_LIMITATION
```

Not `ZERO_IS_REAL`: the policy model defines 13 OWNER-only and 15 OWNER+ADMIN-only permissions, and **59
privileged operations are genuinely enforced at the API** — 9 OWNER-only, 50 tenant-admin.

Not `MIXED`: the zeros contain no true-negative component. Three OWNER-only permissions lack a route consumer
(PRIV-03), but that does not make the *reported zero* partly correct — those three were never counted by anything,
and the detector that would have counted the other nine does not exist.

Not `UNPROVEN`: the mechanism is fully established by reading `classifyHandler`, `GUARD_TOKENS` and the
PERMISSIONS table, and the enforcement is established by tracing each call chain to its decision point.

---

## 18. Reproduction manifest

```bash
# Classifier architecture
git grep -n "TENANT_ADMIN\|OWNER_ONLY" -- scripts/security/
sed -n '466,508p' scripts/security/phase99/route-inventory.mjs      # classifyHandler precedence
sed -n '405,435p' scripts/security/phase99/route-inventory.mjs      # guardEvidence
grep -nE 'token: "|scope: "' scripts/security/phase99/route-inventory.mjs

# Role / permission model
sed -n '/export type OrgRole/,/;/p' src/lib/org/types.ts
node -e "const fs=require('fs');const m=fs.readFileSync('src/lib/org/rbac.ts','utf8')
  .match(/const PERMISSIONS:[^=]*=\s*\{([\s\S]*?)\n\};/)[1];const r={};let x,re=/^\s*([a-z_]+):\s*\[([^\]]*)\]/gm;
  while((x=re.exec(m)))r[x[1]]=x[2].split(',').map(s=>s.trim().replace(/[\"']/g,'')).filter(Boolean);
  const own=Object.entries(r).filter(([,v])=>v.length===1&&v[0]==='OWNER');
  const adm=Object.entries(r).filter(([,v])=>v.length>1&&v.every(z=>z==='OWNER'||z==='ADMIN'));
  console.log('permissions',Object.keys(r).length,'owner-only',own.length,'admin-tier',adm.length);"

# Enforcement
git grep -nE 'role\s*===?\s*\"(OWNER|ADMIN)\"' -- 'src/app/api/**/route.ts'   # → no matches
git grep -l "requirePermission(" -- 'src/app/api/**/route.ts' | wc -l          # → 120
git grep -l "requireComplianceOrgScope" -- 'src/app/api/**/route.ts' | wc -l   # → 35
git grep -n "canViewCompensation" -- src | grep -v __tests__                   # → 30+ sites
sed -n '/export function assignableRoles/,/^}/p' src/lib/org/rbac.ts

# Gate
npm run security:phase99:inventory:check        # → committed inventory matches the source tree (exit 0)
```

### 18.1 Tests — what ran and what did not

| Command | Result |
|---|---|
| `npm run security:phase99:inventory:check` | **PASS** (exit 0) — it is a dependency-free Node script |
| `npx --no-install vitest run scripts/__tests__/phase99-route-inventory-completeness.test.ts scripts/__tests__/phase99-tenant-guard-recognition.test.ts` | **NOT RUN** — `node_modules` is **absent** in this worktree. It is a *sibling* of the main checkout, not nested under it, so nothing resolves upward, and installing packages is not permitted in this phase. |

**Not executed ⇒ not reported as passing.** Two targeted tests exist that bear directly on this phase —
`phase99-route-inventory-completeness.test.ts` and `phase99-tenant-guard-recognition.test.ts` — and their result
is unknown. The inventory `--check` passing is **not** evidence of semantic authorization correctness; it only
proves the committed JSON matches what the classifier currently produces, including every false negative above.

---

## 19. Gate A decision

`S0-B-04` is **CLOSED**, with the verdict `CLASSIFIER_LIMITATION`.

The closure conditions are met: the classifier is fully understood (§4, §5); the role and permission helpers are
inventoried (§7, §8, §10); every privileged candidate is adjudicated (§9, §11); the tenant-`OWNER` versus
resource-owner distinction is defined and applied (§3, §6); a reproducible semantic count is given (§9, §18); and
the ambiguities are explicit and bounded to four policy questions (§15).

Gate A overall remains **NOT PASSED**: `S0-B-03` awaits an independent-vantage request and `S0-B-05` is untouched.

---

## 20. Recommended S1 remediation design — design only, not executed

1. **Give the classifier the two scopes, or delete them from the schema.** Advertising `TENANT_ADMIN` and
   `OWNER_ONLY` while no code path can emit them is worse than omitting them, because a reader treats a zero as a
   measurement.
2. **Read the permission argument.** `requirePermission(role, "<perm>")` and
   `requireComplianceOrgScope(req, "<perm>", …)` both carry the permission as a literal. Parse it and join against
   the PERMISSIONS table to derive the tier mechanically — then the table becomes the single source of truth.
3. **Count `(path, method, action)`**, not `(path, method)`, and resolve `ACTION_PERMISSION` maps and ternaries.
   Without this, rows 1-4 of §11 remain unrepresentable.
4. **Register enforcement helpers by provenance, not by name.** Tie `GUARD_TOKENS` to the modules that export the
   helpers so a rename or a new helper fails the gate instead of silently producing `UNKNOWN` or a wrong tier.
   Remove the dead `requireActor` token.
5. **Make capability booleans declarable.** `canViewCompensation` needs a way to announce itself — for example a
   registry of scope-derived capabilities with their required role — or it will stay invisible to every future
   classifier.
6. **Decide the four policy questions in §15** before building anything: OWNER immutability, the last-OWNER
   invariant, which source of truth governs ERP compensation, and whether `delete_org` should exist.
7. **Add negative tests per tier.** For each of the 59 privileged operations, assert that a role one step below
   the requirement is refused with the expected status. That converts §12's static reasoning into executed
   evidence and closes PRIV-07.
8. **Keep the two positive controls and test them explicitly**: `assignableRoles` (no role can assign `OWNER`) and
   `requireComplianceOrgScope`'s fail-closed ladder. Both are load-bearing and both were previously the subject of
   a real defect.
