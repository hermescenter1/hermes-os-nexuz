# Phase 96 — Multi-Currency Policy & Money Safety

Source: `src/lib/billing-governance/money.ts` and `types.ts`.

## Currency readiness vs activation

| Constant | Value | Meaning |
| --- | --- | --- |
| `SUPPORTED_CURRENCIES` | `["GBP", "EUR", "USD"]` | Currencies the platform is **ready to model** |
| `ACTIVE_CURRENCIES` | `["GBP"]` | Currencies that may actually be **charged** today |

`isSupportedCurrency()` / `isActiveCurrency()` are separate type guards.
Every plan definition (`plan-registry.ts`) already lists `["GBP", "EUR",
"USD"]` under `allowedCurrencies` — the plan structure is multi-currency-ready
— but `assertChargeableCurrency(currency)` throws `CURRENCY_NOT_ACTIVE` for
anything other than `GBP`. **There is no implicit conversion anywhere in this
package**: EUR/USD are recognised as valid, well-formed currencies for
future activation, never silently converted to or reconciled against GBP.

The pre-existing `Currency` Prisma enum (`prisma/schema.prisma`) additionally
carries a legacy `IRR` value predating Phase 96 (Iranian Rial, from an
earlier iteration of the platform); Phase 96 does not activate, deactivate or
otherwise touch that value — it is simply not part of
`SUPPORTED_CURRENCIES`.

## No JavaScript floating-point money arithmetic

`money.ts` is explicit that **Option 1 (keep `Decimal`)** was chosen for
Phase 96: the existing `Decimal(20,4)` Prisma columns
(`Plan.monthlyPrice`/`yearlyPrice`, `Invoice.subtotal`/`tax`/`total`,
`Payment.amount`/`refundedAmount`) are retained, and all **new** Phase 96
arithmetic operates on:

- **decimal strings** matching the column precision (`DECIMAL_STRING =
  /^-?\d{1,16}(\.\d{1,4})?$/`), or
- **integer minor units** (`bigint`, ×10⁴) derived from those strings via
  `toMinorUnits()` / rendered back via `fromMinorUnits()`.

No `parseFloat`, no `Number` arithmetic on money anywhere in this module.
`compareMoney(a, b)` compares two decimal strings without float error by
comparing their `bigint` minor-unit representations.

### Money helper functions

| Function | Purpose |
| --- | --- |
| `isValidMoneyString(value)` | Type-guards a decimal string (≤16 integer digits, ≤4 decimal places) |
| `toMinorUnits(decimal)` | Decimal string → `bigint` minor units; throws `INVALID_MONEY_STRING` on malformed input (fail closed) |
| `fromMinorUnits(minor)` | `bigint` minor units → decimal string (4 dp) |
| `compareMoney(a, b)` | `-1 \| 0 \| 1`, no float error |
| `refundWithinBounds({ refund, amountPaid, alreadyRefunded })` | `0 < refund ≤ (paid − alreadyRefunded)`, all in minor units; malformed input → `false` |
| `assertChargeableCurrency(currency)` | Throws unless `currency` is in `ACTIVE_CURRENCIES` |
| `currencyIsImmutable(existing, incoming)` | `true` only when unchanged |

## Refunds — bounded, Billing-Admin only, audited (by design)

The policy is: a refund must be strictly positive and may never exceed
`amountPaid − alreadyRefunded` (`refundWithinBounds`), and the `Payment`
model carries `refundedAmount`, `refundedAt`, `refundReason`,
`refundedById` (Phase 96 additive migration) specifically so a refund is
always attributable and auditable. `refundedById` is documented in the
schema as "userId of the authorising Billing Admin"-style attribution,
consistent with the wider Billing-Admin-only override policy (see
[`admin-override-boundary.md`](./admin-override-boundary.md)).

**Not yet wired**: there is no API route in this codebase that calls
`refundWithinBounds()` or writes to `Payment.refundedAmount`. The bounding
function is implemented and unit-tested in isolation
(`money-and-audit.test.ts`), and the database columns exist, but no
refund-issuing service or route exists yet to enforce the Billing-Admin-only
gate at the HTTP layer. This should be treated as a documented gap, not an
implemented control, until a route is added.

## Currency immutability after invoice issue

`currencyIsImmutable(existing, incoming)` is a pure equality check intended
to guard an already-issued `Invoice.currency` from being changed. It is
unit-tested (`currencyIsImmutable("GBP","GBP") === true`,
`currencyIsImmutable("GBP","USD") === false`) but, like the refund helper,
**is not yet called from any invoice-mutation route** — `src/lib/billing/invoices.ts`
(Phase 31) does not currently invoke it before any update path.

## Known gap: legacy invoice/payment generation still uses floating point

`src/lib/billing/invoices.ts` (`generateInvoice`) and
`src/lib/billing/payments.ts` (`recordManualPayment`) — both pre-existing
Phase 31 code, unchanged by this phase — take `subtotal`/`amount` as plain
JS `number`, compute `tax = subtotal * taxRate` and `total = subtotal + tax`
with ordinary floating-point arithmetic, and only convert to a decimal
string at the point of writing to Prisma (`.toFixed(4)`). This means the
`Decimal(20,4)` columns are populated by float-derived values on these two
call paths, not by the new `money.ts` bigint-safe arithmetic. The Phase 96
money module fulfils the "no float money arithmetic" requirement for the
code introduced in this phase; it has not (yet) been retrofitted into the
pre-existing invoice/payment generation code that still writes to the same
columns.

## Tests

`src/lib/billing-governance/__tests__/money-and-audit.test.ts` (11 cases):
decimal-string validation, round-trip through minor units including the
classic `0.1 + 0.2` float trap (`fromMinorUnits(toMinorUnits("0.1") +
toMinorUnits("0.2")) === "0.3000"`), comparison, refund-bounds edge cases
(exact match allowed, over-refund denied, zero/negative denied, malformed
input denied, partial-already-refunded correctly reduces headroom),
active/inactive currency assertion, and currency immutability.

## Owner decisions still required

- Confirm the activation date/process for EUR and USD (readiness already
  modelled; no code change needed beyond extending `ACTIVE_CURRENCIES` once
  the owner approves pricing in those currencies — see
  [`plan-and-entitlement-registry.md`](./plan-and-entitlement-registry.md)
  for the still-unresolved GBP prices themselves).
- Decide whether to wire `refundWithinBounds()` / `currencyIsImmutable()`
  into an actual route before any refund or currency-mutation capability is
  exposed to a Billing-Admin.
