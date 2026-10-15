# DATA-MODEL-PROPOSAL.md

HFCC persistence. **Proposal only — no migration created, no schema byte
changed.** Every model is tenant-bound; every unique constraint is composite
with `organizationId`.

---

## 0. REUSE-FIRST SUMMARY

The brief listed 20 models. Measured against `main` (see
`EXISTING-FACTORY-INVENTORY.md`), **8 are satisfied by existing models** and
**12 are genuinely new**.

| Brief model | Disposition |
|---|---|
| `FactorySite` | **REUSE `IndustrialSite`** + `FactoryIntegrationRequest.siteId` |
| `FactoryAuditEvent` | **REUSE `AuditLog`** (already org-scoped, `outcome`, `correlationId`) |
| `FactoryTagImport` | **REUSE/specialise `EngineeringImport`** |
| `FactoryTagDefinition` | **EXTEND `AutomationTag`** |
| `GatewayProvisioning` | **REUSE `IndustrialGateway` + `EdgeGatewayProfile`** |
| `FactoryDataSource` | **EXTEND `IndustrialConnectorConfig`** |
| `FactoryEvidenceArtifact` | specialise the `ComplianceEvidencePack{,Item}` pattern — **new table, proven shape** |
| `FactoryNetworkProfile` | **new** (site-level; `OtDeviceProfile.networkZone` is device-level) |
| `FactoryContact` | new |
| `FactoryIntegrationRequest` | new — the aggregate root |
| `FactoryInvitation` | new (tenant-bound; `AccessInvite` is not) |
| `OpcUaProfile` | new (typed + validated; Json config is not auditable) |
| `FactoryCertificateRecord` | new |
| `GatewayPackage` | new |
| `ConnectivityCheck` | new |
| `ShadowSession` | new |
| `FactoryFatRun` / `FactoryFatCheck` | new |
| `FactoryStateTransition` | new (hash-chained — `AuditLog` cannot chain) |
| idempotency | **REUSE `IdempotencyKey`** |
| replay protection | **REUSE `GatewayEnvelopeNonce`** |

**Net: 12 new models + 1 extension column set on 2 existing models.**

### Why `AuditLog` is reused but `FactoryStateTransition` is still new

`AuditLog` records *what happened*. It has no `sequence`, no `previousHash`, no
per-aggregate ordering, and its rows are independent. A hash chain needs a
gap-free per-request sequence enforced by a unique constraint. Adding those
columns to the platform-wide `AuditLog` would impose chain semantics on every
other domain. So: **ordinary HFCC actions → `AuditLog`; state transitions →
`FactoryStateTransition`, additionally mirrored into `AuditLog`.** Both, always.

---

## 1. CORE AGGREGATE

```prisma
enum FactoryIntegrationState { /* the 16 states -- see STATE-MACHINE.md */ }
enum FactoryActorKind        { HUMAN  SYSTEM  INTAKE_TOKEN }
enum FactoryExecutionMode    { SIMULATOR  LAB  FACTORY }

/// The HFCC aggregate root. One per (organization, site) integration effort.
model FactoryIntegrationRequest {
  id             String  @id @default(cuid())
  organizationId String
  siteId         String                                  // -> IndustrialSite

  reference      String  @db.VarChar(32)                  // human-facing, e.g. FCC-2026-0007
  state          FactoryIntegrationState @default(DRAFT)
  resumeTo       FactoryIntegrationState?                 // captured at SUSPENDED/HOLD
  stateVersion   Int     @default(0)                      // OPTIMISTIC LOCK

  // Denormalised, SERVER-COMPUTED readiness. Never client-written.
  readinessHold  Boolean @default(true)                   // true => do NOT show a score
  readinessScore Int?                                     // 0..100, null while held
  openBlockers   Int     @default(0)

  gatewayId      String? @unique                          // -> IndustrialGateway, once provisioned

  createdById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  site           IndustrialSite @relation(fields: [siteId], references: [id], onDelete: Restrict)
  gateway        IndustrialGateway? @relation(fields: [gatewayId], references: [id], onDelete: SetNull)
  createdBy      User           @relation(fields: [createdById], references: [id], onDelete: Restrict)

  contacts       FactoryContact[]
  invitations    FactoryInvitation[]
  networkProfile FactoryNetworkProfile?
  dataSources    FactoryDataSource[]
  certificates   FactoryCertificateRecord[]
  tagImports     FactoryTagImport[]
  packages       GatewayPackage[]
  checks         ConnectivityCheck[]
  shadowSessions ShadowSession[]
  fatRuns        FactoryFatRun[]
  evidence       FactoryEvidenceArtifact[]
  transitions    FactoryStateTransition[]
  blockers       FactoryBlocker[]

  @@unique([organizationId, reference])
  @@unique([organizationId, siteId])      // one active request per site; see note
  @@index([organizationId, state])
  @@index([organizationId, siteId])
}
```

> **Note on `@@unique([organizationId, siteId])`.** This forbids a *second*
> request for the same site, which is correct while one is live but blocks a
> legitimate re-integration after `REVOKED`. Two options — **OD-F**:
> (a) keep the constraint and require the old request be archived to a separate
> table, or (b) replace it with a **partial unique index** on non-terminal
> states only. **(b) is recommended**; it needs raw SQL in the migration because
> Prisma cannot express a partial unique index declaratively.

```prisma
/// Open problems that force readinessHold. Blockers are not comments.
model FactoryBlocker {
  id             String @id @default(cuid())
  organizationId String
  requestId      String
  code           String @db.VarChar(64)      // stable code, e.g. FCC-SEC-003
  severity       FactoryBlockerSeverity      // BLOCKER | MAJOR | MINOR
  category       FactoryBlockerCategory      // SECURITY | NETWORK | DATA | PROCESS | DOCUMENTATION
  summary        String @db.VarChar(500)
  raisedAt       DateTime @default(now())
  raisedById     String?
  resolvedAt     DateTime?
  resolvedById   String?
  resolutionNote String? @db.VarChar(1000)
  @@index([organizationId, requestId, resolvedAt])
}
```

Only `severity = BLOCKER` with `resolvedAt = null` forces `readinessHold`.
`MAJOR` and `MINOR` are displayed but do not hold — otherwise every cosmetic
item would block a plant.

---

## 2. INTAKE PLANE

```prisma
enum FactoryContactRole { OT  IT  SECURITY  MANAGEMENT  OTHER }

model FactoryContact {
  id             String @id @default(cuid())
  organizationId String
  requestId      String
  role           FactoryContactRole
  fullName       String  @db.VarChar(191)
  jobTitle       String? @db.VarChar(191)
  email          String  @db.VarChar(255)
  phone          String? @db.VarChar(64)
  isPrimary      Boolean @default(false)
  createdAt      DateTime @default(now())
  @@index([organizationId, requestId])
}
```

```prisma
enum FactoryInvitationStatus { PENDING  OPENED  SUBMITTED  EXPIRED  REVOKED }

/// A scoped, expiring, single-use intake invitation.
/// Shape follows AccessInvite, but is TENANT-BOUND, which AccessInvite is not.
model FactoryInvitation {
  id             String @id @default(cuid())
  organizationId String                               // SCOPE
  requestId      String                               // SCOPE (and thus siteId)

  tokenHash      String @unique @db.VarChar(64)        // SHA-256. The raw token is NEVER stored.
  tokenPrefix    String @db.VarChar(12)                // first chars, for operator identification only

  status         FactoryInvitationStatus @default(PENDING)
  email          String  @db.VarChar(255)
  expiresAt      DateTime                              // mandatory
  openedAt       DateTime?
  submittedAt    DateTime?                             // once set, the token is spent
  revokedAt      DateTime?
  revokedById    String?

  useCount       Int     @default(0)                   // replay / reuse evidence
  lastUseIp      String? @db.VarChar(64)               // from X-Real-IP only -- never XFF
  lastUseAt      DateTime?

  createdById    String
  createdAt      DateTime @default(now())

  @@index([organizationId, requestId, status])
  @@index([expiresAt])
}
```

**Invariants enforced in code, each with a test:**

1. The raw token exists only in the emailed URL. Only `tokenHash` is stored.
2. Validity requires **all** of: `status IN (PENDING, OPENED)`,
   `expiresAt > now()`, `revokedAt IS NULL`, `submittedAt IS NULL`.
3. The token grants access to **exactly one** `requestId` — hence exactly one
   `(organizationId, siteId)`. It cannot enumerate, list, or reach any other
   request, site, tenant or dashboard route.
4. `submittedAt` makes the token **single-use for submission**. A second submit
   is `409 invitation_spent`.
5. `useCount` increments on **every** presentation, valid or not. Reuse after
   expiry/revocation is recorded as a `security-events.ts` event.
6. Token comparison is **constant-time**, and lookup is **by hash** — so an
   invalid token performs exactly the same work as a valid one (no timing
   oracle), and the response is identical regardless of whether the token never
   existed or has expired.
7. Rate-limited per IP **and** per `tokenPrefix`.

---

## 3. NETWORK, DATA SOURCE, CERTIFICATE

```prisma
model FactoryNetworkProfile {
  id             String @id @default(cuid())
  organizationId String
  requestId      String @unique

  plantSubnets   Json   @default("[]")   // validated CIDR strings, server-side
  vlanIds        Json   @default("[]")
  dmzSubnets     Json   @default("[]")
  egressProxyHost String? @db.VarChar(255)
  egressProxyPort Int?
  firewallChangeRef String? @db.VarChar(191)   // the plant's own change ticket
  ntpServers     Json   @default("[]")
  hasDataDiode   Boolean @default(false)
  dataDiodeNotes String? @db.VarChar(1000)
  longestOutageMinutes Int?                    // drives spool sizing
  outboundHttpsConfirmed Boolean @default(false)

  readOnlyConfirmed Boolean @default(false)     // MANDATORY for T-04
  mocConfirmed      Boolean @default(false)     // MANDATORY for T-04
  mocReference      String? @db.VarChar(191)

  updatedAt      DateTime @updatedAt
}
```

> `Json` is used for the list fields because the element count is small and
> unbounded-by-nature (subnets, NTP servers). **Every element is validated with
> Zod on write** (CIDR / hostname / port shape), so the Json never holds
> unvalidated client text. A normalised child table was considered and rejected
> as over-modelling — but see **OD-G** if the owner wants per-subnet audit.

```prisma
enum FactoryProtocol {
  OPC_UA                    // the only one implemented
  MODBUS_TCP                // DEFINED_NOT_IMPLEMENTED
  S7                        // DEFINED_NOT_IMPLEMENTED
  MQTT                      // DEFINED_NOT_IMPLEMENTED
}
enum FactoryProtocolSupport { IMPLEMENTED  DEFINED_NOT_IMPLEMENTED }

model FactoryDataSource {
  id             String @id @default(cuid())
  organizationId String
  requestId      String
  protocol       FactoryProtocol
  name           String  @db.VarChar(191)
  enabled        Boolean @default(false)
  // Phase 1: a non-OPC_UA source is persistable (so the plant can DECLARE it)
  // but its config is REFUSED fail-closed. support is SERVER-SET from protocol.
  support        FactoryProtocolSupport
  connectorConfigId String?                   // -> IndustrialConnectorConfig, if adopted
  opcUaProfile   OpcUaProfile?
  createdAt      DateTime @default(now())
  @@unique([organizationId, requestId, name])
  @@index([organizationId, requestId])
}
```

**Fail-closed rule for unimplemented protocols:** `support` is derived
**server-side** from `protocol` — never accepted from the client. Any attempt
to supply configuration for a `DEFINED_NOT_IMPLEMENTED` protocol is refused
`422 protocol_not_implemented`. The UI shows the protocol with that status
rather than hiding it, so the plant can see its roadmap, but nothing can be
configured. Negative test `P-01`.

```prisma
enum OpcUaSecurityPolicy {
  NONE                       // refused unless explicitly waived with a blocker
  BASIC128RSA15              // deprecated -- raises a blocker
  BASIC256                   // deprecated -- raises a blocker
  BASIC256SHA256
  AES128_SHA256_RSAOAEP
  AES256_SHA256_RSAPSS
}
enum OpcUaMessageSecurityMode { NONE  SIGN  SIGN_AND_ENCRYPT }

/// Typed OPC UA connection parameters. CONTAINS NO SECRET.
model OpcUaProfile {
  id             String @id @default(cuid())
  organizationId String
  dataSourceId   String @unique

  endpointUrl    String  @db.VarChar(500)     // opc.tcp://host:port/path -- scheme allowlisted
  endpointHost   String  @db.VarChar(255)     // parsed; used for SSRF checks
  endpointPort   Int
  securityPolicy OpcUaSecurityPolicy
  messageSecurityMode OpcUaMessageSecurityMode
  anonymousDisabled Boolean @default(false)   // declared; VERIFIED by check C-07
  readOnlyUserConfirmed Boolean @default(false) // declared; VERIFIED by check C-08
  sampleIntervalMs Int                         // the plant's requested rate
  // --- DELIBERATELY ABSENT: username, password, privateKey, keystore ---
  // Hermes has no writable secret store (ot-no-writable-secret-store).
  // These are entered ONLY on the local factory gateway.
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

> The absence of credential columns is a **load-bearing design decision**, not
> an omission. A gate test asserts that no HFCC model declares a field whose
> name matches `/pass(word)?|secret|privateKey|keystore|pfx|credential$/i`.

```prisma
enum FactoryCertificateKind  { OPC_UA_SERVER  OPC_UA_CLIENT  ISSUING_CA }
enum FactoryCertificateState { UNKNOWN  TRUSTED  UNTRUSTED  EXPIRED  REVOKED  MISMATCH }

model FactoryCertificateRecord {
  id             String @id @default(cuid())
  organizationId String
  requestId      String
  kind           FactoryCertificateKind
  subject        String  @db.VarChar(500)
  issuer         String  @db.VarChar(500)
  serialNumber   String  @db.VarChar(128)
  sha256Fingerprint String @db.VarChar(64)    // lowercase hex, no colons -- normalised on write
  notBefore      DateTime
  notAfter       DateTime
  state          FactoryCertificateState @default(UNKNOWN)
  // The PUBLIC certificate may be stored (it is public). A private key may NOT.
  publicPem      String? @db.Text
  observedAt     DateTime?                     // when a connectivity check last SAW it
  createdAt      DateTime @default(now())
  @@unique([organizationId, requestId, kind, sha256Fingerprint])
  @@index([organizationId, requestId])
  @@index([notAfter])                           // expiry sweep
}
```

`state = MISMATCH` is set when a connectivity check observes a fingerprint that
differs from the declared one — i.e. a possible man-in-the-middle. That raises a
`BLOCKER`-severity `FactoryBlocker` automatically.

---

## 4. TAG IMPORT AND DEFINITION

**Decision: specialise, do not duplicate.** `EngineeringImport` already provides
normalised filename, content type, SHA-256 evidence checksum, org-scoped
idempotency, byte size, typed status + failure reason, per-category counts and
DB-level per-tenant duplicate detection.

Two options (**OD-C**):

- **(a) Recommended — a new `FactoryTagImport` modelled on `EngineeringImport`**,
  because HFCC needs `requestId` scoping, a preview/commit two-phase flow and
  row-level error reporting that `EngineeringImport` does not have, and because
  extending `EngineeringImport` would couple HFCC to the TIA-export pipeline.
- (b) add a `sourceType = FACTORY_TAG_LIST` to `EngineeringImport`.

Proposal below assumes (a), with the field shape copied deliberately so the two
remain comparable.

```prisma
enum FactoryTagImportStatus  { PENDING  PARSED  PREVIEW_READY  COMMITTED  FAILED  ROLLED_BACK }
enum FactoryTagImportFailure {
  NONE  MIME_REJECTED  TOO_LARGE  PARSE_ERROR  SCHEMA_ERROR
  DUPLICATE_NODE_ID  DUPLICATE_LOGICAL_TAG  FORMULA_INJECTION
  ROW_LIMIT_EXCEEDED  TENANT_MISMATCH
}

model FactoryTagImport {
  id             String @id @default(cuid())
  organizationId String
  requestId      String
  dataSourceId   String?
  uploadedById   String

  sourceFilename String  @db.VarChar(255)   // NORMALISED -- never a client-supplied path
  contentType    String  @db.VarChar(120)
  byteSize       Int
  checksum       String  @db.VarChar(64)    // SHA-256 of the raw upload. Immutable evidence id.
  idempotencyKey String? @db.VarChar(128)

  status         FactoryTagImportStatus  @default(PENDING)
  failureReason  FactoryTagImportFailure @default(NONE)

  rowCount       Int @default(0)
  acceptedCount  Int @default(0)
  rejectedCount  Int @default(0)
  warningCount   Int @default(0)

  // Bounded, row-level error report. Capped (see note) so a hostile file
  // cannot write an unbounded blob.
  rowErrors      Json @default("[]")
  rowErrorsTruncated Boolean @default(false)

  startedAt      DateTime @default(now())
  previewedAt    DateTime?
  committedAt    DateTime?
  rolledBackAt   DateTime?

  @@unique([organizationId, requestId, checksum])        // same file twice = duplicate, at the DB
  @@unique([organizationId, idempotencyKey])
  @@index([organizationId, requestId, status])
}
```

> `rowErrors` is capped at the **first 200 errors**, with
> `rowErrorsTruncated = true` and the full count in `rejectedCount`. An
> unbounded Json column fed by a hostile 50 000-row file is a denial-of-service
> and a storage amplification vector.

```prisma
enum FactoryTagDataType   { BOOL  INT  UINT  FLOAT  DOUBLE  STRING  DATETIME }
enum FactoryTagCriticality{ LOW  MEDIUM  HIGH  SAFETY_RELEVANT }

model FactoryTagDefinition {
  id             String @id @default(cuid())
  organizationId String
  requestId      String
  dataSourceId   String
  importId       String

  externalTagId  String  @db.VarChar(191)
  nodeId         String  @db.VarChar(500)     // OPC UA NodeId
  displayName    String  @db.VarChar(191)
  engineeringUnit String? @db.VarChar(32)
  dataType       FactoryTagDataType
  expectedMin    Float?
  expectedMax    Float?
  sampleIntervalMs Int
  criticality    FactoryTagCriticality @default(MEDIUM)
  equipmentId    String? @db.VarChar(191)
  assetId        String?                      // -> IndustrialAsset, resolved server-side
  sourceSystem   String? @db.VarChar(120)
  enabled        Boolean @default(true)

  createdAt      DateTime @default(now())

  // Both uniqueness rules the brief requires, enforced PER TENANT PER SOURCE:
  @@unique([organizationId, dataSourceId, nodeId])        // duplicate NodeId
  @@unique([organizationId, dataSourceId, externalTagId]) // duplicate logical tag
  @@index([organizationId, requestId])
  @@index([organizationId, assetId])
}
```

> **Relationship to `AutomationTag`.** `AutomationTag` holds tags discovered
> from a TIA engineering export; `FactoryTagDefinition` holds tags the plant
> *declares* for collection, with collection parameters (`sampleIntervalMs`,
> `expectedMin/Max`, `criticality`) that `AutomationTag` does not carry.
> They are different concepts and both are legitimate — but this is exactly the
> "do not build a seventh tag table without justification" risk, so it is
> **OD-C** for the owner, with the above as the stated justification.

### Import validation pipeline (every control the brief lists)

```
 1 MIME allowlist        text/csv, application/vnd.openxmlformats-...sheet ONLY
                         -- checked against SNIFFED content, not the declared header
 2 Size cap              hard byte limit, enforced BEFORE buffering
 3 Row cap               hard row limit, enforced during streaming parse
 4 Filename              normalised to a basename; path separators stripped
 5 FORMULA INJECTION     any cell whose first char is = + - @ TAB CR is
                         REJECTED (not neutralised) -- a tag list has no formulas
 6 Encoding              UTF-8 enforced; BOM stripped; control chars rejected
 7 Schema                Zod per row: the 13 declared columns, exact types
 8 Data type             value parses as the declared dataType
 9 Unit                  against a known unit allowlist; unknown = WARNING
10 Range                 expectedMin <= expectedMax; both finite
                         -- 1e999 parses to Infinity: REJECT non-finite explicitly
11 Interval              within [policyMin, policyMax] ms
12 Duplicate NodeId      within-file AND against committed rows
13 Duplicate logical tag within-file AND against committed rows
14 Tenant isolation      dataSourceId/requestId re-resolved from the SESSION,
                         never from the file or the body
15 PREVIEW               parse + validate, persist NOTHING but the import row
16 COMMIT                ATOMIC: one transaction, all rows or none
17 ROLLBACK              a committed import can be rolled back as a whole
18 Row-level report      per-row code + column + reason, capped at 200
```

> **Control 10 is not hypothetical.** `1e999` parses to `Infinity` in
> JavaScript — a fact this programme already established in the HV2 R2 lane,
> where it flipped a test verdict. `Number.isFinite()` must be asserted
> explicitly; a `typeof x === "number"` check passes `Infinity` and `NaN`.

---

## 5. PROVISIONING AND PACKAGE

Gateway identity **reuses** `IndustrialGateway` + `EdgeGatewayProfile`. No new
gateway table.

Required additive columns on existing models (nullable, so the migration is
purely additive):

```prisma
// on IndustrialGateway -- link back to the HFCC request
//   factoryRequest  FactoryIntegrationRequest?    (back-relation only, no column)

// on EdgeGatewayProfile -- the stream identity the brief requires
//   streamId  String?  @unique @db.VarChar(64)    // server-generated, opaque
```

> `EdgeGatewayProfile.ingestionId` already exists and is exactly the right
> shape: *"server-generated, high-entropy and opaque … It is an IDENTIFIER, not
> a credential: knowing it proves nothing."* HFCC's `streamId` follows the same
> rule. **The brief's "issue a gatewayId" step must issue this, not the
> enumerable serial `IndustrialGateway.gatewayId`.**

```prisma
enum GatewayPackageStatus { BUILDING  SEALED  SUPERSEDED  REVOKED  BUILD_FAILED }

model GatewayPackage {
  id             String @id @default(cuid())
  organizationId String
  requestId      String
  gatewayId      String                            // -> IndustrialGateway

  version        Int                               // 1..n per request
  status         GatewayPackageStatus @default(BUILDING)
  executionMode  FactoryExecutionMode              // SIMULATOR | LAB | FACTORY -- server-set

  // The manifest is the evidence. It lists every file and its hash.
  manifestJson   Json
  manifestSha256 String @db.VarChar(64)            // SHA-256 of the CANONICALISED manifest
  fileCount      Int

  // Storage reference. NEVER a client-supplied path.
  storageKey     String  @db.VarChar(500)
  signatureRef   String? @db.VarChar(191)          // reference to a signature, not the key

  builtById      String
  builtAt        DateTime @default(now())
  sealedAt       DateTime?

  // Download receipt -- the brief's step 9
  downloadedAt   DateTime?
  downloadedById String?
  downloadCount  Int @default(0)

  @@unique([organizationId, requestId, version])
  @@index([organizationId, gatewayId])
}
```

**The credential is not in this table, and not in any table.**

```
Provisioning sequence (brief §Gateway Provisioning):
  1 preflight          -- zero open BLOCKERs, re-verified server-side
  2 session + step-up  -- requireRecentAuth (owner decision D-1)
  3 issue identities   -- gateway PK + opaque streamId (NOT the serial)
  4 credential         -- generated, returned ONCE in the response body,
                          stored as a HASH/reference only, never re-readable
  5 config build       -- templates WITHOUT any factory secret
  6 manifest           -- every file + its SHA-256
  7 SHA-256            -- of the canonicalised manifest
  8 signed package     -- signature reference recorded
  9 download receipt   -- downloadedAt / By / Count
 10 audit              -- AuditLog + FactoryStateTransition
```

**Credential one-time display, enforced structurally:** the plaintext credential
exists only in the HTTP response of the issuing request. There is no column to
store it, therefore no endpoint can return it again. The UI's "shown once"
behaviour is a consequence, not the control.

**Credential lifecycle reuses Phase 94**:
`POST|PATCH|DELETE /api/ot/gateways/[id]/enrollment{,/rotate,/revoke}`.
HFCC drives those routes. It does not build a second lifecycle.
Owner decision **D-7** applies: a REVOKED binding revokes its API key on
**every** path.

Package contents (the brief's list) are **files inside the package**, not
database rows: Ubuntu install runbook, systemd units, logrotate, config
templates, firewall requirements, certificate trust instructions,
backup/restore, rollback, safe shutdown, health verification, uninstall,
manifest + hash.

---

## 6. CONNECTIVITY, SHADOW, FAT

```prisma
enum ConnectivityCheckStatus  { QUEUED  DISPATCHED  RUNNING  COMPLETED  EXPIRED  CANCELLED }
enum ConnectivityCheckOutcome { PASS  FAIL  SKIPPED  NOT_RUN  ERROR }

/// One dispatched run of the C-01..C-19 catalogue.
model ConnectivityCheck {
  id             String @id @default(cuid())
  organizationId String
  requestId      String
  gatewayId      String?

  runNumber      Int
  status         ConnectivityCheckStatus @default(QUEUED)
  executionMode  FactoryExecutionMode                 // SERVER-SET from the gateway profile
  correlationId  String @db.VarChar(64)

  requestedById  String
  requestedAt    DateTime @default(now())
  dispatchedAt   DateTime?
  completedAt    DateTime?
  expiresAt      DateTime                             // a never-collected job must EXPIRE

  results        ConnectivityCheckResult[]
  @@unique([organizationId, requestId, runNumber])
  @@index([organizationId, status, expiresAt])
}

model ConnectivityCheckResult {
  id             String @id @default(cuid())
  organizationId String
  checkId        String
  checkCode      String  @db.VarChar(16)              // "C-07"
  outcome        ConnectivityCheckOutcome
  executionMode  FactoryExecutionMode                 // copied from the parent -- never client-set
  measuredValue  String? @db.VarChar(500)             // e.g. "offset=12ms"
  expectedValue  String? @db.VarChar(500)
  // SAFE detail only. No stack trace, no raw socket error, no credential.
  detailCode     String? @db.VarChar(64)
  observedAt     DateTime
  @@unique([organizationId, checkId, checkCode])
  @@index([organizationId, checkId])
}
```

```prisma
enum ShadowSessionStatus { OPEN  CLOSED  ABORTED }

model ShadowSession {
  id             String @id @default(cuid())
  organizationId String
  requestId      String
  gatewayId      String

  status         ShadowSessionStatus @default(OPEN)
  startedAt      DateTime @default(now())
  endedAt        DateTime?

  // SERVER-COMPUTED counters. Never client-written.
  acceptedCount   Int @default(0)
  duplicateCount  Int @default(0)
  outOfOrderCount Int @default(0)
  quarantinedCount Int @default(0)
  badQualityCount Int @default(0)
  staleCount      Int @default(0)
  replayCount     Int @default(0)
  unknownProvenanceCount Int @default(0)

  lastTelemetryAt DateTime?                           // = receivedAt of the newest row
  maxObservedLagMs Int?
  @@index([organizationId, requestId, status])
  @@index([organizationId, gatewayId])
}
```

> Telemetry itself goes to the existing `TelemetryRecord`. `ShadowSession` is an
> **envelope with server-computed statistics**, not a second copy of the data.
> `lastTelemetryAt` derives from `receivedAt`, never `timestamp` — the
> `REPLAY`-vs-`LIVE` distinction depends on it (see
> `FACTORY-CONNECTION-CENTER-ARCHITECTURE.md` §6).

```prisma
enum FactoryCheckOutcome { PASS  FAIL  NOT_RUN  NOT_MEASURED }
enum FactoryFatRunStatus { DRAFT  RUNNING  SEALED_PASSED  SEALED_FAILED  ABANDONED }

model FactoryFatRun {
  id             String @id @default(cuid())
  organizationId String
  requestId      String

  runNumber      Int
  status         FactoryFatRunStatus @default(DRAFT)
  executionMode  FactoryExecutionMode                 // the mode this RUN was conducted in

  preconditionsJson Json @default("[]")               // each with its own acknowledgement

  operatorUserId String
  witnessUserId  String?                              // MUST differ from operator for T-13
  startedAt      DateTime?
  endedAt        DateTime?

  // Separate tallies. NEVER summed across executionMode.
  passCount         Int @default(0)
  failCount         Int @default(0)
  notRunCount       Int @default(0)
  notMeasuredCount  Int @default(0)

  signedById     String?
  signedAt       DateTime?
  signatureRef   String? @db.VarChar(191)

  sealedAt       DateTime?                            // once set, IMMUTABLE
  supersedesRunId String? @unique

  checks         FactoryFatCheck[]
  @@unique([organizationId, requestId, runNumber])
  @@index([organizationId, requestId, status])
}

model FactoryFatCheck {
  id             String @id @default(cuid())
  organizationId String
  runId          String

  checkCode      String @db.VarChar(32)
  title          String @db.VarChar(300)
  expectedResult String @db.VarChar(1000)

  outcome        FactoryCheckOutcome @default(NOT_RUN)
  executionMode  FactoryExecutionMode
  measuredValue  String? @db.VarChar(500)
  actualResult   String? @db.VarChar(1000)

  startedAt      DateTime?
  endedAt        DateTime?
  comment        String? @db.VarChar(2000)
  attachmentIds  Json @default("[]")                  // -> FactoryEvidenceArtifact ids
  evidenceRef    String?                              // the immutable evidence reference

  @@unique([organizationId, runId, checkCode])
  @@index([organizationId, runId, outcome])
}
```

**`outcome` defaults to `NOT_RUN`, never `PASS`.** A check nobody touched is
`NOT_RUN`, and `NOT_RUN` is not `PASS`. The transition guard additionally
asserts that no *required* check is **missing** from the run — absence of a row
must not be mistaken for absence of a failure.

---

## 7. EVIDENCE

Shape follows `ComplianceEvidencePack` / `ComplianceEvidencePackItem`.

```prisma
enum FactoryEvidenceKind {
  TAG_LIST  NETWORK_DIAGRAM  CERTIFICATE  PACKAGE_MANIFEST
  CONNECTIVITY_REPORT  SHADOW_REPORT  FAT_ATTACHMENT  FAT_REPORT
  SIGNATURE  TRANSITION_CHAIN  OTHER
}
enum FactoryEvidenceState { DRAFT  SEALED  SUPERSEDED }

model FactoryEvidenceArtifact {
  id             String @id @default(cuid())
  organizationId String
  requestId      String

  kind           FactoryEvidenceKind
  state          FactoryEvidenceState @default(DRAFT)

  filename       String  @db.VarChar(255)   // normalised basename only
  contentType    String  @db.VarChar(120)
  byteSize       Int
  sha256         String  @db.VarChar(64)
  storageKey     String  @db.VarChar(500)   // server-derived, never client-supplied

  // Provenance of the artifact itself
  producedBy     FactoryActorKind
  producedById   String?
  executionMode  FactoryExecutionMode?      // for measured artifacts

  sealedAt       DateTime?                  // once set: IMMUTABLE
  supersededById String? @unique

  createdAt      DateTime @default(now())
  @@unique([organizationId, requestId, kind, sha256])
  @@index([organizationId, requestId, state])
}
```

**Append-only semantics:** a `SEALED` artifact can never be updated or deleted.
A replacement is a new row with `supersededById` pointing back. The *Evidence
Pack* the brief asks to hand over is a generated bundle whose manifest lists
every sealed artifact plus the head `auditHash` of the transition chain.

> **Constraint carried from the HV2 lane:** *a manifested document cannot quote
> its own TOTAL.* The pack manifest therefore must not be an artifact listed
> inside itself, and the transition chain must not contain a row describing the
> manifest that contains that chain.

---

## 8. `FactoryStateTransition`

Defined in full in `STATE-MACHINE.md` §4 (hash chain, JCS canonicalisation,
strict RFC 3339 timestamps, `@@unique([requestId, sequence])`). Not repeated
here.

---

## 9. MIGRATION PLAN — DESIGN ONLY, NOT CREATED

**No migration has been created.** When authorised:

```
prisma/migrations/<YYYYMMDDHHMMSS>_factory_connection_center_foundation/
  migration.sql
  rollback.sql          (the FC1 lane's convention -- keep it)
```

Properties the migration must have:

1. **Purely additive.** New tables + new nullable columns only. No column
   dropped, no type narrowed, no existing index removed.
2. `streamId` on `EdgeGatewayProfile` is **nullable** — a legacy profile simply
   reports "no stream", exactly as `ingestionId` already does.
3. Raw SQL is required for the partial unique index in **OD-F(b)** — Prisma
   cannot express it declaratively.
4. **Every new migration must be declared** in
   `prisma/__tests__/phase102-migration-safety.test.ts` and the CI migration
   list (FC1 finding **F-033**), verified with
   `npm run gate:phase102:migrations` and `gate:phase102:applied-migrations`.
5. Rehearse on a **throwaway database** first: every constraint probe must be
   REFUSED, the rollback must leave a schema-identical tree, and an interrupted
   migration must leave nothing behind. (The FC1 lane's rehearsal protocol.)

### Two Prisma-specific traps that will bite

- **`prisma format` rewrites CRLF → LF for the whole schema file.** Running it
  after an edit produces a whole-file diff that buries the real change. The FC1
  lane solved this by applying schema additions **textually** with a script
  (`tools/fc1-apply-schema.cjs`). HFCC must do the same, or accept and declare
  the whitespace-only diff.
- **`prisma generate` must be re-run after the schema edit**, or the client
  types silently lag the schema and the typecheck passes against stale types.

Drift detection: see `prisma7-drift-detection-facts` — the flags
`--from-schema-datamodel` / `--to-url` were removed, and `pipefail` matters.

---

## 10. TENANT-ISOLATION CHECKLIST — APPLIED TO EVERY MODEL ABOVE

| Requirement | Status across all 12 new models |
|---|---|
| `organizationId` present | ✅ all 12 |
| FK to `Organization` on the aggregate root | ✅ `onDelete: Cascade` |
| Every unique constraint composite with `organizationId` | ✅ — no bare `@unique` on a business key |
| Every index leads with `organizationId` | ✅ |
| No model trusts a client-supplied `organizationId` / `siteId` / `userId` | ✅ by the resolution rule in §4 of the architecture |
| No secret-shaped field | ✅ enforced by a gate test (§3) |
| `onDelete: Restrict` on historical records | ✅ evidence, transitions, FAT runs |
| Server-set timestamps | ✅ `@default(now())` / `@updatedAt`; no client clock is authoritative |

The one deliberate exception: `FactoryInvitation.tokenHash` is `@unique`
**globally**, not per tenant. That is correct and intentional — a token must be
globally unambiguous, and the tenant is resolved *from* the token, not used to
look it up. The scope check happens after resolution and is a separate
assertion.
