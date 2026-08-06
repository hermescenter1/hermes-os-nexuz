# Phase 97 — Architecture & Implementation Plan (pre-coding review)

> This software provides compliance-control evidence and workflows.
> It does not constitute legal advice or automatic certification.

Companion to `phase97-existing-state-matrix.md`. This is the proposed design presented
for owner review **before any implementation code is written** (per the chosen
"infrastructure first, then review" strategy).

## 1. Stack & branch facts

```
agent/phase95-ai-governance-model-assurance
  ↓  agent/phase95-runtime-enforcement
  ↓  agent/phase96-commercialisation-billing-entitlements   fa461f1c
  ↓  agent/phase96-compliance-hotfix-integration            50888bd  (PR #42, Draft)
  ↓  agent/phase97-compliance-privacy-legal-readiness       50888bd  (base)
```

- Integration PR #42 is open (Draft) with the hotfix forward-ported by a real merge
  commit + one disclosed cross-platform LF hygiene commit. Local validation is fully
  green (tsc 0, lint 0, 5441 tests pass, build 0, both offline evals OK, env gate 0).
- CI does not auto-run on these bases (ci.yml is `PR → main` only); local validation
  is the record.

## 2. Design principles (non-negotiable)

- **Server-authoritative & fail-closed.** Reuse `requireComplianceOrgScope` /
  `requirePlatformSuperadmin`; never trust client `organizationId`.
- **Reuse before adding.** Extend `PrivacyRequest`, `LegalDocument`, `ConsentRecord`,
  `ProcessingActivity`, `DataExportRequest`, `DataDeletionRequest`, `AuditLog`. Add new
  models only for genuinely-absent concepts (LegalHold, Subprocessor, DataTransfer,
  ComplianceIncident, RetentionPolicy, ExportDownloadToken).
- **Additive, non-destructive migration only.** New nullable columns, new tables, new
  enum values. No edits to applied migrations. Legacy NULL rows quarantined, never
  back-filled with invented values.
- **No invented legal facts.** Durations, deadlines, lawful bases, notification
  decisions, contract/approval states default to `CONFIGURATION_REQUIRED` /
  `LEGAL_REVIEW_REQUIRED` and fail closed in evidence generation.
- **Destructive execution disabled by default.** Retention/erasure/export prod execution
  gated behind env flags that default false, following the OpenBao disabled-by-default
  pattern. This phase ships planners + dry-run + test-only adapters only.
- **Do not weaken** Phase 95 AI-governance, Phase 96 billing/entitlements, or the PR #41
  hotfix boundaries. Transfer register may *reference* Phase 95 provider-policy but a
  Phase-95 denial always wins.

## 3. Proposed data model (single additive migration)

Extend (additive nullable columns / new enum values):
- `ProcessingActivity`: `status`, `approvalState`, `reviewDate`, `riskClassification`,
  `specialCategory Boolean?`, `automatedDecision Boolean?`, `internationalTransfer Boolean?`,
  `dataOwner`, `systemOwner`, `subjectCategories Json?`, `sourceSystems Json?`,
  `destinationSystems Json?`, `retentionPolicyId?`.
- `PrivacyRequest`: extend `PrivacyRequestType` (+`RECTIFICATION`,`RESTRICTION`,`OBJECTION`,
  `OTHER`; keep legacy 5 as aliases in a mapping layer), extend `PrivacyRequestStatus`
  (+the intermediate states), add `assignedOrgById?`, `assignedAt?`, `assignedById?`,
  `acknowledgementDueAt?`, `identityVerificationDueAt?`, `responseDueAt?`, `extensionDueAt?`,
  `responsiblePersonId?`. Unassigned public submissions stay `organizationId = null`
  (platform triage queue); tenant queries always predicate `id + organizationId`.
- `LegalDocument`: add `LegalDocumentLifecycle` enum + `lifecycle` col + `supersededById?`.
- `DataExportRequest`: add `ExportStatus` lifecycle + `manifestKey?`, `schemaVersion?`,
  `tokenHash?`, wire `expiresAt`.
- `DataDeletionRequest`: add `planJson?`, `idempotencyKey?`, `approvedById?`, `approvedAt?`.

New models (all org-scoped except global-template cases; all with the standard
`organizationId`, `status`, `approvalState`, `createdAt/updatedAt`, and the indexes in
Part N): `RetentionPolicy`, `LegalHold`, `Subprocessor`, `DataTransfer`,
`ComplianceIncident`, `ExportDownloadToken` (hashed token, single-use, short TTL).

Migration name (proposed): `20260804000000_phase97_compliance_control_plane` — additive
only; validated against fresh DB, legacy-populated upgrade, and second-deploy idempotency.

## 4. Permissions (org axis — `src/lib/org/rbac.ts`)

Add minimal `OrgPermission` values, mapped OWNER + `COMPLIANCE_MANAGER` (+ ADMIN where
appropriate): `compliance:view/manage`, `privacy_requests:view/manage`,
`legal_documents:view/manage/publish`, `retention:view/manage`, `legal_hold:view/manage`,
`exports:view/approve`, `incidents:view/manage`, `evidence_packs:generate`. The
platform-only `privacy_requests:assign_platform` maps to `requirePlatformSuperadmin`
(triage of unassigned requests), never to an org role.

## 5. State machine & deadline policy

- Privacy-request transitions defined as an explicit allow-list map (from→[to]); the
  PATCH route rejects any transition not in the map (no arbitrary strings). Legacy 4
  statuses map onto the extended set so existing rows remain valid.
- Deadline clocks are **configuration-driven**. With no configured policy,
  `DEADLINE_POLICY_STATUS = CONFIGURATION_REQUIRED` and no due dates are generated. No
  statutory duration is hard-coded.

## 6. Export / erasure / retention safety

- Export: state machine `REQUESTED→…→READY→EXPIRED/REVOKED/FAILED`; server-owned subject
  identity; scope = subject + org only; excludes secrets/tokens/credentials/foreign audit;
  manifest + schema version + timestamp + auto-expiry; download via short-lived single-use
  hashed token, server-side ownership check, audited. Prod execution flag default false.
- Erasure: planning engine classifies each related record
  (`DELETE_ALLOWED/ANONYMISE_REQUIRED/RETENTION_REQUIRED/LEGAL_HOLD/DEPENDENCY_BLOCKED/
  MANUAL_REVIEW_REQUIRED/NOT_SUBJECT_DATA`); execution requires approved plan +
  idempotency key + no active hold + test adapter. Prod execution flag default false.
- Retention: policy registry (data class, trigger, duration config, action, approval,
  hold behaviour, dry-run). Missing duration/approval → `CONFIGURATION_REQUIRED`.
  Evaluation dry-run by default; destructive execution behind a default-false env flag.
- **Invariants:** `LEGAL_HOLD_PROTECTED_DELETION=0`, `UNAPPROVED_ERASURE_EXECUTION=0`,
  `CROSS_TENANT_EXPORT_RECORD=0`, `EXPORT_SECRET_LEAK=0`.

## 7. Owner / legal decision register (must be resolved by owner/counsel)

| # | Decision | Default until decided |
|---|---|---|
| 1 | Authoritative relationship: `PrivacyRequest` vs `DataExport/DataDeletion` records | Proposal: PrivacyRequest = lifecycle; export/erasure = child jobs |
| 2 | Lawful-basis values per processing activity | `LEGAL_REVIEW_REQUIRED` |
| 3 | Retention durations & actions per data class | `CONFIGURATION_REQUIRED` |
| 4 | Privacy-request statutory deadlines (ack/verify/response/extension) | `CONFIGURATION_REQUIRED` (no clock) |
| 5 | Subprocessor contract & review status; transfer classification | `REVIEW_REQUIRED` |
| 6 | Incident notification decisions | `NOTIFICATION_DECISION_REQUIRED` (never automated) |
| 7 | Enable production export execution | disabled (flag false) |
| 8 | Enable production erasure execution | disabled (flag false) |
| 9 | Enable destructive retention execution | disabled (flag false) |
| 10 | Consent purpose taxonomy (which optional purposes exist) | necessary-only defaults; optional = deny |
| 11 | Broaden CI triggers so stacked PRs run Actions | out of scope unless approved |

## 8. Proposed commit / PR plan (Part T)

1. `feat(compliance): add processing inventory and privacy lifecycle`
2. `feat(compliance): add legal lifecycle and consent evidence`
3. `feat(compliance): add retention holds and erasure planning`
4. `feat(compliance): add export and transfer governance`
5. `feat(compliance): add incidents and evidence packs`
6. `feat(ui): add multilingual compliance operations center`
7. `test(compliance): add Phase 97 assurance gates`
8. `docs(compliance): document Phase 97 control plane`

Phase 97 Draft PR: base `agent/phase96-compliance-hotfix-integration`, head
`agent/phase97-compliance-privacy-legal-readiness`. Do not mark ready. Do not merge.
Do not deploy.

## 9. Safety posture (unchanged through this phase)

```
PROVIDER_CONTACTED=False
PRODUCTION_CONTACTED=False
DESTRUCTIVE_RETENTION_EXECUTED=False
PRODUCTION_EXPORT_EXECUTED=False
PRODUCTION_ERASURE_EXECUTED=False
DEPLOYED=False
MERGED=False
LEGAL_CERTIFICATION_CLAIMED=False
```

## 10. Governed compliance incidents — evidence & closure integrity

Migrations `20260820000014` (base workflow) and `20260820000015` (evidence-integrity
hardening) define a tenant-owned incident control plane. The runtime source of truth
for cross-plane reconstruction remains the Phase 92 observability facilities; an
incident only **references** that timeline by `correlationId`.

- **Authoritative membership-bound ownership.** `ownerId` / `assignedToId` are org
  member user ids bound by a composite FK `(organizationId, ownerId) →
  OrganizationMember(organizationId, userId)` (RESTRICT). Generic create/update can
  never assign an owner; assignment is a dedicated route
  (`POST /api/compliance/incidents/[id]/assignment`, `manage_compliance_incidents`)
  that locks the incident, then resolves + locks the membership (FOR SHARE) and
  requires `status = ACTIVE`. Closure re-reads the owner's membership transactionally,
  so a now-inactive/removed owner no longer satisfies closure.
- **Immutable tenant-bound timeline.** `ComplianceIncidentEvent` binds to its incident
  by a composite FK `(complianceIncidentId, organizationId) → ComplianceIncident(id,
  organizationId)` (RESTRICT, non-cascading) plus an Organization FK; `actorId` is NOT
  NULL with a closed `actorClass` (PLATFORM | ORGANIZATION_MEMBER); a `BEFORE UPDATE OR
  DELETE` trigger rejects any mutation. An incident with timeline evidence cannot be
  hard-deleted, and there is no incident DELETE route.
- **Decision evidence versioning.** A high-authority decision state requires a SHA-256
  `decisionEvidenceHash` in the request and a positive monotonic `decisionVersion`
  (DB CHECKs); the `DECISION_RECORDED` timeline event carries the same hash + version +
  `outcome = RECORDED`. A non-decision state must clear the current hash (no stale,
  seemingly-valid evidence). `decisionVersion` never decreases; invalidation preserves
  it as lineage and the next valid decision receives `version + 1`.
- **Decision invalidation.** Reassessment out of a decision state and the explicit
  reopen both clear the current decision evidence atomically (reopen also sets
  `assessmentStatus = IN_ASSESSMENT`, clears resolution/closure attribution and appends
  `REOPENED` with `outcome = INVALIDATED`). A reopened incident requires a completely
  new decision before RESOLVED/CLOSED; the closure gate validates current evidence, not
  the status string.
- **IncidentAction as blocker authority.** `ComplianceIncidentAction` (closed
  priority/status/actionCode, tenant-bound parent FK) is the single source of truth for
  closure blocking; `openBlockerCount` is only a transactionally-reconciled cache. Any
  OPEN action blocks RESOLVED/CLOSED (closure reads the authoritative OPEN count under
  the incident lock); resolving a HIGH/CRITICAL action requires an evidence hash;
  resolving a missing/terminal/foreign action is uniformly not-found.
- **LegalHold ↔ closure lock ordering.** One global order —
  `ComplianceIncident → OrganizationMember → LegalHold → ComplianceIncidentAction`.
  Incident closure and INCIDENT-scoped hold activation/release both lock the incident
  first, so they linearise and an incident CLOSED with an ACTIVE hold can never persist;
  activation is refused unless the incident is still in an active working state.
- **No automatic external notification.** The workflow records containment /
  remediation / notification-decision **evidence** only. It never sends email/webhooks,
  contacts customers/regulators/providers, executes containment, alters subject data, or
  invents a legal deadline / jurisdiction / notification duty / breach verdict.
- **Fail-closed migration.** `20260820000015` is additive/strengthening (no DROP TABLE /
  DROP COLUMN / TRUNCATE / DELETE / auto-repair). A classification-count-only preflight
  aborts (counts + closed labels only, never row content) when any pre-existing row
  would violate a new constraint — invalid actor, parent-org mismatch, incomplete
  decision evidence, invalid ownership binding, invalid incident-hold binding, or a
  blocker-cache mismatch.
