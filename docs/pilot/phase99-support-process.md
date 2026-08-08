# Hermes OS — Phase 99 Pilot Support Process

Status: **process document, ready for use once a pilot is selected**. Roles
only — no names, emails, or phone numbers appear in this document. Every
response time below is an owner-approved **process expectation** for the
duration of the pilot, not a contractual commitment. See
`phase99-sla-draft.md` for why no binding commitment is made yet.

## 1. Intake

Every pilot-reported issue enters through a single tracked intake channel
(the specific tool/address is configured by the owner outside this document —
never hardcoded here). Each intake item records: reporter role, pilot alias
(`pilot-<slug>`), what was expected vs. observed, when it happened, and any
evidence reference (screenshot, correlation id, exported log excerpt — never
raw credentials or another tenant's data).

## 2. Severity classification

Severity reuses the same vocabulary as
`docs/release/slo-sli-contract.md` and `docs/release/incident-response-runbook.md`
so the same signal is never described two different ways:

| Severity | Definition | Example |
|---|---|---|
| **Critical** | User-facing outage of the pilot environment, an active security event, or an SLO breach classified critical in the SLO/SLI contract. | Pilot environment unreachable; `refresh_replay`/`cross_tenant_denied` fired; sustained 503 readiness. |
| **Warning** | Degraded but functioning; budget-burning; a non-blocking correctness issue. | Elevated latency below the critical threshold; a UAT case fails with `releaseBlocker: false`. |
| **Pilot-blocker** | Not necessarily a system outage, but prevents the pilot from progressing through `phase99-pilot-plan.md` (e.g. onboarding cannot complete, a required workflow cannot be exercised at all). | A required role cannot be assigned; a workflow needed for Phase 3 fails outright. |
| **Informational** | A question, clarification request, or minor UX friction with no functional impact. | "How do I switch locale?" |

## 3. Security escalation

Any report that could be security-relevant (suspected unauthorized access,
suspected data exposure, suspected authentication/session weakness) is routed
to the **Security Contact** role immediately, in parallel with normal intake
— never held for routine triage. The Security Contact follows the
repository's `SECURITY.md` process for anything that looks like a genuine
vulnerability, and coordinates with the **Incident Commander** if it is
confirmed as an active incident (see
`docs/release/incident-response-runbook.md`).

## 4. Operational escalation

A **Critical** item (per §2) is escalated to the **Incident Commander** and
handled per `docs/release/incident-response-runbook.md` and, where a
disaster-recovery action is needed, `docs/release/disaster-recovery-runbook.md`
(Phase 98). Support intake does not duplicate that runbook — it is the entry
point into it for pilot-reported signals.

## 5. Pilot-blocker handling

A **Pilot-blocker** is owned by the **Pilot Coordinator**, who decides whether
it pauses the current phase of `phase99-pilot-plan.md`, needs Application/
release owner involvement, or can be worked around without blocking. A
pilot-blocker is never silently downgraded to Informational to keep a phase
"on schedule."

## 6. Response ownership by role

| Severity | Primary owner role | Secondary / escalation role |
|---|---|---|
| Critical | Incident Commander | Application/release owner, Database recovery owner, Upload recovery owner (per the incident-response runbook's decision tree) |
| Critical (security) | Security Contact | Incident Commander |
| Warning | Support Contact (pilot) | Pilot Coordinator |
| Pilot-blocker | Pilot Coordinator | Application/release owner |
| Informational | Support Contact (pilot) | — |

## 7. Evidence requested

To triage efficiently, intake should include (never more than needed, never
real secrets/PII): the pilot alias, the UAT case id if applicable
(`phase99-uat-cases.json`), a correlation id if the reporter has one, a
screenshot with no sensitive data visible, and the locale/role in use at the
time.

## 8. Communication cadence

- **Critical:** acknowledged as soon as it is triaged; status updates at
  detection, mitigation, and resolution (mirrors
  `docs/release/incident-response-runbook.md` §5).
- **Warning / Pilot-blocker:** acknowledged within the next scheduled pilot
  check-in; the Pilot Coordinator sets the actual cadence per pilot, since no
  fixed number is contractually promised here.
- **Informational:** answered as capacity allows; not tracked toward any
  guarantee.

## 9. Closure criteria

An item closes when: the reported behaviour is either reproduced and fixed,
reproduced and explicitly accepted as a documented limitation (feeding
`knownLimitations` in `phase99-acceptance-template.md`), or found not to be
reproducible with the evidence available (recorded as such, not silently
dropped). A Critical item additionally requires the verification step from
the incident-response runbook before closure.

## 10. What this process does not promise

No commercial support tier, response-time SLA, or uptime commitment is made
by this document. The cadence and ownership above are the owner's approved
operating expectations for the pilot, subject to change by the owner, and are
explicitly not a binding agreement — see `phase99-sla-draft.md`.
