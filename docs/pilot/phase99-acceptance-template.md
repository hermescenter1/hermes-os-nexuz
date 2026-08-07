# Hermes OS — Phase 99 Pilot Acceptance Record Template

Status: **blank template**. `PILOT_ACCEPTANCE_RECORDED=False`.

This is the sanitized schema for a pilot acceptance record. **The agent that
authored this Phase 99 package must never populate `acceptanceAuthorityRole`,
`acceptanceDate`, or `acceptanceDecision`.** Those three fields exist only to
be filled in by a real, authorised human acting in the Acceptance Authority
role defined in `phase99-pilot-plan.md` §5, after independently reviewing the
referenced evidence — never inferred, never defaulted, never filled in on the
Acceptance Authority's behalf by anyone else.

A record whose `pilotId` (or any other field) is a synthetic/test value —
i.e. marked `SYNTHETIC_TEST_FIXTURE` — **can never satisfy closure of a real
pilot**, no matter how complete the rest of the record looks. Synthetic
records exist only to prove the schema and process work; they carry no
evidentiary weight toward a real acceptance decision.

`PILOT_ACCEPTANCE_RECORDED=False` until a real Acceptance Authority records a
decision in an instance of this template. Nothing in this repository may
claim otherwise.

## 1. Field schema

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | integer | Version of this acceptance-record schema (starts at `1`). |
| `pilotId` | string | The `pilot-<slug>` alias for this pilot — never a real name. |
| `testedCommitSha` | string (40-hex) | The exact git commit SHA the pilot ran against. |
| `testedImageDigest` | string | The container image digest actually deployed for the pilot, if applicable. |
| `pilotScopeHash` | string | A hash (e.g. SHA-256) over the agreed pilot scope document(s), so the acceptance record is bound to a specific, unambiguous scope. |
| `uatSummary` | object | `{ total, pass, fail, blocked, acceptedWithLimitation, notRun }` — counts rolled up from `phase99-uat-cases.json` at the time of review. |
| `workflowValidationReference` | string | Pointer to the completed `phase99-workflow-validation.md` record(s) used. |
| `engineerFeedbackReference` | string | Pointer to the completed `phase99-industrial-engineer-feedback.md` instance used. |
| `performanceObservationReference` | string | Pointer to the completed `phase99-performance-observation.md` run used. |
| `incidentSimulationReference` | string | Pointer to the completed `phase99-incident-simulation.md` exercise record(s) used. |
| `onboardingCompleted` | boolean | Whether `phase99-onboarding-guide.md` was walked through with the pilot users. |
| `supportProcessAccepted` | boolean | Whether the pilot side has acknowledged `phase99-support-process.md`. |
| `knownLimitations` | string[] | Documented, accepted limitations (e.g. `ACCEPTED_WITH_LIMITATION` UAT cases, `OWNER_THRESHOLD_REQUIRED` items left unresolved). |
| `openBlockerCount` | integer | Count of unresolved Pilot-blocker items per `phase99-support-process.md` at review time. Must be `0` for `ACCEPTED`. |
| `acceptanceDecision` | enum | One of `ACCEPTED`, `REJECTED`, `CONDITIONAL`. **Never set by an agent.** |
| `acceptanceAuthorityRole` | string | The role (never a name) that made the decision — must match `phase99-pilot-plan.md` §5's Acceptance Authority. **Never set by an agent.** |
| `acceptanceDate` | string (ISO 8601 date) | The date the decision was made. **Never set by an agent.** |
| `acceptanceEvidenceReference` | string | Pointer to the bundle of evidence the Acceptance Authority actually reviewed. |
| `acceptanceEvidenceSha256` | string | SHA-256 of that evidence bundle, so the record is bound to specific, unalterable evidence. |

## 2. Blank template

```json
{
  "schemaVersion": 1,
  "pilotId": null,
  "testedCommitSha": null,
  "testedImageDigest": null,
  "pilotScopeHash": null,
  "uatSummary": {
    "total": null,
    "pass": null,
    "fail": null,
    "blocked": null,
    "acceptedWithLimitation": null,
    "notRun": null
  },
  "workflowValidationReference": null,
  "engineerFeedbackReference": null,
  "performanceObservationReference": null,
  "incidentSimulationReference": null,
  "onboardingCompleted": null,
  "supportProcessAccepted": null,
  "knownLimitations": [],
  "openBlockerCount": null,
  "acceptanceDecision": null,
  "acceptanceAuthorityRole": null,
  "acceptanceDate": null,
  "acceptanceEvidenceReference": null,
  "acceptanceEvidenceSha256": null
}
```

## 3. Rules for using this template

1. Every field except `schemaVersion` starts `null`/empty in a new record.
2. Fields other than the three Acceptance-Authority fields may be filled in
   by the Pilot Coordinator as evidence becomes available (e.g. `uatSummary`
   once `phase99-uat-cases.json` reaches closed statuses).
3. `acceptanceDecision`, `acceptanceAuthorityRole`, and `acceptanceDate` are
   filled in **only** by the Acceptance Authority, **only** after reviewing
   the referenced evidence directly (not a summary written by anyone else on
   their behalf).
4. `ACCEPTED` requires `openBlockerCount == 0`; `CONDITIONAL` requires every
   condition to be captured in `knownLimitations`; `REJECTED` requires the
   reviewed evidence to be referenced regardless.
5. A record produced to validate this template itself (rather than a real
   pilot) must set `pilotId` to a value explicitly marked
   `SYNTHETIC_TEST_FIXTURE` and can never be cited as satisfying pilot
   acceptance.
6. `PILOT_ACCEPTANCE_RECORDED` is `True` only for a specific, real,
   non-synthetic record with all three Acceptance-Authority fields completed
   by a real human. Until then it is `False`, everywhere this package refers
   to it.
