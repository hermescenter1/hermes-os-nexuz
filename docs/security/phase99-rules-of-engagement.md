# Phase 99 — Rules of Engagement

This document is binding on any authorised external security review of
Hermes OS. It is a companion to `phase99-external-review-scope.md` (what is
in and out of scope) and `phase99-external-review-intake.md` (how an
engagement is set up and how findings come back). If any instruction here
conflicts with a verbal agreement, this document — and the specific written
authorization the owner issues for a given engagement — controls.

No test environment has been provisioned as of the writing of this document.
The authorised target is therefore not yet known and MUST NOT be guessed,
assumed, or inferred from the production domain referenced elsewhere in this
repository (`www.hermesnovin.com`). The current value is:

```
PENTEST_TARGET=OWNER_CONFIGURATION_REQUIRED
```

Testing MUST NOT begin against any host until the owner replaces this value,
in writing, with an explicit, owner-provisioned, non-production target for a
specific engagement (see "Authorised non-production target" below). No agent,
document or automated process in this repository is authorised to supply a
target on the owner's behalf.

## Authorised non-production target

Every engagement targets a dedicated, owner-provisioned, non-production
environment running the exact commit identified in
`phase99-external-review-scope.md`. The production deployment is not an
authorised target under this document. If the owner ever wishes to authorise
testing against production, that requires a separate, explicit, written
authorization naming production specifically, with its own test window and
its own heightened safety constraints; it is not implied by anything here.

## Test window

Every engagement has an explicit start and end date/time, stated in the
owner's written authorization for that engagement. Testing outside the
agreed test window is not authorised, even if the target environment happens
to remain reachable. The owner may pause, extend or terminate the test
window at any time by written notice; testing must stop immediately on
notice of termination.

## Source commit / image identity

The environment under test must correspond to the exact `testedCommitSha`
(and, where applicable, `testedImageDigest`) recorded in the engagement's
attestation. The reviewer is responsible for confirming, at the start of
testing, that the deployed target actually matches the commit the owner
identified — testing an environment that does not match the agreed commit
does not produce evidence about that commit.

## Allowed test accounts

All test accounts and identities created for the engagement — human logins,
API keys, service identities — MUST use the naming convention
`hermes99test_*` (for example, a login local-part or organization name
prefixed `hermes99test_`), so that any of these identities is immediately
recognisable as engagement-only in logs, audit trails and support tooling and
can be located and deleted after the engagement closes. Reviewers must not
create, guess, or attempt to reuse any account that does not follow this
convention, and must not attempt to authenticate as, or gain access to, any
account belonging to a real user or a real customer.

## Synthetic tenant identities

The target environment must be seeded with **at least two** independent
synthetic tenant organizations before testing begins, each with its own
`hermes99test_*`-prefixed accounts and its own synthetic data. Cross-tenant
isolation testing (attempting to read or write tenant A's data from a tenant
B session) is a core objective of this review and requires at least two
tenants to be meaningful; a single-tenant environment cannot exercise the
isolation boundary at all.

## Rate-limit and load boundaries

Interactive, functional security testing (manual exploration, targeted
parameter manipulation, session-handling tests) is permitted at ordinary
human or light-automation request rates. Sustained high-volume automated
scanning, load testing, or any activity intended to approach or exceed the
platform's configured rate limits (see `phase99-test-matrix.md#rate-limiting`)
requires prior written agreement on volume, duration and timing, and must
avoid any activity that degrades the shared test environment for other
users. Distributed or amplification techniques intended to overwhelm the
target are addressed separately under "No denial-of-service" below and are
never permitted regardless of volume agreement.

## Safe upload payload constraints

Testing of the two upload surfaces (`POST /api/documents`,
`POST /api/articles/author-profile/avatar`) must use payloads that are
inert: no payload may contain a payload intended to execute code on
retrieval, no payload may exceed the destination's documented maximum size
by more than what is needed to demonstrate a bound is enforced (i.e., do not
attempt to exhaust disk or memory), and no payload may be crafted to
resemble ransomware, real malware, or content that would itself constitute
unlawful material. Demonstrating a control gap (a MIME check that can be
bypassed, a filename that is not normalised) requires only proof of concept,
not a working exploit chain against the environment's storage backend.

## Data-handling rules

Only synthetic data — generated for the engagement — may be entered into the
target environment. No real personal data, no real payment data, and no real
industrial/operational data belonging to Hermes or any customer may be used
in testing. Any data a reviewer generates or observes during testing is
handled under "Evidence retention" and "Report confidentiality" below and
must not be copied outside the channels described there.

## Reporting channel

All findings, draft reports, proof-of-concept detail and raw evidence are
submitted through a **private** channel: a private GitHub security advisory
opened on this repository, or an owner-designated encrypted-storage location
communicated at engagement kick-off. Findings, exploit detail, or raw report
content must never be posted as a public pull-request comment, a public
issue, or committed to the repository in any form. See
`phase99-finding-handling.md` for exactly what — sanitized counts,
references and SHA-256 hashes only — is permitted to reach the public
repository.

## Critical-finding emergency contact

A finding the reviewer assesses as CRITICAL and immediately exploitable
(confirmed cross-tenant data disclosure, confirmed authentication bypass,
confirmed remote code execution, confirmed secret disclosure) must be
reported without delay through the emergency path the owner specifies at
kick-off, addressed to the **Security Response Owner role** — a role, not a
named individual or a fixed address, because the person holding it may
change between engagements. The owner communicates the current holder of
that role as part of engagement setup; this document intentionally does not
hard-code a person, email address or phone number.

## Prohibited actions

The following are prohibited in every engagement conducted under this
document, without exception, regardless of any verbal permission given
during testing:

- **No destructive database operations.** No `DROP`, `TRUNCATE`, bulk
  `DELETE`, or any operation intended to destroy or irreversibly corrupt data
  in the target environment, even synthetic data, beyond what is strictly
  necessary to demonstrate a specific finding and reversible within the
  engagement.
- **No denial-of-service.** No volumetric flooding, resource-exhaustion
  attack, or amplification technique intended to make the target environment
  or any shared infrastructure it depends on (database, cache, reverse
  proxy, outbound providers) unavailable to other users. Demonstrating that a
  specific endpoint lacks a resource bound (see
  `phase99-test-matrix.md#rate-limiting`) requires only enough requests to
  prove the gap, not a sustained attack.
- **No phishing or social engineering** against Hermes personnel,
  contractors, or any real customer, unless separately authorised in writing
  under a distinct engagement scoped specifically to that activity.
- **No attacks on real third parties or providers.** Stripe, the
  transactional-email provider, DNS, TLS issuance, hosting, or any other
  external service is not a target; see `phase99-external-review-scope.md`.
- **No industrial actuation.** No engagement under this document reaches any
  real PLC, SIS, HMI, OT gateway, or other industrial equipment. Nothing
  tested here may issue a real actuation command, real setpoint change, or
  real control action against physical equipment, whether owned by Hermes or
  by a customer.
- **No safety-system testing.** Safety-instrumented systems and any
  functionality that represents or interfaces with a safety system are
  categorically out of scope for this software-security review and must not
  be probed, simulated against real equipment, or otherwise tested.

## Evidence retention

Reviewers retain raw testing evidence (screenshots, request/response
captures, notes) only for as long as necessary to complete the report and
any agreed retest, and for a maximum retention period the owner specifies at
kick-off (absent a different written agreement, no longer than 90 days after
the final report is accepted). Evidence must be stored encrypted at rest and
deleted — not merely marked deleted — at the end of the retention period,
with confirmation of deletion provided to the owner on request.

## Report confidentiality

The raw report, including any proof-of-concept detail, is confidential
between the reviewer and the owner. It is never published, never posted to
this public repository in any form, and is shared only through the private
reporting channel above. What reaches the public repository is limited to
what `phase99-finding-handling.md` and `phase99-external-review-intake.md`
describe: sanitized severity counts, references, and SHA-256 hashes of the
raw material — never the material itself.

## Retest procedure

For each finding the owner reports as remediated, the reviewer performs a
retest against the fixed commit and records the outcome (fixed / not fixed /
partially fixed) in an update to the same private report. A finding is only
marked `retestCompleted: true` in the sanitized attestation
(`phase99-external-review-intake.md`) once every reported-fixed finding has
actually been retested; the retest report and its SHA-256 hash are recorded
alongside the original report reference. Findings the owner formally risk-
accepts instead of fixing follow the risk-acceptance path in
`phase99-finding-handling.md` and are not subject to retest, except that a
CRITICAL finding can never be closed by risk acceptance under any
circumstance.
