# Hermes OS — Pilot Service-Level Draft

**DRAFT — NON_BINDING — OWNER_REVIEW_REQUIRED — LEGAL_REVIEW_REQUIRED**

This document is a **draft** starting point for a future service-level
discussion with a pilot participant. It is **NON_BINDING**: it creates no
obligation, commitment, or right for either party until it has gone through
`OWNER_REVIEW_REQUIRED` and separately `LEGAL_REVIEW_REQUIRED`, and until both
parties sign a final, negotiated agreement outside this repository. Nothing in
this file may be presented to a pilot participant as an agreed term.

## 1. What this draft references (existing, real evidence — not new promises)

- **Availability measurement.** Availability is measured exactly as defined
  in `docs/release/slo-sli-contract.md` SLI-1: fraction of non-5xx HTTP
  responses, target ≥ 99.5% over a rolling 30 days, corresponding to an error
  budget of approximately 3 hours 39 minutes per 30 days. This draft proposes
  reusing that same measurement, not a new one.
- **Recovery point objective (RPO).** As established in Phase 98
  (`docs/release/phase98-architecture-and-plan.md`,
  `docs/release/phase98-assurance-report.md`): system RPO ≈ 24 hours
  (worst durable component; owner-activated backup schedule).
- **Recovery time objective (RTO).** Owner **target** RTO ≈ 4 hours for a
  full-node recovery, per `docs/release/incident-response-runbook.md` §3.8 —
  described there explicitly as a target, not yet timed against a real
  production incident. This draft does not upgrade that target into a
  commitment.
- **Incident and support process.** `docs/release/incident-response-runbook.md`
  and `phase99-support-process.md` describe how incidents and support items
  are handled today. This draft proposes referencing those processes as-is,
  not replacing them.

## 2. Draft structure (placeholders — OWNER_REVIEW_REQUIRED for every value)

| Term | Draft value | Status |
|---|---|---|
| Availability target | 99.5% / 30 days (reused from SLI-1) | `OWNER_REVIEW_REQUIRED` |
| Measurement window | rolling 30 days | `OWNER_REVIEW_REQUIRED` |
| Scheduled-maintenance exclusion | not yet defined | `OWNER_THRESHOLD_REQUIRED` |
| RPO reference | ≈ 24 h (Phase 98 mechanism) | `OWNER_REVIEW_REQUIRED` |
| RTO reference | ≈ 4 h (owner target, not production-timed) | `OWNER_REVIEW_REQUIRED` |
| Support severity model | reuse `phase99-support-process.md` §2 | `OWNER_REVIEW_REQUIRED` |
| Response cadence | process expectation only, not a guarantee (`phase99-support-process.md` §8) | `OWNER_REVIEW_REQUIRED` |
| Escalation path | reuse `docs/release/incident-response-runbook.md` | `OWNER_REVIEW_REQUIRED` |
| Term / termination | not yet defined | `LEGAL_REVIEW_REQUIRED` |
| Data handling / privacy terms | must align with the pilot's own data/privacy agreement (`phase99-pilot-plan.md` §6) | `LEGAL_REVIEW_REQUIRED` |
| Liability / indemnity | not addressed by this draft at all | `LEGAL_REVIEW_REQUIRED` |
| Fees / commercial terms | out of scope for the pilot entirely | `OWNER_REVIEW_REQUIRED` |

## 3. What this draft explicitly does not contain

- No financial remedy of any kind is described or implied for missing a
  target in this draft.
- No contractual uptime guarantee is made — §1's availability figure is a
  measurement definition, not a promise.
- No contractual response-time guarantee is made — support cadence in
  `phase99-support-process.md` is stated there as a process expectation, not
  a commitment, and this draft does not upgrade it.
- No regulatory or industry certification is claimed. Hermes OS does not
  currently hold any third-party security or compliance certification (for
  example SOC 2 or ISO 27001); none is asserted here or anywhere else in this
  pilot package.

## 4. Path to a real agreement

1. Owner reviews and edits every `OWNER_REVIEW_REQUIRED` row in §2 with real,
   deliberate values (or explicitly decides a term does not apply to this
   pilot).
2. Legal review covers every `LEGAL_REVIEW_REQUIRED` row, plus anything the
   owner's review surfaces that needs it.
3. Only after both reviews, and only as a separate, explicitly-labeled final
   document (not this file), can any version of this content be shared with a
   pilot participant as a proposed term.

Until all three steps above are complete, this document remains
**DRAFT / NON_BINDING** and must not be represented otherwise.
