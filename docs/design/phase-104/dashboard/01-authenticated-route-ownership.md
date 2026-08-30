# Phase 104-I.D0 — Authenticated route ownership

Every number here is **derived**, never remembered. The route set comes from a
filesystem walk of `src/app`; the protected/public verdict comes from the
product's own `src/lib/auth/rbac.ts`, compiled verbatim and executed — not from
a re-implementation of its regexes, which could drift from what middleware
actually enforces.

## Derived totals

| Gate | Value |
| --- | --- |
| `ROUTES_DISCOVERED` | 279 |
| `INTERNAL_ROUTES_DISCOVERED` | 208 |
| `INTERNAL_ROUTES_CLASSIFIED` | 208 |
| `UNCLASSIFIED_INTERNAL_ROUTES` | 0 |
| `PUBLIC_ROUTES` | 71 |
| `DEAD_CLASSIFICATION_RULES` | 0 |
| `LOCALE_PARITY_BREAKS` | 0 |
| `ROUTE_LAYOUT_OWNERSHIP` | 100% (every route's full layout chain resolved) |
| `SECURITY_OWNER_RECORDED` | 100% (allowed roles derived per route) |

`LOCALE_PARITY_BREAKS = 0` means no route is protected under `/en` but public
under `/fa` (or vice versa) — the guard is locale-symmetric.

## Fail-closed classification

Rules are evaluated **most-specific-first** and the first match wins. A route
matching no rule is emitted as `UNCLASSIFIED`, which is a gate failure — it is
never absorbed into a default family.

There is deliberately **no `/dashboard` prefix catch-all**. `/dashboard` matches
exactly. A catch-all would have silently swept any future unrecognised
`/dashboard/*` child into the workspace family — precisely the
`DASHBOARD_CHILD_CLASSIFIED_AS_WORKSPACE` failure the brief forbids. Removing it
also drove `DEAD_CLASSIFICATION_RULES` to 0, since it never fired.

`/dashboard/operations/alerts` is classified by **path**, ahead of the broader
`/dashboard/operations` rule — not by a filename search for "alerts".

## Family distribution (internal routes)

| Family | Routes |
| --- | ---: |
| `erp-crm-cmms-docs` | 92 |
| `assets-connectivity` | 25 |
| `command-intelligence` | 19 |
| `administration-org` | 16 |
| `portal-vendor-customer` | 14 |
| `journal-editorial` | 12 |
| `compliance-governance` | 12 |
| `engineering-studio` | 6 |
| `predictive-reports` | 5 |
| `industrial-operations` | 4 |
| `academy-library-media` | 1 |
| `alarms` | 1 |
| `workspace-dashboard` | 1 |
| **Total** | **208** |

## Shell / chrome ownership — STATIC DECLARED

> **Honesty boundary.** The table below is a static scan of each page file and
> its entire layout chain. It records what a route *declares*. It is **not**
> proof of what the browser renders — a shell reached through an intermediate
> wrapper is invisible to it. No route may be called "designed" on this
> evidence alone; DOM confirmation is required, and was performed for the two
> Gate A reference routes only.

| Declared shell | Internal routes |
| --- | ---: |
| `AppShell` | 140 |
| `NONE` | 27 |
| `LegacyPageShell` | 22 |
| `JournalShell` | 12 |
| `EngineeringShell` | 6 |
| `PublicPageShell` | 1 |

**68 of 208 authenticated routes (33%) do not declare the authenticated `AppShell`.**

### `PublicPageShell` — 1 route(s)

| Route | Family | Allowed roles |
| --- | --- | --- |
| `/[locale]/academy/admin` | `academy-library-media` | superadmin, admin |

### `NONE` — 27 route(s)

| Route | Family | Allowed roles |
| --- | --- | --- |
| `/[locale]/admin/customers` | `administration-org` | superadmin, admin |
| `/[locale]/admin/leads` | `administration-org` | superadmin, admin |
| `/[locale]/admin/observability` | `administration-org` | superadmin, admin |
| `/[locale]/admin/vendors` | `administration-org` | superadmin, admin |
| `/[locale]/automation/executions/[id]` | `erp-crm-cmms-docs` | superadmin, admin, engineer |
| `/[locale]/automation/executions` | `erp-crm-cmms-docs` | superadmin, admin, engineer |
| `/[locale]/automation` | `erp-crm-cmms-docs` | superadmin, admin, engineer |
| `/[locale]/automation/settings` | `erp-crm-cmms-docs` | superadmin, admin, engineer |
| `/[locale]/automation/templates/[id]` | `erp-crm-cmms-docs` | superadmin, admin, engineer |
| `/[locale]/automation/templates` | `erp-crm-cmms-docs` | superadmin, admin, engineer |
| `/[locale]/automation/webhooks` | `erp-crm-cmms-docs` | superadmin, admin, engineer |
| `/[locale]/automation/workflows/[id]/builder` | `erp-crm-cmms-docs` | superadmin, admin, engineer |
| `/[locale]/automation/workflows/[id]` | `erp-crm-cmms-docs` | superadmin, admin, engineer |
| `/[locale]/automation/workflows/new` | `erp-crm-cmms-docs` | superadmin, admin, engineer |
| `/[locale]/automation/workflows` | `erp-crm-cmms-docs` | superadmin, admin, engineer |
| `/[locale]/customer/account` | `portal-vendor-customer` | superadmin, admin, engineer, customer |
| `/[locale]/customer/activity` | `portal-vendor-customer` | superadmin, admin, engineer, customer |
| `/[locale]/customer/documents` | `portal-vendor-customer` | superadmin, admin, engineer, customer |
| `/[locale]/customer` | `portal-vendor-customer` | superadmin, admin, engineer, customer |
| `/[locale]/customer/projects/[projectId]` | `portal-vendor-customer` | superadmin, admin, engineer, customer |
| `/[locale]/customer/projects` | `portal-vendor-customer` | superadmin, admin, engineer, customer |
| `/[locale]/customer/settings` | `portal-vendor-customer` | superadmin, admin, engineer, customer |
| `/[locale]/customer/subscription` | `portal-vendor-customer` | superadmin, admin, engineer, customer |
| `/[locale]/customer/support/[ticketId]` | `portal-vendor-customer` | superadmin, admin, engineer, customer |
| `/[locale]/customer/support` | `portal-vendor-customer` | superadmin, admin, engineer, customer |
| `/[locale]/customer/training` | `portal-vendor-customer` | superadmin, admin, engineer, customer |
| `/[locale]/vendor` | `portal-vendor-customer` | superadmin, admin, vendor |

### `LegacyPageShell` — 22 route(s)

| Route | Family | Allowed roles |
| --- | --- | --- |
| `/[locale]/admin/analytics` | `administration-org` | superadmin, admin |
| `/[locale]/admin/documents` | `administration-org` | superadmin, admin |
| `/[locale]/admin/documents/search` | `administration-org` | superadmin, admin |
| `/[locale]/admin` | `administration-org` | superadmin, admin |
| `/[locale]/admin/seo` | `administration-org` | superadmin, admin |
| `/[locale]/candidate/applications` | `portal-vendor-customer` | superadmin, admin, candidate |
| `/[locale]/candidate` | `portal-vendor-customer` | superadmin, admin, candidate |
| `/[locale]/compliance/consents` | `compliance-governance` | superadmin, admin |
| `/[locale]/compliance/data-transfers` | `compliance-governance` | superadmin, admin |
| `/[locale]/compliance/evidence-packs` | `compliance-governance` | superadmin, admin |
| `/[locale]/compliance/incidents` | `compliance-governance` | superadmin, admin |
| `/[locale]/compliance/legal-documents` | `compliance-governance` | superadmin, admin |
| `/[locale]/compliance/legal-holds` | `compliance-governance` | superadmin, admin |
| `/[locale]/compliance` | `compliance-governance` | superadmin, admin |
| `/[locale]/compliance/privacy-requests` | `compliance-governance` | superadmin, admin |
| `/[locale]/compliance/processing-activities` | `compliance-governance` | superadmin, admin |
| `/[locale]/compliance/retention` | `compliance-governance` | superadmin, admin |
| `/[locale]/compliance/subprocessors` | `compliance-governance` | superadmin, admin |
| `/[locale]/intelligence/unknown` | `command-intelligence` | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/knowledge/case-studio` | `command-intelligence` | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/knowledge/studio` | `command-intelligence` | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/privacy-center` | `compliance-governance` | superadmin, admin, engineer, customer, viewer, candidate, vendor |

### `EngineeringShell` — 6 route(s)

| Route | Family | Allowed roles |
| --- | --- | --- |
| `/[locale]/engineering/domains` | `engineering-studio` | superadmin, admin, engineer |
| `/[locale]/engineering/intelligence` | `engineering-studio` | superadmin, admin, engineer |
| `/[locale]/engineering/knowledge-graph` | `engineering-studio` | superadmin, admin, engineer |
| `/[locale]/engineering/memory` | `engineering-studio` | superadmin, admin, engineer |
| `/[locale]/engineering` | `engineering-studio` | superadmin, admin, engineer |
| `/[locale]/engineering/projects` | `engineering-studio` | superadmin, admin, engineer |

### `JournalShell` — 12 route(s)

| Route | Family | Allowed roles |
| --- | --- | --- |
| `/[locale]/articles/drafts` | `journal-editorial` | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/articles/editor` | `journal-editorial` | superadmin, admin |
| `/[locale]/articles/editorial-board` | `journal-editorial` | superadmin, admin |
| `/[locale]/articles/following` | `journal-editorial` | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/articles/moderation` | `journal-editorial` | superadmin, admin |
| `/[locale]/articles/my-articles` | `journal-editorial` | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/articles/reports` | `journal-editorial` | superadmin, admin |
| `/[locale]/articles/review-queue` | `journal-editorial` | superadmin, admin |
| `/[locale]/articles/saved` | `journal-editorial` | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/articles/settings` | `journal-editorial` | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/articles/submissions` | `journal-editorial` | superadmin, admin |
| `/[locale]/articles/write` | `journal-editorial` | superadmin, admin, engineer, customer, viewer, candidate, vendor |

## Full internal route inventory

| Route | Family | Declared shell | Declared by | Layouts | Allowed roles |
| --- | --- | --- | --- | ---: | --- |
| `/[locale]/academy/admin` | `academy-library-media` | `PublicPageShell` | layout | 3 | superadmin, admin |
| `/[locale]/admin` | `administration-org` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/admin/analytics` | `administration-org` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/admin/customers` | `administration-org` | `NONE` | none | 2 | superadmin, admin |
| `/[locale]/admin/documents` | `administration-org` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/admin/documents/search` | `administration-org` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/admin/leads` | `administration-org` | `NONE` | none | 2 | superadmin, admin |
| `/[locale]/admin/observability` | `administration-org` | `NONE` | none | 2 | superadmin, admin |
| `/[locale]/admin/seo` | `administration-org` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/admin/vendors` | `administration-org` | `NONE` | none | 2 | superadmin, admin |
| `/[locale]/articles/drafts` | `journal-editorial` | `JournalShell` | layout | 3 | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/articles/editor` | `journal-editorial` | `JournalShell` | layout | 3 | superadmin, admin |
| `/[locale]/articles/editorial-board` | `journal-editorial` | `JournalShell` | layout | 3 | superadmin, admin |
| `/[locale]/articles/following` | `journal-editorial` | `JournalShell` | layout | 3 | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/articles/moderation` | `journal-editorial` | `JournalShell` | layout | 3 | superadmin, admin |
| `/[locale]/articles/my-articles` | `journal-editorial` | `JournalShell` | layout | 3 | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/articles/reports` | `journal-editorial` | `JournalShell` | layout | 3 | superadmin, admin |
| `/[locale]/articles/review-queue` | `journal-editorial` | `JournalShell` | layout | 3 | superadmin, admin |
| `/[locale]/articles/saved` | `journal-editorial` | `JournalShell` | layout | 3 | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/articles/settings` | `journal-editorial` | `JournalShell` | layout | 3 | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/articles/submissions` | `journal-editorial` | `JournalShell` | layout | 3 | superadmin, admin |
| `/[locale]/articles/write` | `journal-editorial` | `JournalShell` | layout | 3 | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/assets` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/assets/[id]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/assets/analytics` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/assets/criticality` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/assets/dashboard` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/assets/documents` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/assets/health` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/assets/hierarchy` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/assets/lifecycle` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/assets/maintenance` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/assets/registry` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/assets/settings` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/automation` | `erp-crm-cmms-docs` | `NONE` | none | 3 | superadmin, admin, engineer |
| `/[locale]/automation/executions` | `erp-crm-cmms-docs` | `NONE` | none | 3 | superadmin, admin, engineer |
| `/[locale]/automation/executions/[id]` | `erp-crm-cmms-docs` | `NONE` | none | 3 | superadmin, admin, engineer |
| `/[locale]/automation/settings` | `erp-crm-cmms-docs` | `NONE` | none | 3 | superadmin, admin, engineer |
| `/[locale]/automation/templates` | `erp-crm-cmms-docs` | `NONE` | none | 3 | superadmin, admin, engineer |
| `/[locale]/automation/templates/[id]` | `erp-crm-cmms-docs` | `NONE` | none | 3 | superadmin, admin, engineer |
| `/[locale]/automation/webhooks` | `erp-crm-cmms-docs` | `NONE` | none | 3 | superadmin, admin, engineer |
| `/[locale]/automation/workflows` | `erp-crm-cmms-docs` | `NONE` | none | 3 | superadmin, admin, engineer |
| `/[locale]/automation/workflows/[id]` | `erp-crm-cmms-docs` | `NONE` | none | 3 | superadmin, admin, engineer |
| `/[locale]/automation/workflows/[id]/builder` | `erp-crm-cmms-docs` | `NONE` | none | 3 | superadmin, admin, engineer |
| `/[locale]/automation/workflows/new` | `erp-crm-cmms-docs` | `NONE` | none | 3 | superadmin, admin, engineer |
| `/[locale]/candidate` | `portal-vendor-customer` | `LegacyPageShell` | layout | 3 | superadmin, admin, candidate |
| `/[locale]/candidate/applications` | `portal-vendor-customer` | `LegacyPageShell` | layout | 3 | superadmin, admin, candidate |
| `/[locale]/cmms` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/calendar` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/checklists` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/costs` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/dashboard` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/downtime` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/failures` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/failures/[id]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/history` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/plans` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/plans/[id]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/reports` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/schedules` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/settings` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/spares` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/tasks` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/tasks/[id]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/work-orders` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/cmms/work-orders/[id]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/compliance` | `compliance-governance` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/compliance/consents` | `compliance-governance` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/compliance/data-transfers` | `compliance-governance` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/compliance/evidence-packs` | `compliance-governance` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/compliance/incidents` | `compliance-governance` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/compliance/legal-documents` | `compliance-governance` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/compliance/legal-holds` | `compliance-governance` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/compliance/privacy-requests` | `compliance-governance` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/compliance/processing-activities` | `compliance-governance` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/compliance/retention` | `compliance-governance` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/compliance/subprocessors` | `compliance-governance` | `LegacyPageShell` | page | 2 | superadmin, admin |
| `/[locale]/crm` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/crm/accounts` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/crm/accounts/[id]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/crm/customer-success` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/crm/leads` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/crm/leads/[leadId]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/crm/opportunities` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/crm/opportunities/[id]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/customer` | `portal-vendor-customer` | `NONE` | none | 3 | superadmin, admin, engineer, customer |
| `/[locale]/customer/account` | `portal-vendor-customer` | `NONE` | none | 3 | superadmin, admin, engineer, customer |
| `/[locale]/customer/activity` | `portal-vendor-customer` | `NONE` | none | 3 | superadmin, admin, engineer, customer |
| `/[locale]/customer/documents` | `portal-vendor-customer` | `NONE` | none | 3 | superadmin, admin, engineer, customer |
| `/[locale]/customer/projects` | `portal-vendor-customer` | `NONE` | none | 3 | superadmin, admin, engineer, customer |
| `/[locale]/customer/projects/[projectId]` | `portal-vendor-customer` | `NONE` | none | 3 | superadmin, admin, engineer, customer |
| `/[locale]/customer/settings` | `portal-vendor-customer` | `NONE` | none | 3 | superadmin, admin, engineer, customer |
| `/[locale]/customer/subscription` | `portal-vendor-customer` | `NONE` | none | 3 | superadmin, admin, engineer, customer |
| `/[locale]/customer/support` | `portal-vendor-customer` | `NONE` | none | 3 | superadmin, admin, engineer, customer |
| `/[locale]/customer/support/[ticketId]` | `portal-vendor-customer` | `NONE` | none | 3 | superadmin, admin, engineer, customer |
| `/[locale]/customer/training` | `portal-vendor-customer` | `NONE` | none | 3 | superadmin, admin, engineer, customer |
| `/[locale]/dashboard` | `workspace-dashboard` | `AppShell` | page | 2 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/api` | `administration-org` | `AppShell` | page | 2 | superadmin, admin |
| `/[locale]/dashboard/ats` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/ats/analytics` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/ats/candidates` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/ats/interviews` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/ats/jobs` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/ats/pipeline` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/billing` | `administration-org` | `AppShell` | page | 2 | superadmin, admin |
| `/[locale]/dashboard/copilot` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/copilot/conversations` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/copilot/insights` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/copilot/recommendations` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/customers` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/customers/accounts` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/customers/health` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/customers/risks` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/customers/success-plans` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/customers/usage` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/digital-twin` | `assets-connectivity` | `AppShell` | page | 2 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/digital-twin/assets` | `assets-connectivity` | `AppShell` | page | 2 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/digital-twin/graph` | `assets-connectivity` | `AppShell` | page | 2 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/digital-twin/layout` | `assets-connectivity` | `AppShell` | page | 2 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/industrial` | `assets-connectivity` | `AppShell` | page | 2 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/industrial/assets` | `assets-connectivity` | `AppShell` | page | 2 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/industrial/assets/[id]` | `assets-connectivity` | `AppShell` | page | 2 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/industrial/connectors` | `assets-connectivity` | `AppShell` | page | 2 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/industrial/gateways` | `assets-connectivity` | `AppShell` | page | 2 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/industrial/knowledge-graph` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/industrial/knowledge-graph/assets` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/industrial/knowledge-graph/failures` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/industrial/knowledge-graph/paths` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/industrial/knowledge-graph/procedures` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/industrial/sites` | `assets-connectivity` | `AppShell` | page | 2 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/industrial/telemetry` | `assets-connectivity` | `AppShell` | page | 2 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/knowledge` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/knowledge-graph` | `command-intelligence` | `AppShell` | page | 2 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/knowledge/articles` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/knowledge/cases` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/knowledge/failures` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/knowledge/procedures` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/multi-site` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/multi-site/benchmarks` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/multi-site/failures` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/multi-site/knowledge` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/multi-site/kpis` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/multi-site/risk` | `command-intelligence` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/operations` | `industrial-operations` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/operations/alerts` | `alarms` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/operations/intelligence` | `industrial-operations` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/operations/sites` | `industrial-operations` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/operations/war-room` | `industrial-operations` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/organization` | `administration-org` | `AppShell` | page | 2 | superadmin, admin |
| `/[locale]/dashboard/organization/departments` | `administration-org` | `AppShell` | page | 2 | superadmin, admin |
| `/[locale]/dashboard/organization/invitations` | `administration-org` | `AppShell` | page | 2 | superadmin, admin |
| `/[locale]/dashboard/organization/members` | `administration-org` | `AppShell` | page | 2 | superadmin, admin |
| `/[locale]/dashboard/organization/settings` | `administration-org` | `AppShell` | page | 2 | superadmin, admin |
| `/[locale]/dashboard/ot` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/ot/devices` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/ot/devices/[id]` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/ot/devices/[id]/edit` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/ot/devices/new` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/ot/gateways` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/ot/gateways/[id]` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/ot/gateways/[id]/edit` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/ot/gateways/new` | `assets-connectivity` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/predictive` | `predictive-reports` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/predictive/baselines` | `predictive-reports` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/predictive/recommendations` | `predictive-reports` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/predictive/risk` | `predictive-reports` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/dashboard/predictive/rul` | `predictive-reports` | `AppShell` | layout | 3 | superadmin, admin, engineer, customer, vendor |
| `/[locale]/documents` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/documents/[id]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/documents/approvals` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/documents/audit` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/documents/categories` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/documents/comments` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/documents/explorer` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/documents/folders` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/documents/retention` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/documents/revisions` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/documents/search` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/documents/settings` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/documents/templates` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/engineering` | `engineering-studio` | `EngineeringShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/engineering/domains` | `engineering-studio` | `EngineeringShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/engineering/intelligence` | `engineering-studio` | `EngineeringShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/engineering/knowledge-graph` | `engineering-studio` | `EngineeringShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/engineering/memory` | `engineering-studio` | `EngineeringShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/engineering/projects` | `engineering-studio` | `EngineeringShell` | layout | 3 | superadmin, admin, engineer |
| `/[locale]/erp` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/approvals` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/inventory` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/inventory/[id]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/kpis` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/projects` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/projects/[id]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/projects/[id]/milestones` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/projects/new` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/resources` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/settings` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/tasks` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/tasks/[id]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/teams` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/teams/[id]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/work-orders` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/erp/work-orders/[id]` | `erp-crm-cmms-docs` | `AppShell` | layout | 3 | superadmin, admin |
| `/[locale]/intelligence/unknown` | `command-intelligence` | `LegacyPageShell` | page | 2 | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/knowledge/case-studio` | `command-intelligence` | `LegacyPageShell` | page | 2 | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/knowledge/studio` | `command-intelligence` | `LegacyPageShell` | page | 2 | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/privacy-center` | `compliance-governance` | `LegacyPageShell` | page | 2 | superadmin, admin, engineer, customer, viewer, candidate, vendor |
| `/[locale]/vendor` | `portal-vendor-customer` | `NONE` | none | 2 | superadmin, admin, vendor |

Machine-readable source of truth: `audit/routes-full.json` and
`audit/routes-full.ndjson` in the evidence package.
