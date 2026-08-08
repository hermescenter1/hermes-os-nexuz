# Hermes OS — Phase 99 Workflow Validation

Status: **template + real workflow descriptions, not yet executed against a
pilot**. Companion to `phase99-uat-matrix.md` (mechanical pass/fail) and
`phase99-industrial-engineer-feedback.md` (qualitative judgment). Where UAT
proves a step behaves as specified, workflow validation records the fuller
operational picture around it: objective, decision points, evidence, and
recovery — for the Authorised Engineering Stakeholder to walk through and
annotate with the Pilot Coordinator during Phase 3 of `phase99-pilot-plan.md`.

> **Advisory contract, restated.** Every industrial diagnostic output in
> Hermes OS (Industrial Brain, OT Edge findings) is **advisory**. It is never
> converted into automatic actuation, direct PLC control, or direct SIS
> control (`LIVE_OT_WRITE=False`, `DIRECT_PLC_CONTROL=False`,
> `DIRECT_SIS_CONTROL=False`, `AUTOMATIC_ACTUATION=False` — see
> `phase99-pilot-plan.md` §4). A human always makes the operational decision.

## Record template

For each workflow actually exercised, fill in:

- **Workflow name**
- **Business objective** — what operational outcome the workflow serves.
- **Industrial objective** — the engineering/process outcome it serves.
- **Input source** — where the data entering the workflow comes from (manual
  entry, an uploaded document, a prior case, etc.) — never a live OT read.
- **Operator role** — the RBAC/organization role exercising the workflow.
- **System actions** — what Hermes OS actually does, step by step.
- **Decision points** — where a human must choose or confirm before the
  workflow proceeds.
- **Outputs** — what the workflow produces (a record, a document, a status
  change).
- **Audit / evidence** — what is recorded and where it can be found again
  (audit trail, evidence attachment, correlation id).
- **Failure handling** — what happens when a step fails (validation error,
  denied permission, unavailable dependency).
- **Recovery / rollback** — how to undo or correct a mistaken action.
- **Expected human verification** — what a person must independently confirm
  before relying on the output.

---

## 1. Authenticated onboarding and organization context

- **Business objective:** a pilot user can reach the correct organization and
  site scope quickly and only see their own tenant's data.
- **Industrial objective:** none directly — this is the access-control
  foundation every other workflow depends on.
- **Input source:** credentials entered by the user; organization/site
  selection from the switcher.
- **Operator role:** any authenticated role (`engineer`, `admin`, `customer`,
  `vendor`, `superadmin`).
- **System actions:** authenticate, establish a session, resolve organization
  membership, apply the selected organization/site as the active context for
  subsequent queries.
- **Decision points:** which organization/site to make active, when a user
  belongs to more than one.
- **Outputs:** an active session scoped to one organization (and, where
  relevant, one site) at a time.
- **Audit / evidence:** session and security events are recorded (see
  `docs/release/slo-sli-contract.md` SLI-5); tenant isolation is enforced at
  the database query level, not only in the UI.
- **Failure handling:** invalid credentials are rejected without revealing
  which part was wrong; an ambiguous or unavailable owner/organization context
  fails closed (409/503), never defaults to an arbitrary organization.
- **Recovery / rollback:** password reset flow; session revocation
  (logout, or an admin-initiated revoke) if a session is suspected compromised.
- **Expected human verification:** confirm the organization/site shown in the
  UI matches the intended pilot scope before entering or reviewing any data.

## 2. Site and asset workflow

- **Business objective:** maintain an accurate inventory of the pilot site's
  assets for use by other modules (Operations, CMMS, Industrial Brain).
- **Industrial objective:** ground later diagnostic and maintenance workflows
  in a correct, current asset record.
- **Input source:** manual entry by an authorised engineer; no live OT feed.
- **Operator role:** `engineer` (authoring capability) or `admin`.
- **System actions:** create/update an asset record scoped to the active site
  and organization; list and filter assets.
- **Decision points:** which site an asset belongs to; which fields are
  required before the record is considered usable elsewhere.
- **Outputs:** an asset record usable by other modules that reference assets
  (cases, CMMS, Industrial Brain context).
- **Audit / evidence:** creation/edit is attributable to the acting user and
  organization.
- **Failure handling:** invalid or incomplete input is rejected with a clear
  validation message, not silently dropped.
- **Recovery / rollback:** the record can be corrected or retired; deletion,
  where offered, does not silently affect other modules' data integrity.
- **Expected human verification:** the engineer confirms the asset record
  matches the real (or agreed sandbox) equipment identity before it is used as
  the basis for a case or analysis.

## 3. Industrial Brain fault analysis (advisory)

- **Business objective:** give an engineer a fast, explainable starting point
  for diagnosing a fault, reducing time-to-first-hypothesis.
- **Industrial objective:** structure evidence, likely causes, checklist
  items, and risk for a described fault using a deterministic, evidence-first
  reasoning engine — no external AI call, no fabricated telemetry.
- **Input source:** manually entered fault description, symptoms, and
  observed state fields entered by the engineer; never a live PLC/SIS read.
- **Operator role:** `engineer`.
- **System actions:** match the input against the deterministic case/rule
  base; produce a structured analysis (signal matrix, likely causes,
  checklist, risk, evidence gaps) traceable to the input given.
- **Decision points:** the engineer decides whether the analysis is
  sufficient, needs more input, or should be escalated to a case.
- **Outputs:** a structured analysis result; optionally, a case created from
  it (workflow 4).
- **Audit / evidence:** the analysis is traceable to its exact input; nothing
  in the output claims to be a live measurement.
- **Failure handling:** insufficient or malformed input is rejected by
  validation before analysis runs, with an explicit evidence-gap noted rather
  than a guessed value substituted.
- **Recovery / rollback:** the engineer can re-run the analysis with corrected
  or additional input; nothing is written back to any OT system, so there is
  no OT-side rollback to perform.
- **Expected human verification:** the engineer, not the system, decides on
  and performs any real-world action; the output is explicitly advisory (see
  the banner above the analysis panel) and must be read as such.

## 4. Case and evidence workflow

- **Business objective:** turn a diagnostic finding into a trackable unit of
  work with a defensible history.
- **Industrial objective:** preserve the evidence trail behind an engineering
  decision.
- **Input source:** an Industrial Brain analysis, a manual observation, or an
  OT Edge finding; evidence attachments provided by the engineer.
- **Operator role:** `engineer`, reviewed/managed by `admin` where relevant.
- **System actions:** create the case, link it to its origin (analysis/asset),
  accept evidence attachments, record status transitions.
- **Decision points:** case status transitions (e.g. open, in review,
  resolved); who evidence is visible to (kept within the organization).
- **Outputs:** a case record with an attached evidence and status history.
- **Audit / evidence:** every status transition is recorded with actor and
  timestamp (UAT-010); evidence attachments are retrievable.
- **Failure handling:** an attachment that fails validation (size, type) is
  rejected with a clear message, not silently discarded.
- **Recovery / rollback:** a case can be reopened or its status corrected; the
  audit trail preserves the original transition rather than overwriting it.
- **Expected human verification:** before closing a case, the engineer
  confirms the evidence attached actually supports the recorded resolution.

## 5. Knowledge / journal publication

- **Business objective:** let engineering knowledge gained during the pilot be
  captured and reused.
- **Industrial objective:** turn a one-off finding into durable, searchable
  institutional knowledge.
- **Input source:** manual authoring by an engineer.
- **Operator role:** `engineer` (authoring) to draft; publish action makes it
  visible org-wide.
- **System actions:** save a draft, then publish it; publication changes
  visibility, not content ownership.
- **Decision points:** whether a draft is ready to publish; who can see
  unpublished content (authors and admins only).
- **Outputs:** a published article discoverable via Library/Knowledge Base
  search (UAT-012).
- **Audit / evidence:** authorship and publish timestamp are recorded.
- **Failure handling:** an attempt to view an unpublished article by a
  non-authorized role is denied, not returned with partial content.
- **Recovery / rollback:** a published article can be edited or unpublished by
  its author/admin.
- **Expected human verification:** the author confirms the published content
  is accurate before publishing — publication is a one-way visibility change
  the author controls.

## 6. Compliance workflow (consent and privacy request)

- **Business objective:** meet the pilot side's data-handling expectations
  from first contact with the product.
- **Industrial objective:** none — this is a governance workflow, not a
  process/engineering one.
- **Input source:** the pilot user's consent choice and, if invoked, a
  privacy-request submission.
- **Operator role:** `viewer`/`customer` for consent; `customer` (or the
  pilot's designated contact) for a privacy request.
- **System actions:** record the consent choice and apply it; create and
  track a privacy request through the existing compliance control plane
  (Phase 97).
- **Decision points:** what the user consents to; how the request is
  triaged and assigned.
- **Outputs:** a stored, respected consent state; a tracked privacy-request
  record.
- **Audit / evidence:** the compliance control plane records the request's
  lifecycle.
- **Failure handling:** a malformed or cross-tenant request is rejected, not
  partially processed.
- **Recovery / rollback:** a consent choice can be changed later by the user.
- **Expected human verification:** the pilot's designated privacy contact
  confirms the request was actually handled per the agreed data/privacy
  understanding referenced in the pilot selection checklist.

## 7. Admin and observability monitoring

- **Business objective:** give the pilot's administrator visibility into
  system health without needing a separate tool.
- **Industrial objective:** none directly — this supports the operational
  confidence behind every other workflow.
- **Input source:** the platform's own real telemetry (metrics, health,
  security events) — never synthesized data presented as if it were live.
- **Operator role:** `admin`.
- **System actions:** aggregate dependency health, active alerts, a security
  summary, error fingerprints, and recent audit activity into one view.
- **Decision points:** whether observed data warrants escalation (see
  `phase99-incident-simulation.md` and `docs/release/incident-response-runbook.md`).
- **Outputs:** a read-only operator snapshot.
- **Audit / evidence:** the dashboard itself is a read surface over existing,
  already-audited data; access to it is admin-only.
- **Failure handling:** a component that cannot be measured is shown as
  `NOT_INSTRUMENTED`, never as a fabricated zero.
- **Recovery / rollback:** not applicable — this workflow is read-only.
- **Expected human verification:** the admin cross-checks any concerning
  signal against `docs/release/slo-sli-contract.md` before treating it as an
  incident.

## 8. Document export and EDMS

- **Business objective:** let a pilot user take a record out of Hermes OS in a
  portable form (e.g. for an internal report).
- **Industrial objective:** preserve engineering evidence in a durable,
  shareable document format.
- **Input source:** an existing case, asset, or uploaded controlled document.
- **Operator role:** `engineer` (authoring) or the record's owning role.
- **System actions:** render/export the record's real content; store and
  retrieve uploaded controlled documents scoped to the organization.
- **Decision points:** what format to export to; whether the document being
  uploaded belongs in EDMS at all.
- **Outputs:** a downloadable document; a stored EDMS document record.
- **Audit / evidence:** export and upload actions are attributable to the
  acting user and organization.
- **Failure handling:** an export or upload request for a record outside the
  user's organization is denied, not partially fulfilled.
- **Recovery / rollback:** an EDMS document can be superseded or retired by an
  authorized role; exports themselves are not stored server-side beyond what
  the existing document/export implementation already does.
- **Expected human verification:** the engineer confirms the exported/uploaded
  content matches what was intended before sharing it outside Hermes OS.
