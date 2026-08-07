# Hermes OS — Phase 99 Incident Simulation Plan

Status: **scenario plan, not yet executed against a pilot**. Every scenario
below runs in a safe, disposable, non-production environment only —
**destructive incident simulation is never run against production**, mirroring
the safety posture already established in
`docs/release/phase98-architecture-and-plan.md` (disposable rehearsal
projects/volumes only) and enforced by
`docs/release/incident-response-runbook.md`. This document does not define
new detection thresholds; it reuses the existing SLO/SLI contract
(`docs/release/slo-sli-contract.md`) and routes recovery to the existing
Phase 93/98 runbooks by reference.

## Format

For each scenario: **Trigger → Expected detection → Triage → Escalation →
Operator action → Recovery → Verification → Communication path.**

---

## 1. Application candidate failure

- **Trigger:** a deliberately broken build/candidate is started in a
  disposable environment (mirrors `docs/release/incident-response-runbook.md`
  §3.11, "Failed cutover").
- **Expected detection:** candidate health check fails before any cutover;
  no user-facing impact by design.
- **Triage:** inspect candidate logs for the injected failure.
- **Escalation:** Application/release owner; no Incident Commander
  involvement needed since no cutover occurred.
- **Operator action:** none required for user-facing service.
- **Recovery:** fix the candidate and rebuild; previous-good color remains
  active throughout.
- **Verification:** `activeColor()` still reports the previous-good color;
  `/api/health/ready` == 200 throughout.
- **Communication path:** internal only — no customer-facing impact occurred.

## 2. PostgreSQL unavailable

- **Trigger:** the disposable environment's PostgreSQL container is stopped.
- **Expected detection:** `/api/health/ready` returns 503;
  `dependency_up{postgres}==0` (SLI-7, critical immediately).
- **Triage:** confirm via `GET /api/admin/observability` → `health`.
- **Escalation:** Database recovery owner → Incident Commander (per
  `docs/release/incident-response-runbook.md` §3.1).
- **Operator action:** do not restart-loop the application; follow the DR
  runbook's Postgres recovery path.
- **Recovery:** restart/restore PostgreSQL in the disposable environment
  (never a real restore against the pilot's own data outside a genuinely
  agreed rehearsal window).
- **Verification:** `/api/health/ready` == 200; no fresh error spike.
- **Communication path:** internal status update at detection and resolution;
  external (pilot-facing) communication only if the pilot's own environment
  was genuinely affected, and only via the Support Contact process
  (`phase99-support-process.md`).

## 3. Redis unavailable

- **Trigger:** the disposable environment's Redis container is stopped.
- **Expected detection:** `dependency_up{redis}==0`; the auth rate limiter is
  expected to degrade to its in-process fallback rather than fail open
  (SLI-7, warning — not critical on a single node).
- **Triage:** confirm rate limiting still functions after the fallback.
- **Escalation:** Platform/SRE → Incident Commander.
- **Operator action:** never disable or bypass rate limiting to "work around"
  Redis being down.
- **Recovery:** bring Redis back up; no data migration expected
  (`REBUILD_FROM_AUTHORITATIVE_STATE`).
- **Verification:** `dependency_up{redis}==1`; rate limiting still functions.
- **Communication path:** internal only, unless sustained long enough to
  visibly affect the pilot's own testing.

## 4. Upload / document storage unavailable

- **Trigger:** in the disposable environment, the uploads/documents volume is
  made unavailable (mirrors
  `docs/release/incident-response-runbook.md` §3.4).
- **Expected detection:** 404s on previously-working document/avatar URLs, or
  volume-loss evidence.
- **Triage:** confirm scope (one root or both affected).
- **Escalation:** Upload recovery owner → Incident Commander.
- **Operator action:** never synthesize placeholder documents to "fill the
  gap" — that would inject fake data into a production-shaped path, which is
  prohibited even in a pilot.
- **Recovery:** restore from a verified `.hbk` uploads artifact per
  `docs/release/disaster-recovery-runbook.md` §Uploads (Phase 98).
  Reference: `docs/release/phase98-architecture-and-plan.md`.
- **Verification:** `FILE_COUNT`/`MANIFEST_SHA256` match the artifact's
  `.meta.json` sidecar; spot-check a known document URL.
- **Communication path:** internal status update; pilot-facing communication
  via the Support Contact process only if the pilot's own uploaded content was
  genuinely affected.

## 5. Expired or revoked session

- **Trigger:** a test session is deliberately expired or its `tokenVersion`
  bumped (revocation).
- **Expected detection:** the next authenticated request is rejected and the
  user is redirected to sign in, matching UAT-023.
- **Triage:** confirm the rejection is clean (no partial data returned before
  the redirect).
- **Escalation:** none required for the expected-behaviour case; escalate to
  Incident Commander only if a revoked/expired session is found to still be
  accepted (that would be a security regression, not a simulation result).
- **Operator action:** none, unless the unexpected-acceptance case above is
  found.
- **Recovery:** not applicable for the expected case.
- **Verification:** confirm no authenticated action succeeds on the
  expired/revoked session.
- **Communication path:** internal only.

## 6. Cross-tenant access attempt correctly denied

- **Trigger:** an authenticated account outside `pilot-alpha` attempts to
  access a `pilot-alpha`-scoped resource directly (matches UAT-024).
- **Expected detection:** access denied (404/403, no existence leak); a
  `cross_tenant_denied` security event is recorded (SLI-5, critical detector,
  but this is the control working correctly, not an outage).
- **Triage:** confirm via `GET /api/admin/observability?correlationId=<id>`
  that the event shows a denial, not a leak.
- **Escalation:** per `docs/release/incident-response-runbook.md` §4 —
  confirm it is *denied* (fail-closed working); investigate the caller by
  correlation id; never relax authorization to "resolve" this.
- **Operator action:** none required if correctly denied.
- **Recovery:** not applicable for the expected case; if access was
  incorrectly granted, this becomes a real security incident and is escalated
  immediately, not treated as a simulation artifact.
- **Verification:** the denial is corroborated in the security/audit trail.
- **Communication path:** internal only, unless a genuine cross-tenant leak is
  found, in which case the Security Contact and Incident Commander are engaged
  immediately per the incident-response runbook.

## 7. Backup / recovery escalation (reference only, Phase 98)

- **Trigger:** any scenario above that requires an actual restore, or a
  deliberate "verify only" rehearsal of the backup chain in a disposable
  environment.
- **Expected detection / recovery / verification:** fully defined in
  `docs/release/disaster-recovery-runbook.md` and
  `docs/release/incident-response-runbook.md` §3.1–3.5 — this document does
  not restate or alter that procedure.
- **Escalation:** Database recovery owner / Upload recovery owner → Incident
  Commander.
- **Communication path:** internal; RPO/RTO evidence is recorded per the
  Phase 98 assurance report, not fabricated for the pilot.

## 8. Security-finding escalation

- **Trigger:** a security-relevant observation is made during the pilot
  (e.g. an unexpected error, a suspicious access pattern, a UAT case that
  fails in a way that suggests a boundary weakness).
- **Expected detection:** the observer files it through the Security Contact
  role, not by informally messaging an individual.
- **Triage:** classify per `phase99-support-process.md` §Security escalation.
- **Escalation:** Security Contact → Incident Commander if confirmed.
- **Operator action:** never attempt to "fix" a suspected security issue by
  weakening a check to make a symptom go away.
- **Recovery:** per the incident-response runbook once classified.
- **Verification:** the finding is either confirmed and remediated, or
  documented as a false positive with reasoning.
- **Communication path:** see "how to report a security issue" in
  `phase99-onboarding-guide.md`; internal-only until triaged.

## 9. Support escalation

- **Trigger:** a pilot user reports a blocking issue through the support
  intake process.
- **Expected detection:** intake creates a tracked item per
  `phase99-support-process.md`.
- **Triage:** severity classified per the same document.
- **Escalation:** Support Contact → Pilot Coordinator → (if operational)
  Incident Commander, or (if security-relevant) Security Contact.
- **Operator action:** per the classified severity.
- **Recovery:** per whichever path above the underlying cause maps to.
- **Verification:** closure criteria in `phase99-support-process.md`.
- **Communication path:** Support Contact process; no informal side channel
  substitutes for the tracked intake.
