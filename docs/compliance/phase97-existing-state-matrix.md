# Phase 97 — Existing-State Matrix (Stage 5 discovery)

> This software provides compliance-control evidence and workflows.
> It does not constitute legal advice or automatic certification.

Base of Phase 97 branch: integration HEAD `50888bd95386a55d81bd3baa9fa6c6282cbd72cc`
(= Phase 96 `fa461f1c` + hotfix `2efab8b9` merge `f005433` + LF hygiene `50888bd`).

Discovery is **read-only**. No implementation has been written. This document is the
pre-coding review artifact required by Stage 5. Columns follow the mandated schema.

---

## Legend

- **REUSE** — use the existing implementation as-is.
- **EXTEND** — additive change to an existing model/route/service.
- **NEW** — a brand-new model/service/route/UI is required.
- **MIG** — an additive, non-destructive Prisma migration is required.
- **OWNER** — an owner/legal decision is required before this can be finalised.

---

## A. Data model (Prisma) — `prisma/schema.prisma`

| Capability | Existing implementation | Security boundary | REUSE | EXTEND | NEW | MIG | OWNER |
|---|---|---|---|---|---|---|---|
| Processing inventory (RoPA) | `ProcessingActivity` (schema.prisma:3034) — org-scoped, `legalBasis String`, `dataCategories Json[]`, `thirdCountries Json`, `retentionPeriod String?`, `isActive` | org nullable (null=global) | ✔ | ✔ (add: status/approval/review-date/risk/special-cat/automated-decision/international-transfer/owners as additive nullable cols) | | ✔ | ✔ legal-basis is a **classification**, not a conclusion |
| PrivacyRequest lifecycle | `PrivacyRequest` (2885) + `PrivacyRequestType` (5 vals, 2798) + `PrivacyRequestStatus` (4 vals: PENDING/IN_REVIEW/COMPLETED/REJECTED, 2806) | org nullable; hotfix DB predicates | ✔ | ✔ (add enum values + status/policy-clock/assignment cols) | | ✔ | ✔ map 4→13 states; map 5→8 types |
| LegalDocument + acceptance | `LegalDocument` (2922) + `LegalAcceptance` (2950, append-only) + `LegalDocumentType` (7 vals) | global vs tenant via org null; hotfix public filter | ✔ | ✔ (add `status`/lifecycle enum + `supersededById`) | | ✔ | ✔ publish vs approve authority |
| Consent evidence | `ConsentRecord` (2830, append-only, versioned) + `CookieConsent` (2859, session) | org nullable | ✔ | maybe (purpose taxonomy) | | possibly | ✔ purpose list |
| Audit | `AuditLog` (470) already has `organizationId`,`outcome`,`correlationId`,`createdAt` + indexes | append-only in practice | ✔ | ✔ (extend `COMPLIANCE_AUDIT` action consts only — **no schema change**) | | | |
| Org / membership / roles | `Organization` (590), `OrganizationMember` (691), `OrgRole` incl. `COMPLIANCE_MANAGER` (512) | `@@unique([orgId,userId])` | ✔ | | | | |
| Data export job | `DataExportRequest` (2975) — org-scoped, `status String`, `downloadUrl String?`, `expiresAt DateTime?` (declared, never written) | org nullable | ✔ | ✔ (add lifecycle/token/manifest cols; wire expiresAt) | | ✔ | ✔ enable prod export |
| Erasure job | `DataDeletionRequest` (3004) — org-scoped, `status String`, `scheduledFor` (never written) | org nullable | ✔ | ✔ (add plan/idempotency cols) | | ✔ | ✔ enable prod erasure |
| Retention policy (privacy) | only `EdmsRetentionPolicy` (4620) — **EDMS-scoped, not privacy** | org nullable | | | ✔ new `RetentionPolicy` | ✔ | ✔ durations, actions |
| Legal hold | **absent** | — | | | ✔ new `LegalHold` | ✔ | ✔ reason classes |
| Subprocessor register | **absent** (Phase 64 `Vendor*` is commercial, not GDPR) | — | | | ✔ new `Subprocessor` | ✔ | ✔ contract/review status |
| Transfer register | only `ProcessingActivity.thirdCountries Json` | — | | maybe | ✔ new `DataTransfer` (or extend) | ✔ | ✔ transfer classification |
| Incident / breach | **absent** | — | | | ✔ new `ComplianceIncident` | ✔ | ✔ notification decision |
| Signed download token | **absent** (only `downloadUrl String?`) | — | | | ✔ new `ExportDownloadToken` (or hashed token col) | ✔ | |
| Platform-superadmin flag | **absent as column**; `User.role` is a plain string (`superadmin\|admin\|…`) | `requirePlatformSuperadmin` reads JWT `role==="superadmin"` | ✔ (JWT-claim gate already exists) | | | | |

Prisma facts: provider `postgresql`, all ids `cuid()`, `createdAt=now()`, `updatedAt` via `@updatedAt`
(append-only compliance models deliberately omit `updatedAt`). Additive enum values and additive
nullable columns are non-destructive. **Postgres `ALTER TYPE ... ADD VALUE` is additive** and safe.

## B. Code surface — routes / lib / services

| Capability | Existing implementation | Security boundary (DO NOT WEAKEN) | REUSE | EXTEND | NEW |
|---|---|---|---|---|---|
| Compliance authz gate | `src/lib/compliance/authz.ts` — `requireComplianceOrgScope(req,perm,op)`, `requirePlatformSuperadmin(req,op)` | ACCESS_TOKEN identity + `isPayloadSessionActive` + server-derived org (`resolveOrgScope`) + `requirePermission`; ambiguous→409, none→403 | ✔ | ✔ (accept new `OrgPermission` values) | |
| Tenant DB predicates | `src/lib/compliance/db.ts` — `getPrivacyRequestForOrg`, `updatePrivacyRequestStatusForOrg` (id+org `updateMany`, assert affected===1), `getLatestPublicLegalDocument` (org=null+published+effective), `getLegalDocumentsForOrg`, `getGlobalLegalDocuments` | IDOR defense at query level; uniform 404 | ✔ | ✔ (add scoped queries for new models) | |
| Privacy PATCH route | `api/compliance/privacy-requests/[id]/route.ts` — uses hardened gate; closed-enum status validation; allow-listed audit metadata | never reads org from body; audit = ids+enums+bool only | ✔ | ✔ (add state-machine guard + assignment/deadline) | |
| Privacy GET / overview routes | `privacy-requests/route.ts` GET + `overview/route.ts` GET — **legacy `resolveAdmin`**: trusts JWT `role`, picks **first ACTIVE org by createdAt** | still org-scoped (not a leak) but **inconsistent** with hardened gate; picks arbitrary org for multi-org admin | | ✔ **migrate to `requireComplianceOrgScope`** (closes the known follow-up) | |
| Public legal endpoint | `legal-documents/[type]/route.ts` — anonymous, org=null only, `toPublicDto` | never exposes tenant/draft/internal fields | ✔ | | |
| Consent stores | `CookieConsentBanner.tsx` (localStorage `hermes_cookie_consent` + DB `CookieConsent` + `hermes:consent-updated` event) | deny-by-default, `necessary` locked true | ✔ | possibly (evidence surfacing) | |
| ProvenExpert gate | `src/components/trust/proseal-controller.ts` + `ProvenExpertSeal.tsx` | fail-closed pre-consent; full teardown on withdrawal | ✔ (**do not weaken**) | | |
| Analytics gate | `src/components/analytics/AnalyticsProvider.tsx` | consent-mode denied by default; ad_* denied | ✔ (**do not weaken**) | | |
| RBAC permissions | `src/lib/org/rbac.ts` — `OrgPermission` string-union + `PERMISSIONS` map + `requirePermission` | role→perm matrix | ✔ | ✔ **add compliance permissions** (see Part L) | |
| Audit service | `src/lib/audit/audit-service.ts` — `recordAuditEvent` (never throws), `COMPLIANCE_AUDIT` consts | metadata verbatim → caller allow-list discipline | ✔ | ✔ (extend `COMPLIANCE_AUDIT`) | |
| Object storage | `src/lib/documents/object-storage.ts` — `getDocumentObjectStorage()` (local real; minio/s3 stubs throw) | server-generated keys only | ✔ | | ⚠ **no signed URLs** — must implement token+stream |
| Async / retention runner | operator CLI only — `scripts/audit-retention.mjs` (dry-run default, `--apply`) | protects action prefixes | ✔ (pattern) | | ✔ new `scripts/*` planners (dry-run default) |
| Env feature-flag | module-local `config.ts` accessor, disabled-by-default, fail-closed (e.g. `ot-edge/secret-backend.ts`) | fail-closed | ✔ (pattern) | | ✔ (new flags for prod export/erasure/retention execution) |

## C. UI / i18n / navigation

| Capability | Existing implementation | REUSE | EXTEND | NEW |
|---|---|---|---|---|
| Compliance UI (Phase 61) | `src/app/[locale]/compliance/**` + `ComplianceDashboardClient.tsx` (admin-gated in `rbac.ts` COMPLIANCE pattern) | ✔ | ✔ | ✔ new admin sections |
| Admin route pattern | `RequireCapability capability="admin"` + `PageShell` + `getTranslations` + `robots:noindex` | ✔ | | |
| Nav registry | `src/lib/navigation/app-nav.ts` (administration group; `pageCapability` presentation-only) | ✔ | ✔ (add entry) | |
| i18n catalogs | `messages/{en,fa,de}.json` **(CRLF)**; namespace `adminGovernance.compliance` exists | ✔ | ✔ (extend/allowlist) | |
| i18n enforcement | `fa-identical-audit.test.ts` / `de-identical-audit.test.ts` — FA/DE leaves must differ from EN or be allowlisted | must satisfy | | |
| Design system | `src/components/ds/**` — Badge, StatusIndicator, Card/ds-glass, FormField, Tabs, Dialog, Drawer, KpiCard | ✔ | | ⚠ **no Table/Select/Pagination** — hand-roll per `AuditExplorer.tsx` |

## D. CI reality (important)

- `.github/workflows/ci.yml` triggers **only on `pull_request` → `main`**.
- The integration PR (#42, base `agent/phase96-…`) and the Phase 97 PR (base
  `agent/phase96-compliance-hotfix-integration`) **do not target `main`, so GitHub
  Actions CI does not auto-run on them.** Local validation is the substitute of record.
- `deploy.yml` and `ai-governance-live-eval.yml` are **manual-dispatch only** and are
  NOT run in this phase.
- Adding a Phase 97 CI job to `ci.yml` follows convention but still only executes on
  PRs to `main`. Whether to also broaden triggers is an **OWNER decision** (would touch
  shared CI config — out of scope unless approved).

---

## Duplication / conflict risks flagged (must resolve before coding)

1. **PrivacyRequest vs DataExportRequest/DataDeletionRequest** — the generic
   `PrivacyRequest` already carries `DATA_EXPORT`/`DATA_DELETION` types, while dedicated
   `DataExportRequest`/`DataDeletionRequest` models also exist. Phase 97 must pick an
   authoritative relationship (proposal: `PrivacyRequest` is the lifecycle record;
   export/erasure jobs are child fulfilment records linked by FK). **OWNER/arch decision.**
2. **Enum breadth** — existing `PrivacyRequestType` (5) and `PrivacyRequestStatus` (4)
   are smaller than the Phase 97 taxonomy (8 types / 13 states). Additive enum values are
   safe; but the 13-state machine must be layered without breaking the 4 legacy statuses.
3. **Two RBAC axes** — app-capability axis (`roles.ts`, drives middleware + nav +
   `RequireCapability`) vs org-permission axis (`rbac.ts`, drives `requirePermission`).
   New compliance permissions belong on the **org axis**; nav/page gating can only express
   the **app axis** (`admin`). Platform-global actions use `requirePlatformSuperadmin`.
4. **Legacy `resolveAdmin`** on two GET routes is inconsistent with the hardened gate —
   migrating them is the documented follow-up and is in-scope for Part B.
