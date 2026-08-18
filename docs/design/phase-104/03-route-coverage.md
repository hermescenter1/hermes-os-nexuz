# Phase 104 — Product Route Design Coverage (Increment 104-G)

```text
PHASE104_ROUTE_COVERAGE=279/279
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
| `academy/articles/library/media` | 40 |
| `customer/vendor/candidate/careers` | 27 |
| `industrial operations` | 26 |
| `public/marketing` | 27 |
| `command/intelligence` | 16 |
| `administration/organization` | 15 |
| `reports/analytics` | 11 |
| `authentication` | 7 |
| `workspace/dashboard` | 2 |
| `error/not-found/access-denied` | 1 |
| `alarms` | 1 |

## 3. Coverage by status

| Coverage status | Routes |
|---|---|
| `COVERED_BY_SHARED_LAYOUT` | 239 |
| `VISUAL_ONLY_STATIC_PUBLIC` | 29 |
| `COVERED_BY_SHARED_TEMPLATE` | 6 |
| `MIGRATED_DIRECTLY` | 5 |

**Read this table honestly.** `COVERED_BY_SHARED_LAYOUT` is a statement about *how* a route
would receive the design language — through the shell and shared layout it already renders
inside — **not** a claim that the Phase 104 visual language has been applied to it and reviewed.

`MIGRATED_DIRECTLY` means the opposite: the route's **own content** was redesigned. Increment
104-D2 migrated two, 104-E added the homepage, and 104-F added the two Industrial Journal reading
surfaces — exactly these five:

| Route | What changed |
|---|---|
| `/auth/login` | Hermes Horizon atmosphere (Login pilot only) + a contract-owned `.ds-glass-elevated` content surface |
| `/dashboard` | The Hermes Triad — `operate` / `understand` / `act` — as the Workspace Home decision hierarchy |
| `/` | **Phase 104-E — the Observatory homepage.** Bespoke `ObservatorySignature` (asset → PLC/SCADA/HMI → evidence → Brain → hypothesis & risk → human gate → safe action), eight-chapter narrative, no stock imagery, three Glass surfaces at real depth, header/footer opt-in. **Owner + Codex approved after three visual review rounds.** The classifier matches `/` exactly, so the locale variants are one route and no other public route inherits the status. |
| `/articles` | **Phase 104-F — the Industrial Journal landing (the Evidence Pressroom).** Masthead + Evidence Folio signature, lead dossier on the landing's single Glass surface, a numbered dispatch ledger, a real discipline index, a byline register, publication paths. No card grid, no sidebar, no fabricated KPI. Exact rule, placed before the broad `/articles` prefix. |
| `/articles/[slug]` | **Phase 104-F — the article reading instrument.** 72ch measure, reading-progress instrument, real-heading margin TOC, provenance on the page's single Glass surface, editorial related rail; one `<h1>` (the 72.5 renderer emitted two). Exact rule. |

Everything else is still inheritance, not adoption. `/login` stays a **redirect** to `/auth/login`
and is deliberately *not* counted as a migrated visual route; `/dashboard/*` subroutes are matched
by a separate subtree rule and remain `COVERED_BY_SHARED_LAYOUT`, so the pilot cannot inflate the
count by inheritance. **Owner visual review status:** the homepage is approved; the two Journal surfaces are implemented and
awaiting owner + Codex visual review; Login and Workspace Home remain 104-D2 pilots awaiting their own
redesign rounds. Every other `/articles/*` route — the public sub-views (discover, latest, tags, tag,
categories, category, authors, author, trending, editors-picks, case-studies, feed) AND the private
author workspace and editorial tools — stays `COVERED_BY_SHARED_LAYOUT`: the public ones render inside
the redesigned journal shell with their own untouched compositions, the private ones keep the legacy
sidebar shell, and none inherits the migrated status because both Journal rules are exact.

## 4. The Alarm Center — correction of a false claim

An earlier revision of this document asserted that **no Alarm Center exists in the product**.
**That was wrong**, and the way it was wrong matters more than the conclusion.

The shipped surface exists and is canonical:

| | |
|---|---|
| Route | `src/app/[locale]/dashboard/operations/alerts/page.tsx` |
| Client | `src/components/operations/AlertCommandClient.tsx` |
| API | `GET /api/operations/alerts` |

The mistake was methodological: the search looked for `/alarm/i` in route and component
filenames, but the product spells this surface **alerts**. A narrow lexical scan returned nothing
and was reported as a confident negative about the entire product. The lesson is recorded here
rather than quietly deleted — a search that finds nothing is evidence about the search, not proof
about the system.

`/dashboard/operations/alerts` is now classified as the **`alarms`** family, with a rule placed
**before** the generic `/dashboard/operations` rule. Without that ordering the Alarm Center
disappears into "industrial operations" and the family looks empty, which is exactly how the
false claim survived. The gate asserts the ordering directly.

Derived movement from this correction (recomputed, not asserted; **historical — measured at
`a7b665a` on 2026-08-15 when the inventory totalled 270; the current total is 279/279 with 0
unclassified, see the header of this document**):

| Family | Before | After |
|---|---|---|
| `alarms` | 0 | **1** |
| `industrial operations` | 27 | **26** |
| total routes | 270 | **270** |

`EMPTY_FAMILIES` is now empty and every declared family owns at least one route.

### 4.1 Acknowledgement is deliberately not built

`GET /api/operations/alerts` exposes **only** `GET` — there is no acknowledge mutation, and
`AlertCommandClient.tsx` carries no acknowledge affordance. The gate asserts the exported HTTP
methods are exactly `["GET"]`, so this note cannot silently become false.

Any acknowledgement control therefore stays **omitted**. A button that appears to acknowledge an
alarm but is bound to nothing is worse than no button at all in an industrial context: it invites
an operator to believe a safety-relevant action was recorded. When a real backend contract exists,
the control can be built against it; until then it is explicitly **unbound and not shipped**.

## 5. Specificity ordering

Rules are ordered most-specific first and the first match wins. The dashboard subtree is
classified **before** the generic `/dashboard` rule, because otherwise an entire industrial
surface would be filed as "workspace" and silently lose its design owner:

| Route | Family |
|---|---|
| `/dashboard/operations/alerts` | `alarms` |
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
8. Every declared family owns at least one route; `EMPTY_FAMILIES` is empty, and no family may be
   listed as empty while actually owning routes.
9. The Alarm Center route, client and API all exist at their recorded paths, and the alerts API
   exports exactly `["GET"]` — so the "no acknowledge mutation" note cannot go stale.
10. This document publishes the derived totals, every family count and every status count
   verbatim — so the table cannot drift from the code that produced it.

## 7. Rollback

```bash
git revert --no-commit <commit-sha>
```

Removes the inventory script, its gate and this document. No product code is touched by this
increment.
