# ATS Role Catalog — the five initial Hermes profiles

**Source of truth:** `src/lib/ats/review/catalog.ts` (`ROLE_PROFILES`), version `ATS_RUBRIC_VERSION = hermes-5-roles-1.0`.
This document describes that file; where they differ, the file wins and this document is stale.

## What a profile is

A profile is a **scorecard**, not a job posting. It carries:

| Element | Purpose |
| --- | --- |
| `criteria` | must-have / nice-to-have / disqualifier, each with a dimension, a weight, an evidence vocabulary (`keywords`), an optional `minYears`, and `hardGate` |
| `weights` | per-dimension weights (skill, experience, education, certification, project, role_relevance) — always sum to 100 |
| `interviewKit` | five stages: recruiter screen → technical/functional → behavioral/communication → final review → reference/offer readiness (policy-gated), each with owner role, SLA, questions and an anchored rubric |
| `assessment` | one role-specific exercise with what it evaluates and what is submitted |
| `approvalOwnerRole` / `decisionSlaDays` | who is accountable for the human decision at the gate, and by when |

**Deliberately absent:** salary range, currency, headcount, sponsorship, contract type, location type. These are real business facts the repository does not hold. They stay owner-gated on `AtsJob` and are never inferred here.

## Non-negotiables enforced by test (`review-engine.test.ts`)

- No criterion label, keyword, question, rubric anchor or assessment string contains a protected-attribute term (`PROTECTED_ATTRIBUTE_TERMS` in `policy.ts`: age, gender, ethnicity, religion, photo, marital status, nationality, surname, disability…). The scan is strict enough to have caught the word "race" in an unrelated engineering question, which was rephrased.
- Every profile has an experience hard gate (`minYears`), at least one must-have, one nice-to-have and one disqualifier.
- **Absence is not failure.** A must-have with no evidence yields `UNKNOWN` on its gate, which yields `REVIEW_REQUIRED` — never a rejection. A disqualifier fires only on an **explicit statement** in the candidate's own text.

## Applying a profile to a job

`POST /api/ats/jobs/{jobId}/criteria` with `{ "roleCode": "<code>" }` (capability `ATS_MANAGE`) writes the criteria as `AtsJobCriterion` rows coded `<roleCode>.<criterionCode>`, upserting by `(organizationId, jobId, code)`. The review engine recovers the profile from that prefix. A job without criteria cannot be reviewed; its outbox row records `NO_CRITERIA` and retries.

## The five profiles

### 1 · `finance_accountant` — Accountant / Finance Specialist
Department `finance`. Weights: skill 40 · experience 25 · education 10 · certification 10 · project 5 · role_relevance 10.
- **Must-have:** general ledger / AP / AR / month-end close (hard gate); financial statements and management reporting; tax and VAT; accounting/ERP software; **≥ 3 years** (hard gate).
- **Nice-to-have:** IFRS/national standards; accounting/finance/economics degree; ACCA/CPA/CMA or national certification; cost/industrial accounting; audit or internal control.
- **Disqualifier (explicit only):** states no accounting experience.
- **Assessment:** ledger reconciliation case (90 min, spreadsheet with notes on every adjustment).
- **Approval owner:** HR_MANAGER · SLA 5 days. Functional interview owner: HIRING_MANAGER.

### 2 · `automation_plc_scada_engineer` — Senior Electrical / Automation / PLC / SCADA Engineer
Department `automation`. Weights: skill 40 · experience 20 · education 5 · certification 10 · project 15 · role_relevance 10.
- **Must-have:** PLC programming — Siemens S7/TIA Portal, Allen-Bradley, Schneider (hard gate); SCADA/HMI — WinCC, Ignition, Citect, FactoryTalk (hard gate); industrial protocols — Profinet, Profibus, Modbus, OPC UA, EtherNet/IP; electrical design — panels, drawings, drives; commissioning on site; **≥ 5 years** (hard gate).
- **Nice-to-have:** IEC 61131-3 languages; electrical/control/automation degree; vendor or functional-safety certification (SIL, IEC 61508/61511); process-industry exposure; live-plant troubleshooting.
- **Disqualifier (explicit only):** states no PLC experience.
- **Assessment:** PLC and SCADA design exercise (take-home, two-tank process with interlocks and an HMI outline).
- **Approval owner:** HIRING_MANAGER · SLA 7 days.

### 3 · `backend_engineer` — Backend Engineer
Department `engineering`. Weights: skill 40 · experience 20 · education 5 · certification 0 · project 25 · role_relevance 10.
- **Must-have:** a server-side language (hard gate); relational databases and SQL, PostgreSQL preferred (hard gate); API design, authentication and authorization; automated testing and CI; owned a production system; **≥ 3 years** (hard gate).
- **Nice-to-have:** containers/caching/queues/observability; CS or software-engineering degree; application security practice; Next.js/React exposure.
- **Disqualifier (explicit only):** states no backend or server-side experience.
- **Assessment:** tenant-scoped API exercise (take-home, org scoping + one transactional endpoint + tests).
- **Approval owner:** HIRING_MANAGER · SLA 5 days.

### 4 · `ai_ml_engineer` — AI / ML Engineer
Department `engineering`. Weights: skill 40 · experience 15 · education 10 · certification 0 · project 25 · role_relevance 10.
- **Must-have:** Python for ML engineering (hard gate); ML frameworks — PyTorch, TensorFlow, scikit-learn (hard gate); model evaluation, validation and monitoring; LLM/NLP application work (RAG, embeddings, fine-tuning); shipped a model to production; **≥ 2 years** (hard gate).
- **Nice-to-have:** time-series / anomaly detection; relevant degree; industrial or engineering data experience; AI governance and evaluation-set awareness.
- **Disqualifier (explicit only):** states no machine-learning experience.
- **Assessment:** evidence-grounded extraction exercise (take-home, per-claim evidence spans, evaluated against a labelled set).
- **Approval owner:** HIRING_MANAGER · SLA 5 days.

### 5 · `b2b_technical_marketing` — B2B / Technical Marketing Specialist
Department `marketing`. Weights: skill 40 · experience 20 · education 5 · certification 5 · project 20 · role_relevance 10.
- **Must-have:** B2B marketing for industrial/technical products (hard gate); technical content — case studies, white papers, product pages (hard gate); campaign analytics and attribution; SEO, LinkedIn and digital demand generation; owned a launch with measurable results; **≥ 3 years** (hard gate).
- **Nice-to-have:** CRM and marketing automation; relevant degree; platform certification; trade shows/events/partner marketing; automation/industrial-software domain literacy.
- **Disqualifier (explicit only):** states no B2B marketing experience.
- **Assessment:** technical content and launch brief (portfolio review, two pieces + one-page launch brief with metrics).
- **Approval owner:** HR_MANAGER · SLA 5 days.

## Interview kit — shared structure

Every profile's kit has the same five stages so the pipeline UI and the audit trail can treat them uniformly:

| Stage | Kind | Default owner | SLA |
| --- | --- | --- | --- |
| Recruiter screen | `RECRUITER_SCREEN` | RECRUITER | 3 d |
| Technical / functional | `TECHNICAL_FUNCTIONAL` | HIRING_MANAGER | 5 d |
| Behavioral & communication | `BEHAVIORAL_COMMUNICATION` | HIRING_MANAGER or HR_MANAGER | 5 d |
| Final review | `FINAL_REVIEW` | HR_MANAGER | 5 d |
| Reference & offer readiness | `REFERENCE_OFFER_READINESS` (policy-gated) | HR_MANAGER | 7 d |

Each rubric item carries three anchors (what a 1, a 3 and a 5 look like) so two interviewers score the same thing.

## Known limitations

- Interview kits and assessments are **catalog data** in this stage. Recording interview scores against them (`AtsInterviewKit` / `AtsInterviewFeedback` persistence, append-only) is not yet implemented; `AtsInterview` still carries the pre-existing free-form score columns.
- Persian and German titles are provided; criterion labels, questions and rubric anchors are English only in `hermes-5-roles-1.0`.
