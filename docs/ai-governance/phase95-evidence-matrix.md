# Phase 95 — AI Governance & Model Assurance: Evidence Matrix

Deterministic-first, fail-closed. LLM authority = paraphrase/explanation only.
This matrix maps each official closure gate to its acceptance criterion,
implementation, tests, dataset, command, result and limitations. Offline PR CI
never calls a provider.

Base: `origin/main` (911a2d7). Branch: `agent/phase95-ai-governance-model-assurance`.

| Gate | Acceptance | Implementation | Tests / dataset | Result | Limitation |
| --- | --- | --- | --- | --- | --- |
| MODEL_INVENTORY | Every production provider/model in code is registered; 0 unregistered | `src/lib/ai-governance/model-registry.ts` | `__tests__/model-registry.static.test.ts` (scans `src/**`) | **PASS (offline)** — UNREGISTERED=0 | Registry is code-level; legal/retention facts marked `EXTERNAL_REVIEW_REQUIRED` |
| TENANT_DATA_PROVIDER_POLICY | Default-deny; external transfer needs flag + approved org policy | `provider-policy.ts` (fail-closed) | `__tests__/provider-policy.test.ts` + `tests/fixtures/ai-governance/tenant-data-policy.jsonl` | **PASS (offline)** — default `False` | Persistence (Prisma model) proposed, not yet bound in a route |
| PROMPT_INJECTION_EVAL | High-risk asks never influence model; 0 secret/system/cross-tenant disclosure | `injection-screen.ts`, `prompt-envelope.ts`, `content-normalisation.ts`, `router.ts` | `__tests__/prompt-security.test.ts` + `injection.jsonl` | **PASS (offline)** | Offline heuristic screen; live behaviour is the manual workflow |
| RAG_POISONING_EVAL | Cross-tenant/revoked/archived blocked; unreviewed never authoritative | `rag-provenance.ts` | `__tests__/rag-provenance.test.ts` + `rag-poisoning.jsonl` | **PASS (offline)** — logic; not yet wired into live retrieval | Retrieval wiring into `src/lib/rag/*` is a follow-up |
| CITATION_INTEGRITY | Only server-issued, retrieved, same-tenant, accessible citations survive | `citation-verifier.ts`, `output-schema.ts` (allow-list) | `__tests__/output-and-citation.test.ts` + `citation-integrity.jsonl` | **PASS (offline)** | Verifier is pure; route binding is a follow-up |
| UNSAFE_RECOMMENDATION_BLOCKING | Safety-defeat content hard-blocked; approval never downgraded; 0 escapes | `unsafe-output.ts` | `__tests__/safety-router-evidence.test.ts` + `unsafe-recommendations.jsonl` | **PASS (offline)** — CONTROL_ACTION_POSSIBLE=False | Multilingual heuristic; complements existing guardrails |
| HUMAN_APPROVAL_BOUNDARY | LLM cannot remove/downgrade deterministic approval | `unsafe-output.ts`, `output-schema.ts` (immutable fields), `router.ts` | `__tests__/safety-router-evidence.test.ts`, `output-and-citation.test.ts` | **PASS (offline)** | Reuses finding-workflow pattern; LLM-specific workflow binding is a follow-up |
| HALLUCINATION_REGRESSION_WITHIN_BUDGET | Pinned LIVE model within budget on synthetic set | `hallucination.live.test.ts`, `ai-governance-live-eval.yml` (dispatch-only) | `hallucination-regression.jsonl` (live only) | **EVIDENCE_INCOMPLETE** — offline cannot certify; live workflow created, NOT run | Requires owner-approved live run in the `ai-evaluation` environment |

## Offline evaluation

- Runner: `scripts/ci/phase95-ai-governance-eval.mjs` → `__tests__/phase95-eval.test.ts`.
- Datasets: `tests/fixtures/ai-governance/*.jsonl` (synthetic; no real tenant data).
- Budgets: `tests/fixtures/ai-governance/budgets.json` — zero-tolerance escapes must be 0.
- CI job: `.github/workflows/ci.yml` → `phase95-ai-governance` (no provider, no secrets).

## Two distinct hallucination gates

- `OFFLINE_REGRESSION_GATE` — deterministic library validation (citation allow-list, schema, unsafe screen) of model-shaped inputs. Enforced in PR CI.
- `LIVE_PINNED_MODEL_REGRESSION_GATE` — the pinned `claude-sonnet-4-20250514` over synthetic data, in the manual `ai-governance-live-eval` workflow. **Not run in this phase.** `HALLUCINATION_REGRESSION_WITHIN_BUDGET` is therefore reported `EVIDENCE_INCOMPLETE`.

## What this phase deliberately does NOT do

- No external provider call during implementation or PR CI.
- No Production contact, deployment, secret change, or OpenBao interaction.
- No route/DB surgery that would risk the existing suite: the governance library
  is complete and tested; binding it into `/api/brain` (rate-limit + policy gate +
  execution-trace persistence) and `src/lib/rag/*` is the documented next work
  unit, guarded behind default-off flags.
