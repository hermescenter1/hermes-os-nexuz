# Hermes OS — Phase 99 Industrial Engineer Feedback Form

Status: **blank form template**. `INDUSTRIAL_ENGINEER_FEEDBACK=BLOCKED_EXTERNAL`.

This form must be completed by a real, authorised engineer who actually
exercised the workflows in `phase99-workflow-validation.md` against a real
(non-production/isolated) pilot environment. **No field below may be
pre-filled, simulated, or answered on the engineer's behalf by an agent, the
Pilot Coordinator, or any other role.** Fabricated feedback — including a
plausible-sounding answer written to "complete" this document — is never
acceptable and would make any acceptance decision built on it invalid.

Every response field is intentionally left empty in this template.

---

## Respondent

- Role (e.g. process engineer, controls engineer, maintenance engineer):
  `______________________________`
- Relationship to the pilot organization (e.g. internal engineer, contracted
  engineer) — role only, no name: `______________________________`
- Workflows actually exercised (list from `phase99-workflow-validation.md`):
  `______________________________`
- Date range of use: `______________________________`

## 1. Workflow usefulness

Did each exercised workflow address a real need in your engineering work? For
each workflow, what would you have done without Hermes OS?

`______________________________`

## 2. Engineering correctness

Was the diagnostic reasoning, terminology, and recommended checklist content
engineering-sound for your domain? Note any incorrect, misleading, or
domain-inappropriate content specifically.

`______________________________`

## 3. Clarity

Was the output (analysis, checklist, risk framing) understandable without
additional explanation? What, if anything, needed interpretation help?

`______________________________`

## 4. Traceability

Could you trace every conclusion back to the input evidence you provided? Was
it ever unclear where a statement came from?

`______________________________`

## 5. Evidence quality

Was the evidence captured (attachments, case history, audit trail) sufficient
to support a real engineering decision or a later audit?

`______________________________`

## 6. False positives

Did the system flag anything as a likely cause, risk, or concern that turned
out not to be relevant? Describe specific instances.

`______________________________`

## 7. False negatives

Did the system miss a cause, risk, or concern that you identified through your
own expertise? Describe specific instances.

`______________________________`

## 8. Operational fit

Did the workflow fit how your team actually works (roles, escalation, shift
handover, documentation practice)? What friction did it introduce?

`______________________________`

## 9. Training / onboarding friction

What, if anything, was hard to learn or use without guidance? Was
`phase99-onboarding-guide.md` sufficient?

`______________________________`

## 10. Performance

Was response time acceptable for your workflow? Note any specific slow
interaction (see `phase99-performance-observation.md` for what was measured
independently).

`______________________________`

## 11. Missing capability / blockers

Is there anything you needed that Hermes OS does not currently provide, that
you would consider a blocker to real use?

`______________________________`

## 12. Safety concerns

Did anything about the output, its presentation, or the workflow create a risk
of being mistaken for a live/automatic control action, or otherwise raise a
process-safety concern? This question exists specifically to catch any
erosion of the advisory-only contract (`phase99-pilot-plan.md` §4).

`______________________________`

## 13. Acceptance recommendation

Based on your experience, would you recommend proceeding, proceeding with
noted limitations, or not proceeding? This is a recommendation to the
Acceptance Authority, not a decision — only the Acceptance Authority records
`acceptanceDecision` in `phase99-acceptance-template.md`.

`______________________________`

## 14. Additional comments

`______________________________`

---

**Signature / authority.** This form is only meaningful when completed by the
named-to-the-owner Authorised Engineering Stakeholder identified in
`phase99-pilot-plan.md` §5. This repository never records that person's name.

`INDUSTRIAL_ENGINEER_FEEDBACK=BLOCKED_EXTERNAL` until this form is returned,
completed by a real person, with none of the fields above left as a template
placeholder.
