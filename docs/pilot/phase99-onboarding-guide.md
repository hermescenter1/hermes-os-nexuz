# Hermes OS — Phase 99 Pilot Onboarding Guide

Status: **guide, ready for use once a pilot is selected**. No credentials of
any kind appear in this document. Where a name would normally go (contact,
customer, environment identifier), use the `pilot-<slug>` alias form only.

## 1. Supported browsers and environment

Hermes OS is a standard Next.js App Router web application. Use a current
version of a modern evergreen browser (Chromium-based, Firefox, or Safari).
JavaScript must be enabled. No browser plugin, extension, or special network
configuration is required beyond normal HTTPS access to the pilot environment
URL provided out of band by the Pilot Coordinator.

## 2. Account activation

Pilot accounts are created by invitation, not self-registration. An
invitation email contains a single-use activation link. On first use:

1. Follow the activation link.
2. Set a password (the product enforces its existing password strength
   requirements — no separate pilot-specific rule).
3. Sign in.

Never share an activation link or a session cookie between people — each
pilot user should have their own account so that role, audit trail, and
support intake stay attributable to the right person.

## 3. Role model

Hermes OS enforces two role axes together:

- **Product role** (what you can do): `superadmin`, `admin`, `engineer`,
  `customer`, `vendor`, `candidate`, `viewer`. Most pilot users will be
  `engineer` (authoring workflows) or `customer` (read-scoped portal access);
  one or two will be `admin` for organization administration.
- **Organization role** (your standing within the pilot's organization):
  `OWNER`, `ADMIN`, `MANAGER`, `ENGINEER`, `VIEWER`, `BILLING_ADMIN`, and a
  handful of module-specific roles (recruiting, academy, compliance) that are
  not expected to matter for most pilots.

Access to a given page or action is the intersection of both — never assume a
role grants something because the navigation shows it; the server-side check
is authoritative.

## 4. Organization and site setup

A pilot runs inside one organization (aliased `pilot-<slug>` in every document
in this package). Within it:

- **Sites** represent physical/logical locations. Create the sites relevant to
  the pilot's scope before creating assets under them.
- **Assets** belong to a site and organization; they are the anchor most other
  modules (cases, CMMS, Industrial Brain context) reference.
- If the pilot user belongs to more than one organization (e.g. also has a
  personal or sandbox account), always confirm the active organization in the
  switcher before entering data — see UAT-004 in `phase99-uat-cases.json`.

## 5. Data-import boundaries

- Only enter data you are authorized to put into a system outside your own
  infrastructure, consistent with the data/privacy agreement referenced in the
  pilot selection checklist (`phase99-pilot-plan.md` §6).
- Do not import real personally identifiable information, real credentials, or
  real safety-critical process data as a substitute for a proper data-handling
  agreement — if in doubt, use a synthetic/sanitized value and say so in the
  record.
- There is no bulk/administrative data-import path exercised by this pilot
  package; data enters through the product's normal authenticated workflows
  only.

## 6. Read-only / simulation policy (restated)

The pilot never connects Hermes OS to live plant equipment for control
purposes:

```
LIVE_OT_WRITE        = False
DIRECT_PLC_CONTROL   = False
DIRECT_SIS_CONTROL   = False
AUTOMATIC_ACTUATION  = False
```

Any OT-related screen you see (OT Edge, Industrial Brain) is read-only or
simulated: no live connection is opened to a controller, no live process value
is read as a control input, and no command is issued to industrial equipment.

## 7. Industrial Brain usage

Industrial Brain is a deterministic, evidence-first reasoning aid: you
describe a fault (symptoms, observed state, context) and it returns a
structured, explainable analysis (signal review, likely causes, checklist,
risk, evidence gaps) traced to exactly what you entered. It does not call an
external AI service and does not fabricate a measurement it was not given.
Its output is advisory: you decide what, if anything, to act on in the real
world. Treat any analysis the same way you would treat a first-pass written by
a colleague — useful, but requiring your own engineering judgment before
action.

## 8. Evidence and audit behaviour

Actions that matter operationally (case status changes, published knowledge
content, invitations, sensitive administrative changes) are recorded with the
acting user and a timestamp. Security-relevant events (failed logins, denied
cross-tenant access, session anomalies) are recorded and visible to
organization admins via the Observability surface. This is for your own
traceability as much as for the platform's — if you need to reconstruct what
happened during the pilot, ask an `admin` user to check
`/{locale}/admin/observability` or, for a specific event, request a
correlation-id lookup through the Support Contact process.

## 9. Privacy and compliance notices

Hermes OS records a cookie-consent choice and offers a data-subject privacy
request mechanism. Use these the same way you would on any production system.
Any specific data-handling commitment beyond the product's existing
compliance control plane (retention, subject-request handling) must be agreed
separately in writing before the pilot begins, per the pilot selection
checklist — this guide does not itself create such a commitment.

## 10. Support contact process

Do not use an informal channel for anything you want tracked. Report issues
through the intake process described in `phase99-support-process.md`. That
document defines severity classification, who owns each severity, and what
evidence to include — it does not name a specific person or address here.

## 11. Known limitations (pilot context)

- This is a pilot, not a general-availability commercial deployment; no
  uptime, response-time, or support-level commitment is made (see
  `phase99-sla-draft.md`, which is explicitly non-binding).
- Alert **delivery** (outbound webhook) is a deferred owner configuration item
  as of the current release acceptance record
  (`docs/release/phase93-production-acceptance.md`); detection still works via
  the admin observability surface in the meantime.
- No automated full-page accessibility sweep has been run beyond the verified
  invariants already recorded in the same acceptance record; report any
  accessibility issue you encounter through the support process.

## 12. Reporting a security issue

If you believe you have found a security issue (not a general bug), report it
through the process described in the repository's `SECURITY.md`. Do not post
security-sensitive details in a general support ticket or a public channel.

## 13. Incident contact process

If you believe the pilot environment is down, degraded, or behaving in a way
that looks like a security incident, use the same support intake described in
§10/`phase99-support-process.md` and mark it as urgent/security per that
document's severity classification — this triggers the escalation path to the
Incident Commander and Security Contact roles defined in
`phase99-pilot-plan.md` §5.

## 14. Logout and session security

- Always sign out when you are done, especially on a shared machine.
- Signing out invalidates the session server-side; it cannot be reused by
  reopening the browser or replaying the cookie.
- If you suspect your session or account has been compromised, tell the
  Support Contact immediately (mark it security-relevant) so the session can
  be revoked administratively — do not wait for it to expire on its own.

## 15. Disconnecting the pilot

Either side may end the pilot at any time. To disconnect:

1. Notify the Pilot Coordinator (through the support process).
2. Pilot user access is revoked (sessions invalidated, accounts disabled).
3. If the pilot ran in a dedicated isolated environment, that environment is
   torn down.
4. Any data retention beyond that point follows only the data/privacy
   agreement made before the pilot began — nothing in this guide extends or
   shortens that agreement.
