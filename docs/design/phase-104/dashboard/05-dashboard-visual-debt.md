# Phase 104-I.D0 — Visual debt ledger

Debt is recorded here as **measured**, and each item says whether Gate A closed
it or deferred it. Consuming a token is not evidence that a route is designed,
and a shared layout is not evidence that a route was migrated.

## The structural finding

There is **no `src/app/[locale]/dashboard/layout.tsx`**. Nine dashboard children
carry their own layout; the dashboard root does not. The root
`[locale]/layout.tsx` renders no chrome at all — only `<html>`, `<body>`, the
i18n provider, the cookie banner and analytics.

Consequence: **every dashboard page must supply its own shell, or render none.**
Of 71 dashboard routes, **22 declare no sub-layout**, including `/dashboard`
itself, and the whole of `digital-twin`, `organization`, `api`, `billing` and
`knowledge-graph`.

## Shell ownership across the authenticated estate (static declared)

| Declared shell | Internal routes | Share |
| --- | ---: | ---: |
| `AppShell` | 140 | 67% |
| *(none)* | 27 | 13% |
| `LegacyPageShell` | 22 | 11% |
| `JournalShell` | 12 | 6% |
| `EngineeringShell` | 6 | 3% |
| `PublicPageShell` | 1 | <1% |

**68 of 208 authenticated routes (33%) are not on the authenticated shell.**

Two entries deserve to be called out:

- **`/[locale]/academy/admin` renders the PUBLIC marketing chrome** while sitting
  behind an admin guard.
- **27 authenticated routes render no chrome at all** — the entire `/customer`
  portal (12), the entire `/automation` module (11), and four `/admin` routes.

> These counts are `STATIC_DECLARED`: a scan of each page file and its full
> layout chain. A shell reached through an intermediate wrapper is invisible to
> it. They are a map of where to look, not a verdict on any single route. DOM
> confirmation was performed for the two Gate A routes only.

## Debt closed by Gate A

| # | Item | Where | Evidence |
| --- | --- | --- | --- |
| V-01 | **Fabricated KPI** — `"Resolution Coverage: 100%"` hard-coded in the affirmative accent with no backing field | Alarm Center | removed; no unbacked metric remains |
| V-02 | **API failure rendered as a crash** — `r.ok` never checked, so a 500 envelope was stored as data and the render threw | Alarm Center | `interpretResponse()` + `NC-03` |
| V-03 | **No empty state, and no empty-vs-filtered distinction** | Alarm Center | `selectQueue()` + `NC-12` |
| V-04 | **Constant presented as observed state** — `status: "ACTIVE"` shown as a data row | Alarm Center | row removed; contract documented |
| V-05 | **Invented timestamp risk** — the feed has no per-alert time | Alarm Center | renders "Not provided by the feed" |
| V-06 | **Zero i18n** — every string English, including inside `/de` and `/fa` | Alarm Center, subnav, operations layout | 54 catalogue keys, zero carryover |
| V-07 | **Five routes shared one generic `<h1>`** — the layout owned the heading | operations family | heading moved to each page + `NC-08` |
| V-08 | **Inline `rgba()` elevation** bypassing the DNA scale | `DashboardClient` `Panel` | `shadow-e2` / `shadow-e3` |
| V-09 | **Untyped status→colour map across two semantic domains**, so `"down"` mapped to the success accent | `DashboardClient` | four exhaustive typed records + `NC-11` |
| V-10 | **Sub-44px navigation targets** | operations subnav | `min-h-11` |
| V-11 | **Active tab signalled by colour alone** | operations subnav | `aria-current="page"` |
| V-12 | **Filter state signalled by colour alone** | Alarm Center | `aria-pressed` |

## Debt recorded and DEFERRED (not authorized at Gate A)

| # | Item | Scale |
| --- | --- | --- |
| V-20 | 27 authenticated routes with no chrome | D3–D7 |
| V-21 | 22 authenticated routes on `LegacyPageShell` | D6–D7 |
| V-22 | `/academy/admin` wearing public marketing chrome | D6 |
| V-23 | `EngineeringShell` as a third parallel app shell | D9 |
| V-24 | Only 2 routes estate-wide declare `loading.tsx`; only 3 declare `not-found.tsx` | D8 |
| V-25 | `OperationsOverviewClient`, `SitesMonitorClient`, `IntelligenceWallClient`, `WarRoomClient` are still generic compositions | D3 |
| V-26 | `page-header-premium` / `global-ops-strip` are bespoke CSS classes outside the DNA component layer | D8 |

**V-25 is deliberately not closed.** Those four routes received exactly one
change — a page-owned, translated `<h1>` — because the Gate A H1 contract could
not be satisfied for the Alarm Center without moving the heading out of the
shared layout, and leaving the other four headless would have traded one defect
for four. Their internal composition is untouched. That is heading ownership, not
migration, and they remain unmigrated in the D3 backlog.
