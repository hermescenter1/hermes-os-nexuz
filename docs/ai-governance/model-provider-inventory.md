# Phase 95 — Model & Provider Inventory

Authoritative source of truth: `src/lib/ai-governance/model-registry.ts`
(snapshot: `tests/fixtures/ai-governance/model-inventory.json`). External legal
facts are recorded as `EXTERNAL_REVIEW_REQUIRED` and are **not** invented here.

| registryId | type | external | default | tenant policy | data classes | retention/training/region |
| --- | --- | --- | --- | --- | --- | --- |
| anthropic:claude-sonnet-4-20250514 | generation | yes | off | required | public, tenant_operational | EXTERNAL_REVIEW_REQUIRED |
| openai:text-embedding-3-small | embedding | yes | off | required | public, tenant_operational | EXTERNAL_REVIEW_REQUIRED |
| openai:gpt-4o-mini (dormant router) | generation | yes | off | required | public, tenant_operational | EXTERNAL_REVIEW_REQUIRED |
| hermes:brain-deterministic | deterministic | no | on | n/a | — | hermes-controlled |
| hermes:industrial-brain | deterministic | no | on | n/a | — | hermes-controlled |
| hermes:copilot-deterministic | deterministic | no | on | n/a | — | hermes-controlled |
| hermes:predictive-non-llm | deterministic | no | on | n/a | — | hermes-controlled |
| hermes:mock-generation | mock | no | off | n/a | — | hermes-controlled |
| hermes:mock-embedding | mock | no | off | n/a | — | hermes-controlled |

- Every external entry is deny-by-default, tool-calling disabled, structured
  output required, and requires an approved org policy to receive tenant data.
- The static gate (`model-registry.static.test.ts`) fails the build if any
  production model literal appears in executable code but is unregistered.
- `EXTERNAL_REVIEW_REQUIRED` fields require independent owner/vendor review
  before any real-provider activation; this repository makes no legal claim.
