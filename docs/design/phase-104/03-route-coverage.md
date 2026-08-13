# Phase 104 — Product Route Design Coverage (Increment 104-G)

```text
PHASE104_ROUTE_COVERAGE=270/270
PHASE104_UNCLASSIFIED_ROUTES=0
```

Both numbers are **derived from the filesystem** by
`scripts/design/phase104-route-inventory.mjs` and re-derived on every test run by
`scripts/__tests__/phase104-route-coverage.test.ts`. Neither is pinned. Adding a page to the
product adds it here, and if no rule matches it the gate goes red until someone gives it a
design owner.

Regenerate at any time:

```bash
node scripts/design/phase104-route-inventory.mjs --check
```

---

## 1. What this gate is actually for

The failure mode that matters in a design phase across a product this size is not an ugly
screen. It is a screen **nobody owns** — a route that predates the design language, inherits
nothing, and is never looked at again because no list says it exists.

So the rule is: every `page.*` under `src/app` maps to exactly one design family and one
coverage status, and an unmatched route **fails closed**.

The locale segment is stripped before classification: `/fa/assets` and `/en/assets` are the same
screen in two directions, not two design surfaces.

## 2. Coverage by family

| Design family | Routes |
|---|---|
| `ERP/CRM/CMMS/documents/compliance/automation` | 66 |
| `assets/connectivity` | 40 |
| `academy/articles/library/media` | 39 |
| `customer/vendor/candidate/careers` | 27 |
| `industrial operations` | 27 |
| `public/marketing` | 19 |
| `command/intelligence` | 16 |
| `administration/organization` | 15 |
| `reports/analytics` | 11 |
| `authentication` | 7 |
| `workspace/dashboard` | 2 |
| `error/not-found/access-denied` | 1 |

## 3. Coverage by status

| Coverage status | Routes |
|---|---|
| `COVERED_BY_SHARED_LAYOUT` | 241 |
| `VISUAL_ONLY_STATIC_PUBLIC` | 22 |
| `COVERED_BY_SHARED_TEMPLATE` | 7 |

**Read this table honestly.** `COVERED_BY_SHARED_LAYOUT` is a statement about *how* a route
would receive the design language — through the shell and shared layout it already renders
inside — **not** a claim that the Phase 104 visual language has been applied to it and reviewed.
As of this increment no route carries `MIGRATED_DIRECTLY`, because increment 104-D (App Shell and
Workspace adoption) has not landed. The count of routes whose appearance has actually been
changed by Phase 104 is **zero**, and this document will not imply otherwise.

## 4. A surface the brief assumes exists, and does not

The declared family `alarms` owns **zero routes**, and that is a finding rather than a gap in
this table:

> There is **no Alarm Center in the product**. No route under `src/app` and no component under
> `src/` matches `/alarm/i`. Alarm handling today lives inside the operations surfaces.

Building one is a **new feature**, not a design migration, and a UI phase is the wrong place for
it. Figma may specify the screen; the product has nothing to migrate onto. The gate asserts this
explicitly (`EMPTY_FAMILIES.alarms`), so "designed the Alarm Center" can never be claimed about a
screen with no route behind it.

**Owner decision required:** scope an Alarm Center as its own feature phase, or drop it from the
Phase 104 screen list.

## 5. Specificity ordering

Rules are ordered most-specific first and the first match wins. The dashboard subtree is
classified **before** the generic `/dashboard` rule, because otherwise an entire industrial
surface would be filed as "workspace" and silently lose its design owner:

| Route | Family |
|---|---|
| `/dashboard/operations` | `industrial operations` |
| `/dashboard/ot` | `assets/connectivity` |
| `/dashboard/predictive` | `reports/analytics` |
| `/dashboard/organization` | `administration/organization` |
| `/dashboard` | `workspace/dashboard` |

The gate asserts this ordering directly, asserts the locale-root rule matches only `/` (a naive
`/` prefix would swallow the entire product), asserts no rule is dead, and asserts an unknown
route classifies as `null`.

## 6. What the gate asserts

1. The route list is derived from the filesystem and the total is not pinned.
2. `UNCLASSIFIED_ROUTES = 0`.
3. Every classified route names a family from the declared list.
4. Every rule declares a known family, a known status and a written note.
5. No duplicate rule prefix, and **no dead rule** — every rule matches at least one route.
6. Specificity ordering holds for the dashboard subtree and the locale root.
7. An unknown route fails closed.
8. Every declared family either owns routes or is listed in `EMPTY_FAMILIES` with a reason, and
   no family is listed as empty while actually owning routes.
9. This document publishes the derived totals, every family count and every status count
   verbatim — so the table cannot drift from the code that produced it.

## 7. Rollback

```bash
git revert --no-commit <commit-sha>
```

Removes the inventory script, its gate and this document. No product code is touched by this
increment.
