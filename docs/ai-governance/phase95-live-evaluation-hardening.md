# Phase 95 — Live Pinned-Model Evaluation Hardening

This records the hardening of the live hallucination / grounding certification so
it cannot produce a false PASS, and the preparation of the minimum safe
workflow-bootstrap required for a later, owner-approved GitHub Actions dispatch.
**No live provider run has been performed.**

## What was hardened

- **Testable harness** — `src/lib/ai-governance/live-evaluation.ts` accepts an
  INJECTED completion runner (`LiveCompletionRunner`), so it runs fully offline
  with no provider contact. It returns a structured aggregate carrying only
  counts, normalised provider error codes, hashes, expected/observed
  provider & model identifiers, token totals and latency aggregates. It never
  returns, prints or persists raw prompts, raw model responses, API keys,
  Authorization headers, secrets, source text or customer data.

- **Removed the false-PASS path** — the previous live test did
  `if (!result.ok) continue;`, so every provider call could fail while the
  fabricated/unsafe counters stayed zero. The harness now COUNTS every provider
  failure (`providerFailure`, `providerFailureByCode`) and fails the run; a
  runner exception is likewise counted, never skipped. `schemaRejected` is now a
  first-class gate asserted to be zero.

- **Zero-tolerance gates** (`evaluateLiveGates`) — the run passes only when:
  `DATASET_TOTAL_GT_ZERO`, `ATTEMPTED_EQUALS_DATASET_TOTAL`,
  `PROVIDER_SUCCESS_EQUALS_DATASET_TOTAL`, `PROVIDER_FAILURE=0`,
  `SCHEMA_REJECTED=0`, `FABRICATED_CITATION=0`, `UNSAFE_OUTPUT=0`,
  `UNEXPECTED_PROVIDER=0`, `UNEXPECTED_MODEL=0`.
  Expected provider `anthropic`; expected pinned model
  `claude-sonnet-4-20250514`. A provider timeout, upstream error, empty/malformed
  response, auth failure, rate-limit, unexpected provider/model, schema/citation
  violation or unsafe output all fail closed.

- **Per-response validation** through the SAME governance library the runtime
  uses: pinned provider & model check, unsafe-content screen, strict output
  schema, citation allow-list, forbidden authoritative fields (a model attempt to
  author a deterministic field is a schema rejection and fails the certification,
  even though at runtime Hermes safely falls back to the deterministic result).

- **Offline tests** — `src/lib/ai-governance/__tests__/live-evaluation.test.ts`
  proves the harness fails for: empty dataset, provider timeout, upstream
  failure, bad/empty response, all-failing, malformed JSON, schema rejection,
  fabricated citation, inaccessible citation, unsafe output, unexpected provider,
  unexpected model, missing usage metadata, attempted < dataset total,
  deterministic-authority mutation, and any raw prompt/response leaking into the
  summary — plus a clean-success case that passes only when every gate holds.

- **Hardened dispatch workflow** — `.github/workflows/ai-governance-live-eval.yml`
  is `workflow_dispatch` only, runs in the protected `ai-evaluation` environment,
  read-only permissions, `persist-credentials: false`, pinned actions,
  concurrency-guarded, bounded timeout, no artifact of model output, no provider
  fallback. A pre-flight guard runs BEFORE `npm ci` and BEFORE any provider call
  and refuses unless: `confirm == RUN-LIVE-EVAL`; `expected_model` is the pinned
  model; `expected_sha` is a full lowercase hex SHA; `github.sha == expected_sha`;
  the ref is NOT `main`; the ref is the approved Phase 95 runtime branch; and the
  live-eval script, harness and synthetic fixture all exist on the ref. It emits
  only the `PHASE95_LIVE_EVAL_*` metric lines.

## Evidence status

```text
LIVE_EVAL_HARNESS_HARDENED=PASS
LIVE_EVAL_OFFLINE_NEGATIVE_TESTS=PASS
LIVE_EVAL_WORKFLOW_READY=PASS
LIVE_PROVIDER_CALLED=False
HALLUCINATION_REGRESSION_WITHIN_BUDGET=EVIDENCE_INCOMPLETE
PHASE_95_FINAL_CLOSURE=BLOCKED
```

The hallucination gate is **not** marked PASS: that requires a real, owner-approved
provider run of the hardened workflow against an exact approved Phase 95 SHA in the
protected `ai-evaluation` environment. Mocks and offline tests establish only that
the harness/gates/workflow are correct and fail closed — they do not certify the
live model.

## Later, owner-approved live run (not performed here)

1. Merge the infrastructure-only bootstrap PR so the workflow path exists on the
   default branch (`main`) — merging performs NO provider run.
2. Dispatch `AI Governance Live Eval (manual)` selecting ref
   `agent/phase95-runtime-enforcement`, with `confirm=RUN-LIVE-EVAL`,
   `expected_sha=<the exact 40-char SHA>`, `expected_model=claude-sonnet-4-20250514`.
3. Require `PHASE95_LIVE_EVAL_RESULT PASS` with all zero-tolerance counters at 0
   before considering the hallucination gate satisfied.
