# Hermes OS — Phase 99 Pilot Plan

Status: **planning document, no pilot has started**. Companion to
`docs/release/slo-sli-contract.md` (SLO/SLI contract), `docs/release/incident-response-runbook.md`
(incident response), and the Phase 98 disaster-recovery and release-engineering
documents under `docs/release/` (backup/restore, blue/green release, RPO/RTO).
This plan does not restate or change any of those; it references them.

`PILOT_CUSTOMER_SELECTED=BLOCKED_OWNER` — no pilot organization has been
selected, contacted, or onboarded. This document contains no company name,
person name, email address, phone number, or IP address. Any pilot identifier
used anywhere in the Phase 99 pilot package MUST take the alias form
`pilot-<slug>` (for example `pilot-alpha`), never a real name.

---

## 1. Objectives

- Prove that a representative industrial workflow can be exercised end to end
  in Hermes OS by an authorised engineering stakeholder, under the read-only /
  simulated OT policy (§4), with every step traceable to evidence.
- Collect structured, honest feedback on engineering correctness, clarity,
  and operational fit from a real authorised engineer (never fabricated).
- Exercise the support, incident, and observability processes against a real
  (non-production) pilot environment before any commercial commitment is made.
- Produce a defensible, evidence-backed acceptance record (or a documented
  rejection) that a real Acceptance Authority signs — not an agent.

## 2. Scope

In scope: a single pilot organization (`pilot-<slug>`), a bounded set of
representative workflows drawn from the real product surface (Intelligence,
Operations, Engineering, Knowledge, Business, Administration groups — see
`src/lib/navigation/app-nav.ts`), guided UAT, workflow validation, structured
engineer feedback, bounded non-production performance observation, safe
incident simulation, and a documented acceptance decision.

Out of scope (see §3 Non-goals): any live PLC/SIS control, any production
customer data, any commercial terms, any regulatory or certification claim.

## 3. Non-goals

- No pilot customer is named, selected, or contacted by this package. Selection
  is an owner decision (§6 checklist).
- No claim is made anywhere in this package that a pilot has occurred, that
  acceptance was granted, or that an industrial engineer gave feedback — those
  are external facts that do not exist yet and must never be fabricated.
- No financial credit, contractual uptime guarantee, contractual response-time
  guarantee, or regulatory/certification claim is made (see
  `phase99-sla-draft.md`, which is itself a non-binding draft).
- No direct PLC control, no direct SIS control, no automatic actuation (§4).
- No production system, production data, or production customer is touched by
  any exercise in this package (UAT, workflow validation, performance
  observation, incident simulation all run in non-production/isolated
  environments).

## 4. OT safety policy (explicit, unconditional for the pilot)

```
LIVE_OT_WRITE        = False
DIRECT_PLC_CONTROL   = False
DIRECT_SIS_CONTROL   = False
AUTOMATIC_ACTUATION  = False
```

The pilot only exercises Hermes OS surfaces that are read-only or simulated
against OT/industrial equipment. Industrial Brain and OT Edge output is
**advisory**: Hermes OS does not open a connection to a controller, does not
read live process values as a control input, and issues no command to
industrial equipment (consistent with the existing product contract; see
`messages/en.json` → `ot.advisory`). No pilot activity may convert this into
automatic actuation or direct control. If a future phase changes this policy,
that is a distinct, explicitly-approved change — never an implicit pilot
side effect.

## 5. Roles (roles only — never names, emails, or phone numbers)

| Role | Responsibility |
|---|---|
| **Pilot Coordinator** | Owns this plan end to end: scheduling, entry/exit criteria, scope control; coordinates the other roles below. |
| **Acceptance Authority** | The only role permitted to record `acceptanceDecision` on `phase99-acceptance-template.md`. Never the agent; never Support. |
| **Authorised Engineering Stakeholder** | The pilot-side domain expert who completes workflow validation (`phase99-workflow-validation.md`) and the feedback form (`phase99-industrial-engineer-feedback.md`). Must be a real, authorised person — never simulated. |
| **Support Contact (pilot)** | Intake and triage for pilot-reported issues, per `phase99-support-process.md`. |
| **Security Contact** | Receives and triages any security-relevant report during the pilot; coordinates with the repository's `SECURITY.md` process. |
| **Incident Commander** | Reused from `docs/release/incident-response-runbook.md` — owns any incident that touches the pilot environment. |
| **Application/release owner** | Reused from the Phase 98 release-engineering runbook — owns the identity of the release/build the pilot runs against. |

## 6. Pilot selection checklist (owner decision — non-identifying)

None of the items below are satisfied yet. This checklist exists so the owner
can evaluate a candidate pilot without this package ever recording who it is.

- [ ] **Representative industrial workflow** — the candidate's use case maps to
      at least one of the real workflows in `phase99-workflow-validation.md`.
- [ ] **Authorised engineering stakeholder available** — a named-to-the-owner
      (never named in this repository) person with the domain authority to
      validate workflows and give engineering feedback.
- [ ] **Non-production or isolated integration path** — the pilot runs against
      an environment that is not the production system and not commingled with
      another tenant's live data.
- [ ] **Ability to give UAT feedback** — the stakeholder can execute or
      observe the UAT cases in `phase99-uat-cases.json` and record real results.
- [ ] **Support contact role identified** — the pilot side has designated who
      receives support communications (a role, per `phase99-support-process.md`).
- [ ] **Data / privacy agreement readiness** — any data the pilot side provides
      is covered by an agreed data-handling/privacy understanding before it
      enters Hermes OS.
- [ ] **Network and security approval** — the pilot side's own IT/security
      function has approved the integration path (if any network exposure is
      involved).
- [ ] **Clear acceptance authority** — a single named-to-the-owner role who can
      sign the acceptance record (§ Acceptance Authority above).
- [ ] **Rollback and disconnect capability** — a documented way to revoke pilot
      access and disconnect the pilot environment at any time, from either side.

## 7. Phases (entry / exit criteria)

### Phase 0 — Readiness
- **Entry:** Phase 93 v1 GO conditions accepted by the owner; Phase 97
  compliance/privacy/legal control plane in place; Phase 98 DR/release
  engineering in place; this pilot package reviewed by the owner.
- **Exit:** every item in §6 checked by the owner for a specific candidate,
  environment provisioned, roles in §5 assigned to real people (never recorded
  here), `pilot-<slug>` alias assigned.

### Phase 1 — Onboarding
- **Entry:** Phase 0 exit satisfied.
- **Exit:** pilot users can authenticate, organization/site context is
  established, `phase99-onboarding-guide.md` has been walked through, and the
  OT safety policy (§4) has been acknowledged in writing by the pilot side.

### Phase 2 — Guided UAT
- **Entry:** Phase 1 exit satisfied.
- **Exit:** every case in `phase99-uat-cases.json` reaches a closed status
  (`PASS` / `FAIL` / `BLOCKED` / `ACCEPTED_WITH_LIMITATION`) — none left
  `NOT_RUN` — and no open `FAIL` has `releaseBlocker: true`.

### Phase 3 — Workflow validation & engineer feedback
- **Entry:** Phase 2 exit satisfied.
- **Exit:** `phase99-workflow-validation.md` completed for each workflow
  actually exercised; the Authorised Engineering Stakeholder has returned a
  completed `phase99-industrial-engineer-feedback.md`; no unresolved safety
  concern is flagged as blocking.

### Phase 4 — Performance & incident observation
- **Entry:** Phase 3 underway or complete.
- **Exit:** the observation plan in `phase99-performance-observation.md` has
  been run for the pilot window with no unresolved critical SLO breach
  attributable to the pilot path; at least one safe exercise from
  `phase99-incident-simulation.md` has been run in a disposable/non-production
  environment and documented.

### Phase 5 — Acceptance review
- **Entry:** Phases 2–4 exit criteria satisfied.
- **Exit:** the Acceptance Authority has reviewed all evidence and completed
  `phase99-acceptance-template.md`. `PILOT_ACCEPTANCE_RECORDED` flips from
  `False` to `True` only when a real Acceptance Authority records a decision
  there — never automatically, never by an agent.

### Phase 6 — Close-out (extension, rejection, or disconnect)
- **Entry:** Phase 5 exit satisfied, or the pilot is terminated early via the
  rollback/disconnect capability (§6).
- **Exit:** the acceptance decision is applied; on `REJECTED` or early
  termination, pilot access is revoked and the pilot environment is
  disconnected; on `ACCEPTED`, hand-off to any follow-on commercial process is
  explicitly outside this package's scope — this package makes no commercial
  commitment (see `phase99-sla-draft.md`).

## 8. Rollback and disconnect

At any phase, either side may invoke rollback/disconnect: revoke the pilot
organization's sessions and credentials, disable further access, and (if the
pilot ran in a dedicated isolated environment) tear that environment down.
This uses the existing session-revocation and access-control mechanisms — it
does not require, and must never use, a weakened or bypassed authorization
path. No pilot data is retained beyond what the agreed data/privacy
understanding (§6) specifies.
