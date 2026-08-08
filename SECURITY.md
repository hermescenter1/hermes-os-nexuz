# Security Policy

Hermes OS is a continuously deployed enterprise industrial-intelligence
platform, not a versioned library consumers pin to a release number. This
policy explains how to report a security concern responsibly and what to
expect afterward.

## Supported versions

There is no back-catalogue of maintained release branches. Security fixes
are applied to the `main` branch and shipped through the platform's normal
continuous-deployment pipeline; only the current state of `main` (and the
production deployment built from it) is supported. If you are testing
against a fork, an older checkout, or a self-hosted deployment that has not
been kept current, please note the exact commit SHA you tested in your
report so triage can account for it.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**, using GitHub's
private security-advisory feature on this repository:
**Security → Report a vulnerability**. Do not open a public issue, a public
pull request, or a public discussion for a suspected vulnerability — this
repository is public, and a public report before a fix ships is itself a
disclosure.

When reporting, please include as much of the following as you reasonably
can:

- A clear description of the issue and its security impact.
- The affected endpoint, page, or component (a route path, a file path, a
  feature name).
- Steps to reproduce, or a proof of concept, using only your own test data —
  never real customer data, and never a destructive action (see "Out of
  scope" below).
- The commit SHA or deployment you tested against.
- Any suggested remediation, if you have one.

If your report concerns an authorised, contracted penetration-test or
application-security engagement rather than independent good-faith research,
please follow `docs/security/phase99-rules-of-engagement.md` instead, which
defines the reporting channel, retest procedure and confidentiality terms
for that context.

## What happens after a report

This is described as a **process**, not a contractual service-level
agreement — Hermes OS does not currently offer a paid or contracted
vulnerability-response SLA:

1. **Acknowledgement.** We aim to acknowledge a new report within a few
   business days.
2. **Triage.** The report is assessed and assigned a severity
   (`CRITICAL` / `HIGH` / `MEDIUM` / `LOW` / `INFO`) and a status, using the
   same closed vocabulary defined in
   `docs/security/phase99-finding-handling.md`. A `CRITICAL` finding is never
   closed by "accepting the risk" — it is fixed or it is shown, with
   evidence, not to apply.
3. **Remediation.** We work on a fix at a pace proportionate to severity and
   exploitability. We may ask follow-up questions or request additional
   reproduction detail.
4. **Coordinated disclosure.** We will let you know when a fix has shipped.
   We ask that you not publicly disclose details of the vulnerability until
   a fix is available, and we are happy to credit your report (with your
   permission) once it is safe to do so.

## Safe harbour for good-faith research

We will not pursue legal action against a researcher who, acting in good
faith:

- Reports a vulnerability privately per the process above rather than
  exploiting or publicly disclosing it first;
- Makes a good-faith effort to avoid privacy violations, data destruction,
  and service disruption;
- Does not access, modify, or exfiltrate data belonging to a real customer
  or a real production tenant;
- Stops testing and reports immediately upon encountering data that does not
  belong to them.

This safe harbour covers **independent, non-destructive research against
your own test data**. It does **not** authorise testing against the live
production deployment, real customer data, or real customer tenants —
testing at that level requires the explicit, written, scoped authorization
described in `docs/security/phase99-rules-of-engagement.md`, including a
target the owner has specifically designated for that purpose. Testing the
production domain without that written authorization is not covered by this
safe harbour.

## Out of scope

The following are explicitly out of scope for any report or research
activity under this policy, consistent with
`docs/security/phase99-external-review-scope.md`:

- **Production data** — no report or test may involve reading, modifying or
  exfiltrating real production data.
- **Real customer tenants** — testing must use your own account(s) or
  data you control, never another organization's records.
- **Live industrial equipment** — Hermes OS integrates with operational-
  technology gateways and industrial control systems in customer
  deployments; no real PLC, SIS, HMI, OT gateway, or other physical
  equipment is an authorised target under this policy, and no actuation or
  safety-system testing of any kind is in scope.
- **Denial-of-service testing** — volumetric flooding, resource-exhaustion
  attacks, or any technique intended to make the service unavailable to
  other users.
- **Social engineering** — phishing, pretexting, or social engineering
  against Hermes personnel, contractors, or customers is not covered by this
  policy and is not authorised.

For a fuller description of what an independent security review of this
platform covers, see `docs/security/phase99-external-review-scope.md` and
`docs/security/phase99-rules-of-engagement.md`.
