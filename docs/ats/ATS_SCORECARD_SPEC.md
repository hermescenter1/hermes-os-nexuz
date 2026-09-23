# ATS Scorecard and AI Review Specification

**Implements:** `src/lib/ats/review/{extractor,scorer,engine,report-schema,prompt-guard}.ts`
**Versions stamped on every review row:** `extractorVersion = deterministic-1.0`, `rubricVersion = hermes-5-roles-1.0`, `promptVersion = ats-review-prompt-1.0`, `policyVersion = stage-gate-1.0`.

## 1. The process (mandatory stage gate)

```
Application received (APPLIED)
  → AI_REVIEW_PENDING            written by the intake, same transaction
  → [review worker]              evidence extraction → scoring → typed report
  → PENDING_HUMAN_APPROVAL       written by the worker, conditional update
  → [human decision, reason]     ADVANCE | HOLD | RETURN_FOR_REVIEW | REJECT
  → SCREENING | (stays) | AI_REVIEW_PENDING (cycle+1) | REJECTED
```

No code path advances, rejects or hires automatically. `REJECT_RECOMMENDED` is a recommendation; only `AtsReviewDecision` with a written reason moves the application.

## 2. Evidence — the unit of every claim

```ts
{ source, span: {start,end} | null, quote (≤200), confidence: HIGH|MEDIUM|LOW, extractedAt, extractorVersion }
```

Sources are exactly the Stage-1 fields: `resumeText`, `fitStatement`, `keySkills`, `yearsExperience`, `currentLocation`, `linkedinUrl`, or `notCollected`. The extractor never reads the name, e-mail or phone.

| Signal | Source | Confidence |
| --- | --- | --- |
| keyword in résumé text | `resumeText` | HIGH |
| keyword in fit statement | `fitStatement` | MEDIUM |
| self-declared skill | `keySkills` | MEDIUM (a claim, not proficiency) |
| years from the form field | `yearsExperience` | HIGH |
| "N years" mention in text | `resumeText` / `fitStatement` | MEDIUM |

Keyword matching is case-insensitive, whitespace-flexible and word-bounded for Latin, digits and Persian letters (`plc` matches, `plcx` does not). Spans index the **original** text.

## 3. What is never inferred

| Field | Report value |
| --- | --- |
| work authorization | `{ status: "UNKNOWN", reason: "not collected in Stage 1" }` |
| salary fit | `{ status: "NOT_COLLECTED" }` |
| location without a form value | `{ status: "UNKNOWN" }` |
| years without form or text | `{ status: "UNKNOWN" }` |
| any criterion without evidence | listed under `missingEvidence` with an `ask` — a question for the reviewer, never a guess |

## 4. Hard gates

| Criterion type | Evidence | Outcome |
| --- | --- | --- |
| experience (`minYears`) | years OBSERVED ≥ min | PASS, evidence = the observation |
| | years OBSERVED < min | FAIL, evidence = the observation |
| | years UNKNOWN | UNKNOWN |
| must-have (`hardGate`) | any evidence | PASS |
| | none | UNKNOWN (absence is not failure) |
| disqualifier | explicit statement found | FAIL |
| | none | UNKNOWN (not asserted either way; does not count as missing evidence) |

The report refuses (schema) a PASS/FAIL gate without evidence and an UNKNOWN gate with evidence.

## 5. Scores

- **Dimension score** = Σ weight(matched must/nice) ÷ Σ weight(all must/nice in the dimension) × 100; `null` when the dimension has no criteria. Disqualifiers carry no weight.
- **Overall** = weighted mean of non-null dimension scores by the profile's dimension weights; `null` when nothing is scorable.
- **Confidence** (0..100) = 40 + 60 × evidence coverage − 15 per decidable UNKNOWN gate − 25 without résumé text − 20 on suspected injection, clamped.

## 6. Recommendation (advisory)

| Condition | Recommendation |
| --- | --- |
| any FAIL gate | `REJECT_RECOMMENDED` |
| any decidable UNKNOWN gate | `REVIEW_REQUIRED` |
| overall null or < 45 | `REVIEW_REQUIRED` |
| 45 ≤ overall < 70 | `HOLD` |
| overall ≥ 70 | `ADVANCE` |

Thresholds are constants in `scorer.ts` (`HOLD_THRESHOLD`, `ADVANCE_THRESHOLD`) and belong to `rubricVersion`.

## 7. The report (`AtsAiReview.report`, schema `ats-review-report-1`)

Required sections, each typed by Zod (`report-schema.ts`): version labels, provider, `roleCode`, `matchedSkills`, `missingSkills`, `experience`, `education`, `certifications`, `projects`, `roleRelevance`, `locationAvailability`, `workAuthorization`, `salaryFit`, `contradictions`, `missingEvidence`, `riskFlags`, `hardGates`, `dimensionScores`, `overallScore`, `confidence`, `recommendation`, `explanation` (plain language), and `humanReview: { status: "PENDING_HUMAN_APPROVAL" }` stated inside the report itself.

Risk flag codes: `PROMPT_INJECTION_SUSPECTED`, `RESUME_TEXT_ABSENT`, `EXPERIENCE_CONTRADICTION`, `LOCATION_UNKNOWN`, `WORK_AUTHORIZATION_NOT_COLLECTED`, `SALARY_NOT_COLLECTED`, `DISQUALIFIER_EVIDENCE`, `LOW_EVIDENCE_COVERAGE`.

## 8. Determinism and reproducibility

The deterministic path is pure: identical inputs and `now` produce byte-identical reports (tested). A stored review can be reproduced from the application row, the job's criteria snapshot (`AtsApplication.jobCriteriaSnapshot`) and the four version labels.

## 9. Prompt injection

Résumé text is data. Detection (`scanForInjection`) raises `PROMPT_INJECTION_SUSPECTED` and lowers confidence; **scores, gates and the recommendation are identical to the clean résumé** (tested with an injected fixture). Containment applies only on the optional model path: sanitised text inside a data fence, criterion labels only (no weights, no thresholds), and an instruction to produce prose, never a score.

## 10. Optional external model — doubly gated

`ATS_AI_REVIEW_PROVIDER=router` **and** `ATS_AI_EXTERNAL_PROCESSING_ALLOWED=true`. Without both, no candidate text leaves the process (tested: the provider is not called). When it runs, its output is appended to `explanation` as "Model commentary (advisory, <model>)" and `provider`/`modelVersion` record it; a mock or degraded response is discarded. The model never sees a score and never returns one.

## 11. Human review record (`AtsReviewDecision`)

Every decision stores: actor user id, member id (when known), actor role, organization id, application id, from-status, to-status, decision, **reason (mandatory, ≥ 3 chars)**, the AI review id the actor cites (validated to belong to the same application and organization), correlation id, timestamp, and the audit-log linkage. Append-only.
