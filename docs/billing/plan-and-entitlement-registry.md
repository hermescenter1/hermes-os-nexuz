# Phase 96 — Plan & Entitlement Registry

Source of truth: `src/lib/billing-governance/plan-registry.ts` and
`src/lib/billing-governance/entitlement-registry.ts`. Both are pure data
modules (no I/O); `policyVersion` on every plan is
`COMMERCIAL_POLICY_VERSION = "phase96.1.0"` (`types.ts`).

## The four owner-approved plans

| Plan key | Display name | Commercial status | Billing mode(s) | Trial eligible | Manual contract |
| --- | --- | --- | --- | --- | --- |
| `COMMUNITY` | Community | `AVAILABLE_SELF_SERVE` (free) | `FREE` | No (already free) | No |
| `PROFESSIONAL` | Professional | `CONFIGURATION_REQUIRED` (price unresolved) | `STRIPE_SELF_SERVE` | Yes | No |
| `TEAM` | Team | `CONFIGURATION_REQUIRED` (price unresolved) | `STRIPE_SELF_SERVE` | Yes | No |
| `ENTERPRISE` | Enterprise | `CONTACT_SALES` | `MANUAL_CONTRACT` | No | Yes |

`allowedCurrencies` for every plan is `["GBP", "EUR", "USD"]` (currency
*readiness*, not activation — see
[`multi-currency-policy.md`](./multi-currency-policy.md)).
`BASELINE_PLAN_KEY = "COMMUNITY"` — an organisation with no subscription row
resolves to Community, never to a denial of the whole platform.

`isSelfServePurchasable(planKey)` is `false` for every plan today: Community
has no Stripe checkout (it is free), and Professional/Team are
`CONFIGURATION_REQUIRED` (price unresolved), so **self-serve checkout is
fail-closed for all paid plans until the owner sets a price.** Enterprise is
never self-serve by design (`MANUAL_CONTRACT` only).

## Entitlement keys

`ENTITLEMENT_KEYS` (`types.ts`) — 19 `FEATURE` (boolean) + 8 `METERED`
(countable) keys. `paid: true` means "must fail closed without an explicit
grant"; `paid: false` marks a free Community baseline.

### FEATURE entitlements

| Key | Display name | Community baseline (`paid: false`) |
| --- | --- | --- |
| `library` | Knowledge Library | Yes |
| `journal` | Engineering Journal | Yes |
| `engineering_cases` | Engineering Cases | Yes |
| `analytics` | Analytics | Yes |
| `public_profiles` | Public Profiles | Yes |
| `industrial_brain` | Industrial Brain | No (paid) |
| `external_ai` | External AI Providers | No (paid) |
| `copilot` | Copilot | No (paid) |
| `knowledge_graph` | Knowledge Graph | No (paid) |
| `video_hub` | Video Hub | No (paid) |
| `automation_studio` | Automation Studio | No (paid) |
| `ot_gateway` | OT Gateway | No (paid) |
| `gateway_enrollment` | Gateway Enrollment | No (paid) |
| `scada_plc_connectivity` | SCADA / PLC Connectivity | No (paid) |
| `evidence_pack` | Evidence Pack | No (paid) |
| `editorial_workflow` | Editorial Workflow | No (paid) |
| `api_access` | API Access | No (paid) |
| `data_export` | Data Export | No (paid) |
| `audit_retention` | Extended Audit Retention | No (paid) |

### METERED entitlements

| Key | Display name | `paid` | Gating feature (if any) |
| --- | --- | --- | --- |
| `members` | Members (seats) | false | — |
| `sites` | Sites | false | — |
| `assets` | Assets | false | — |
| `documents` | Documents | false | — |
| `storage_bytes` | Storage | false | — |
| `gateways` | Gateways | true | `ot_gateway` |
| `ai_executions` | AI Executions | true | `industrial_brain` |
| `api_requests` | API Requests | true | `api_access` |

A metered resource whose gating feature is not in the plan resolves to
`FEATURE_DISABLED` (denied outright), independent of any numeric limit.

## Per-plan feature availability (structural, additive tiers)

`FEATURE_AVAILABILITY` in `entitlement-registry.ts`. Each tier is additive —
Professional includes everything Community has, Team includes everything
Professional has, Enterprise includes every `FEATURE` key.

| Feature | Community | Professional | Team | Enterprise |
| --- | :---: | :---: | :---: | :---: |
| library / journal / engineering_cases / analytics / public_profiles | ✔ | ✔ | ✔ | ✔ |
| industrial_brain, copilot, knowledge_graph, video_hub, data_export, api_access | | ✔ | ✔ | ✔ |
| external_ai, automation_studio, ot_gateway, gateway_enrollment, scada_plc_connectivity, evidence_pack, editorial_workflow, audit_retention | | | ✔ | ✔ |

Enterprise is the only plan where every `FEATURE` key resolves `UNLIMITED`
(feature-gate-wise); its numeric metered ceilings are still owner-decision
values or per-contract overrides (see below), not automatically unlimited.

## Numeric limits — DELIBERATELY unresolved

**Every** metered grant returned by `getPlanEntitlementGrant()` for a
resource whose gating feature is present resolves to
`limitType: "CONFIGURATION_REQUIRED"`, `limit: null` — for **all four
plans**, including Community. No numeric ceiling for `members`, `sites`,
`assets`, `documents`, `storage_bytes`, `gateways`, `ai_executions` or
`api_requests` is encoded anywhere in this registry. This is intentional: the
resolver denies creation (`COMMERCIAL_CONFIGURATION_REQUIRED`, HTTP 409) for
any of these resources on every plan until the owner supplies a real ceiling.
No number has been invented as a placeholder.

Likewise, **no price** is encoded for Professional or Team
(`commercialStatus: "CONFIGURATION_REQUIRED"`); Enterprise is priced by
manual contract only.

### `LimitType` vocabulary (`types.ts`)

| Value | Meaning |
| --- | --- |
| `UNLIMITED` | No ceiling (feature still gated separately) |
| `FIXED_LIMIT` | A resolved, configured numeric ceiling |
| `METERED_LIMIT` | A resolved metered ceiling with a usage window |
| `FEATURE_DISABLED` | The plan does not include this feature at all |
| `CONFIGURATION_REQUIRED` | Numeric ceiling not yet configured → deny paid use |
| `OWNER_DECISION_REQUIRED` | Commercial value awaits an explicit owner decision |

## Owner decisions still required

The following are **not** encoded in code anywhere and must be supplied by
the owner before the corresponding capability can be sold or consumed:

1. Monthly/yearly **price** for Professional and Team, per active currency
   (GBP at launch).
2. Numeric **seat (member) limit** per plan (Community/Professional/Team;
   Enterprise typically contract-defined).
3. Numeric **site limit** per plan.
4. Numeric **gateway limit** per plan (Team+ only, since `ot_gateway` gates
   it below Team).
5. Numeric **asset limit** per plan.
6. Numeric **document limit** per plan.
7. **Storage** ceiling per plan (unit and value — bytes vs GB not yet
   decided in code).
8. **AI execution** ceiling per plan (Professional+ only).
9. **API request** ceiling per plan (Professional+ only, `api_access`
   gated).
10. Enterprise **manual-contract terms** (limits are expected to be set via
    a time-bounded `OrganizationEntitlementOverride` per contract, not a
    registry default — see
    [`admin-override-boundary.md`](./admin-override-boundary.md)).

Until each is supplied, the platform's behaviour is exactly as tested: it
fails closed rather than granting an unbounded or arbitrarily-numbered
allowance.
