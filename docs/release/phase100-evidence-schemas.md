# Phase 100 — evidence schemas

Field-level definitions for every Phase 100 evidence document. The executable
contract is `scripts/security/phase100/ga-evidence.mjs`; this document explains
it. Where the two ever disagree, the validator wins — it is what actually gates
the release.

Working examples: `docs/release/phase100-evidence-examples/`. Every one of them
carries `EXAMPLE_ONLY`, `SYNTHETIC_TEST_FIXTURE` and `NOT_EXTERNAL_ATTESTATION`
and is therefore rejected by construction.

## Shared envelope

Every Phase 100 document carries the same envelope, validated before any
type-specific field:

| Field | Type | Rule |
|---|---|---|
| `schemaVersion` | integer | Must be exactly `1`. |
| `evidenceType` | enum | One of `LEGAL_PRIVACY`, `LIVE_MODEL_EVALUATION`, `BACKUP_OPERATIONS`, `COMMERCIAL_DECISIONS`, `INFRASTRUCTURE_PREREQUISITES`, `GA_AUTHORIZATION`, `RESIDUAL_FINDING_RISK`. Must match the gate the document was supplied for, so evidence cannot be moved between gates. |
| `testedCommitSha` | 40 lowercase hex | Must equal the expected release commit (`PHASE100_RELEASE_COMMIT`, else `PHASE99_RELEASE_COMMIT`, else `git rev-parse HEAD`). |
| `recordedAt` | ISO date | `YYYY-MM-DD` or a full `…T…Z` instant. |
| `signedOrOwnerVerified` | boolean | Must be `true`. The owner confirms provenance. |

### Shared value types

| Type | Rule |
|---|---|
| ISO date | `YYYY-MM-DD`, optionally `THH:MM:SS(.mmm)Z`. |
| ISO date-time | Full instant required — operational facts need a moment, not a day. |
| sha-256 digest | 64 lowercase hex characters. |
| human authority role | A free-text role that contains no `agent`, `automation`, `bot`, `claude`, `assistant`, `ai`, `llm`, `copilot`, `model`, `self` or `system` word. |
| reference | A pointer into an owner-controlled private channel. Never the evidence body, never a URL carrying identity. |

### Universally rejected

Non-production markers (`SYNTHETIC_TEST_FIXTURE`, `EXAMPLE_ONLY`,
`NOT_EXTERNAL_ATTESTATION`), placeholder text anywhere in a decision record
(blank, `TBD`, `TODO`, `FIXME`, `N/A`, `PENDING`, `PLACEHOLDER`, `CHANGEME`,
`<…>`, `OWNER_DECISION_REQUIRED`, `CONFIGURATION_REQUIRED`, `finalized after …`,
lorem ipsum, filler), and any credential, private key, provider key, webhook
secret, AWS key id, JWT, script payload, SQL-injection payload, IP address or
e-mail address.

---

## `LEGAL_PRIVACY` → `docs/legal/phase100-legal-privacy-approvals.json`

```
reviews[]                              array, one entry per review type
  .reviewType                          EXTERNAL_LEGAL_REVIEW | EXTERNAL_PRIVACY_REVIEW
  .reviewerOrganizationAlias           alias only — never a firm's real name without owner approval
  .reviewerRole                        human authority role
  .independentReviewer                 must be true
  .reviewDate                          ISO date
  .reportReference                     private-channel reference
  .reportSha256                        sha-256 digest
  .outcome                             APPROVED | APPROVED_WITH_CONDITIONS | REJECTED
                                       REJECTED fails the gate
  .validityExpiresAt                   ISO date, REQUIRED, must be in the future

approvedDocuments[]                    must include PRIVACY_POLICY, TERMS_OF_SERVICE, DPA
  .documentId                          PRIVACY_POLICY | TERMS_OF_SERVICE | COOKIE_POLICY | DPA
                                       | CANDIDATE_CONSENT | ACADEMY_TERMS | MARKETING_CONSENT
                                       (mirrors LegalDocumentType in src/lib/compliance/types.ts)
  .version                             non-empty
  .approvedAt                          ISO date
  .documentSha256                      sha-256 digest
  .approvedByRole                      human authority role

subprocessorGovernance
  .registerReference / .registerSha256
  .subprocessorCount                   non-negative integer
  .transferMechanisms[]                STANDARD_CONTRACTUAL_CLAUSES | ADEQUACY_DECISION
                                       | BINDING_CORPORATE_RULES | DEROGATION
                                       | NO_INTERNATIONAL_TRANSFER   (non-empty)
  .reviewedAt / .reviewedByRole

residualLegalRiskAcceptance
  .decision                            exactly ACCEPT
  .ownerAuthorityRole                  human authority role
  .reason                              ≥ 20 characters, substantive
  .residualRiskCount                   non-negative integer
  .acceptedAt                          ISO date
  .expiresAt                           ISO date, REQUIRED, must be in the future
  .evidenceReference / .evidenceSha256
```

Gates: `EXTERNAL_LEGAL_REVIEW`, `EXTERNAL_PRIVACY_REVIEW`,
`APPROVED_LEGAL_DOCUMENT_VERSIONS`, `SUBPROCESSOR_AND_TRANSFER_GOVERNANCE`,
`RESIDUAL_LEGAL_RISK_ACCEPTED` — each resolved independently.

---

## `LIVE_MODEL_EVALUATION` → `docs/ai-governance/phase100-live-model-evaluation.json`

```
evaluation
  .evaluationMode                      must be LIVE_PROVIDER
                                       OFFLINE_FIXTURE is rejected with
                                       OFFLINE_EVIDENCE_FOR_LIVE_GATE
  .offlineFixtureOnly                  must not be true
  .providerRequestCount                integer ≥ 1
  .evaluationEnvironment               e.g. github-environment/ai-evaluation
  .provider / .modelId / .modelVersion non-empty — the model/provider/version binding
  .governanceLibraryVersion            non-empty
  .datasetReference / .datasetSha256
  .runReference / .runSha256
  .evaluatedAt                         ISO date
  .sampleCount                         integer ≥ 1
  .hallucinationRateObserved           number in [0,1], must be ≤ budget
  .hallucinationRateBudget             number in [0,1]
  .unsupportedClaimRateObserved        number in [0,1], must be ≤ budget
  .unsupportedClaimRateBudget          number in [0,1]
  .unsafeOutputCount                   must be exactly 0
  .ownerApproval.decision              exactly APPROVED
  .ownerApproval.ownerAuthorityRole    human authority role
  .ownerApproval.approvedAt            ISO date
  .validityExpiresAt                   optional; if present, must be in the future
```

Produced only by an owner-approved run of
`.github/workflows/ai-governance-live-eval.yml` in the protected
`ai-evaluation` environment. Phase 100 consumes it and never triggers it.

Gate: `LIVE_MODEL_EVALUATION`.

---

## `BACKUP_OPERATIONS` → `docs/release/phase100-backup-operations.json`

```
scheduler
  .mechanism                           what actually runs the backup
  .lastExecutedAt                      ISO date-time, ≤ 48 h old
  .consecutiveSuccessfulRuns           integer ≥ 1
  .failedRunsSinceLastSuccess          must be 0
  .evidenceReference / .evidenceSha256
  .confirmedByRole                     human authority role

latestBackupVerification
  .verifiedAt                          ISO date-time, ≤ 168 h old
  .artifactSha256
  .verificationTool                    e.g. scripts/verify-backup.sh
  .encrypted                           must be true
  .cipher                              must be aes-256-gcm (Phase 98 envelope)
  .verificationResult                  must be PASS
  .artifactSizeBytes                   integer > 0

offHostCopy
  .locationClass                       SEPARATE_REGION_OBJECT_STORAGE
                                       | SEPARATE_PROVIDER_OBJECT_STORAGE
                                       | OFFLINE_MEDIA | SEPARATE_PHYSICAL_SITE
                                       a class, never an address or credential
  .copiedAt                            ISO date-time, ≤ 168 h old
  .artifactSha256                      source digest
  .integrityVerified                   must be true
  .integrityMethod                     how integrity was re-established at the destination
  .verifiedCopySha256                  destination digest — must EQUAL artifactSha256
  .confirmedByRole                     human authority role

recoveryTest
  .recoveryType                        FULL_NODE_RECOVERY | DATABASE_POINT_IN_TIME
                                       | UPLOADS_RECOVERY | FULL_STACK_REHEARSAL
  .testedAt                            ISO date-time, ≤ 180 days old
  .integrityCheck                      must be PASS
  .rtoMinutes                          number > 0
  .rpoHours                            number ≥ 0
  .evidenceReference / .evidenceSha256
  .confirmedByRole                     human authority role

keyCustody
  .custodyModel                        SPLIT_CUSTODY | SEALED_ENVELOPE_OFFLINE
                                       | HARDWARE_SECURITY_MODULE | EXTERNAL_ESCROW
  .custodianRole / .backupCustodianRole  two human authority roles
  .confirmedAt                         ISO date
  .keyMaterialInRepository             must be explicitly false
  .custodyEvidenceReference / .custodyEvidenceSha256
  keyMaterial, privateKey, recoveryKey, passphrase, secret, unsealKey
                                       these keys must NOT be present at all
```

Gates: `BACKUP_SCHEDULER_EXECUTED`, `LATEST_BACKUP_VERIFIED`,
`OFFHOST_COPY_VERIFIED`, `RECOVERY_TESTED`, `RECOVERY_KEY_CUSTODY_CONFIRMED`.

---

## `COMMERCIAL_DECISIONS` → `docs/release/phase100-commercial-decisions.json`

```
pricing
  .decision                            exactly APPROVED
  .ownerAuthorityRole / .decidedAt
  .planRegistryReference / .planRegistrySha256
  .pricedPlanCount                     integer ≥ 1
  .currencies[]                        non-empty, ISO 4217 (three uppercase letters)
  .unresolvedPlanLimitCount            must be 0

paymentProvider
  .decision                            exactly APPROVED
  .ownerAuthorityRole / .decidedAt
  .provider                            STRIPE | NONE
  .mode                                LIVE | TEST   (STRIPE requires LIVE for GA)
  .webhookEndpointConfigured           must be true
  .webhookSigningSecretConfigured      must be true (the FACT, never the secret)
  .configurationEvidenceReference / .configurationEvidenceSha256

taxCurrencyRefund
  .decision                            exactly APPROVED
  .ownerAuthorityRole / .decidedAt
  .taxHandling                         PROVIDER_AUTOMATIC_TAX | MANUAL_TAX_TABLE
                                       | OUT_OF_SCOPE_B2B_REVERSE_CHARGE | NOT_APPLICABLE
  .settlementCurrencies[]              non-empty, ISO 4217
  .refundPolicyReference / .refundPolicySha256
  .refundWindowDays                    non-negative integer

productionBillingActivation
  .activationDecision                  ACTIVATED | DEFERRED — only ACTIVATED passes
  .ownerAuthorityRole / .decidedAt
  .separatedFromCodeReadiness          must be true
  .activationEvidenceReference / .activationEvidenceSha256
```

Gates: `PRICING_DECISION`, `PAYMENT_PROVIDER_DECISION`,
`TAX_CURRENCY_REFUND_DECISION`, `PRODUCTION_BILLING_ACTIVATION`.

---

## `INFRASTRUCTURE_PREREQUISITES` → `docs/release/phase100-infrastructure-prerequisites.json`

```
privateTransport
  .transport                           WIREGUARD | MUTUAL_TLS | PRIVATE_NETWORK_SEGMENT
  .publiclyReachable                   must be explicitly false
  .confirmedAt / .confirmedByRole
  .evidenceReference / .evidenceSha256

secretBackend
  .backend                             OPENBAO | DISABLED — BOTH are legitimate
  .decision                            exactly DECIDED
  .ownerAuthorityRole / .decidedAt
  .failClosedWhenUnavailable           must be true
  .privateTransportRequired            must be true when backend = OPENBAO
  .rationale                           why this backend is correct for this release

credentialOwnership
  .credentialOwnerRole / .recoveryOwnerRole   human authority roles
  .unsealCustodyModel                  same enum as keyCustody.custodyModel
  .confirmedAt
  .runbookReference / .runbookSha256
  rootToken, unsealKey, approleSecretId, token
                                       these keys must NOT be present at all

prerequisites[]                        non-empty
  .id / .description
  .status                              must be COMPLETE
  .verifiedAt / .verifiedByRole
```

Gates: `PRIVATE_TRANSPORT_CONFIRMED`, `SECRET_BACKEND_ACTIVATION_DECISION`,
`CREDENTIAL_AND_RECOVERY_OWNERSHIP`, `INFRASTRUCTURE_PREREQUISITES_COMPLETE`.

---

## `RESIDUAL_FINDING_RISK` → `residualAcceptances` in `docs/security/phase99-risk-acceptances.json`

A map keyed by `findingId`. Phase 99 owns the sibling `acceptances` key for HIGH
findings; this key is separate so Phase 99 semantics are untouched.

```
residualAcceptances["P99-DEP-008"]
  .findingId                           must equal the map key and match P99-{INT|EXT|DEP|INF|PLT}-NNN
  .severity                            MEDIUM | LOW | INFO   (HIGH belongs in `acceptances`)
  .decision                            exactly ACCEPT
  .ownerAuthorityRole                  human authority role
  .reason                              ≥ 20 characters, substantive
  .compensatingControls[]              non-empty
  .acceptedAt                          ISO date
  .expiresAt                           ISO date, REQUIRED, must be in the future
  .evidenceReference / .evidenceSha256
```

One entry per unresolved lower-severity finding. Gate:
`RESIDUAL_FINDING_RISK_ACCEPTED`.

---

## `GA_AUTHORIZATION` → `docs/release/phase100-ga-authorization.json`

```
authorization
  .decision                            exactly AUTHORIZED
  .releaseVersion                      vMAJOR.MINOR.PATCH, e.g. v1.0.0
  .ownerAuthorityRole                  human authority role
  .authorizedAt                        ISO date
  .authorizationEvidenceReference / .authorizationEvidenceSha256
  .acknowledgedBlockerCount            must be 0
  .allPrecedingGatesReviewed           must be true
  .validityExpiresAt                   optional; if present, must be in the future
```

Gate: `GA_RELEASE_AUTHORIZATION`. The last gate, never the first.
