# EXISTING-FACTORY-INVENTORY.md

What Hermes OS **already has** on `main` (HEAD `153b8617`) that HFCC must reuse
rather than re-create. The owner's rule — *"inspect existing models and reuse
them; do not build a parallel or contradictory model"* — is enforced by this
inventory.

All findings are measured from the repository, not inferred.

---

## 1. PRISMA SCHEMA — SCALE AND RELEVANT DOMAINS

`prisma/schema.prisma` declares **275 models**. Models matching the factory /
gateway / telemetry / tag / evidence domain:

| Line | Model | Verdict for HFCC |
|---|---|---|
| 1209 | `IndustrialGateway` | **REUSE — this is the gateway identity.** Do not create a second gateway table. |
| 1245 | `IndustrialAsset` | REUSE (tag targets, equipment references) |
| 1308 | `TelemetryRecord` | REUSE (shadow-mode data arrives here) |
| 1338 | `IndustrialConnectorConfig` | REUSE / extend — already per-gateway connector config |
| 1476 | `AssetTag` | inspect before adding a tag model (see §4) |
| 4195 | `ComplianceEvidencePack` | **REUSE as the evidence-pack precedent** |
| 4235 | `ComplianceEvidencePackItem` | REUSE pattern for `FactoryEvidenceArtifact` |
| 6950 | `AssetTelemetryLink` | inspect — asset↔telemetry mapping may already cover tag binding |
| 6967 | `RegistryAssetTag` | inspect |
| 7701 | `EdgeGatewayProfile` | **REUSE — the credential/enrollment lifecycle already exists** |
| 7750 | `GatewayEnvelopeNonce` | **REUSE — replay protection already exists** |
| 7766 | `OtDeviceProfile` | REUSE (OT categorisation, safety class, network zone) |
| 7867 | `AutomationTag` | **REUSE — imported tag metadata already exists** |
| — | `EngineeringImport` / `EngineeringProject` | **REUSE — the secure bounded-import precedent** |
| 504 | `AccessInvite` | **REUSE as the invitation precedent** (see §5) |
| 524 | `AuditLog` | **REUSE — tenant-scoped audit with correlationId** |
| 8650 | `IdempotencyKey` | **REUSE — generic org-scoped idempotency already exists** |

---

## 2. `IndustrialGateway` — the existing gateway identity

```prisma
model IndustrialGateway {
  id             String    @id @default(cuid())
  organizationId String
  siteId         String
  name           String
  gatewayId      String    @unique   // external hardware id (serial). GLOBALLY unique.
  status         IndustrialGatewayStatus @default(OFFLINE)
  version        String?
  apiKeyId       String?             // key<->gateway binding
  lastSeenAt     DateTime?
  metadata       Json      @default("{}")
  revokedAt      DateTime?
  ...
  otProfile      EdgeGatewayProfile?     // Phase 94, 1:1 optional
  otNonces       GatewayEnvelopeNonce[]
  otImports      EngineeringImport[]
  @@index([organizationId]) @@index([siteId]) @@index([apiKeyId])
}
```

**Facts that constrain HFCC design:**

1. `gatewayId` is **globally unique and operator-supplied** (a serial number).
   The schema comment on `EdgeGatewayProfile` states this explicitly makes it
   **enumerable and unsuitable as the handle for an unauthenticated endpoint**.
   → HFCC's "issue a gatewayId" step must therefore issue the **CORE primary
   key / an opaque server-generated identifier**, not a guessable serial.
   The already-solved precedent is `EdgeGatewayProfile.ingestionId`.
2. `apiKeyId` is a **single** nullable FK → **one API key per gateway**, so a key
   rotation cannot overlap two keys. This is a known design limit
   (`h110-factory-readiness-design`). HFCC's credential lifecycle must either
   accept it or adopt FC1's `GatewayCredentialBinding` (not on `main`).
3. `onDelete: SetNull` on `apiKey` — revoking a key does not orphan the gateway.
4. **Known security precedent (FC1 F-021):** a REVOKED binding once left its
   `ApiKey` still valid. Owner decision **D-7**: a REVOKED binding must revoke
   its API key on **every** path. HFCC must honour D-7.
5. **Known availability precedent (FC1 F-020):** the shared `verifyApiKey` has
   `catch { return null }`, so a **DB outage answers 401 `invalid_api_key`**, and
   a relay HALTS on 401 until its credential changes — the path stays dead after
   DB recovery. HFCC connectivity/ingest routes must distinguish *outage* (503)
   from *invalid credential* (401). The shared helper is deliberately untouched
   (`OI-FC1-16`).

---

## 3. `TelemetryRecord` — the shadow-mode data sink

```prisma
model TelemetryRecord {
  id, organizationId, siteId, gatewayId, assetId?
  tag          String
  value        Json
  numericValue Float?            // denormalised for numeric range queries
  quality      TelemetryQuality @default(GOOD)
  unit         String?
  source       String
  timestamp    DateTime          // GATEWAY-REPORTED, UNTRUSTED
  receivedAt   DateTime @default(now())  // ALWAYS SERVER-SET
  sequenceId   String?
  @@index([organizationId, assetId, timestamp])
  @@index([gatewayId, timestamp])
  @@index([organizationId, tag, timestamp])
  @@index([organizationId, receivedAt])
}
```

The schema carries explicit **FIELD TRUST LEVELS** comments:

```
timestamp   = GATEWAY-REPORTED, UNTRUSTED (may be wrong, backdated, missing tz)
receivedAt  = SERVER-SET ONLY, never read from the ingestion payload
```

**Facts that constrain HFCC's Shadow Mode and provenance design:**

1. The table is **partition-ready but not partitioned**. Schema comment:
   a 100-gateway site at 1 Hz with 500 tags is ~4.3 B rows/day; partitioning is
   explicitly deferred. HFCC must therefore **bound every telemetry query**
   (time window + limit) and must not add an unbounded list endpoint.
2. `source` is a free-text `String`. **It must not determine provenance.**
   - Owner decision **D-2**: `source` is **never** used for provenance.
   - Owner decision **D-5** (APPROVED): fail-closed legacy provenance — a legacy
     row without server evidence is `UNKNOWN`, never LIVE / healthy / verified,
     shown as *"origin not verified"*; `source` never upgrades it; **no backfill**.
   - The Combined tree's `validateReading` **requires** `source` as policy:
     a reading without it is `422 "Invalid source"` — this is *not* a
     future-timestamp refusal. HFCC tests must not confuse the two.
3. **Freshness and "latest" both derive from `receivedAt`**, not `timestamp`
   (verified in FC1 `contract.ts`). Consequence recorded in the
   factory-readiness design: **a post-outage backfill would display old values
   as LIVE.** HFCC's Shadow Mode must therefore compute freshness on a server
   contract and must mark replayed/backfilled data as `REPLAY`, never LIVE.
4. `UNIQUE(gatewayId, sequenceId)` is **documented as deferred to "Phase 36+"
   and does not exist**. Deduplication is therefore not enforced by the DB on
   `main`. FC1 added it; HFCC on `main` alone must treat duplicates as possible.

---

## 4. Tag and engineering-import substrate — ALREADY EXISTS

### `AutomationTag` (line 7867) — imported tag metadata

Schema comment: *"Imported TAG METADATA. Carries no value and cannot write to a
device."* This is exactly HFCC's `FactoryTagDefinition` intent. **Reuse or extend
— do not create a parallel tag table** without an explicit owner decision
(`OPEN-DECISIONS.md` OD-C).

Also present: `AssetTag`, `RegistryAssetTag`, `AssetTelemetryLink`, `EdmsTag`,
`ArticleTag`, `MediaTag` — the repo already has **six** tag-shaped models. A
seventh needs justification.

### `EngineeringImport` — the secure bounded-import precedent

```prisma
model EngineeringImport {
  organizationId, siteId?, gatewayId?, uploadedById?
  sourceType     EngineeringSourceType
  sourceFilename String  @db.VarChar(255)  // "Normalised filename only -- never a client-supplied path."
  contentType    String  @db.VarChar(120)
  checksum       String  @db.VarChar(64)   // "SHA-256 of the canonicalised payload. Immutable evidence identifier."
  idempotencyKey String? @db.VarChar(128)  // "Caller-supplied, scoped to the organization."
  byteSize       Int
  status         EngineeringImportStatus  @default(PENDING)
  failureReason  EngineeringImportFailure @default(NONE)
  deviceCount, tagCount, alarmCount, networkCount, warningCount, errorCount  Int @default(0)
  startedAt, completedAt
  @@unique([organizationId, checksum])        // "Same payload twice in one tenant = duplicate, detected at the DB."
  @@unique([organizationId, idempotencyKey])
  @@index([organizationId, status, startedAt])
}
```

**This model already solves almost everything HFCC's Tag Import needs:**
normalised filename, content type, SHA-256 evidence checksum, org-scoped
idempotency, byte size, status + typed failure reason, per-category counts,
row-level warning/error counts, append-only evidence semantics, and DB-level
duplicate detection per tenant.

→ **HFCC `FactoryTagImport` should be a thin specialisation of this pattern, or
the same model with a new `sourceType`.** Recorded as OD-C.

`EngineeringProject` adds the revision/supersede pattern
(`supersededById @unique`, `@@unique([organizationId, normalizedName, revision])`)
which HFCC can reuse for re-imported tag lists.

---

## 5. Invitation substrate

### `AccessInvite` (line 504) — the existing token-invite precedent

```prisma
model AccessInvite {
  email, fullName?, company?
  role            String  @default("customer")  // "granted on accept -- never admin/superadmin"
  tokenHash       String  @unique               // HASH, not the token
  status          String  @default("PENDING")   // PENDING | ACCEPTED | EXPIRED | REVOKED
  expiresAt       DateTime
  usedAt          DateTime?
  createdByUserId String?   // loose reference -- no FK
  sourceLeadId    String?   // loose reference -- no FK
}
```

Also present: `OrganizationInvitation` (line 832).
Helper: `src/lib/auth/access-invite.ts`.

**What it already gives HFCC:** `tokenHash @unique` (the raw token is never
stored), a four-state lifecycle including `REVOKED`, `expiresAt`, and `usedAt`
for single-use enforcement.

**What it does NOT give HFCC and must be added:**

- **No `organizationId`** and **no `siteId`** → `AccessInvite` is *not*
  tenant-bound. HFCC's `FactoryInvitation` requires scoping to
  `(organizationId, factorySiteId)`, so it cannot reuse this table as-is.
- `role` is free text defaulting to `"customer"`. HFCC needs a **minimal,
  enumerated** intake capability that grants **no dashboard access at all**.
- `createdByUserId` is a *loose reference with no FK*. HFCC is audit-critical and
  should use a real FK.

→ A **new** `FactoryInvitation` model is justified; it should follow
`AccessInvite`'s hashing and lifecycle shape while adding tenant binding.
Recorded as OD-D.

---

## 6. Authorisation, session and step-up — ALREADY EXISTS

### `src/lib/auth/` (28 modules)

```
access-invite.ts  api-guards.ts   argon2-wrapper.ts  config.ts
context-result.ts crypto.ts       current-user.ts    email-service.ts
jwt-server.ts     jwt.ts          password-policy.ts password-reset.ts
rate-limiter.ts   rbac-server.ts  rbac.ts            reauth.ts
refusal-vocabulary.ts  registration.ts  request-session.ts
roles.ts          safe-return-path.ts  service.ts    session-store.ts
session.ts        sso/            token-session.ts   verification.ts
```

### The real helper names on `main`

The brief named `requireActor`, `requirePermission`, `requireSiteActor`,
`requireSitePermission` and said to use "the repository's current equivalents if
these names have changed". Measured result:

| Brief name | Exists on `main`? | Actual current equivalent |
|---|---|---|
| `requirePermission` | **yes** | `src/lib/org/rbac.ts:309` `requirePermission(...)` |
| `requireSitePermission` | **yes** | `src/lib/site/rbac.ts:26` `requireSitePermission(...)` |
| `requireActor` | **not under that name** | `src/lib/auth/request-session.ts`, `current-user.ts`, plus `src/lib/auth/api-guards.ts` → `requireAuthoring()`, `requireWritableOwner()` |
| `requireSiteActor` | **not under that name** | `src/lib/site/rbac.ts:22` `canOnSite(role, permission)` + the site-context resolver |

Also: `src/lib/org/rbac.ts:305` `can(role, permission)`,
`src/lib/org/rbac.ts:320` `assignableRoles(actorRole)`.

→ HFCC must call `requirePermission` / `requireSitePermission` and the existing
session resolver. **No new authorisation system.** Exact import paths are
re-verified in `API-CONTRACT-PROPOSAL.md` §2 before implementation.

### Step-up — `src/lib/auth/reauth.ts`

```ts
export type ReauthResult = ...
export async function requireRecentAuth(...)
```

**A step-up mechanism already exists and is the one to use.** Owner decision
**D-1**: credential operations require *session + `manage_gateway_credentials`
+ `requireRecentAuth`*. Owner decision **D-4**: legacy `apiKeyId` writes also
need session + step-up.

### Permission catalogue — `src/lib/org/rbac.ts`

`OrgPermission` is a union type (line 10) with a role matrix (line ~181).
Industrial-relevant entries measured:

```
manage_industrial                   -> OWNER, ADMIN, MANAGER
view_industrial                     -> OWNER, ADMIN, MANAGER, ENGINEER, VIEWER, BILLING_ADMIN
run_industrial_automation_org_wide  -> OWNER, ADMIN
```

The file's own comments establish the governing principle, quoted in substance:
`run_industrial_automation_org_wide` is *deliberately separate* from
`manage_industrial`, because "administer the industrial registry" is a different
capability from "run automation org-wide" — this separation is what closed the
Phase 99 defect on `POST /api/industrial/assets`.

→ **HFCC must follow the same principle:** separate permissions for
*administering a factory connection* vs. *issuing credentials* vs. *approving a
FAT*. Proposed set in `API-CONTRACT-PROPOSAL.md` §3.

`manage_gateway_credentials` — introduced by **FC1**, so it is **NOT on `main`**.
HFCC must add it (or its equivalent) itself if FC1 is not merged.

Other RBAC modules: `src/lib/ats/rbac.ts`, `src/lib/document/permissions.ts`,
`src/lib/site/rbac.ts`, `src/lib/auth/rbac{,-server}.ts`.
Lock tests exist: `src/lib/auth/__tests__/api-platform-permissions.test.ts`,
`rbac-path-boundaries.test.ts`, `src/lib/ot-edge/__tests__/ot-rbac.test.ts`.

### Audit — `AuditLog` (line 524)

```prisma
model AuditLog {
  userId?, action, entityType, entityId?, metadata Json, createdAt
  organizationId String?   // PHASE 90B -- durable audit tenancy
  outcome        String?   // attempted vs. completed
  correlationId  String?   // ties the row to its originating request
  @@index([action]) @@index([userId]) @@index([organizationId])
  @@index([createdAt]) @@index([correlationId])
}
```

**Everything HFCC's audit trail needs is already here**: tenant scoping, an
attempted-vs-completed `outcome`, and a `correlationId` for incident timeline
reconstruction. Correlation support lives in `src/lib/logger/correlation.ts`;
`src/lib/logger/` also has `safe-error.ts` and `security-events.ts`.

→ HFCC's `FactoryAuditEvent` should **not** replace `AuditLog`. See
`DATA-MODEL-PROPOSAL.md` §4 for the split actually proposed (a hash-chained
*state-transition* ledger, which `AuditLog` genuinely cannot provide, while
ordinary actions keep going to `AuditLog`).

### Idempotency — `IdempotencyKey` (line 8650)

```prisma
model IdempotencyKey {
  organizationId (FK, onDelete: Restrict), actorUserId, operation,
  keyHash, payloadHash, resultType, resultId, createdAt, expiresAt
  @@unique([organizationId, operation, keyHash])
  @@index([expiresAt])
}
```

A **generic, org-scoped, payload-hashed, expiring** idempotency ledger already
exists — exactly what the brief requires for every mutation. Helper precedent:
`src/lib/ats/idempotency.ts`. Domain variants also exist
(`RecruitmentIdempotencyKey`, `AtsManagementIdempotencyKey`), so a domain-specific
table is an accepted pattern if needed.

→ **REUSE `IdempotencyKey`.** Do not invent a new scheme.

### Tenant context — `ActiveOrganizationSelection`

```prisma
model ActiveOrganizationSelection {
  sessionId String @id   // keyed by the server-issued session row id (sid)
  userId, organizationId, ...
}
```

Schema comment: keyed by the sid *"so a client cannot choose or forge a session,
and a new login (new sid) starts with no selection. Every ERP request re-checks
the ACTIVE membership; this row is a pointer, never a grant."*

→ This is the authoritative answer to *"never trust a client-supplied
`organizationId`"*. HFCC resolves the tenant this way.

### Rate limiting

`src/lib/auth/rate-limiter.ts`.
**Known hazard:** `resolveClientIp` is **`X-Real-IP` ONLY** — trusting
`X-Forwarded-For` is a bypass (Phase 93 HIGH, already fixed). HFCC must not
introduce XFF trust. Production edge is Cloudflare.

---

## 7. Existing routes and UI surfaces HFCC must not break

### API

```
src/app/api/industrial/{alerts,assets,automation,connectors,gateways,metering,sites,telemetry}
src/app/api/ot/{devices,gateways}
```

Gateway-specific handlers:

```
src/app/api/industrial/gateways/route.ts
src/app/api/industrial/gateways/[id]/route.ts
src/app/api/industrial/gateways/[id]/heartbeat/route.ts
src/app/api/ot/gateways/route.ts
src/app/api/ot/gateways/[id]/route.ts
src/app/api/ot/gateways/[id]/envelopes/route.ts
src/app/api/ot/gateways/[id]/enrollment/route.ts
src/app/api/ot/gateways/[id]/enrollment/rotate/route.ts
src/app/api/ot/gateways/[id]/enrollment/revoke/route.ts
```

> The brief's rule *"no existing c1 API is broken without an explicit
> decision"* applies to all of the above. HFCC adds routes; it does not alter
> these signatures. The **credential issue / rotate / revoke lifecycle already
> exists** under `/api/ot/gateways/[id]/enrollment/*` (Phase 94) — HFCC's
> "Gateway Provisioning" step must drive **that**, not a second one.

### Dashboard UI

```
src/app/[locale]/dashboard/
  industrial/{assets,connectors,gateways,knowledge-graph,sites,telemetry}
  ot/{devices,gateways}
  digital-twin  multi-site  operations  predictive  knowledge  copilot
  billing  customers  organization  ats
```

→ HFCC belongs under `/[locale]/dashboard/` to inherit the authenticated shell.
Siting decision in `UX-INFORMATION-ARCHITECTURE.md` §2.

### Domain libraries

```
src/lib/industrial/   (30 tracked files) incl. gateways.ts, gateway-auth.ts,
                      alerts.ts, assets.ts, connectors.ts, db-bridge.ts,
                      brain-core.ts, automation-scope.ts
src/lib/ot-edge/      analysis-rules.ts, dto.ts, envelope-signature.ts,
                      finding-workflow.ts, gateway-envelope.ts,
                      import-envelope.ts, machine-context.ts, metrics.ts,
                      reservations.ts, secret-manager.ts, secret-backend.ts,
                      openbao-* (4 modules), persistence/, services/, http/,
                      testing/, service-context.ts
```

`src/lib/industrial/gateways.ts` already exports exactly the gateway CRUD HFCC
needs, **all org-scoped**:

```ts
listGateways(...)        getGateway(id, organizationId)
createGateway({...})     updateGateway(id, organizationId, patch)
revokeGateway(id, organizationId)   touchGatewayHeartbeat(id)
rowToGateway(r)
```

`src/lib/industrial/gateway-auth.ts` exports `verifyGatewayBinding(...)`.

> **Note:** `touchGatewayHeartbeat(id)` takes **no `organizationId`**. Every
> other function is org-scoped. This asymmetry must be inspected before HFCC
> calls it — it may be safe (the id is resolved from an already-authenticated
> binding) or it may be a tenant-isolation gap. Flagged as a Phase-1 verification
> item, **not** asserted here as a defect.

### Secrets — `src/lib/ot-edge/secret-manager.ts`, `openbao-*`

An OpenBao-backed secret plane exists. **Known constraint
(`ot-no-writable-secret-store`): the `SecretProvider` is RESOLVE-ONLY — there is
no KMS/Vault write path**, which is why per-gateway HMAC was used.

→ **This is decisive for HFCC**: Hermes **cannot** store a factory's OPC UA
password even if it wanted to. That is not merely a policy in HFCC — it is an
architectural fact of the current platform. It directly supports the brief's
rule that OPC UA credentials are entered **only on the local factory gateway**.

---

## 8. Design system — ALREADY EXISTS, 23 components

`src/components/ds/`:

```
Alert  Badge  Button  Card  Checkbox  Dialog  Drawer  EmptyState  ErrorState
FormField  IconButton  Input  InsightCard  KpiCard  Radio  Skeleton  Spinner
StatusIndicator  Switch  Tabs  TechnicalValue  Textarea  Tooltip
```

Infrastructure: `a11y.tsx`, `cn.ts`, `direction.ts`, `layers.ts`, `logic.ts`,
`overlay.ts`, `index.ts` (barrel), `showcase/`,
`token-contract.ts`, `phase104-token-contract.ts`,
`phase104-signature-contract.ts`.

**HFCC needs almost no new primitives.** `StatusIndicator`, `KpiCard`,
`TechnicalValue`, `Drawer`, `EmptyState`, `ErrorState`, `Skeleton`, `Alert`,
`Badge`, `Tabs` cover the Overview, health cards, evidence drawer and all
empty/error/skeleton states the brief demands. See `UI-DESIGN-SPEC.md` §3 for
the short list of genuinely new compositions.

> **Known hazards:**
> - The `ds` barrel's `buttonVariants` is **client-tainted** — server code must
>   not import it from the barrel (`phase-87d-public-site`).
> - **Vitest 4 (oxc) cannot import `.tsx`** — DS component tests need the
>   established workaround (`phase-87b-design-system`).
> - `token-contract.ts` / `phase104-*-contract.ts` are **enforced contracts**:
>   new tokens must be registered, not improvised.

---

## 9. i18n — 79 namespaces, 8128 leaves at HEAD, exact three-way parity

Catalogues live at the **repository root**: `messages/{en,fa,de}.json`.
`fa.json` is **CRLF**; a raw LF-vs-CRLF compare gives a Windows-only false
difference (FINDING-105-001).

Existing namespaces relevant to HFCC:

```
industrial  industrialBrain  industrialBrainReport  automation
automationStudio  automationOperations  otEdge
assetOperations  assetMaintenance  copilot  footer
```

→ `otEdge` and `industrial` are the natural homes; a **new top-level namespace
is what triggers the hardest gate**.

**Gate coupling (`i18n-namespace-gate-coupling`): a new top-level namespace
requires the leaf count bumped in TWO places and registration in the German
catalogue's `TRANSLATED_NS`.** Measured pin sites in §3.2 of
`REPOSITORY-BASELINE.md`. The German gates additionally require:

- **zero DE == EN** leaves (any genuine loanword needs an explicit
  `de-identical-allowlist` entry with a recorded reason),
- exact three-way key / placeholder / rich-tag parity,
- for Persian: `ی` not `ي`, `ک` not `ك`, correct ZWNJ.

**Recommendation:** nest HFCC's leaves under the **existing `otEdge`**
namespace (already in `TRANSLATED_NS`, already held to zero carryover) rather
than create `factoryConnection`. This avoids the `TRANSLATED_NS` registration
step entirely. Recorded as OD-E.

Known Persian carryover hazards: `fa.assetOperations` is an **English
carryover**; `fa.json` parity is otherwise exact.

---

## 10. Summary — reuse map

| HFCC domain from the brief | Reuse on `main` | New required? |
|---|---|---|
| `FactorySite` | `IndustrialSite` (+ `DigitalTwinNode` SITE) | thin extension |
| `FactoryContact` | — | **new** |
| `FactoryIntegrationRequest` | — | **new** (the HFCC aggregate) |
| `FactoryInvitation` | shape from `AccessInvite` | **new** (tenant-bound) |
| `FactoryNetworkProfile` | `OtDeviceProfile.networkZone`, `IndustrialNetworkNode` | **new** (site-level) |
| `FactoryDataSource` | `IndustrialConnectorConfig` | extend or new |
| `OpcUaProfile` | `IndustrialConnectorConfig.config` Json | **new** (typed, validated) |
| `FactoryCertificateRecord` | — | **new** |
| `FactoryTagImport` | **`EngineeringImport`** | specialise, do not duplicate |
| `FactoryTagDefinition` | **`AutomationTag`** | extend, do not duplicate |
| `GatewayProvisioning` | `IndustrialGateway` + `EdgeGatewayProfile` | thin extension |
| `GatewayPackage` | — | **new** |
| `ConnectivityCheck` | — | **new** |
| `ShadowSession` | `TelemetryRecord` as the sink | **new** (session envelope) |
| `FactoryFatRun` / `FactoryFatCheck` | — | **new** |
| `FactoryEvidenceArtifact` | `ComplianceEvidencePack{,Item}` | specialise |
| `FactoryStateTransition` | — | **new** (hash-chained) |
| `FactoryAuditEvent` | **`AuditLog`** | reuse; do not replace |
| idempotency | **`IdempotencyKey`** | reuse |
| step-up | **`requireRecentAuth`** | reuse |
| permissions | **`requirePermission` / `requireSitePermission`** | reuse + add keys |
| credential lifecycle | **`/api/ot/gateways/[id]/enrollment/*`** | reuse, do not rebuild |
| replay protection | **`GatewayEnvelopeNonce`** | reuse |
| design primitives | **23 `ds` components** | ~4 new compositions |

The brief listed 20 new models. This inventory reduces that to **12 genuinely
new models**, with 8 satisfied by extending or specialising what exists.
Detail and rationale in `DATA-MODEL-PROPOSAL.md`.
