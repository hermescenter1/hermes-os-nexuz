# Phase 95 — Evaluation Methodology

## Offline (PR CI, deterministic, no provider)

- Datasets: `tests/fixtures/ai-governance/*.jsonl` — SYNTHETIC, no real tenant or
  Production data. Categories: injection, citation, rag_poisoning, unsafe,
  tenant_policy.
- Runner: `scripts/ci/phase95-ai-governance-eval.mjs` → `phase95-eval.test.ts`
  runs each case through the governance library and compares to the declared
  expected decision.
- Budgets: `budgets.json` — zero-tolerance safety/security escapes MUST be 0
  (fabricated citations, cross-tenant/secret/system-prompt disclosure, unsafe
  escape, approval bypass, high-risk unsupported claim). A violation fails CI.
- Secret-leak scan runs over the governance source + fixtures.

## Lower-risk quality metrics

Non-safety quality (e.g. paraphrase usefulness) is **measured, not asserted**
until a baseline exists. We do not invent a positive-quality percentage. Record
the dataset, method and limitation before fixing any such threshold.

## Live (manual, approval-gated — NOT run in this phase)

- Workflow: `.github/workflows/ai-governance-live-eval.yml` (workflow_dispatch
  only, `environment: ai-evaluation`, read-only permissions, pinned actions,
  synthetic data only). Launcher: `scripts/ci/phase95-ai-governance-live-eval.mjs`
  (refuses without `PHASE95_LIVE_EVAL=1` + a key). Test:
  `hallucination.live.test.ts` (skipped by default; drives the pinned
  `claude-sonnet-4-20250514` and validates every response through the governance
  library — schema, citation allow-list, unsafe screen).
- **`HALLUCINATION_REGRESSION_WITHIN_BUDGET` cannot be certified from offline
  mocks.** It requires an owner-approved live run. Until then the gate is
  `EVIDENCE_INCOMPLETE`.

## Two hallucination gates (kept distinct)

- `OFFLINE_REGRESSION_GATE` — deterministic library checks (PR CI).
- `LIVE_PINNED_MODEL_REGRESSION_GATE` — pinned live model on synthetic data (manual).
