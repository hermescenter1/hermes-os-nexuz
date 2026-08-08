# Phase 95 — AI Governance Architecture

**Principle:** deterministic-first, fail-closed. The deterministic engine is
authoritative for fault classification, hypothesis ranking, evidence state,
confidence, safe-action boundaries, approval requirements, tenant/site ownership
and citation identity. The LLM is optional and **paraphrase/explanation only**;
it may never author or change any authoritative field, create citations, relax
safety, remove approval, or trigger an OT action. Provider failure, malformed
output, invalid citation, insufficient evidence or policy denial ⇒ deterministic
result / fail closed.

## Components (all under `src/lib/ai-governance/`)

- `model-registry.ts` — the single governed inventory of providers/models/engines. Static gate enforces zero unregistered production model ids.
- `provider-policy.ts` — fail-closed, default-deny tenant external-provider policy (global flag AND approved org policy, unexpired, in-scope; secrets never leave).
- `router.ts` — deterministic-first policy router (`DETERMINISTIC_ONLY` / `+LLM_REPHRASE` / `RETRIEVAL_ONLY` / `BLOCKED` / `HUMAN_REVIEW_REQUIRED`). No auto-fallback to a second external provider; production never uses mock embeddings silently.
- `content-normalisation.ts` + `injection-screen.ts` + `prompt-envelope.ts` — instruction/data separation; retrieved content is untrusted DATA, never instructions.
- `output-schema.ts` — strict Zod LLM output (`rephrasedSummary`, `explanation`, `citationIds`); forbidden authoritative fields rejected; deterministic fields immutable on merge.
- `citation-verifier.ts` — server-side verification of an opaque citation allow-list (existence, retrieval-set membership, tenant/site, accessibility, lifecycle).
- `rag-provenance.ts` — trust tiers + poisoning defence (cross-tenant/revoked/archived/unpublished blocked; unreviewed never authoritative).
- `evidence-sufficiency.ts` — sufficiency states + per-risk-class thresholds (LLM cannot change).
- `unsafe-output.ts` — industrial output classes + hard-block of safety-defeat content + human-approval preservation (multilingual FA/EN/DE).
- `execution-trace.ts` — privacy-preserving trace (hashes + ids + classifications; never raw prompt/response/secret) and governance audit-event names.
- `evaluation/harness.ts` — deterministic offline evaluation over synthetic datasets with zero-tolerance budgets.

## Integration posture

The library is complete, self-contained and tested. Binding it into `/api/brain`
(policy gate + rate limit + execution-trace persistence + envelope) and
`src/lib/rag/*` (provenance-filtered retrieval) is the next work unit, guarded
behind default-off flags, so this phase changes no existing runtime behaviour.
