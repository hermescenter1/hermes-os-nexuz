# Phase 95 — Tenant External-Provider Data Policy (fail-closed)

Tenant data must not leave Hermes infrastructure merely because an API key
exists. Enforced by `src/lib/ai-governance/provider-policy.ts`.

## Default is DENY

External use requires ALL of:
1. Global external-AI feature flag ON (`externalAiEnabled`).
2. An approved, unexpired, organisation-scoped policy for the exact provider.
3. The requested data class is allowed by BOTH the registry entry and the policy.
4. The requested workflow is in the policy's `allowedWorkflows`.
5. The environment is allowed by the registry entry.

Denials (fixed reasons, no secret): `NO_POLICY`, `POLICY_DISABLED`,
`POLICY_EXPIRED`, `UNKNOWN_PROVIDER`, `UNKNOWN_MODEL`, `UNAPPROVED_DATA_CLASS`,
`CROSS_TENANT`, `SECRET_OR_CREDENTIAL`, `FEATURE_FLAG_OFF`,
`ENVIRONMENT_NOT_ALLOWED`.

## Hard rules

- `secret` data class is ALWAYS denied — credentials/secrets never leave.
- A policy owned by another organisation can never authorise a request (`CROSS_TENANT`).
- No provider is enabled by default; no tenant data is sent by default.
- Public `/api/ai` must use a SEPARATE explicit public-provider flag + rate limit; a public request is never tenant approval.
- `/api/brain` external use requires authenticated tenant context and an approved org policy.
- The policy row stores approval envelope only — never a provider key or raw prompt.

## Persistence

The policy fields (organisationId, providerRegistryId, enabled,
allowedDataClasses, allowedWorkflows, approvedBy, approvedAt, policyVersion,
expiresAt, timestamps) map to a proposed additive, org-scoped Prisma model
(`AiProviderPolicy`), bound through `ProviderPolicyStore`. No migration is
introduced in this phase; the decision logic and tests are complete and DB-agnostic.

## Required external review before activation

`EXTERNAL_REVIEW_REQUIRED` provider facts (retention, training opt-out, region,
DPA) must be independently reviewed and recorded by the owner before enabling any
external provider for real tenant data.
