# Phase 97 — Compliance Operations Runbook

> This software provides compliance-control evidence and workflows.
> **It is not legal advice and does not certify compliance.** A pack marked `READY`
> means its manifest was generated consistently from one database snapshot — nothing more.

Operational guide for the delivered Phase 97 compliance control plane. See
`phase97-architecture-and-plan.md` §12 for the design.

## 1. Roles & permissions

| Permission | Roles | Grants |
|---|---|---|
| `view_compliance` / `view_compliance_incidents` / `view_compliance_evidence` | OWNER, ADMIN, MANAGER | read the Operations Center, incidents, evidence packs |
| `manage_*` (processing/privacy/retention/legal-hold/incidents/transfer) | OWNER, ADMIN | create/triage/edit governance records |
| `approve_*`, `decide_*`, `close_*`, `publish_*`, `generate_compliance_evidence`, `revoke_compliance_evidence` | OWNER | accountable acts (approvals, decisions, evidence generation/revocation) |

RBAC is enforced on the server by `requireComplianceOrgScope`; the organization is derived
from the caller's ACTIVE membership (never from the client). A caller with more than one
active organization fails closed (409).

## 2. Generate an evidence pack

1. Operations Center → **Evidence packs** → choose a scope
   (`ORGANIZATION` / `INCIDENT` / `PROCESSING_ACTIVITY` / `PRIVACY_REQUEST`).
2. For a non-organization scope, supply the same-org target id. A cross-tenant or unknown
   target is rejected (uniform not-found).
3. Generate. The server creates a `REQUESTED` pack (idempotent per key), then runs one
   `RepeatableRead` snapshot, builds SAFE evidence items, computes the canonical manifest +
   lowercase SHA-256 hash, and finalizes the pack to `READY` atomically. Readiness reflects
   the fail-closed fold of item states.
4. Open the pack → **Verify manifest** recomputes the SHA-256 of the canonical manifest in
   the browser and compares it to the recorded hash.

CLI/API equivalent:

```bash
curl -s -X POST /api/compliance/evidence-packs \
  -H 'content-type: application/json' \
  -d '{"scopeType":"ORGANIZATION"}'
```

## 3. Revoke an evidence pack

A READY pack's manifest and items are immutable. Revocation (`OWNER`) marks the pack
`REVOKED`, preserves the manifest + items as historical evidence, and audits after commit.
There is no hard-delete. A revoked pack stays readable and is visibly marked revoked.

## 4. Readiness & lifecycle vocabulary

- Readiness (fail-closed precedence): `CONFIGURATION_REQUIRED` > `INSUFFICIENT_EVIDENCE` >
  `REVIEW_REQUIRED` > `COMPLETE`. An empty pack is `INSUFFICIENT_EVIDENCE`.
- Pack lifecycle: `REQUESTED` → `GENERATING`/`READY` → `REVOKED`/`EXPIRED`; `FAILED` on a
  generation error (a closed `failureCode`; no partial items committed).

## 5. What is never in a pack

Email, description, IP, user-agent, subject/candidate identity, consent raw identifiers,
legal-document body/title, contract text, incident `sensitiveSummary` (only `summaryCode`),
raw audit metadata, raw observability content, provider configuration / API keys / OpenBao
data, session/token/download-token values, export archive contents, erasure subject data /
`planJson`, or any unrestricted free text. Items carry only ids, versions, timestamps,
counts, booleans, closed classifications and hashes.

## 6. Assurance & CI

```bash
npm run eval:phase97          # offline, deterministic, fail-closed (14 invariant groups)
npm run test:phase97:postgres # compliance PostgreSQL suite (needs a live pgvector DB)
```

`.github/workflows/phase97-compliance-assurance.yml` runs an offline job (generate,
db:validate, tsc, lint, eval:phase95/96/97, npm test, build, adversarial static checks,
safe JSON artifact) and a `pgvector/pgvector:pg16` PostgreSQL job (fresh deploy through
migration 17, second-deploy idempotency, db:validate, the compliance `*.pg.test.ts` suite).
No deploy step, no SSH, no Production hostname/secret.

## 7. Backup, migration & rollback

- Back up `ComplianceEvidencePack` + `ComplianceEvidencePackItem` with the rest of the
  tenant data (standard `pg_dump`). Evidence is `RESTRICT`-owned: an organization holding a
  pack cannot be hard-deleted.
- Migration `20260820000017` is additive-only. Roll back only by an explicit new migration
  — never by editing 00–17. A READY pack is never un-generated, only revoked.
- The pre-apply preflight aborts (with counts + closed labels only) if any pre-existing row
  would violate a new constraint.

## 8. Disabled by default

Destructive retention execution, production export execution and production erasure
execution remain DISABLED by default and are not exposed by this phase. Owner/legal
decisions still `CONFIGURATION_REQUIRED` surface to the operator as readiness states; they
are never auto-resolved and this software never invents a legal deadline, duty, breach
verdict or adequacy decision.
