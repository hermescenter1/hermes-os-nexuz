# Executive Management Center — Slice G1: a tenant's customers (data, API, audit)

Status: **IMPLEMENTED AND UNIT-TESTED; NOT YET MERGED; NO UI YET (G2); NOT PROVEN ON A REAL DATABASE YET**
Date: 2026-10-13
Branch `feature/executive-slice-g-customers`.

Requirement row 3 in `REQUIREMENTS-TRACKER.md` moves from `NOT_STARTED` to
`PARTIAL`. G2 adds the Persian/English pages and the live end-to-end proof; G3
makes the management view read these rows instead of `NO_SOURCE`.

---

## 1. Why a `Party`, and not a "customer" table

The existing customer models cannot serve a tenant: `CustomerAccount` and
`CrmAccount` are unique per organization (they describe the **platform's** own
customers), `CrmOpportunity` has no tenant column, and `/api/customers/*` is an
unauthenticated fixture (Stage 1 audit). A new table was needed.

The accounting lane's plan (`docs/accounting/ACCOUNTING_EXECUTION_PLAN.md` §5,
A2, in that lane's branch) already names the shape: a **tenant-owned `Party`**
for customers and vendors. Building a separate customer model now would create
exactly the parallel, incompatible model the brief forbids. So G1 creates
`Party` itself — `kind = CUSTOMER` only, identity, contact and follow-up fields
only — and A2 adds its finance attributes (tax id, terms, control account) to
**this** table. Nothing here is a ledger, an invoice or a receivable.

**Contract for the accounting lane:** extend `Party`; keep `@@unique([organizationId, id])`
as the target of composite foreign keys; add `VENDOR` to `PartyKind`; do not
create a second counterparty table.

## 2. Schema (migration `20261013090000_tenant_customers`, additive)

| Object | What |
| --- | --- |
| `Party` | `organizationId`, `kind`, `status` (PROSPECT/ACTIVE/INACTIVE), `displayName`, `legalName`, `email`, `phone`, `city`, `country` (ISO-2), `notes`, `followUpOwnerId`, `nextActionAt`, `nextActionNote`, `lastInteractionAt`, `version`, `createdBy/updatedBy`, `archivedAt` |
| `PartyInteraction` | append-only contact log: `kind` (CALL/MEETING/EMAIL/VISIT/NOTE), `occurredAt`, `summary`, `recordedBy` |
| `ErpProject.partyId` | nullable link to the project's customer |

**Cross-tenant links cannot be stored.** Both foreign keys into `Party` are
composite — `(organizationId, partyId) → Party(organizationId, id)` — so an
interaction or a project can only point at a customer of its own organization,
whatever any code does. CHECK constraints refuse a blank name or summary, a
malformed country or email, a next-action note without a date, and a version
below 1. The DDL is Prisma's own (`migrate diff`), so the schema and the
migration cannot drift; the CHECKs are added after it. Declared in both Phase
102 lists. No existing row changes; rollback steps are in the migration header.

## 3. Permissions

`view_customers` and `manage_customers`, granted to OWNER, ADMIN and MANAGER —
separate from ERP, so a sales manager can follow up customers without
receiving project, cost or approval access. Project data on a customer needs
ERP permission **as well** (`view_erp` to read, `manage_erp` to link), which
MANAGER does not hold. None of the eight roles that carry no grants today
receives one.

## 4. API (`/api/tenant/customers/**`, all `TENANT_MEMBER` in Phase 99)

| Route | Methods |
| --- | --- |
| `/api/tenant/customers` | `GET` search (`q` over name, legal name, email, phone), `status`, `owner` (`me` or a member), `followUp` (`overdue`/`scheduled`/`none`), `archived`; cursor-paged ≤ 100 · `POST` create |
| `/api/tenant/customers/[id]` | `GET` · `PATCH` partial edit, archive, restore — carries `expectedVersion` |
| `/api/tenant/customers/[id]/interactions` | `GET` newest first, cursor-paged · `POST` record a contact |
| `/api/tenant/customers/[id]/projects` | `GET` linked projects + recorded cost per currency · `PUT` link/unlink |

The organization is always the session's server-side active organization,
bound visibly at every call site (`active.scope.organizationId`). A body or
query carrying `organizationId` is refused as an unknown field (422), not
silently ignored. Writes refuse a cross-site origin before the session is read
and accept JSON only. Validation answers name the failing fields with a generic
code and never echo values.

## 5. Behaviour the data layer guarantees

* Every query carries the caller's organization; another tenant's customer is
  **404**, never 403.
* A pagination cursor must belong to the caller's organization — otherwise
  Prisma would position the page by a foreign row and reveal where another
  tenant's customer name sorts.
* The follow-up owner must be an ACTIVE member of the same organization who may
  see customers.
* Two active customers cannot share a name (case-insensitive) inside one
  organization; another organization may use the same name. (Enforced in the
  transaction, not by a partial index, which Prisma's drift check cannot model.
  Two simultaneous creates of the same name can still both succeed — recorded.)
* Edits carry the version they read; a stale one is **409** with the current
  version. An archived customer is read-only until restored. Nothing is deleted.
* `lastInteractionAt` moves forward only: recording an older contact later does
  not hide a newer one. A contact dated in the future is refused.
* Every write audits through the transaction client (`customer.create`,
  `customer.update`, `customer.archive`, `customer.restore`,
  `customer.interaction.create`, `customer.project.link/unlink`); a change whose
  audit fails is not committed. Audit metadata names the changed fields and the
  status/owner transitions — never contact details or interaction text.
* Linked-project cost is reported **per currency**, never summed across
  currencies. There are no contracts, invoices or receivables in this product
  yet, so none are shown.

## 6. Tests

* `src/lib/customers/__tests__/service.test.ts` — isolation (foreign record 404
  on read, edit and contact; foreign cursor refused before any page query;
  foreign or ineligible follow-up owner refused), search/filters/pagination,
  create (organization and audit through the transaction client, no PII in
  audit, duplicate refused, same name allowed elsewhere, audit failure commits
  nothing, no driver message leaked), update (version in WHERE, stale refused,
  archive/restore, rename collision, note cleared with its date), interactions
  (forward-only, future refused, archived refused, foreign cursor refused),
  projects (foreign project 404, link/steal/unlink with audit, cost per currency).
  Its fake database returns COPIES, as Prisma does — a reference-returning fake
  hid a real "before" snapshot defect during development, now fixed at the
  source as well (the changed-field list is computed from the row as read,
  before the write).
* `src/app/api/tenant/customers/__tests__/routes.test.ts` — permission matrix per
  method for nine roles, ERP permission required for project data, active-org
  failures passed through, organization taken only from the server,
  `organizationId` in body or query refused, cross-site write refused before the
  session, non-JSON refused, field problems without values, version required,
  error mapping, nothing leaked.
* Phase 99: the inventory is regenerated (8 new handlers, all `TENANT_MEMBER`,
  0 `UNKNOWN`), and the whole-tree tenant analysis stays at zero violations —
  it initially flagged the six `[id]` handlers, because the organization was
  bound out of sight inside a helper; it is now bound at each call site.

## 7. Still open (G2, G3)

* G2: `/[locale]/dashboard/customers` list/detail/forms in Persian and English,
  and a live proof on an isolated database from creation to re-display,
  including the composite-key refusal by raw SQL.
* G3: the management view's customer section and tomorrow's priorities
  (overdue follow-ups) reading these rows.
