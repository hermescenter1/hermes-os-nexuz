# Accounting and customers — what the models actually support, and the next slice

Date: 2026-10-11
Read from `prisma/schema.prisma` at `d27a9f60` (merged with `origin/main 560d4af9`).

This answers brief §8's follow-up: define the accounting and customer gaps from
the **existing models and workflows**, and propose the smallest operational next
slice. Nothing here proposes hiding an absent source behind demo data.

---

## 1. Customers — the gap is structural, not a missing screen

There is **no entity in this product that means "a customer of a tenant"**.

Both candidate models are **one-to-one with an Organization**:

| Model | Tenant column | Meaning |
| --- | --- | --- |
| `CrmAccount` | `organizationId String? @unique` | one CRM account **is** one tenant |
| `CustomerAccount` | `organizationId String @unique` | one customer record **is** one tenant |
| `CrmOpportunity` | *(none at all)* | platform-global |

`@unique` is the decisive detail. A tenant's customer list would need
`organizationId` to be **non-unique** — many customers per organization. As
modelled, these are ZHARFA's own customers, where each customer happens to be a
tenant of the platform.

So the executive dashboard's `customers: NO_SOURCE` is not a missing query. Two
honest routes exist, and they serve different readers:

**(a) Platform-owner customer view — no schema change.** Reuse `CrmAccount`,
`CrmOpportunity`, `CustomerAccount` for the ZHARFA owner, clearly labelled as
platform scope, and fix the three defects the Stage-1 audit recorded:
`newLeadsThisMonth = totalLeads * 0.3` is fabricated (`src/lib/crm/db.ts:73`),
account health is seeded pseudo-random on the real-database path
(`mockHealthForAccount`, `:66`), and six paths fall back to fixtures inside a
bare `catch` so an outage renders as plausible business numbers. This serves the
platform owner, **not** a tenant manager.

**(b) Tenant-scoped customers — new schema.** A `TenantCustomer` entity with a
non-unique `organizationId`, plus contact and follow-up records. This is the
only way to answer brief §5 for a tenant, and it is a genuine new domain, not a
dashboard task.

**Recommendation: neither belongs in the next slice.** (a) is a CRM-correctness
fix that happens to be visible on a dashboard; (b) is a new domain. Doing either
under the banner of "finish the executive dashboard" would mis-scope it.

---

## 2. Accounting — the ledger is absent, but *oversight* is not

There is no `JournalEntry`, `Ledger`, `Account`, `Voucher`, `Receivable` or
`Payable` among the 276 models, and `Invoice.subscriptionId` is required, so a
billing invoice cannot represent a customer receivable. That part of brief §4
genuinely has no source.

But §4 asks for **oversight of financial activity**, and three real,
tenant-scoped models already carry it:

| Model | What it already records |
| --- | --- |
| `ErpProjectCost` | `amount`, `currency`, `category`, `date`, `description`, `projectId`, **`createdBy`** |
| `ErpApprovalRequest` + `ErpApprovalStep` | `status`, `order`, **`approverRole`**, **`decidedBy`**, **`decidedAt`**, `notes` |
| `ErpAuditEvent` | `entityType`, `entityId`, `userId`, `eventType`, `before`/`after` JSON |

Together these answer most of what §4 actually asks of a manager: *who recorded
what cost, against which project, when; what is awaiting whose approval; and
what changed.* What they cannot answer is receivables, payables, invoices to
customers, and reconciliation.

### One hard constraint that must shape the slice

**There is no exchange-rate model anywhere** (`grep` for `ExchangeRate`,
`FxRate`, `CurrencyRate` → 0 matches), and `ErpProjectCost.currency` is a free
`String` defaulting to `"USD"`. So costs in two currencies **must never be
summed**. The slice must group by currency and show each total separately, and
say so — exactly as the brief requires ("do not add different currencies
without a valid rate and a stated date").

Note this also applies to the figures slice A already ships:
`ErpProject.budget` and `.actualCost` are plain `Float` with **no currency
column at all**, so those totals are currency-less by construction. That is a
pre-existing modelling fact worth stating on the surface.

---

## 3. The smallest next operational slice

**Slice C — financial activity and approval oversight.**
Zero new models, zero migration, one new section on an existing page.

What it would show, all from real tenant rows:

* **Recorded cost in the period**, grouped by currency and by category, each
  with its own total — never one combined number.
* **Who recorded it**: `ErpProjectCost.createdBy`, with a drill-down to the cost
  lines, so "the accountant's activity" is answerable from records rather than
  from clicks or presence.
* **Approvals awaiting a decision**, by `approverRole` and age, so the manager
  sees *whose* decision is blocking, not just how many are pending.
* **Approvals decided in the period**, with `decidedBy` and `decidedAt`.
* **Budget vs recorded cost per project**, with the currency-less caveat stated.
* An explicit, permanent statement of what this is **not**: no ledger, no
  receivables, no payables, no reconciliation.

Why this is the right next step:

* it reuses the gate, the contract, the period logic and the renderer that
  slices A and B already proved;
* it needs no schema change, so it cannot destabilise a deployed database;
* it closes the part of §4 that the data genuinely supports, and makes the
  remaining part *visibly* absent rather than quietly missing;
* it is independently useful even if the ledger is never built.

### What it must not do

Invent an aged-debt table, synthesise a receivable from a project cost, or sum
across currencies. If the owner wants true accounting, that is a separate
programme with its own schema, and the honest sequence is: this oversight slice
first, ledger second — not a half-ledger dressed as both.
