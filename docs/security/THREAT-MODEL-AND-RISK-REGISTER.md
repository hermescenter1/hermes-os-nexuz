# Hermes OS — Threat Model and Risk Register (Phase S1)

**Program:** Hermes Security Dragon
**Phase:** S1 — threat model and risk prioritisation
**Source state:** `bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2` — the S0 source lock, clean worktree
**Inputs:** the eight committed S0 documents, the committed Phase 99 register and route-security
inventory, and the deterministic `getPrisma` call-site inventory. No chat summary was used as a source.
**Method version:** `s1-v1`, declared in §4 and in `scripts/security/s1/risk-register-check.mjs`
**Machine-readable register:** `docs/security/s1-risk-register.json`
**Checker:** `node scripts/security/s1/risk-register-check.mjs check`

---

## 1. Executive verdict

Hermes OS has a **well-built core and an unevenly applied perimeter.** That is the whole finding, and
everything below is the detail.

What S1 established, in one paragraph each.

**No critical risk is open, and that is a measurement rather than reassurance.** Every one of the <!-- S1-FACT:S1_RISKS_TOTAL -->64<!-- /S1-FACT --> risks
was scored by the declared method; **zero** reached the CRITICAL band. Two reached it on raw score and were
clamped to HIGH because the configuration that would make them exploitable was **observed not to hold** in the
running container — the clamp is a declared rule, not a judgement call, and both clamps carry that reason on the
risk. No authentication bypass, no tenant-isolation bypass and no cross-tenant read was demonstrated in any
phase of this programme. Four earlier phases each said the same thing independently, and nothing in S1
contradicts them.

**<!-- S1-FACT:STATE_LATENT_CONFIG_GUARDED:W -->Four<!-- /S1-FACT --> risks are held shut by configuration rather than by code, and each names its guard.** R-01 and R-02
(the legacy signing key and the sid-less revocation bypass), R-16 (the address-pseudonymisation salt) and R-10
(the site-filter construction) are all `LATENT_CONFIG_GUARDED`. For the first three the guard is an
owner-supplied read-only presence check already recorded in the committed S0 documents; for R-10 it is a
neighbouring code path that refuses on the identical condition. **A presence check proves presence and nothing
more.** It says nothing about a key's strength, entropy, independence from the other variable names the boot
check accepts, uniqueness across environments, replica consistency, rotation, age, prior disclosure, or
whether it will still be set after the next deploy — and the register claims none of those. Every risk
carrying such evidence lists, in the register, exactly what it does not prove.

**The platform's security core is genuinely good, and it is bypassed from above.** <!-- S1-FACT:STATE_POSITIVE_CONTROL:W -->Eleven<!-- /S1-FACT --> positive controls
are recorded as register entries with evidence, not as praise: the session store and the tenant contract both
fail closed by construction; no role can assign organization ownership; the compliance scope helper has a
complete refusal ladder; the enterprise-resource surface applies four gates uniformly across twenty-six route
files and refuses rather than degrading; the gateway envelope is canonicalised by construction; there is
exactly one mutation transport; and twelve security-control dependencies were individually traced and
confirmed to deny when the database is unavailable. The recurring shape is that **each of these correct
controls is reached through a path that can skip it** — a sid-less token above the session store, a data layer
with no predicate beneath the tenant contract, a handler without the four-gate chain beside the ERP module.

<!-- S1-BLOCK:truthfulness -->
**The largest cluster of risk is not confidentiality — it is truthfulness.** `REPUDIATION` is the most frequent STRIDE category among the 35 HIGH risks — 16 of them, against 10 for `INFORMATION_DISCLOSURE` — and the 5 HIGH risks scheduled for `S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS` are about the platform reporting something that did not happen.
<!-- /S1-BLOCK:truthfulness -->
Among them: a write that went to process memory reported as a
database write, telemetry answered `201 Created` when the readings were dropped, a payment event
acknowledged so the provider never retries, an outage rendered as "not found", as a duplicate key, or as an
authentication failure, and — the one that matters most operationally — **a gateway revocation that answers
"already revoked" while the credential stays valid.** None of these discloses data. All of them mislead an
operator or an external system at exactly the moment accuracy matters.

**The perimeter is thinner than the application.** The origin is reachable directly from the public internet,
confirmed from an independent external vantage, so the edge is bypassable; there is no transport-security
header at any layer; the application's idea of a client address is an edge node rather than a visitor; and
continuous integration contains no security scanning of any kind — no static analysis, no secret scanning, no
image scanning, no bill of materials, no artifact signing.

**Several of the most important numbers in this programme are instrument readings, not measurements of the
platform.** The route inventory reports complete tenant coverage and cannot see inside a data layer. The
privilege classifier reports zero tenant-administrative and zero owner-only handlers because **no code path
can emit those values**, while 59 privileged operations are in fact correctly enforced. <!-- S1-FACT:STATE_ASSURANCE_GAP:W -->Ten<!-- /S1-FACT --> risks are
`ASSURANCE_GAP` entries: they record what is not known, and three of them are about the instruments this
programme itself relies on.

**One contradiction inside the S0 evidence was found and is disclosed.** Two committed S0 documents record
opposite statuses for the same precondition: the legacy-token document calls it unverified, while the edge <!-- S1-HISTORICAL-SUPERSEDED -->
document records the owner-supplied presence check and the verdict that the flaw is not active in the observed
container. The second is the later and correct record. This register was built from the stale sentence and
reported a settled condition as unknown until the reconciliation; it is now aligned to the evidence, the
contradiction is registered as a finding under R-29, and the checker carries a gate that makes the same class
of drift fail rather than propagate. **Neither source document could be corrected here** — the order
authorising S1 limits the deliverables to four paths and neither is among them.

**What S1 did not do.** No scanner was run, no request was sent to any environment, no fault was injected, no
database was stopped, no exploit was written and no production state was changed. **No production or network
command was run during the reconciliation either** — it used only evidence already committed to the repository.
Every risk in this register is derived from reading committed source and committed evidence. <!-- S1-FACT:STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN:W -->Twelve<!-- /S1-FACT --> risks
carry the state `CODE_CONFIRMED_RUNTIME_UNPROVEN` precisely because their behaviour is what the code says it
will do, traced to the statement that does it, and has not been watched happening.

<!-- S1-BLOCK:headline -->
```
S1_VERDICT:                 see §16
GATE_A:                     PASSED_WITH_FINDINGS (S0, closed before this phase)
CRITICAL_RISKS_OPEN:        0
HIGH_RISKS_OPEN:            35
PROVEN_AUTHENTICATION_BYPASS:   NONE DEMONSTRATED
PROVEN_TENANT_ISOLATION_BYPASS: NONE DEMONSTRATED
PROVEN_CLOUD_TO_CONTROLLER_PATH: NONE — the capability does not exist (R-50)
```
<!-- /S1-BLOCK:headline -->

**Line endings are repository-enforced.** All four S1 artifacts carry a `.gitattributes` rule pinning them
to `eol=lf`, so a Windows checkout cannot silently rewrite the bytes that the register's hash and the
report's generated blocks are verified against. That gap was open while the artifacts were first
written and is closed now.

### 1.1 The machine-checked summary

Every value below is recomputed from the register by `check`, which fails on any difference. This block is
the drift gate between this document and the JSON.

<!-- S1-SUMMARY-BLOCK -->
<!-- S1-BLOCK:summary -->
```
S1_METHOD_VERSION = s1-v1
S1_RISKS_TOTAL = 64
S1_FINDINGS_TOTAL = 161
SEVERITY_CRITICAL = 0
SEVERITY_HIGH = 35
SEVERITY_MEDIUM = 17
SEVERITY_LOW = 1
SEVERITY_INFORMATIONAL = 11
STATE_ACTIVE_CONFIRMED = 24
STATE_LATENT_CONFIG_GUARDED = 4
STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN = 12
STATE_ASSURANCE_GAP = 10
STATE_POLICY_AMBIGUITY = 3
STATE_POSITIVE_CONTROL = 11
FINDING_COVERAGE_PERCENT = 100
ORPHAN_FINDINGS = 0
DUPLICATE_REMEDIATION_OWNERSHIP = 0
SCORE_MISMATCHES = 0
SEVERITY_MISMATCHES = 0
UNKNOWN_ENUM_VALUES = 0
SEVERITY_CLAMPS_APPLIED = 2
RUNTIME_EVIDENCE_RISKS = 3
RUNTIME_EVIDENCE_CONFLICTS = 0
GUARD_EVIDENCE_VIOLATIONS = 0
SOURCE_UNIVERSE_VIOLATIONS = 0
LOCK_UNIVERSE_COUNT = 51
VERIFICATION_LINKAGE_VIOLATIONS = 0
DOMINANT_IMPACT_VIOLATIONS = 0
```
<!-- /S1-BLOCK:summary -->

---

## 2. Threat model

### 2.1 Actors

Each actor is a closed enum value in the register, so a risk cannot name an actor that is not modelled here.

| Actor | What they hold | What they are assumed able to do |
|---|---|---|
| `ANONYMOUS_PUBLIC` | nothing | reach the 50 public handlers, the static upload path, the health surface and — per R-24 — the origin directly |
| `AUTHENTICATED_USER` | a valid credential | reach roughly 130 handlers gated by the authentication helper alone |
| `MALICIOUS_TENANT_MEMBER` | membership of one organization | reach every tenant surface of that organization and attempt to reach another's |
| `TENANT_ADMIN_OR_TAKEOVER` | an administrative role, or a compromised one | exercise the 50 tenant-administrative operations and 13 owner-only ones |
| `DIRECT_ORIGIN_ATTACKER` | a network position | bypass the edge entirely (R-24), and reach the proxy and the health surface |
| `CREDENTIAL_STUFFING_ATTACKER` | credentials obtained elsewhere | log in, with no second factor to stop them (R-04) |
| `INSIDER_OR_ERRING_OPERATOR` | host or database access | change configuration, restart a service, write to the audit table |
| `SUPPLY_CHAIN_ATTACKER` | a dependency, an image or a workflow | introduce code that nothing in the pipeline scans (R-43) |
| `INFRASTRUCTURE_FAILURE` | nothing — it is not an adversary | trigger every degraded path in the register's largest cluster |
| `STALE_TOKEN_HOLDER` | an old cookie or token | survive a logout, a suspension or a password reset within the 30-day ceiling (R-02) |

`INFRASTRUCTURE_FAILURE` is modelled as an actor deliberately. It is the single most frequent precondition in
this register, and treating it as an adversary is what made the truthfulness cluster visible.

### 2.2 Assets, and the boundary that last protects each

| Asset | Last protecting boundary | The risk that weakens it |
|---|---|---|
| `IDENTITY_AND_SESSION` | the session store, fail-closed by construction | R-01, R-02, R-03, R-04 |
| `TENANT_ISOLATION` | caller-side predicates and the tenant contract | R-08, R-09, R-11 |
| `SITE_ISOLATION` | nine route files with a site guard | R-10, R-42 |
| `AUTHORIZATION_BOUNDARY` | 572 independent per-handler decisions | R-63, R-13 |
| `FACTORY_AND_ERP_DATA` | the four-gate ERP chain, where it is applied | R-08, R-35, R-36 |
| `DIGITAL_TWIN_AND_KNOWLEDGE_GRAPH` | per-handler authorization | R-32, R-35 |
| `DOCUMENTS_AND_UPLOADS` | the document access check; **nothing** for the public upload path | R-22, R-63 |
| `PUBLIC_CONTENT` | published-only predicates in the data layer | R-17, R-18 |
| `AUDIT_EVIDENCE` | database access control only | R-37, R-38, R-40 |
| `SECRETS_AND_SIGNING_KEYS` | environment isolation | R-01, R-16, R-49 |
| `POSTGRES` | one credential holding both runtime and migration rights | R-09, R-47 |
| `REDIS` | a password and an unpublished port | R-12, R-48 |
| `IN_MEMORY_FALLBACK_STORE` | the same owner predicate as the database path | R-32 |
| `EDGE_AND_ORIGIN` | **nothing at the host level** — confirmed | R-24, R-25 |
| `CLIENT_IP_TRUTH` | the proxy overwrites every client-settable header | R-26 |
| `RATE_LIMITING` | a fail-closed registry of 34 actions | R-21, R-26 |
| `CI_CD_AND_ARTIFACTS` | pinned actions, manual deploy, protected environment | R-43, R-46 |
| `DEPENDENCY_TREE` | one audit gate with a governance file | R-44, R-43 |
| `BACKUP_AND_DR` | encrypted envelopes and a rehearsal job | R-51, R-52 |
| `WORKER_BOUNDARY` | one dependency-free script per image, no credential | R-53 (positive) |
| `OT_GATEWAY_BOUNDARY` | per-gateway signed envelopes | R-49, R-34, R-33 |
| `PII_AND_CANDIDATE_DATA` | hardcoded privileged columns and schema validation where present | R-16, R-20, R-07 |
| `BILLING_AND_METERING` | entitlement reads that deny on failure | R-33, R-37 |
| `SECURITY_ASSURANCE_INSTRUMENTS` | this programme's own gates | R-13, R-29, R-45 |

### 2.3 The OT boundary, stated precisely

**There is no cloud-to-controller code path in `bcf3be9a`, because the capability does not exist.** No library
in the dependency tree can speak any industrial protocol; the protocol names appear in the application only
as domain vocabulary. Industrial data enters in one direction only, through gateway-initiated signed
envelopes. This is recorded as a positive control (R-50) with a gate, not as a permanent property: it stops
being true the moment a protocol client enters the dependency manifest. Gateway properties asserted by design
documents outside this repository — outbound-only initiation, offline buffering bounds, signed and
rollback-safe updates, per-site certificate separation — are **not** scored as present anywhere in this
register.

---

## 3. Attack-surface map

```
  ANONYMOUS_PUBLIC ─────────────┐
                                │                        R-24: this hop is skippable
  ┌─────────────────────────────▼──────────────┐         R-25: no transport-security header
  │ Cloudflare edge   (observed, not modelled) │         R-26: the real caller stops here
  └─────────────────────────────┬──────────────┘
                                │
  DIRECT_ORIGIN_ATTACKER ───────┤ ◄── R-24 CONFIRMED reachable from an independent vantage
                                │
  ┌─────────────────────────────▼──────────────┐         R-28: version disclosure
  │ nginx  0.0.0.0:80/443, no request limits   │         R-31: health path, logging off
  │        no trusted-proxy directive          │         R-48: plain hop onward
  └─────────────────────────────┬──────────────┘
                                │
  ┌─────────────────────────────▼──────────────────────────────────────────────┐
  │ hermes-web                                                                 │
  │                                                                            │
  │   PAGE requests ──► middleware: JWT role, path authz, policy nonce         │
  │                                                                            │
  │   /api/* and ANY dotted path ──► NO MIDDLEWARE          ◄── R-63           │
  │        572 handlers = 572 independent enforcement decisions                 │
  │        36 public read · 14 public write · 2 webhook · 2 health              │
  │        188 authenticated · 195 tenant · 135 platform · 0 unknown           │
  │        reported tenant-admin 0 and owner-only 0 ◄── R-13, not a measurement│
  │                                                                            │
  │   static /uploads/<hex>.png ──► no authz, no policy header  ◄── R-22       │
  └───┬───────────────┬──────────────────┬─────────────────────┬───────────────┘
      │               │                  │                     │
  ┌───▼────────┐ ┌────▼───────┐ ┌────────▼────────┐ ┌──────────▼──────────────┐
  │ PostgreSQL │ │ Redis      │ │ local volumes   │ │ third parties           │
  │ R-09 no RLS│ │ R-12 no    │ │ R-22 uploads is │ │ R-64 webhook signature  │
  │ R-47 one   │ │  namespace │ │  inside public/ │ │  check unread           │
  │  identity  │ │ R-48 no TLS│ │                 │ │ R-33 acked, not stored  │
  └───┬────────┘ └────────────┘ └─────────────────┘ └─────────────────────────┘
      │ ▲
      │ │  R-32: on ANY Prisma exception, six repositories answer from process memory
      │ │        and report success — including the store they claim to have used
  ┌───▼─┴──────────────────────────────────────────┐
  │ globalThis session store (R-32, R-35, R-36)    │
  └────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │ Gateway envelope ingress — HMAC + nonce +      │  R-62 canonicalisation (positive)
  │ timestamp + idempotency key, NO mTLS           │  R-49 no certificate lifecycle
  └────────────────────▲───────────────────────────┘  R-33 201 for dropped telemetry
                       │ gateway-initiated            R-34 revocation can report a lie
  ┌────────────────────┴───────────────────────────┐
  │ Industrial DMZ / gateway  (OUT OF REPOSITORY)  │
  └────────────────────┬───────────────────────────┘
  ┌────────────────────▼───────────────────────────┐
  │ Historian / controllers — NO CODE PATH (R-50)  │
  └────────────────────────────────────────────────┘
```

---

## 4. Scoring method — declared before any risk was scored

The method was fixed before the first factor was assigned, is implemented once in
`scripts/security/s1/risk-register-check.mjs`, and is re-derived from the factors on every `check`. A stored
severity that differs from the computed one is a gate failure, so the numbers in this document cannot drift
from the register.

```
likelihood = round( mean(reachability, exploitability, privilegeAccessibility, repeatability) )
impact     = max( confidentiality, integrity, availability, auditability, industrialSafety )
score      = likelihood × impact

20–25 CRITICAL   12–19 HIGH   6–11 MEDIUM   1–5 LOW   0 INFORMATIONAL
```

**Factor orientation.** Every factor is an integer 0–5 and **higher always means more risk**, including the
privilege factor: `privilegeAccessibility` scores **5 when no privilege is needed** and 0 when platform
ownership plus host access is needed. It was originally called `requiredPrivileges`, which read backwards —
under that name a high number suggested *more* privilege required, and therefore *less* risk. The first
independent review flagged the hazard and the factor was renamed before anything was committed: every value
is unchanged, and no score, severity or ordering moved with the rename. The scale used throughout: **5**
anonymous · **4** a public capability or an external system's credential · **3** any authenticated user ·
**2** a specific credential or tenant role · **1** tenant administrator or operator · **0** host or platform
ownership. The direction is not left to the reader's trust: a selftest asserts that anonymous-reachable risks
cluster at the accessible end and that operator-only risks sit at the other.

**Rounding.** `round` is round-half-up. A mean of four integers can only be `x.0`, `x.25`, `x.5` or `x.75`, so
the result is fully determined; it is stated because "round" alone is ambiguous.

**The CRITICAL clamp, also declared in advance.** A risk whose `productionState` is not `ACTIVE_CONFIRMED`
**cannot** be CRITICAL: its severity is clamped to HIGH, and the clamp with its rule and reason is recorded on
the risk. This is a mechanical rule applied uniformly to all <!-- S1-FACT:S1_RISKS_TOTAL -->64<!-- /S1-FACT --> risks, **not** a manual override — there is no
manual override mechanism in this register, and `CRITICAL_WITHOUT_ACTIVE_CONFIRMED` is a gate counter that
must be zero. <!-- S1-FACT:SEVERITY_CLAMPS_APPLIED:W -->Two<!-- /S1-FACT --> clamps were applied, both to identity risks whose enabling condition was **checked and
observed not to hold in the running container** — so the design flaw is latent, not active. The
presence of a value proves presence and nothing else: it says nothing about that value's strength,
rotation, independence from the other names the boot check accepts, or parity across replicas, and the
register states those limits on every risk that carries such evidence.

**A property of the method, stated rather than hidden.** Because likelihood is a *mean*, a very high
exploitability partly offsets a very low reachability. R-01, R-02 and R-16 are the clearest cases: all three
are observed inactive in the running container, and all three still score HIGH because exploitation would be
trivial were the guard removed. The clamp and the `productionState` field are what keep that from reaching the
top band. **No severity in this register should be read without its `productionState`,** which is why every
table below carries both. It also follows that a `reachability` of 1 on these entries does not mean "almost
reachable" — it means "reachable only after a configuration or deployment change".

**Two evidence blocks, and what they are allowed to say.** A risk whose state is `LATENT_CONFIG_GUARDED` must
carry `guardEvidence`: a named, cited guard rather than the bare assertion that something is latent. A risk
settled by an owner-supplied read-only production observation additionally carries `runtimeEvidence` with the
statement, the variables, the citation, `activeInCurrentContainer`, what it **proves** and an explicit list of
what it **does not prove**. Three checker gates enforce the discipline: a risk carrying runtime evidence may
not also describe that condition as unknown or ask for the check to be repeated; a configuration-guarded state
without named guard evidence fails; and the next-action block may not request evidence the register already
holds. All three are proven by negative selftests.

**The clamp's reason is derived, not written.** A configuration-guarded risk clamps with the reason
`observed inactive configuration in current container`, because it was *measured* inactive. Any other
non-active state clamps with a reason naming that state, because the path was simply never observed. Those are
different claims and the tool refuses to let the register blur them.

**Production state vocabulary.**

| State | Meaning | Count |
|---|---|---|
| `ACTIVE_CONFIRMED` | the condition holds now and was confirmed | <!-- S1-FACT:STATE_ACTIVE_CONFIRMED -->24<!-- /S1-FACT --> |
| `LATENT_CONFIG_GUARDED` | the defect is in the code and a named guard — a configuration value observed in the running container, or a second code path — currently holds it shut | <!-- S1-FACT:STATE_LATENT_CONFIG_GUARDED -->4<!-- /S1-FACT --> |
| `CODE_CONFIRMED_RUNTIME_UNPROVEN` | the behaviour is established by reading the code and tracing it to the statement that does it; it has not been observed | <!-- S1-FACT:STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN -->12<!-- /S1-FACT --> |
| `ASSURANCE_GAP` | something is not known, and the entry records the ignorance rather than a defect | <!-- S1-FACT:STATE_ASSURANCE_GAP -->10<!-- /S1-FACT --> |
| `POLICY_AMBIGUITY` | the answer is a decision the owner must make, not a measurement | <!-- S1-FACT:STATE_POLICY_AMBIGUITY -->3<!-- /S1-FACT --> |
| `POSITIVE_CONTROL` | a control that is present; all factors are pinned to 0 by the gate, so the score is 0 | <!-- S1-FACT:STATE_POSITIVE_CONTROL -->11<!-- /S1-FACT --> |

**Finding disposition vocabulary.** Every one of the <!-- S1-FACT:S1_FINDINGS_TOTAL -->161<!-- /S1-FACT --> findings carries exactly one status, and no finding
has more than one owning risk — both are gate counters.

| Status | Meaning | Count |
|---|---|---|
| `MAPPED_TO_RISK` | owned by exactly one risk | <!-- S1-FACT:FINDING_STATUS_MAPPED_TO_RISK -->83<!-- /S1-FACT --> |
| `DUPLICATE_OF` | the same defect recorded twice across S0 documents; ownership stays with the primary | <!-- S1-FACT:FINDING_STATUS_DUPLICATE_OF -->2<!-- /S1-FACT --> |
| `POLICY_QUESTION` | needs a decision; owned by a policy risk | <!-- S1-FACT:FINDING_STATUS_POLICY_QUESTION -->7<!-- /S1-FACT --> |
| `ASSURANCE_GAP` | records what is not known; owned by an assurance risk | <!-- S1-FACT:FINDING_STATUS_ASSURANCE_GAP -->49<!-- /S1-FACT --> |
| `POSITIVE_CONTROL` | a control that is present; owned by a positive-control entry | <!-- S1-FACT:FINDING_STATUS_POSITIVE_CONTROL -->12<!-- /S1-FACT --> |
| `NOT_A_SECURITY_RISK_WITH_REASON` | withdrawn, retired, closed by time, or a defect in an audit instrument rather than in the product — each with its reason | <!-- S1-FACT:FINDING_STATUS_NOT_A_SECURITY_RISK -->8<!-- /S1-FACT --> |

**The distinctions this register keeps separate**, because collapsing them is how a risk report becomes
useless: a real vulnerability; a latent design flaw; an active production exposure; an assurance or
classifier gap; a policy ambiguity; and a positive control. A finding from a classifier that could not see a
correct control is **never** reported as a product vulnerability — the twelve reclassified security-control
dependencies in R-60 are the worked example.

---

## 5. The complete risk register

All <!-- S1-FACT:S1_RISKS_TOTAL -->64<!-- /S1-FACT --> entries, sorted by identifier. `L×I` is likelihood × impact as computed by the
declared method; a clamped severity is marked. The machine-readable source of every value in this table is
`docs/security/s1-risk-register.json`, and `check` fails if they disagree.

| Risk | Title | Production state | L×I | Severity | Conf. | Prio | Findings owned |
|---|---|---|---|---|---|---|---|
| `R-01` | The legacy session HMAC key has no production guard, so a forged cookie can select any role | LATENT_CONFIG_GUARDED | 4×5=**20** | **HIGH** ←clamped | HIGH | 1 | `L-5` |
| `R-02` | A session token without a sid bypasses the canonical revocation check, with no mode guard on the read side | LATENT_CONFIG_GUARDED | 4×5=**20** | **HIGH** ←clamped | HIGH | 2 | `L-1` `L-4` |
| `R-03` | A storage-mode change is a deferred authentication downgrade that the next restart activates | CODE_CONFIRMED_RUNTIME_UNPROVEN | 2×5=**10** | **MEDIUM** | HIGH | 37 | `L-2` |
| `R-04` | No account-level multi-factor authentication exists, so a valid credential is sufficient everywhere | ACTIVE_CONFIRMED | 3×5=**15** | **HIGH** | HIGH | 3 | `LOCK-MFA-ABSENT` |
| `R-05` | A standing environment-driven privileged account exists whenever two variables are present | CODE_CONFIRMED_RUNTIME_UNPROVEN | 3×5=**15** | **HIGH** | MEDIUM | 19 | `LOCK-ADMIN-SEED` |
| `R-06` | Two password-hashing libraries are present and the authoritative verifier is unestablished | ASSURANCE_GAP | 2×3=**6** | **MEDIUM** | MEDIUM | 38 | `LOCK-PASSWORD-HASH-DUAL` |
| `R-07` | Public candidate registration is an account-existence oracle | ACTIVE_CONFIRMED | 4×2=**8** | **MEDIUM** | HIGH | 42 | `H-5` |
| `R-08` | Six module data layers query the database with no organization predicate | CODE_CONFIRMED_RUNTIME_UNPROVEN | 3×5=**15** | **HIGH** | MEDIUM | 4 | `LOCK-NO-ORG-PREDICATE` |
| `R-09` | There is no database-level tenant backstop: filtering is entirely caller-side | ACTIVE_CONFIRMED | 3×5=**15** | **HIGH** | HIGH | 20 | `LOCK-NO-RLS` |
| `R-10` | Site-level authorization is structurally thin, and one site-filter bypass is latent | LATENT_CONFIG_GUARDED | 3×4=**12** | **HIGH** | HIGH | 21 | `DB-09` `LOCK-SITE-GUARD-THIN` |
| `R-11` | Ambiguous organization membership is resolved by silently picking the oldest | CODE_CONFIRMED_RUNTIME_UNPROVEN | 3×3=**9** | **MEDIUM** | HIGH | 43 | `LOCK-ORG-FIRST-PICK` |
| `R-12` | Redis keys carry no namespace, and tenant scoping of cache keys is unverified | ASSURANCE_GAP | 3×3=**9** | **MEDIUM** | MEDIUM | 44 | `LOCK-REDIS-NO-PREFIX` |
| `R-13` | The privilege-reporting instrument cannot represent the privilege model it reports on | ASSURANCE_GAP | 3×5=**15** | **HIGH** | HIGH | 5 | `PRIV-01` `PRIV-02` `PRIV-03` `PRIV-04` `PRIV-05` `PRIV-06` |
| `R-14` | Per-tier negative authorization tests were not assessable, so refusal is argued rather than executed | ASSURANCE_GAP | 3×4=**12** | **HIGH** | HIGH | 22 | `PRIV-07` |
| `R-15` | Four organization-governance questions are undecided, including whether an organization can lose its only owner | POLICY_AMBIGUITY | 2×4=**8** | **MEDIUM** | HIGH | 45 | `A-1` `A-2` `A-3` `A-4` |
| `R-16` | The IP pseudonymisation salt can be silently absent, turning a privacy control into a reversible hash | LATENT_CONFIG_GUARDED | 4×4=**16** | **HIGH** | HIGH | 6 | `H-1` `IP-05` `IP-07` |
| `R-17` | Six unauthenticated endpoints publish an internal commercial dashboard built from fabricated records | ACTIVE_CONFIRMED | 5×2=**10** | **MEDIUM** | HIGH | 46 | `LOCK-CUSTOMERS-PUBLIC` |
| `R-18` | Public certificate verification returns a named individual with no rate limit and unprovable token entropy | POLICY_AMBIGUITY | 4×3=**12** | **HIGH** | MEDIUM | 23 | `LOCK-ACADEMY-CERT` |
| `R-19` | Public writers have no idempotency, and one enforces its rate limit per process rather than per cluster | ACTIVE_CONFIRMED | 5×3=**15** | **HIGH** | HIGH | 32 | `H-2` `H-3` |
| `R-20` | The only public handler that creates a user validates nothing and writes outside a transaction | ACTIVE_CONFIRMED | 5×3=**15** | **HIGH** | HIGH | 24 | `H-4` `H-6` |
| `R-21` | Unrelated public features share one rate-limit bucket, so each can exhaust the other's allowance | ACTIVE_CONFIRMED | 5×3=**15** | **HIGH** | HIGH | 33 | `H-7` |
| `R-22` | The avatar upload accepts unsniffed bytes, bounds after buffering, and publishes to an unauthenticated static surface | ACTIVE_CONFIRMED | 4×3=**12** | **HIGH** | HIGH | 25 | `LOCK-UPLOADS-IN-PUBLIC` `U-1` `U-2` |
| `R-23` | Two public-content behaviours need a policy decision rather than a fix | POLICY_AMBIGUITY | 3×2=**6** | **MEDIUM** | HIGH | 47 | `EDGE-08` `U-3` |
| `R-24` | The origin is directly reachable from the internet, so the edge can be bypassed | ACTIVE_CONFIRMED | 4×4=**16** | **HIGH** | HIGH | 7 | `EDGE-01` `EDGE-09` |
| `R-25` | Strict transport security is set nowhere, at any layer | ACTIVE_CONFIRMED | 4×3=**12** | **HIGH** | HIGH | 26 | `LOCK-HSTS-ABSENT` |
| `R-26` | The application's idea of the client address is an edge point of presence, and two extractors disagree | ACTIVE_CONFIRMED | 4×4=**16** | **HIGH** | HIGH | 8 | `EDGE-03` `IP-01` `IP-02` `IP-03` `IP-04` |
| `R-27` | Production comments assert a safety property the code does not have, and one already corrupted a security document | ACTIVE_CONFIRMED | 3×4=**12** | **HIGH** | HIGH | 34 | `EDGE-04` |
| `R-28` | The platform discloses its framework and does not suppress server version tokens | ACTIVE_CONFIRMED | 4×1=**4** | **LOW** | HIGH | 53 | `EDGE-07` `LOCK-SERVER-TOKENS` |
| `R-29` | Security-relevant configuration and documentation have drifted from the code they describe | ASSURANCE_GAP | 3×4=**12** | **HIGH** | HIGH | 35 | `EDGE-05` `LOCK-GETPRISMA-TESTCOUNT` `LOCK-L5-EVIDENCE-CONTRADICTION` `LOCK-P99-SURFACE-STALE` `LOCK-REQUIREACTOR-PHANTOM` |
| `R-30` | The network path to the origin address was unstable between two observations and the mechanism is unknown | ASSURANCE_GAP | 2×4=**8** | **MEDIUM** | MEDIUM | 48 | `EDGE-10` |
| `R-31` | The health surface is unauthenticated and its access logging is disabled at the proxy | ACTIVE_CONFIRMED | 4×2=**8** | **MEDIUM** | HIGH | 52 | `LOCK-HEALTH-ACCESS-LOG-OFF` |
| `R-32` | A silent fallback accepts writes into process memory and reports success, including the store it claims to have used | CODE_CONFIRMED_RUNTIME_UNPROVEN | 3×5=**15** | **HIGH** | HIGH | 9 | `DB-04` `DB-15` `DB-19` `DB-25` `DB-F1` |
| `R-33` | An outage is acknowledged to an external party that will therefore never retry | CODE_CONFIRMED_RUNTIME_UNPROVEN | 3×5=**15** | **HIGH** | HIGH | 10 | `DB-08` `DB-12` |
| `R-34` | Gateway revocation and heartbeat report security outcomes that did not happen | CODE_CONFIRMED_RUNTIME_UNPROVEN | 3×5=**15** | **HIGH** | HIGH | 11 | `DB-21` `DB-22` |
| `R-35` | Industrial and twin reads present an outage as an empty success, so an operator reads zero rather than unknown | CODE_CONFIRMED_RUNTIME_UNPROVEN | 3×4=**12** | **HIGH** | HIGH | 12 | `DB-01` `DB-16` `DB-F2` |
| `R-36` | An outage is rendered as a wrong domain answer: not found, duplicate, conflict, or an authentication failure | CODE_CONFIRMED_RUNTIME_UNPROVEN | 3×4=**12** | **HIGH** | HIGH | 13 | `DB-07` `DB-10` `DB-11` `DB-18` `DB-20` `DB-23` |
| `R-37` | Metering and audit evidence is lost on every degraded path, and the audit writer shares the failure | CODE_CONFIRMED_RUNTIME_UNPROVEN | 3×5=**15** | **HIGH** | HIGH | 14 | `DB-17` |
| `R-38` | The audit trail has no tamper evidence and its tenancy columns are nullable | ACTIVE_CONFIRMED | 3×5=**15** | **HIGH** | HIGH | 15 | `LOCK-AUDIT-NO-CHAIN` |
| `R-39` | Brute-force detection is silently disabled while the database is unavailable | CODE_CONFIRMED_RUNTIME_UNPROVEN | 3×4=**12** | **HIGH** | HIGH | 27 | `DB-06` |
| `R-40` | Degraded paths are invisible: almost every exception path and half the call sites are silent | ACTIVE_CONFIRMED | 3×5=**15** | **HIGH** | HIGH | 16 | `DB-05` `DB-26` |
| `R-41` | A partial failure between two writes can leave a suspended member's sessions live | CODE_CONFIRMED_RUNTIME_UNPROVEN | 2×3=**6** | **MEDIUM** | HIGH | 49 | `DB-13` |
| `R-42` | Dead product surface refuses correctly where nothing can observe it, including all site-membership management | ASSURANCE_GAP | 2×3=**6** | **MEDIUM** | HIGH | 50 | `DB-14` `DB-24` `IP-06` |
| `R-43` | Continuous integration carries no security scanning of any kind | ACTIVE_CONFIRMED | 4×4=**16** | **HIGH** | HIGH | 17 | `LOCK-CI-TOOLING-ABSENT` |
| `R-44` | Five dependency advisories are open in the production tree | ACTIVE_CONFIRMED | 3×3=**9** | **MEDIUM** | MEDIUM | 39 | `P99-DEP-008` `P99-DEP-009` `P99-DEP-010` `P99-DEP-011` `P99-DEP-012` |
| `R-45` | Twenty-nine Phase 99 remediations are inherited as fixed rather than re-verified in this programme | ASSURANCE_GAP | 3×4=**12** | **HIGH** | MEDIUM | 28 | `P99-DEP-001` `P99-DEP-002` `P99-DEP-003` `P99-DEP-004` `P99-DEP-005` `P99-DEP-006` `P99-DEP-007` `P99-DEP-013` `P99-DEP-014` `P99-INT-001` `P99-INT-002` `P99-INT-003` `P99-INT-004` `P99-INT-005` `P99-INT-006` `P99-INT-007` `P99-INT-008` `P99-INT-009` `P99-INT-010` `P99-INT-011` `P99-INT-012` `P99-INT-013` `P99-INT-014` `P99-INT-015` `P99-INT-016` `P99-INT-017` `P99-INT-018` `P99-INT-019` `P99-INT-020` |
| `R-46` | Containers run without runtime hardening, images are unpinned, and the development compose publishes data ports | ACTIVE_CONFIRMED | 3×4=**12** | **HIGH** | HIGH | 18 | `LOCK-CONTAINER-HARDENING` `LOCK-DEV-COMPOSE-PORTS` `LOCK-IMAGE-TAGS` `LOCK-REDIS-DEFAULT-PASSWORD` |
| `R-47` | The database connection is unencrypted by configuration and one identity holds both migration and runtime rights | ACTIVE_CONFIRMED | 2×5=**10** | **MEDIUM** | HIGH | 36 | `LOCK-DB-ROLE-SEPARATION` `LOCK-DB-SSLMODE` |
| `R-48` | Traffic inside the cluster is unencrypted between the proxy, the application and the cache | ACTIVE_CONFIRMED | 2×3=**6** | **MEDIUM** | HIGH | 51 | `LOCK-PROXY-APP-PLAINTEXT` `LOCK-REDIS-NO-TLS` |
| `R-49` | The gateway boundary is per-gateway shared-secret authentication, not the mutual certificate design the target architecture requires | ACTIVE_CONFIRMED | 2×4=**8** | **MEDIUM** | HIGH | 40 | `LOCK-OT-KEY-SEPARATION` `LOCK-OT-NO-MTLS` |
| `R-50` | No code path from the platform reaches a programmable controller, because the capability is absent | POSITIVE_CONTROL | 0×0=**0** | **INFORMATIONAL** | HIGH | 54 | `LOCK-NO-PLC-PATH` |
| `R-51` | Backup, restore and recovery machinery exists and none of it was executed | ASSURANCE_GAP | 2×5=**10** | **MEDIUM** | MEDIUM | 41 | `LOCK-DR-NOT-EXECUTED` |
| `R-52` | No incident runbook exists | ACTIVE_CONFIRMED | 3×4=**12** | **HIGH** | HIGH | 29 | `LOCK-RUNBOOKS-ABSENT` |
| `R-53` | The worker boundary is deliberately minimal and holds no database credential | POSITIVE_CONTROL | 0×0=**0** | **INFORMATIONAL** | HIGH | 55 | `LOCK-WORKER-BLAST-RADIUS` |
| `R-54` | The rate limiter fails closed on an undeclared bucket and audits the refusal | POSITIVE_CONTROL | 0×0=**0** | **INFORMATIONAL** | HIGH | 56 | `RL-02` |
| `R-55` | No role can assign organization ownership, and every client-supplied role is clamped | POSITIVE_CONTROL | 0×0=**0** | **INFORMATIONAL** | HIGH | 57 | `LOCK-ASSIGNABLE-ROLES-CLAMP` |
| `R-56` | The compliance organization-scope helper has a complete fail-closed ladder | POSITIVE_CONTROL | 0×0=**0** | **INFORMATIONAL** | HIGH | 58 | `LOCK-COMPLIANCE-SCOPE-FAILCLOSED` |
| `R-57` | The enterprise-resource surface is the reference implementation of the target failure policy | POSITIVE_CONTROL | 0×0=**0** | **INFORMATIONAL** | HIGH | 59 | `LOCK-ERP-REFERENCE` |
| `R-58` | There is exactly one mutation transport, because the framework's alternative is unused | POSITIVE_CONTROL | 0×0=**0** | **INFORMATIONAL** | HIGH | 60 | `LOCK-ZERO-SERVER-ACTIONS` |
| `R-59` | The session store and the tenant contract both fail closed by construction | POSITIVE_CONTROL | 0×0=**0** | **INFORMATIONAL** | HIGH | 61 | `LOCK-SESSION-STORE-FAILCLOSED` `LOCK-TENANT-CONTRACT` |
| `R-60` | Twelve security-control dependencies were traced and confirmed to deny rather than to succeed emptily | POSITIVE_CONTROL | 0×0=**0** | **INFORMATIONAL** | HIGH | 62 | `LOCK-TWELVE-RECLASSIFIED` |
| `R-61` | No public handler accepts a tenant, user or role identifier, and every privileged column a public writer sets is hardcoded | POSITIVE_CONTROL | 0×0=**0** | **INFORMATIONAL** | HIGH | 63 | `LOCK-PUBLIC-NO-CLIENT-IDENTITY` |
| `R-62` | The gateway envelope is canonicalised and replay-bounded by construction | POSITIVE_CONTROL | 0×0=**0** | **INFORMATIONAL** | HIGH | 64 | `LOCK-OT-ENVELOPE-CANON` |
| `R-63` | There is no central authorization choke point for the application interface | ACTIVE_CONFIRMED | 3×4=**12** | **HIGH** | HIGH | 30 | `LOCK-API-NO-MIDDLEWARE` `LOCK-CSP-NOT-ON-API` |
| `R-64` | Five security-relevant surfaces were declared out of scope in the source phase and remain unexamined | ASSURANCE_GAP | 3×4=**12** | **HIGH** | LOW | 31 | `LOCK-DOC-TOKEN-TTL-UNVERIFIED` `LOCK-PLATFORM-ADMIN-NOT-AUDITED` `LOCK-REAUTH-NOT-ASSESSED` `LOCK-SSO-NOT-INSPECTED` `LOCK-STRIPE-WEBHOOK-UNCONFIRMED` |

---

## 6. Top risks by score

No entry reached the CRITICAL band. The <!-- S1-FACT:SEVERITY_CLAMPS_APPLIED:w -->two<!-- /S1-FACT --> highest scores are identity risks whose severity was clamped
because the condition that would make them exploitable was checked and **observed not to hold in the
running container**; the next band down is dominated by the truthfulness cluster and the perimeter.
Neither clamp rests on an open question, and neither treats the presence of a value as evidence of its
quality.

| Score | Risk | Severity | Production state | Title |
|---|---|---|---|---|
| 20 | `R-01` | **HIGH** | LATENT_CONFIG_GUARDED | The legacy session HMAC key has no production guard, so a forged cookie can select any role |
| 20 | `R-02` | **HIGH** | LATENT_CONFIG_GUARDED | A session token without a sid bypasses the canonical revocation check, with no mode guard on the read side |
| 16 | `R-16` | **HIGH** | LATENT_CONFIG_GUARDED | The IP pseudonymisation salt can be silently absent, turning a privacy control into a reversible hash |
| 16 | `R-24` | **HIGH** | ACTIVE_CONFIRMED | The origin is directly reachable from the internet, so the edge can be bypassed |
| 16 | `R-26` | **HIGH** | ACTIVE_CONFIRMED | The application's idea of the client address is an edge point of presence, and two extractors disagree |
| 16 | `R-43` | **HIGH** | ACTIVE_CONFIRMED | Continuous integration carries no security scanning of any kind |
| 15 | `R-04` | **HIGH** | ACTIVE_CONFIRMED | No account-level multi-factor authentication exists, so a valid credential is sufficient everywhere |
| 15 | `R-05` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | A standing environment-driven privileged account exists whenever two variables are present |
| 15 | `R-08` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | Six module data layers query the database with no organization predicate |
| 15 | `R-09` | **HIGH** | ACTIVE_CONFIRMED | There is no database-level tenant backstop: filtering is entirely caller-side |
| 15 | `R-13` | **HIGH** | ASSURANCE_GAP | The privilege-reporting instrument cannot represent the privilege model it reports on |
| 15 | `R-19` | **HIGH** | ACTIVE_CONFIRMED | Public writers have no idempotency, and one enforces its rate limit per process rather than per cluster |
| 15 | `R-20` | **HIGH** | ACTIVE_CONFIRMED | The only public handler that creates a user validates nothing and writes outside a transaction |
| 15 | `R-21` | **HIGH** | ACTIVE_CONFIRMED | Unrelated public features share one rate-limit bucket, so each can exhaust the other's allowance |
| 15 | `R-32` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | A silent fallback accepts writes into process memory and reports success, including the store it claims to have used |
| 15 | `R-33` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | An outage is acknowledged to an external party that will therefore never retry |
| 15 | `R-34` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | Gateway revocation and heartbeat report security outcomes that did not happen |
| 15 | `R-37` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | Metering and audit evidence is lost on every degraded path, and the audit writer shares the failure |
| 15 | `R-38` | **HIGH** | ACTIVE_CONFIRMED | The audit trail has no tamper evidence and its tenancy columns are nullable |
| 15 | `R-40` | **HIGH** | ACTIVE_CONFIRMED | Degraded paths are invisible: almost every exception path and half the call sites are silent |

---

## 7. Active production exposures — `ACTIVE_CONFIRMED` (<!-- S1-FACT:STATE_ACTIVE_CONFIRMED -->24<!-- /S1-FACT -->)

These hold now and were confirmed on the source state or by owner-supplied read-only evidence. They are the
entries where "latent" is not available as a comfort.

| Risk | Severity | Title | The defining gap |
|---|---|---|---|
| `R-24` | **HIGH** (16) | The origin is directly reachable from the internet, so the edge can be bypassed | Edge denial-of-service absorption, caching and any edge-layer filtering are all bypassable. |
| `R-26` | **HIGH** (16) | The application's idea of the client address is an edge point of presence, and two extractors disagree | Every visitor behind one edge point of presence shares a single rate-limit bucket, so one noisy visitor can exhaust the budget for many. |
| `R-43` | **HIGH** (16) | Continuous integration carries no security scanning of any kind | No static analysis, so an introduced injection or authorization defect has no automated detector. |
| `R-04` | **HIGH** (15) | No account-level multi-factor authentication exists, so a valid credential is sufficient everywhere | No second factor on login, on privilege elevation, or on any of the 13 OWNER-only operations. |
| `R-09` | **HIGH** (15) | There is no database-level tenant backstop: filtering is entirely caller-side | Every tenant boundary is one forgotten where clause away from being crossed, with nothing below it to refuse. |
| `R-19` | **HIGH** (15) | Public writers have no idempotency, and one enforces its rate limit per process rather than per cluster | The sales-leads counter resets on every container restart or redeploy, and each replica enforces its own cap, so the effective limit is the stated limit multiplied by the replica count. |
| `R-20` | **HIGH** (15) | The only public handler that creates a user validates nothing and writes outside a transaction | No schema validation, so arbitrary strings are stored as user records and the unique-email constraint is the only data-quality control. |
| `R-21` | **HIGH** (15) | Unrelated public features share one rate-limit bucket, so each can exhaust the other's allowance | Bucket collision between unrelated features is invisible to the registry test, which only asserts existence. |
| `R-38` | **HIGH** (15) | The audit trail has no tamper evidence and its tenancy columns are nullable | A row can be altered or deleted with no detectable trace, so the trail cannot evidence anything against someone who holds database access. |
| `R-40` | **HIGH** (15) | Degraded paths are invisible: almost every exception path and half the call sites are silent | An outage or a transient error is invisible to an operator almost everywhere, so a silent integrity defect has no detection path at all. |
| `R-22` | **HIGH** (12) | The avatar upload accepts unsniffed bytes, bounds after buffering, and publishes to an unauthenticated static surface | Content type is taken on trust, so a file whose bytes are not the declared image type is stored and served from the application's own origin. |
| `R-25` | **HIGH** (12) | Strict transport security is set nowhere, at any layer | No instruction to the browser to refuse an insecure connection, so the first request of a session has no protection and no preload entry exists. |
| `R-27` | **HIGH** (12) | Production comments assert a safety property the code does not have, and one already corrupted a security document | A comment that misstates a safety property in the dangerous direction will be believed by the next reader, and already was. |
| `R-46` | **HIGH** (12) | Containers run without runtime hardening, images are unpinned, and the development compose publishes data ports | A compromised process can write anywhere in its filesystem, keep every capability, escalate privileges and consume unbounded memory. |
| `R-52` | **HIGH** (12) | No incident runbook exists | There is no written procedure for the incidents this register makes most likely: a database outage with silent fallback, a suspected gateway compromise, or a credential exposure. |
| `R-63` | **HIGH** (12) | There is no central authorization choke point for the application interface | A new handler that forgets its gate is caught only by a lexical classifier that cannot see past the route file, so the depth of the check does not match the depth of the risk. |
| `R-17` | **MEDIUM** (10) | Six unauthenticated endpoints publish an internal commercial dashboard built from fabricated records | The authorization gap exists now, before the real data arrives; whatever replaces the fixtures will be tenant data and the route would then be an unauthenticated tenant-data endpoint. |
| `R-47` | **MEDIUM** (10) | The database connection is unencrypted by configuration and one identity holds both migration and runtime rights | Transport encryption is absent by configuration rather than by decision, so it is not stated anywhere that the internal network is the control. |
| `R-44` | **MEDIUM** (9) | Five dependency advisories are open in the production tree | Five advisories remain open in the production tree, each clearable by an in-range update that has not been applied. |
| `R-07` | **MEDIUM** (8) | Public candidate registration is an account-existence oracle | This one route contradicts the posture the other four implement. |
| `R-31` | **MEDIUM** (8) | The health surface is unauthenticated and its access logging is disabled at the proxy | Requests to the health surface leave no proxy access record, so probing it is invisible at that layer. |
| `R-49` | **MEDIUM** (8) | The gateway boundary is per-gateway shared-secret authentication, not the mutual certificate design the target architecture requires | A shared secret cannot be attested to a device, so a copied secret is indistinguishable from the device. |
| `R-48` | **MEDIUM** (6) | Traffic inside the cluster is unencrypted between the proxy, the application and the cache | Anything on the container network can read every request and every cached value, including rate-limit state and session-adjacent data. |
| `R-28` | **LOW** (4) | The platform discloses its framework and does not suppress server version tokens | Both values narrow an attacker's guesswork about the stack for no functional benefit. |

---

## 8. Latent design flaws

### 8.1 `CODE_CONFIRMED_RUNTIME_UNPROVEN` (12)

The behaviour is established by reading the code and tracing it to the statement that performs it. None of it
has been observed happening, and this phase injected no fault to make it happen.

| Risk | Severity | Title | The defining gap |
|---|---|---|---|
| `R-05` | **HIGH** (15) | A standing environment-driven privileged account exists whenever two variables are present | A long-lived credential in an environment file has no rotation, no expiry and no second factor. |
| `R-08` | **HIGH** (15) | Six module data layers query the database with no organization predicate | There is no database-level backstop: no row-level security (R-09). |
| `R-32` | **HIGH** (15) | A silent fallback accepts writes into process memory and reports success, including the store it claims to have used | A mutation is accepted, reported as successful, survives only until the container restarts, is invisible to any other replica, and gets a non-conforming identifier. |
| `R-33` | **HIGH** (15) | An outage is acknowledged to an external party that will therefore never retry | A success status is the instruction not to resend, so the data is lost rather than delayed — the one failure mode a buffering edge device cannot recover from. |
| `R-34` | **HIGH** (15) | Gateway revocation and heartbeat report security outcomes that did not happen | A revocation that silently did nothing is reported as a revocation that was already done, which is the one answer that stops an operator from responding further. |
| `R-37` | **HIGH** (15) | Metering and audit evidence is lost on every degraded path, and the audit writer shares the failure | The audit trail and the operation it records share one failure domain, so the evidence disappears exactly when it is most needed. |
| `R-35` | **HIGH** (12) | Industrial and twin reads present an outage as an empty success, so an operator reads zero rather than unknown | An empty collection means both you may see nothing and I could not ask, and the client cannot tell them apart. |
| `R-36` | **HIGH** (12) | An outage is rendered as a wrong domain answer: not found, duplicate, conflict, or an authentication failure | On a plant surface, not found is a statement about the equipment rather than about the platform. |
| `R-39` | **HIGH** (12) | Brute-force detection is silently disabled while the database is unavailable | An attacker can probe during an outage without accumulating lockout state or leaving failed-login evidence, so the attempt is invisible afterwards. |
| `R-03` | **MEDIUM** (10) | A storage-mode change is a deferred authentication downgrade that the next restart activates | A warning does not prevent a boot, so a storage-engine change silently becomes an enforcement change. |
| `R-11` | **MEDIUM** (9) | Ambiguous organization membership is resolved by silently picking the oldest | The billing resolver does not follow the contract's refusal, so one subsystem guesses where the rest refuse. |
| `R-41` | **MEDIUM** (6) | A partial failure between two writes can leave a suspended member's sessions live | The two writes are not atomic and the second one's result is not checked, so the suspension is partially applied with no signal. |

### 8.2 `LATENT_CONFIG_GUARDED` (4)

The defect is in the code, and a configuration value or a second code path currently prevents it from being
reachable. Both entries name the guard, and both guards are incidental rather than deliberate.

| Risk | Severity | Title | The defining gap |
|---|---|---|---|
| `R-01` | **HIGH** (20) | The legacy session HMAC key has no production guard, so a forged cookie can select any role | No FATAL startup check covers AUTH_SECRET itself. |
| `R-02` | **HIGH** (20) | A session token without a sid bypasses the canonical revocation check, with no mode guard on the read side | The protection is entirely on the mint side; one future code path that signs a payload without a sid reopens the bypass and no read-side test would fail. |
| `R-16` | **HIGH** (16) | The IP pseudonymisation salt can be silently absent, turning a privacy control into a reversible hash | Two of three call sites have no guard, so the control depends on a variable name that the authentication path does not require. |
| `R-10` | **HIGH** (12) | Site-level authorization is structurally thin, and one site-filter bypass is latent | The site-filter construction yields undefined rather than an empty allow-list, so it fails open by shape and is masked only by a neighbour. |

---

## 9. Assurance gaps — `ASSURANCE_GAP` (<!-- S1-FACT:STATE_ASSURANCE_GAP -->10<!-- /S1-FACT -->)

Each of these records what is **not known**. Three are about the instruments this programme relies on, which
is the uncomfortable part: the privilege classifier cannot see the model it reports on, the Phase 99 closures
were inherited rather than re-verified, and security documentation has drifted from the code it describes.

| Risk | Severity | Title | The defining gap |
|---|---|---|---|
| `R-13` | **HIGH** (15) | The privilege-reporting instrument cannot represent the privilege model it reports on | A reader or a gate that treats the two zeros as a measurement is misled, and Gate C and the Phase 99 assurance reports consume this output. |
| `R-14` | **HIGH** (12) | Per-tier negative authorization tests were not assessable, so refusal is argued rather than executed | For 59 privileged operations there is no executed assertion that a role one step below the requirement is refused. |
| `R-29` | **HIGH** (12) | Security-relevant configuration and documentation have drifted from the code they describe | A guard name that does not exist invites a future change to invent one, or to assume a boundary is enforced where it is not. |
| `R-45` | **HIGH** (12) | Twenty-nine Phase 99 remediations are inherited as fixed rather than re-verified in this programme | No test behind those closures was executed in this worktree, because it has no installed dependencies, so twenty-four of the twenty-nine rest on a prior phase's word. |
| `R-64` | **HIGH** (12) | Five security-relevant surfaces were declared out of scope in the source phase and remain unexamined | A single-sign-on implementation is an authentication surface and nothing is known about it. |
| `R-51` | **MEDIUM** (10) | Backup, restore and recovery machinery exists and none of it was executed | An unexercised restore is a hypothesis; this programme produced no evidence that data can be recovered. |
| `R-12` | **MEDIUM** (9) | Redis keys carry no namespace, and tenant scoping of cache keys is unverified | There is no mechanism that forces a tenant-scoped key to embed the organization, so correctness rests on each call site. |
| `R-30` | **MEDIUM** (8) | The network path to the origin address was unstable between two observations and the mechanism is unknown | Any future verification of R-24's closure from one request could be misled by the same instability, in either direction. |
| `R-06` | **MEDIUM** (6) | Two password-hashing libraries are present and the authoritative verifier is unestablished | A reachable legacy verifier would set the effective strength of every stored credential, and no evidence establishes whether one is reachable. |
| `R-42` | **MEDIUM** (6) | Dead product surface refuses correctly where nothing can observe it, including all site-membership management | Site membership is a security control with no administrative surface, so the thinness in R-10 cannot even be managed. |

---

## 10. Policy questions and positive controls

### 10.1 Policy questions — `POLICY_AMBIGUITY` (<!-- S1-FACT:STATE_POLICY_AMBIGUITY -->3<!-- /S1-FACT -->)

These need a decision from the owner. They are not measurements and no amount of further reading will settle
them.

| Risk | Severity | Title | The defining gap |
|---|---|---|---|
| `R-18` | **HIGH** (12) | Public certificate verification returns a named individual with no rate limit and unprovable token entropy | No rate limit on a public endpoint that returns a named individual. |
| `R-15` | **MEDIUM** (8) | Four organization-governance questions are undecided, including whether an organization can lose its only owner | An organization that loses its owner has no holder of 13 permissions and no API path to regain one. |
| `R-23` | **MEDIUM** (6) | Two public-content behaviours need a policy decision rather than a fix | No requirement exists stating who may publish an avatar to the public static surface, so there is nothing to enforce. |

### 10.2 Positive controls — `POSITIVE_CONTROL` (<!-- S1-FACT:STATE_POSITIVE_CONTROL -->11<!-- /S1-FACT -->)

Recorded as register entries with evidence and with acceptance criteria whose purpose is to stop them
eroding. All factors are pinned to zero by the gate, so each scores zero. The third column is the honest
half: what the control does **not** cover.

| Entry | The control that is present | What it does not cover |
|---|---|---|
| `R-50` | No code path from the platform reaches a programmable controller, because the capability is absent | This stops being true the moment a protocol client enters the dependency manifest, which is precisely why the preconditions for adding one must be defined before it is added. |
| `R-53` | The worker boundary is deliberately minimal and holds no database credential | The boundary rests on a worker token, so token handling is the control that must not weaken. |
| `R-54` | The rate limiter fails closed on an undeclared bucket and audits the refusal | The registry enforces that an action exists, not that it is semantically distinct, which is the gap R-21 sits in. |
| `R-55` | No role can assign organization ownership, and every client-supplied role is clamped | The clamp is load-bearing and its removal would silently restore a known defect; the negative tests that would catch that are the subject of R-14. |
| `R-56` | The compliance organization-scope helper has a complete fail-closed ladder | The permission is an argument, so the privilege tier is invisible to the classifier — which is R-13, a reporting gap rather than an enforcement one. |
| `R-57` | The enterprise-resource surface is the reference implementation of the target failure policy | The capability is a derived boolean with no textual signature, so no classifier can see it — which is R-13, and the remediation there should register this capability as its first example. |
| `R-58` | There is exactly one mutation transport, because the framework's alternative is unused | The property is maintained by convention; a single server action would silently widen the surface and the inventory would not report it. |
| `R-59` | The session store and the tenant contract both fail closed by construction | The session store's force is undermined by the one sid-less branch described in R-02, which is a branch above it rather than a defect in it. |
| `R-60` | Twelve security-control dependencies were traced and confirmed to deny rather than to succeed emptily | The inventory had been publishing a wrong verdict on the platform's session, tenant, entitlement and egress controls, which is the reporting lesson rather than an enforcement one. |
| `R-61` | No public handler accepts a tenant, user or role identifier, and every privileged column a public writer sets is hardcoded | One route contradicts the enumeration posture, which is R-07. |
| `R-62` | The gateway envelope is canonicalised and replay-bounded by construction | The signature is only as good as the secret's separation and lifecycle, which is R-49. |

---

## 10.3 Finding coverage — all <!-- S1-FACT:S1_FINDINGS_TOTAL -->161<!-- /S1-FACT --> findings, none orphaned

Every named finding from the eight S0 documents and the committed Phase 99 register appears below with
exactly one disposition. A finding is owned by at most one risk — enforced bidirectionally, so the risk must
also claim it — and `DUPLICATE_OF` entries carry no ownership.

<!-- S1-BLOCK:findings -->
### A — 4 findings

| Finding | What it records | Disposition |
|---|---|---|
| `A-1` | No role can assign OWNER and transfer_ownership has no implementation, so an organization's OWNER is effectively immutable through the API. | `POLICY_QUESTION` → `R-15` |
| `A-2` | remove_member is OWNER+ADMIN and no last-OWNER invariant was found in the route, so an ADMIN removing the sole OWNER would leave the organization with no holder of the 13 OWNER-only permissions. | `POLICY_QUESTION` → `R-15` |
| `A-3` | view_erp_compensation exists in the permission table while enforcement uses a direct role comparison: two sources of truth for one rule. | `POLICY_QUESTION` → `R-15` |
| `A-4` | delete_org is declared with no implementation, so whether organization deletion is intended to exist is undecided. | `POLICY_QUESTION` → `R-15` |

### DB — 26 findings

| Finding | What it records | Disposition |
|---|---|---|
| `DB-01` | The empty-success ratio across the inventory: 163 call sites and 96 consumer edges answer an outage with an apparent success. | `MAPPED_TO_RISK` → `R-35` |
| `DB-04` | Published cases are served to anonymous graph and operations endpoints from the in-process ring during an outage; published-only, so not a disclosure, but the public graph can misrepresent the estate. | `MAPPED_TO_RISK` → `R-32` |
| `DB-05` | The silent majority: 211 of 392 call sites carry no logging on their degraded path. | `MAPPED_TO_RISK` → `R-40` |
| `DB-06` | Brute-force detection is lost during an outage: no counter, no login.failed event and no lockout state are recorded, and the isAccountLocked fail-open is masked only because issueTokens throws and the handler answers 503. | `MAPPED_TO_RISK` → `R-39` |
| `DB-07` | Public certificate verification answers HTTP 200 with the holder name "Unknown" during an outage: it mis-attributes rather than mis-validates. | `MAPPED_TO_RISK` → `R-36` |
| `DB-08` | Telemetry ingestion answers an industrial gateway HTTP 201 Created with ingested: 0 when the readings were dropped, so the gateway neither buffers nor resends, and a TELEMETRY_INGESTED audit row asserting count 0 is attempted and fails on the same outage. | `MAPPED_TO_RISK` → `R-33` |
| `DB-09` | The site filter is skipped on the industrial graph route when the client is null; latent only because loadOrgGraph returns null on the identical condition, and cross-tenant exposure is impossible because organizationId is filtered unconditionally. | `MAPPED_TO_RISK` → `R-10` |
| `DB-10` | Organization, billing, knowledge and platform-key writes answer a database outage with HTTP 422 while echoing an internal "Database unavailable" reason string. | `MAPPED_TO_RISK` → `R-36` |
| `DB-11` | Compliance writes answer a database outage with HTTP 409, and the export-download path writes an EXPORT_TOKEN_REPLAY_DENIED audit row for what was an outage. | `MAPPED_TO_RISK` → `R-36` |
| `DB-12` | A billing webhook the platform could not durably claim is answered HTTP 200 with outcome IGNORED, so the provider treats the event as delivered and never retries, and the WEBHOOK_REJECTED row fails on the same outage. | `MAPPED_TO_RISK` → `R-33` |
| `DB-13` | changeMemberStatus does not check revokeAllSessions' result, so a partial failure between the suspension write and the generation bump can leave a suspended member's non-organization sessions live until expiry. | `MAPPED_TO_RISK` → `R-41` |
| `DB-14` | Dead write paths exist whose refusal nothing can observe. | `MAPPED_TO_RISK` → `R-42` |
| `DB-15` | A response payload carrying an isFallback field sets it to false on a fallback. | `MAPPED_TO_RISK` → `R-32` |
| `DB-16` | Health functions report zeros instead of unknown when they could not ask. | `MAPPED_TO_RISK` → `R-35` |
| `DB-17` | Usage metering records are dropped silently during an outage. | `MAPPED_TO_RISK` → `R-37` |
| `DB-18` | initiatePasswordReset cannot signal its own failure. | `MAPPED_TO_RISK` → `R-36` |
| `DB-19` | The case, knowledge and analysis write responses assert storageMode "database" while the write went to process memory: the client is told which store it went to, and that statement is false. | `MAPPED_TO_RISK` → `R-32` |
| `DB-20` | Five academy routes report an outage as HTTP 401 "Authentication required" because a local resolveUser helper collapses four distinct conditions into one null, while a sixth route answers 200 with a null stats block for the same condition. | `MAPPED_TO_RISK` → `R-36` |
| `DB-21` | Gateway revocation answers HTTP 404 "Gateway not found or already revoked" while the credential stays valid, with the GATEWAY_REVOKED audit event written only after the guard, so an operator responding to a suspected compromise is told the job is already done. | `MAPPED_TO_RISK` → `R-34` |
| `DB-22` | The gateway heartbeat route writes a GATEWAY_HEARTBEAT audit event and meters the call after touchGatewayHeartbeat returned early without persisting anything. | `MAPPED_TO_RISK` → `R-34` |
| `DB-23` | The industrial and twin update paths map an outage to HTTP 404 "not found" while their create siblings answer 503, and two relation and tag creators answer 422 "may be duplicate" — an outage reported as a unique-key violation. | `MAPPED_TO_RISK` → `R-36` |
| `DB-24` | Twenty-seven consumer edges and nine exported functions have no caller in src/ or scripts/, including the whole of the site-membership module, so site membership can neither be read nor managed through the product. | `MAPPED_TO_RISK` → `R-42` |
| `DB-25` | The document tenant repository redirects a zero-row update to the in-process store, so a PATCH for an id present in neither store still answers as a successful update; deliberate and tenant-filtered, but the one in-memory write on that surface that is not an outage path. | `MAPPED_TO_RISK` → `R-32` |
| `DB-26` | 119 of 124 exception edges are silent; only five log. | `MAPPED_TO_RISK` → `R-40` |
| `DB-F1` | Silent database-to-session fallback in six core repositories plus one document path: 69 fallback points, 34 inside bare catch blocks, writes included, zero logging, so any transient Prisma exception reroutes a mutation into process memory and reports success. | `MAPPED_TO_RISK` → `R-32` |
| `DB-F2` | The industrial and twin read paths answer an unavailable database with an empty success: 26 sites on the legacy single-line shape and 98 on the semantic definition, so an operator reads "zero alarms" when the truth is "no connection". | `MAPPED_TO_RISK` → `R-35` |

### EDGE — 10 findings

| Finding | What it records | Disposition |
|---|---|---|
| `EDGE-01` | No host-level restriction exists on inbound 80/443: nginx binds 0.0.0.0 and ::, UFW is ALLOW IN Anywhere on both families, DOCKER-USER carries no allowlist, and Docker DNATs both ports publicly. | `MAPPED_TO_RISK` → `R-24` |
| `EDGE-02` | The original finding about the identity of 185.80.196.163 was withdrawn and superseded. | `NOT_A_SECURITY_RISK_WITH_REASON` |
| `EDGE-03` | ngx_http_realip_module is entirely unconfigured — real_ip_header, real_ip_recursive and set_real_ip_from are all absent from both nginx config files. | `MAPPED_TO_RISK` → `R-26` |
| `EDGE-04` | Two production files carry comments asserting the rate limiter fails open on an unknown action when it fails closed, misstating a safety property in the dangerous direction; one already caused an error in a committed security document. | `MAPPED_TO_RISK` → `R-27` |
| `EDGE-05` | deploy/nginx/default.conf lists a stale address in server_name while the host's address is different — harmless as a matching token, but a false statement about the deployment embedded in configuration, and the direct cause of one invalid audit test. | `MAPPED_TO_RISK` → `R-29` |
| `EDGE-06` | The claim that a Cloudflare-fronted response arrives on the origin's own address was reclassified as test-environment interference and the identifier retired. | `NOT_A_SECURITY_RISK_WITH_REASON` |
| `EDGE-07` | x-powered-by: Next.js is present on the origin response — framework disclosure on every response. | `MAPPED_TO_RISK` → `R-28` |
| `EDGE-08` | A HEAD request, nominally side-effect-free, returns Set-Cookie NEXT_LOCALE with a one-year Max-Age; this is next-intl's documented locale negotiation and carries no identity. | `POLICY_QUESTION` → `R-23` |
| `EDGE-09` | The origin is reachable directly from the public internet: a request from a vantage independent of both the production host and the audit environment was answered with the origin's own signature and no Cloudflare headers, so the edge can be bypassed from outside. | `MAPPED_TO_RISK` → `R-24` |
| `EDGE-10` | Routing to the origin address was unstable between two observations 23 seconds apart from the same device; both observations are genuine and the mechanism is not established. | `ASSURANCE_GAP` → `R-30` |

### H — 7 findings

| Finding | What it records | Disposition |
|---|---|---|
| `H-1` | The IP pseudonymisation salt can be silently absent: SHA-256(ip + process.env.JWT_ACCESS_SECRET) with no check, while jwtSecret() accepts three other variable names, so a deployment setting only JWT_SECRET salts with the literal string "undefined". | `MAPPED_TO_RISK` → `R-16` |
| `H-2` | POST /api/auth/access-request has no idempotency or duplicate suppression; the rate limiter is the only bound on repeated rows. | `MAPPED_TO_RISK` → `R-19` |
| `H-3` | POST /api/sales/leads uses a module-local in-memory Map as its limiter instead of the shared Redis limiter, so the counter resets on restart and each replica enforces its own cap. | `MAPPED_TO_RISK` → `R-19` |
| `H-4` | POST /api/candidate/register has no schema validation: a hand-written interface plus raw JSON.parse, so email is never validated as an email and name, phone, location, skills and workAuthorization are unbounded. | `MAPPED_TO_RISK` → `R-20` |
| `H-5` | POST /api/candidate/register answers 409 "Email already registered", a direct account-existence oracle that contradicts the platform's stated anti-enumeration posture. | `MAPPED_TO_RISK` → `R-07` |
| `H-6` | user.create and createCandidate are not in a transaction, so a failure between them leaves a candidate-role User with no candidate record. | `MAPPED_TO_RISK` → `R-20` |
| `H-7` | The three public media handlers borrow the Copilot demo's rate-limit buckets (copilot-demo-get / copilot-demo-post), so one public feature can exhaust another's allowance and neither can be tuned independently. | `MAPPED_TO_RISK` → `R-21` |

### IP — 7 findings

| Finding | What it records | Disposition |
|---|---|---|
| `IP-01` | The one trusted header carries nginx's peer address, which behind Cloudflare is an edge PoP; resolveClientIp's own premise ("no Cloudflare") is false and the mitigation its comment prescribes was never applied. | `MAPPED_TO_RISK` → `R-26` |
| `IP-02` | CF-Connecting-IP arrives on every request, is neither stripped nor rewritten, and is read by no code: the correct value is available and discarded. | `MAPPED_TO_RISK` → `R-26` |
| `IP-03` | Neither IP extractor normalises: IPv6, IPv4-mapped, bracketed and port-bearing forms key differently, and a missing header collapses every caller into one "unknown" bucket. | `MAPPED_TO_RISK` → `R-26` |
| `IP-04` | Two independent IP extractors exist with no shared code, so a fix to one does not reach the other. | `MAPPED_TO_RISK` → `R-26` |
| `IP-05` | The salt guard is an un-propagated fix: the media view beacon names the other two call sites and their line numbers, calls them "same secret, same algorithm", and adds the guard only to itself. | `MAPPED_TO_RISK` → `R-16` |
| `IP-06` | ArticleView.ipHash has no writer anywhere in src/. | `MAPPED_TO_RISK` → `R-42` |
| `IP-07` | A wrong input IP makes all three ipHash columns pseudonyms of a PoP — still non-reversible, but no longer the personal datum they are governed as, and useless for attribution. | `MAPPED_TO_RISK` → `R-16` |

### L — 5 findings

| Finding | What it records | Disposition |
|---|---|---|
| `L-1` | isPayloadSessionActive returns true for any payload without a sid, with no storage-mode guard and no defence in depth on the read side; the protection lives entirely on the mint side. | `MAPPED_TO_RISK` → `R-02` |
| `L-2` | A change of HERMES_STORAGE_MODE to session takes effect on the next recreate, redeploy or restart, after which logins issue sid-less unrevocable cookies; startup check W7 warns but does not block. | `MAPPED_TO_RISK` → `R-03` |
| `L-3` | Legacy cookies minted before Phase 91 carried no sid and closed through the 30-day absolute iat ceiling rather than through any revocation. | `NOT_A_SECURITY_RISK_WITH_REASON` |
| `L-4` | verifySession enforces signature and absolute age but never consults the session store, so all revocation force comes from the single sid branch in isPayloadSessionActive. | `MAPPED_TO_RISK` → `R-02` |
| `L-5` | signSession and verifySession key off AUTH_SECRET alone and fall back to a constant published in this repository with no NODE_ENV guard; the FATAL startup checks evaluate a different resolution order, and the one check naming the constant is a WARNING that does not fire when AUTH_SECRET is merely absent. | `MAPPED_TO_RISK` → `R-01` |

### LOCK — 51 findings

| Finding | What it records | Disposition |
|---|---|---|
| `LOCK-ACADEMY-CERT` | Public certificate verification returns the holder's real name with no rate limit, and the verification token's entropy cannot be established because nothing in src/ writes it — there is no mint site in this repository. | `POLICY_QUESTION` → `R-18` |
| `LOCK-ADMIN-SEED` | adminSeed() makes a standing environment-driven privileged account whenever ADMIN_EMAIL and ADMIN_PASSWORD are present. | `MAPPED_TO_RISK` → `R-05` |
| `LOCK-API-NO-MIDDLEWARE` | The middleware matcher excludes /api and any dotted path, so none of the 572 API handlers receives middleware authentication, and there is no central authorization choke point: 572 handlers are 572 independent enforcement decisions. | `MAPPED_TO_RISK` → `R-63` |
| `LOCK-ASSIGNABLE-ROLES-CLAMP` | No role can assign OWNER and an ADMIN cannot even assign ADMIN; all three places that accept a client-supplied role clamp it, and the clamp is a recorded fix for a real prior defect. | `POSITIVE_CONTROL` → `R-55` |
| `LOCK-AUDIT-NO-CHAIN` | The AuditLog model is a plain append table with no previousHash, hash chain, signature, append-only enforcement or WORM retention, and its organizationId, outcome and correlationId columns are all nullable. | `MAPPED_TO_RISK` → `R-38` |
| `LOCK-CI-TOOLING-ABSENT` | No SAST, secret scanning, container or image scanning, IaC scanning, DAST, SBOM generation or artifact signing appears anywhere in the 13 workflows; the only dependency control is the dependency-audit gate. | `MAPPED_TO_RISK` → `R-43` |
| `LOCK-COMPLIANCE-SCOPE-FAILCLOSED` | The compliance organization-scope helper, used by 35 route files, refuses on an unverifiable token, a revoked session, an unavailable database, an ambiguous membership and a missing active organization, and resolves the organization server-side from membership rows. | `POSITIVE_CONTROL` → `R-56` |
| `LOCK-CONTAINER-HARDENING` | The production compose file carries none of read_only, cap_drop, security_opt, no-new-privileges, tmpfs or resource limits, no seccomp or AppArmor profile, and its internal network is a plain bridge rather than internal, so containers retain outbound egress. | `MAPPED_TO_RISK` → `R-46` |
| `LOCK-CSP-NOT-ON-API` | Because the Content-Security-Policy is set in middleware and middleware excludes /api and dotted paths, API responses and static uploads carry no CSP. | `MAPPED_TO_RISK` → `R-63` |
| `LOCK-CUSTOMERS-PUBLIC` | Six /api/customers handlers serve a customer-success book of business — company names, plans, ARR, health scores and renewal risk — to the anonymous internet with no authentication, authorization, rate limiting or audit, backed by 17 static records naming real companies. | `MAPPED_TO_RISK` → `R-17` |
| `LOCK-DB-ROLE-SEPARATION` | The migration role and the runtime role are not separated in anything found in S0: one connection string holds both. | `MAPPED_TO_RISK` → `R-47` |
| `LOCK-DB-SSLMODE` | Database connection encryption is not configured in the repository: sslmode is absent from both example environment files. | `MAPPED_TO_RISK` → `R-47` |
| `LOCK-DEV-COMPOSE-PORTS` | The development compose file publishes the PostgreSQL and Redis ports, uses a weak default database password and sets no Redis requirepass at all. | `MAPPED_TO_RISK` → `R-46` |
| `LOCK-DOC-TOKEN-TTL-UNVERIFIED` | Signed document export tokens have a time-to-live and a download route exists; the value and the re-authorization behaviour on download were not verified in S0. | `ASSURANCE_GAP` → `R-64` |
| `LOCK-DR-NOT-EXECUTED` | The backup, restore, blue-green and envelope-encryption machinery is substantial, and S0 executed none of it: no backup was taken and no restore was performed. | `ASSURANCE_GAP` → `R-51` |
| `LOCK-ERP-REFERENCE` | The 26 ERP route files apply four gates in order with an origin refusal on every write, and the ERP data layer raises a controlled 503 so no raw Prisma error reaches a caller and no ERP path degrades to in-process storage. | `POSITIVE_CONTROL` → `R-57` |
| `LOCK-GETPRISMA-TESTCOUNT` | The getPrisma classification document states 79 selftests in one section and 75 in two others after the corrective revision updated only the first. | `ASSURANCE_GAP` → `R-29` |
| `LOCK-HEALTH-ACCESS-LOG-OFF` | The proxy forwards the health path on the insecure port with access logging switched off, while every other path on that port is redirected, so requests to the health surface leave no proxy access record. | `MAPPED_TO_RISK` → `R-31` |
| `LOCK-HSTS-ABSENT` | Strict-Transport-Security is set nowhere: both nginx configs contain zero add_header directives, next.config.ts states HSTS is set exclusively by nginx, and the header was confirmed absent on a production response and again on the direct origin response. | `MAPPED_TO_RISK` → `R-25` |
| `LOCK-IMAGE-TAGS` | No container image is digest-pinned: all four are floating or semantic tags, including the Node base image and nginx:alpine. | `MAPPED_TO_RISK` → `R-46` |
| `LOCK-L5-EVIDENCE-CONTRADICTION` | Two committed S0 documents record opposite statuses for one precondition: the legacy-token document calls the signing-variable precondition unverified, while the edge document records the owner-supplied presence check and the verdict that the flaw is not active in the observed container. | `ASSURANCE_GAP` → `R-29` |
| `LOCK-MFA-ABSENT` | There is no account-level MFA, TOTP or WebAuthn implementation: the only one-time-code code is a candidate application-withdrawal flow, not account authentication. | `MAPPED_TO_RISK` → `R-04` |
| `LOCK-NO-ORG-PREDICATE` | The tenant contract records, as established fact in product source, that six module data layers query Prisma with no organizationId predicate although every root model declares the column. | `MAPPED_TO_RISK` → `R-08` |
| `LOCK-NO-PLC-PATH` | No library in the dependency tree can speak OPC UA, MQTT, Modbus, S7, BACnet, PROFINET or EtherNet/IP, so no code path from Hermes reaches a PLC, HMI, historian or OT network; industrial data enters only through the signed gateway-envelope surface. | `POSITIVE_CONTROL` → `R-50` |
| `LOCK-NO-RLS` | No PostgreSQL row-level-security policy was found: tenant filtering is entirely caller-side. | `MAPPED_TO_RISK` → `R-09` |
| `LOCK-NO-SECRET-SCAN-HISTORY` | The DR secret-scan script walks generated JSON manifests so they cannot carry a secret value; it never examines the source tree or git history. | `DUPLICATE_OF` `LOCK-CI-TOOLING-ABSENT` |
| `LOCK-ORG-FIRST-PICK` | The billing organization resolver uses findFirst with orderBy createdAt asc, so for a user in two organizations it silently picks one. | `MAPPED_TO_RISK` → `R-11` |
| `LOCK-OT-ENVELOPE-CANON` | The gateway envelope is canonicalised length-prefixed in a fixed field order rather than by serialising caller input, compared with a timing-safe comparison, and carries timestamp, nonce and idempotency key inside the signed field set; no Prisma model stores key material. | `POSITIVE_CONTROL` → `R-62` |
| `LOCK-OT-KEY-SEPARATION` | Whether one gateway's secret can be used against another gateway's identifier depends on secret-provider key separation, which was not verified in S0. | `ASSURANCE_GAP` → `R-49` |
| `LOCK-OT-NO-MTLS` | Gateway authentication is per-gateway HMAC with environment-resolved secrets; mTLS, per-device certificates, a certificate lifecycle, expiry monitoring and a dual-key validation window are all absent. | `MAPPED_TO_RISK` → `R-49` |
| `LOCK-P99-SURFACE-STALE` | The Phase 99 attack-surface narrative states 355 route files, 497 handlers and 13 public writers while the committed inventory on this source state reports 412, 572 and 14. | `ASSURANCE_GAP` → `R-29` |
| `LOCK-PASSWORD-HASH-DUAL` | Both argon2 and bcryptjs are in the dependency set; which is authoritative for new passwords, and whether a bcrypt verification path remains reachable, was not established in S0. | `ASSURANCE_GAP` → `R-06` |
| `LOCK-PLATFORM-ADMIN-NOT-AUDITED` | The 135 handlers classified as platform-administrative were not re-audited handler by handler and are explicitly not asserted correct — only not contradicted. | `ASSURANCE_GAP` → `R-64` |
| `LOCK-PROXY-APP-PLAINTEXT` | Every request crosses from the proxy to the application as plain traffic on a bridge network, with no identity between the two hops. | `MAPPED_TO_RISK` → `R-48` |
| `LOCK-PUBLIC-NO-CLIENT-IDENTITY` | No public handler returns another tenant's data and none accepts a tenant, user or role identifier from the client: every privileged column a public writer sets is hardcoded, and every public route file's rate-limit action is registered. | `POSITIVE_CONTROL` → `R-61` |
| `LOCK-REAUTH-NOT-ASSESSED` | A re-authentication and step-up module is present; its scope and coverage were not established in S0. | `ASSURANCE_GAP` → `R-64` |
| `LOCK-REDIS-DEFAULT-PASSWORD` | The production compose sets Redis requirepass with a weak literal default when the environment variable is unset. | `MAPPED_TO_RISK` → `R-46` |
| `LOCK-REDIS-NO-PREFIX` | The Redis client sets no global key prefix or namespace and key construction is entirely caller-side, so whether every tenant-scoped key embeds an organizationId is unverified. | `ASSURANCE_GAP` → `R-12` |
| `LOCK-REDIS-NO-TLS` | The cache has no transport encryption configured and relies on being in-network only. | `MAPPED_TO_RISK` → `R-48` |
| `LOCK-REQUIREACTOR-PHANTOM` | Project guidance names a guard called requireActor that has zero definitions and zero uses, and the Phase 99 classifier still registers it as a guard token. | `MAPPED_TO_RISK` → `R-29` |
| `LOCK-RUNBOOKS-ABSENT` | No incident runbook directory exists in the repository. | `MAPPED_TO_RISK` → `R-52` |
| `LOCK-SERVER-TOKENS` | server_tokens off is absent from the nginx configuration. | `MAPPED_TO_RISK` → `R-28` |
| `LOCK-SESSION-STORE-FAILCLOSED` | The session store treats a missing row, a revoked row, an expired row or an unreachable database as revoked, and is documented Node-only so it is never imported from the edge. | `POSITIVE_CONTROL` → `R-59` |
| `LOCK-SITE-GUARD-THIN` | Only 9 of 410 API route files reference a site-level guard, against 78 using the organization actor guard and 120 using the permission guard, and the schema carries 54 siteId references against 580 organizationId references. | `MAPPED_TO_RISK` → `R-10` |
| `LOCK-SSO-NOT-INSPECTED` | The single-sign-on module is present and was not inspected in S0. | `ASSURANCE_GAP` → `R-64` |
| `LOCK-STRIPE-WEBHOOK-UNCONFIRMED` | The inventory reports zero unauthenticated webhooks; the payment webhook's signature verification was not read in S0 and is explicitly deferred. | `ASSURANCE_GAP` → `R-64` |
| `LOCK-TENANT-CONTRACT` | The tenant context resolves to one of five states and only one carries an organizationId, so a tenant-scoped query without an established tenant is unwritable rather than merely discouraged. | `POSITIVE_CONTROL` → `R-59` |
| `LOCK-TWELVE-RECLASSIFIED` | Twelve security-control dependencies — the session revocation check, the organization and site actor contexts, the login credential lookup, three entitlement reads, the AI-egress policy store, the academy request scope, the candidate retention check and two tenant-context readers — were each traced and confirmed to deny rather than to succeed emptily when the database is unavailable. | `POSITIVE_CONTROL` → `R-60` |
| `LOCK-UPLOADS-IN-PUBLIC` | The uploads volume is mounted inside the application's public directory, so its contents are served as static assets with no authorization check and no CSP; filenames are 128-bit random, and the only two writers store images intended for public publication. | `MAPPED_TO_RISK` → `R-22` |
| `LOCK-WORKER-BLAST-RADIUS` | Each worker image contains exactly one dependency-free script with no node_modules, no ORM, no application code and no database credential, and a packaging test asserts the runner and migrator stages copy no scripts. | `POSITIVE_CONTROL` → `R-53` |
| `LOCK-ZERO-SERVER-ACTIONS` | There are zero server actions in src/, so every state change must pass through an inventoried API route handler and no second mutation transport exists. | `POSITIVE_CONTROL` → `R-58` |

### P99-DEP — 14 findings

| Finding | What it records | Disposition |
|---|---|---|
| `P99-DEP-001` | Dependency advisory in brace-expansion (high) | `ASSURANCE_GAP` → `R-45` |
| `P99-DEP-002` | Dependency advisory in fast-uri (high) | `ASSURANCE_GAP` → `R-45` |
| `P99-DEP-003` | Dependency advisory in js-yaml (high) | `ASSURANCE_GAP` → `R-45` |
| `P99-DEP-004` | Dependency advisory in next (high) | `ASSURANCE_GAP` → `R-45` |
| `P99-DEP-005` | Dependency advisory in postcss (high) | `ASSURANCE_GAP` → `R-45` |
| `P99-DEP-006` | Dependency advisory in sharp (high) | `ASSURANCE_GAP` → `R-45` |
| `P99-DEP-007` | Dependency advisory in undici (high) | `ASSURANCE_GAP` → `R-45` |
| `P99-DEP-008` | Dependency advisory in @hono/node-server (medium) | `MAPPED_TO_RISK` → `R-44` |
| `P99-DEP-009` | Dependency advisory in @prisma/dev (medium) | `MAPPED_TO_RISK` → `R-44` |
| `P99-DEP-010` | Dependency advisory in hono (medium) | `MAPPED_TO_RISK` → `R-44` |
| `P99-DEP-011` | Dependency advisory in prisma (medium) | `MAPPED_TO_RISK` → `R-44` |
| `P99-DEP-012` | Dependency advisory in valibot (medium) | `MAPPED_TO_RISK` → `R-44` |
| `P99-DEP-013` | Dependency advisory in browserslist (high) | `ASSURANCE_GAP` → `R-45` |
| `P99-DEP-014` | Dependency advisory in mysql2 (high) | `ASSURANCE_GAP` → `R-45` |

### P99-INT — 20 findings

| Finding | What it records | Disposition |
|---|---|---|
| `P99-INT-001` | Unauthenticated endpoint wrote the authentication session cookie from the request body (session fixation) | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-002` | Live session tokens persisted and logged as consent keys, with an unauthenticated read of consent evidence | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-003` | Mass assignment on the candidate self-service profile update | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-004` | Public careers detail endpoint returned unpublished and cross-tenant job records | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-005` | Academy course detail endpoint had no authentication, tenant predicate or published check | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-006` | Academy assessment content readable anonymously across tenants | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-007` | Raw SQL identifier interpolation guarded only by a comment | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-008` | Rate limit keyed on a client-controlled forwarding header | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-009` | Anonymous vendor onboarding had no abuse controls and stored a session credential | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-010` | Unbounded client-controlled page size on a public listing endpoint | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-011` | Unbounded cross-tenant table scan reachable from anonymous derived-graph endpoints | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-012` | Anonymous analysis endpoint parsed an unbounded body with no rate limit | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-013` | Certificate verification reported expired certificates as valid | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-014` | Site allow-list bypassed by an explicit siteId on the asset listing | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-015` | Site allow-list bypassed by an explicit siteId on the gateway listing | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-016` | Site allow-list bypassed by a gatewayId filter on the connector listing | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-017` | Asset analytics applied no site allow-list, and its score queries were invalid | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-018` | Create handlers wrote a client-supplied siteId with no site-level authorization | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-019` | Anonymous write endpoints parsed unbounded request bodies | `ASSURANCE_GAP` → `R-45` |
| `P99-INT-020` | Compliance evidence recorded a client-controlled IP address as consent and privacy-request provenance | `ASSURANCE_GAP` → `R-45` |

### PRIV — 7 findings

| Finding | What it records | Disposition |
|---|---|---|
| `PRIV-01` | TENANT_ADMIN and OWNER_ONLY are declared vocabulary with no detector: classifyHandler cannot emit either value, so the reported zeros are a structural impossibility rather than a measurement. | `ASSURANCE_GAP` → `R-13` |
| `PRIV-02` | requirePermission, present in 120 route files at 168 call sites, is registered at scope tenant, so every permission-gated handler flattens to TENANT_MEMBER regardless of how privileged the permission is. | `ASSURANCE_GAP` → `R-13` |
| `PRIV-03` | Three OWNER-only permissions have no requirePermission consumer: two are unimplemented operations and the third is enforced by a different mechanism. | `ASSURANCE_GAP` → `R-13` |
| `PRIV-04` | The ERP compensation boundary is enforced as a derived boolean in the repository layer, with no textual signature any token-matching classifier could detect. | `ASSURANCE_GAP` → `R-13` |
| `PRIV-05` | The classifier's unit of counting is wrong for this codebase: privilege is per action, selected inside the handler from an ACTION_PERMISSION map, so one (path, method) pair spans three tiers. | `ASSURANCE_GAP` → `R-13` |
| `PRIV-06` | The GUARD_TOKENS table is hand-maintained, lacks the two scopes its own output schema advertises, and contains a dead token for a guard that does not exist. | `ASSURANCE_GAP` → `R-13` |
| `PRIV-07` | Negative-test coverage for unauthorised roles could not be assessed: the two targeted classifier tests could not be executed in this worktree, so this is absence of evidence rather than evidence of absence. | `ASSURANCE_GAP` → `R-14` |

### RL — 2 findings

| Finding | What it records | Disposition |
|---|---|---|
| `RL-01` | The sales-leads route uses a route-local in-memory limiter keyed on a collapsed IP: it resets on restart and multiplies per replica. | `DUPLICATE_OF` `H-3` |
| `RL-02` | The authentication limiter is correctly fail-closed, action-isolated and audited on an undeclared bucket, and refuseUndeclaredAction both logs at error level and writes an INFRA_AUDIT event. | `POSITIVE_CONTROL` → `R-54` |

### TOOL — 5 findings

| Finding | What it records | Disposition |
|---|---|---|
| `TOOL-03` | The classifier's flat windows crossed function boundaries, so a guardless call could be classified by its neighbour's guard. | `NOT_A_SECURITY_RISK_WITH_REASON` |
| `TOOL-05` | Function-body detection accepted only a header ending in ) or =>, so a TypeScript return type fell through to module scope and two same-named accessors shared all consumers. | `NOT_A_SECURITY_RISK_WITH_REASON` |
| `TOOL-06` | A single regex with an optional return-type group over a 4 KB slice caused catastrophic backtracking and put unrelated identifiers into edge ids. | `NOT_A_SECURITY_RISK_WITH_REASON` |
| `TOOL-07` | A word-boundary match on operation names failed inside longer identifiers, so 181 of 269 edges came back with an unknown operation and audit loss was under-counted by more than half. | `NOT_A_SECURITY_RISK_WITH_REASON` |
| `TOOL-08` | The unconditional-delegation sweep claimed only the accessor's own guard, so a factory method with its own guard was reported as permanent delegation. | `NOT_A_SECURITY_RISK_WITH_REASON` |

### U — 3 findings

| Finding | What it records | Disposition |
|---|---|---|
| `U-1` | The avatar upload route performs no magic-byte validation (0 sniffImageMime) while the sibling article-cover route does, and the media module names that as a deliberate hardening the avatar route lacks. | `MAPPED_TO_RISK` → `R-22` |
| `U-2` | The avatar route enforces its 2 MB ceiling after await file.arrayBuffer(), so the buffer is materialised first; nginx permits 50 MB. | `MAPPED_TO_RISK` → `R-22` |
| `U-3` | The avatar POST gate is getCurrentUser() alone — no role and no permission — which is a policy question about who may publish to the public static surface rather than a demonstrated vulnerability. | `POLICY_QUESTION` → `R-23` |
<!-- /S1-BLOCK:findings -->

---

## 11. Plausible attack chains — defensive description only

No payload, no command and no exploit appears here. Each chain names the risks it composes and the link that
currently breaks it, because the broken link is the thing to protect.

**Chain A — forged credential to full role selection.** `R-01` (the signing key has no production guard) —
`R-02` (a payload without a session identifier is never revocation-checked) → the page gate and roughly 130
handlers accept the identity → `R-04` (no second factor exists to interrupt it) → `R-38` (the audit trail
cannot evidence what happened). **The link that breaks it, and it is measured:** the chain needs the legacy
signing variable to be absent, and the owner-supplied read-only check recorded in the S0 edge document shows
it present in the running container. **This chain is therefore not live as the platform now runs.** What
remains is that the guard is configuration: the boot check validates a different resolution order, so a deploy
omitting the variable would reopen the chain with nothing refusing the boot. That is why R-01's acceptance
criterion is a FATAL startup check rather than another observation.

**Chain B — credential reuse to tenant data.** `R-04` (no second factor) → authenticated access → `R-63` (no
central authorization choke point, so enforcement depth varies per handler) → `R-08` (six data layers with no
tenant predicate) → `R-09` (no database-level backstop to refuse). **The link that breaks it:** every tenant
route derives the organization from the actor and none accepts it from the client, and no cross-tenant read
has been demonstrated. This chain is the reason R-08 is scheduled fourth despite being unproven.

**Chain C — operator deceived during a gateway incident.** `R-32`/`R-36` (a database failure) → `R-34` (the
revocation answers "already revoked" while the credential stays valid) → `R-37` (no audit row records the
attempt) → `R-52` (no runbook tells the operator to verify) → the suspected-compromised gateway keeps signing
valid envelopes. **The link that breaks it:** nothing currently. This is the chain with no mitigating link,
which is why R-34 is the highest-priority item in the truthfulness cluster and why R-52's acceptance criteria
name it explicitly.

**Chain D — silent data loss presented as success.** `R-32` (any Prisma exception reroutes a write to process
memory) → the response asserts the database was used → `R-40` (nothing is logged) → `R-37` (no audit row) →
the write is gone at the next container restart and nobody knows. **The link that breaks it:** none for
detection; tenant isolation is preserved throughout, so this is an integrity and truthfulness chain, never a
disclosure one.

**Chain E — edge bypass to availability pressure.** `R-24` (the origin answers directly) → the edge's
absorption and filtering are skipped → the proxy has no request-rate or connection limit → the application's
per-action limiter is the only bound. **The link that breaks it:** the application limiter is fail-closed and
action-isolated, and a direct request actually makes its key *more* accurate. This chain degrades
availability; it does not reach data.

**Chain F — supply chain to production.** `R-43` (no static analysis, secret scanning, image scanning, bill
of materials or signing) → `R-46` (images are tags, not digests, so the bytes that run are not the bytes
reviewed) → `R-46` again (no capability dropping, no read-only root, unrestricted egress) → exfiltration.
**The link that breaks it:** every stage runs non-root, deployment is manual into a protected environment,
and third-party actions are commit-pinned.

**Chain G — stale instrument to a wrong decision.** `R-13` (the classifier cannot emit the two privileged
classifications) → a report shows zero tenant-administrative and zero owner-only handlers → a reader
concludes no such routes exist → a privilege question is considered answered. **The link that breaks it:**
S0-B-04 read the classifier and found 59 correctly enforced privileged operations, which is why this is an
assurance gap and not an authorization failure. It is in this list because it is the chain this programme
itself nearly walked.

---

## 12. Remediation order

The order is the register's `remediationPriority`, which is a severity-consistent total order: a risk is never
scheduled before a strictly more severe one. The checker enforces that, so this table cannot drift from the
severities.

**Three cheap actions that turn configuration guards into code guards.** The two preconditions that mattered
most are already settled by evidence recorded in S0, so none of these is another observation:

1. **A FATAL startup check for the legacy signing variable** (R-01). Today the variable being set is the only
   thing holding that risk shut, and the boot check validates a different resolution order, so a deploy that
   omits it would succeed silently. This converts a configuration guard into a code guard and is the single
   highest-value change in the register.
2. **Make session mode FATAL at startup** (R-03). A few lines; it closes the deferred half of the identity
   risk and removes the remaining route to a sid-less token. It sits at MEDIUM because its likelihood is
   genuinely low, and the severity-consistent ordering therefore places it after the HIGH work — which is
   why it is called out here instead.
3. **A read-only presence check for `ADMIN_EMAIL` and `ADMIN_PASSWORD`** (R-05). This one *is* still an
   observation, because unlike the other two no committed evidence settles it; it is the only outstanding
   presence question in the register.

**Then, by priority.** The phases are the proposed mapping in §15 and carry no authorisation.

| # | Risk | Severity | Production state | Proposed phase | Verification | Sequencing |
|---|---|---|---|---|---|---|
| 1 | `R-01` | **HIGH** | LATENT_CONFIG_GUARDED | S3_IDENTITY_SESSION_AND_MFA | AUTOMATED_TEST | — |
| 2 | `R-02` | **HIGH** | LATENT_CONFIG_GUARDED | S3_IDENTITY_SESSION_AND_MFA | AUTOMATED_TEST | — |
| 3 | `R-04` | **HIGH** | ACTIVE_CONFIRMED | S3_IDENTITY_SESSION_AND_MFA | AUTOMATED_TEST | — |
| 4 | `R-08` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | S4_TENANT_AND_SITE_ISOLATION | DETERMINISTIC_TOOL_GATE | — |
| 5 | `R-13` | **HIGH** | ASSURANCE_GAP | S4_TENANT_AND_SITE_ISOLATION | DETERMINISTIC_TOOL_GATE | — |
| 6 | `R-16` | **HIGH** | LATENT_CONFIG_GUARDED | S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS | AUTOMATED_TEST | — |
| 7 | `R-24` | **HIGH** | ACTIVE_CONFIRMED | S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING | EXTERNAL_VANTAGE_OBSERVATION | — |
| 8 | `R-26` | **HIGH** | ACTIVE_CONFIRMED | S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING | SOURCE_REVIEW | after `R-24` |
| 9 | `R-32` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS | DETERMINISTIC_TOOL_GATE | — |
| 10 | `R-33` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS | FAULT_INJECTION_REHEARSAL | — |
| 11 | `R-34` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS | FAULT_INJECTION_REHEARSAL | after `R-38` |
| 12 | `R-35` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS | FAULT_INJECTION_REHEARSAL | — |
| 13 | `R-36` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS | FAULT_INJECTION_REHEARSAL | — |
| 14 | `R-37` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | S8_AUDIT_AND_TAMPER_EVIDENCE | FAULT_INJECTION_REHEARSAL | — |
| 15 | `R-38` | **HIGH** | ACTIVE_CONFIRMED | S8_AUDIT_AND_TAMPER_EVIDENCE | AUTOMATED_TEST | after `R-47` |
| 16 | `R-40` | **HIGH** | ACTIVE_CONFIRMED | S9_OBSERVABILITY_AND_DETECTION | DETERMINISTIC_TOOL_GATE | — |
| 17 | `R-43` | **HIGH** | ACTIVE_CONFIRMED | S2_SCANNING_AND_SUPPLY_CHAIN | DETERMINISTIC_TOOL_GATE | — |
| 18 | `R-46` | **HIGH** | ACTIVE_CONFIRMED | S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING | FAULT_INJECTION_REHEARSAL | — |
| 19 | `R-05` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | S3_IDENTITY_SESSION_AND_MFA | OWNER_READ_ONLY_PRODUCTION_CHECK | — |
| 20 | `R-09` | **HIGH** | ACTIVE_CONFIRMED | S4_TENANT_AND_SITE_ISOLATION | FAULT_INJECTION_REHEARSAL | after `R-47` |
| 21 | `R-10` | **HIGH** | LATENT_CONFIG_GUARDED | S4_TENANT_AND_SITE_ISOLATION | AUTOMATED_TEST | — |
| 22 | `R-14` | **HIGH** | ASSURANCE_GAP | S4_TENANT_AND_SITE_ISOLATION | AUTOMATED_TEST | after `R-13` |
| 23 | `R-18` | **HIGH** | POLICY_AMBIGUITY | OWNER_POLICY_DECISION | OWNER_POLICY_STATEMENT | — |
| 24 | `R-20` | **HIGH** | ACTIVE_CONFIRMED | S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS | AUTOMATED_TEST | — |
| 25 | `R-22` | **HIGH** | ACTIVE_CONFIRMED | S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS | AUTOMATED_TEST | — |
| 26 | `R-25` | **HIGH** | ACTIVE_CONFIRMED | S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING | EXTERNAL_VANTAGE_OBSERVATION | — |
| 27 | `R-39` | **HIGH** | CODE_CONFIRMED_RUNTIME_UNPROVEN | S9_OBSERVABILITY_AND_DETECTION | FAULT_INJECTION_REHEARSAL | after `R-37` |
| 28 | `R-45` | **HIGH** | ASSURANCE_GAP | S2_SCANNING_AND_SUPPLY_CHAIN | AUTOMATED_TEST | — |
| 29 | `R-52` | **HIGH** | ACTIVE_CONFIRMED | S12_DR_RUNBOOKS_AND_REHEARSAL | FAULT_INJECTION_REHEARSAL | — |
| 30 | `R-63` | **HIGH** | ACTIVE_CONFIRMED | S4_TENANT_AND_SITE_ISOLATION | DETERMINISTIC_TOOL_GATE | — |
| 31 | `R-64` | **HIGH** | ASSURANCE_GAP | S3_IDENTITY_SESSION_AND_MFA | SOURCE_REVIEW | — |
| 32 | `R-19` | **HIGH** | ACTIVE_CONFIRMED | S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS | AUTOMATED_TEST | — |
| 33 | `R-21` | **HIGH** | ACTIVE_CONFIRMED | S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS | AUTOMATED_TEST | — |
| 34 | `R-27` | **HIGH** | ACTIVE_CONFIRMED | S9_OBSERVABILITY_AND_DETECTION | SOURCE_REVIEW | — |
| 35 | `R-29` | **HIGH** | ASSURANCE_GAP | S9_OBSERVABILITY_AND_DETECTION | DETERMINISTIC_TOOL_GATE | — |
| 36 | `R-47` | **MEDIUM** | ACTIVE_CONFIRMED | S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING | FAULT_INJECTION_REHEARSAL | — |
| 37 | `R-03` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | S3_IDENTITY_SESSION_AND_MFA | AUTOMATED_TEST | — |
| 38 | `R-06` | **MEDIUM** | ASSURANCE_GAP | S3_IDENTITY_SESSION_AND_MFA | AUTOMATED_TEST | — |
| 39 | `R-44` | **MEDIUM** | ACTIVE_CONFIRMED | S2_SCANNING_AND_SUPPLY_CHAIN | DETERMINISTIC_TOOL_GATE | — |
| 40 | `R-49` | **MEDIUM** | ACTIVE_CONFIRMED | S6_OT_GATEWAY_AND_CRYPTO_LIFECYCLE | SOURCE_REVIEW | after `R-34` |
| 41 | `R-51` | **MEDIUM** | ASSURANCE_GAP | S12_DR_RUNBOOKS_AND_REHEARSAL | FAULT_INJECTION_REHEARSAL | — |
| 42 | `R-07` | **MEDIUM** | ACTIVE_CONFIRMED | S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS | AUTOMATED_TEST | — |
| 43 | `R-11` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | S4_TENANT_AND_SITE_ISOLATION | AUTOMATED_TEST | — |
| 44 | `R-12` | **MEDIUM** | ASSURANCE_GAP | S4_TENANT_AND_SITE_ISOLATION | DETERMINISTIC_TOOL_GATE | — |
| 45 | `R-15` | **MEDIUM** | POLICY_AMBIGUITY | OWNER_POLICY_DECISION | OWNER_POLICY_STATEMENT | — |
| 46 | `R-17` | **MEDIUM** | ACTIVE_CONFIRMED | S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS | AUTOMATED_TEST | — |
| 47 | `R-23` | **MEDIUM** | POLICY_AMBIGUITY | OWNER_POLICY_DECISION | OWNER_POLICY_STATEMENT | — |
| 48 | `R-30` | **MEDIUM** | ASSURANCE_GAP | S9_OBSERVABILITY_AND_DETECTION | EXTERNAL_VANTAGE_OBSERVATION | — |
| 49 | `R-41` | **MEDIUM** | CODE_CONFIRMED_RUNTIME_UNPROVEN | S3_IDENTITY_SESSION_AND_MFA | AUTOMATED_TEST | — |
| 50 | `R-42` | **MEDIUM** | ASSURANCE_GAP | S4_TENANT_AND_SITE_ISOLATION | DETERMINISTIC_TOOL_GATE | — |
| 51 | `R-48` | **MEDIUM** | ACTIVE_CONFIRMED | S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING | OWNER_POLICY_STATEMENT | after `R-46` |
| 52 | `R-31` | **MEDIUM** | ACTIVE_CONFIRMED | S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING | AUTOMATED_TEST | — |
| 53 | `R-28` | **LOW** | ACTIVE_CONFIRMED | S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING | EXTERNAL_VANTAGE_OBSERVATION | — |
| 54 | `R-50` | **INFORMATIONAL** | POSITIVE_CONTROL | S10_OT_PRECONDITIONS_BEFORE_PROTOCOL_CLIENTS | DETERMINISTIC_TOOL_GATE | — |
| 55 | `R-53` | **INFORMATIONAL** | POSITIVE_CONTROL | S1_NO_CHANGE_REQUIRED | AUTOMATED_TEST | — |
| 56 | `R-54` | **INFORMATIONAL** | POSITIVE_CONTROL | S1_NO_CHANGE_REQUIRED | AUTOMATED_TEST | — |
| 57 | `R-55` | **INFORMATIONAL** | POSITIVE_CONTROL | S1_NO_CHANGE_REQUIRED | AUTOMATED_TEST | — |
| 58 | `R-56` | **INFORMATIONAL** | POSITIVE_CONTROL | S1_NO_CHANGE_REQUIRED | AUTOMATED_TEST | — |
| 59 | `R-57` | **INFORMATIONAL** | POSITIVE_CONTROL | S1_NO_CHANGE_REQUIRED | SOURCE_REVIEW | — |
| 60 | `R-58` | **INFORMATIONAL** | POSITIVE_CONTROL | S1_NO_CHANGE_REQUIRED | DETERMINISTIC_TOOL_GATE | — |
| 61 | `R-59` | **INFORMATIONAL** | POSITIVE_CONTROL | S1_NO_CHANGE_REQUIRED | AUTOMATED_TEST | — |
| 62 | `R-60` | **INFORMATIONAL** | POSITIVE_CONTROL | S1_NO_CHANGE_REQUIRED | DETERMINISTIC_TOOL_GATE | — |
| 63 | `R-61` | **INFORMATIONAL** | POSITIVE_CONTROL | S1_NO_CHANGE_REQUIRED | DETERMINISTIC_TOOL_GATE | — |
| 64 | `R-62` | **INFORMATIONAL** | POSITIVE_CONTROL | S1_NO_CHANGE_REQUIRED | AUTOMATED_TEST | — |

---

## 13. Acceptance criteria

Every CRITICAL and HIGH risk carries acceptance criteria and a stated residual risk; the checker fails if one
does not. The criteria are in the register, per risk, so they travel with the entry rather than with this
document. Four properties were required of each:

- **Falsifiable.** "Harden the upload route" is not a criterion; "a mislabelled file is refused, with a test"
  is.
- **Verifiable by a named method.** Each risk declares one of source review, an automated test, a
  deterministic tool gate, a fault-injection rehearsal, an owner read-only production check, an external
  vantage observation, or an owner policy statement.
- **Honest about sequencing.** Where a remediation would be unsafe before another, the dependency is
  recorded. The load-bearing one: **R-26 must not be closed before R-24.** Teaching the application to trust
  the edge's client-address header while the origin is still directly reachable would convert a
  spoofing-resistant design into a spoofable one. That is the single most important ordering constraint here.
- **Closed only when complete.** R-64 is explicitly not closable by examining a subset of its five surfaces.

---

## 14. Residual risk and the limits of this analysis

### 14.1 What remains after every criterion in this register is met

- **Static analysis cannot prove a guard is reached on every branch.** Rebuilding the privilege classifier
  (R-13) makes it accurate about declared guards and leaves that limit intact. It must stay stated wherever
  the output is cited.
- **Row-level security protects rows, not application-computed aggregates**, and cannot help where the
  platform legitimately holds cross-tenant authority — the 135 platform-administrative handlers.
- **An audit chain detects tampering; it does not prevent it**, and it is only as trustworthy as the place
  its anchor is kept.
- **A second factor does not reach non-interactive identities** — gateway secrets, worker tokens, the seed
  account unless it is covered deliberately.
- **Refusing instead of falling back converts a silent integrity defect into a visible outage.** That is the
  correct trade and it changes the platform's availability profile; R-32 and R-03 both say so.
- **An allowlist of a provider's published ranges is only as current as its refresh procedure**, and does not
  stop an attacker who proxies through the edge itself.
- **A rehearsed restore in an isolated environment does not prove recovery under production conditions.** No
  destructive operation against production may be used to close that gap.

### 14.2 Limits of this phase, stated as limits

1. **Nothing was executed against any environment.** No request, no scanner, no fault injection, no database
   connection, no container change. <!-- S1-FACT:STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN:W -->Twelve<!-- /S1-FACT --> risks are `CODE_CONFIRMED_RUNTIME_UNPROVEN` for that reason.
2. **No test was run in this worktree, because it has no installed dependencies.** This is why R-45 exists:
   24 of the 29 Phase 99 closures rest on a prior phase's evidence, including the one critical and three high
   findings. Five of the 29 were independently corroborated in source while other work was done, and the five
   tool defects are this programme's own evidence.
3. **Likelihood is a judgement expressed as four integers.** The arithmetic is reproducible; the inputs are
   reasoned estimates from reading code. Two were corrected during this phase when the method produced a
   CRITICAL that the evidence did not support — R-20's integrity factor and R-26's exploitability factor —
   and both corrections are recorded as factor changes rather than as severity overrides. The evidence
   reconciliation changed **no** factor: R-01's and R-02's `reachability` of 1 already stood for a path gated
   by a condition that does not hold, and the reconciliation replaced an unchecked basis with a measured one.
   Each carries an `evidenceReconciliation` note saying so, because a factor that stays the same for a
   different reason is exactly where a register can quietly mislead.
4. **R-64 carries `confidence: LOW` and is the least reliable entry here.** It scores the risk of not knowing,
   derived from what five unexamined surfaces *are* rather than from what they contain, and it may move
   sharply once they are read.
5. **The tokenizer limits of the `getPrisma` instrument are inherited.** Regex literals are not parsed, a
   window has a character ceiling, and the public-path tag is a floor rather than a measurement. Twelve
   misclassifications were found by screening the residual (R-60); the same class may exist wherever a rule
   reads a return value without reading the caller.
6. **Two documentation defects were found and deliberately not fixed.** The `getPrisma` classification
   document states 79 selftests in one section and 75 in two others, which is cosmetic. The legacy-token
   document still calls the signing-variable precondition unverified while the edge document records the <!-- S1-HISTORICAL-SUPERSEDED -->
   presence check and the inactive verdict, which is **not** cosmetic: this register was built from the stale
   sentence and reported a settled condition as unknown until the reconciliation. The order authorising S1
   limits the deliverables to four paths and neither document is among them, so both are disclosed under R-29
   rather than corrected, and the checker now carries the gate that would have caught the second.
7. **Severity is this phase's judgement and it supersedes earlier provisional ratings.** The S0 public-route
   inventory recorded a provisional MEDIUM for the salt finding; the declared method places R-16 at HIGH, and
   the divergence is recorded on the risk rather than resolved silently in either direction.
8. **A green checker run means the register is well-formed.** It says nothing about whether any risk is
   mitigated, and the tool's own header says so.
9. **The report is generated, and the generator is not one of the four deliverables.** The summary counters
   and every generated region — the derived lead and the verdict panel of §1, the verdict panel of §16, the
   finding tables (§10.3) and the appendices — are rendered by `scripts/security/s1/risk-register-check.mjs` and compared with this document **byte for
   byte**: the opening marker, one line feed, the rendered text, one line feed, the closing marker, nothing
   trimmed. A blank line, a trailing space, a tab or a carriage return inside a region is therefore drift (exit
   21), which an earlier build did not detect because it trimmed both sides. The thin script that assembles the
   narrative around those regions is not a deliverable, which is a disclosed limit on regenerating the prose
   rather than on verifying it.
10. **Line endings are pinned by rule, and the rule takes effect when it is committed.** The four artifacts carry
    an `eol=lf` rule in `.gitattributes`. That file is part of the same uncommitted change set, so the hash this
    register is verified against survives a checkout on either platform only once the rule is committed with
    them. The rule arrived after the content did, which is why it is recorded here.
11. **Some gates are consistency gates, and the distinction matters.** The summary counters, the
    generated regions and every figure written into the prose through a fact marker are rendered from the
    register by the same functions in `risk-register-check.mjs` that the checker then compares this document
    against. So **exits 13, 21 and 24 prove consistency and absence of drift, not external truth**: they cannot
    detect a register that is internally perfect and wrong about the platform. The gates that reach outside the
    register are the source-universe closure, which extracts identifiers from the eight S0 documents and the
    Phase 99 register and fails on any divergence; the evidence-path check, which requires every cited path to
    exist (existence, not content); and the arithmetic, which is re-derived from the factors on every run and
    was reproduced independently by three reviews. A green `check` means the structure, the consistency and
    every declared invariant hold — it does not mean any security claim has been observed at runtime.
12. **Why the contradiction scan reads only the hand-authored prose, and what its one exemption can do.**
    Generated regions reproduce the register verbatim and are already gated twice: byte for byte against the
    renderer, and on the JSON side by the runtime-evidence rules. Scanning them again would attribute a matrix
    row to no particular risk and misread a legitimately open question — R-05's precondition genuinely is
    unverified, with no runtime evidence settling it — as a contradiction. **This is not a hole:** one validated
    parser decides what a generated region is, and it refuses an unknown block name, an unbalanced or
    mismatched marker, a duplicate, a nest and a reordering. **The historical marker is a different matter, and
    an earlier version of this paragraph overstated it.** A line-level exemption cannot tell a quotation from a
    live claim, and the check that refused it on a "current obligation" was a short list of phrases that a
    differently-phrased live claim, or a historical sentence followed by a live one on the same line, passed.
    The marker is therefore *pinned*: the checker holds the exact number of marked lines and the digest of each
    (whitespace collapsed and the ends trimmed, nothing else normalised), and `check` refuses a third marker, a
    missing one, an edited one, a second marker on one line and a look-alike that is not the exact marker. Adding
    a quotation means reviewing its line and adding its digest to the pin in the same change — a deliberate,
    visible act, not a keyword.
13. **Exact-byte gates and semantic gates are different things.** The block comparison is exact. The
    contradiction scan, the secret detector, the forbidden-content rules, the verification-linkage phrases and the
    narrative-figure completeness scan are lexical: regular expressions over text. They catch the forms they
    name, were hardened against the specific bypasses reviewers produced, and are not proven complete. They
    cannot catch a paraphrase of a contradiction, a figure written in words the completeness scan does not
    recognise, or a criterion whose operational phrase is present but whose meaning is empty.
14. **What the secret detector can and cannot see.** A key is judged by its whole name, normalised (camel case
    and hyphens become snake case, leading underscores dropped, so `_AUTH_SECRET` and `__SMTP_PASS` are judged
    like the names they wrap). A name is sensitive when one of `secret`, `password`, `passwd`, `pass`, `pwd`,
    `passphrase`, `token`, `api_key`, `apikey`, `access_key`, `private_key`, `signing_key`, `client_secret` or
    `secret_key` occurs anywhere in it **as whole segments**, whatever precedes or follows it. **The rule fails
    closed on a qualifier it has never seen:** an earlier build stripped a fixed list of trailing qualifiers and
    then judged the last segment, so any qualifier missing from that list (`_LIVE`, `_LEGACY`, `_FALLBACK`,
    `_ENC`, `_EU`, `_BLUE`, `_CANARY` …) turned a credential name harmless — `STRIPE_SECRET_KEY_LIVE` and
    `SMTP_PASS_FALLBACK` passed. The only way out is now an explicit, closed list of FINAL segments that change
    what the value *is* rather than qualifying it: `_FILE`, `_PATH`, `_DIR`, `_ID`, `_HASH`, `_TTL`, `_COUNT`,
    `_LENGTH`, `_EXPIRY`, `_POLICY`, `_URL`, `_NAME`, `_STATE`, `_STATUS`. So a key-file path, a key identifier,
    a password hash and an evidence state are not credentials, while anything else after the family still is.
    Words that merely contain a family as letters rather than as a segment (`bypass`, `compass`, `passport`) are
    not names of credentials. **A number does not make a name harmless:** trailing digits are split off each
    segment before the family is compared, so `AUTH_SECRET2`, `apiKey2`, `jwtSecret3` and `SMTP_PASS2026` are
    judged as the names they number, while `TOKENIZER2`, `PASSPORT2` and `SECRETARY2` stay the ordinary words
    they are, and `PASSWORD_HASH2` is still a hash. A dot separates segments like an underscore, so
    `jwt.secret.legacy` and `db.password.prod` are credential names in prose, YAML and JSON alike. A name written
    without separators is one segment, and it is sensitive when it ends in `secret`, `password`, `passwd`,
    `passphrase`, `token`, `apikey`, `accesskey`, `privatekey`, `signingkey`, `secretkey` or `clientsecret`
    (`JWTSECRET`, `DBPASSWORD`, `APIKEY2`); `pass` and `pwd` are deliberately absent from that compact list,
    because `compass`, `bypass` and `overpass` end in them. Every value under a sensitive key is a credential
    unless it is, as a whole, one of a short list of placeholders (`SET`, `UNSET`, `MISSING`, `REDACTED`, `PLACEHOLDER`, `EXAMPLE`, `<redacted>`,
    `<secret>`, a complete `${NAME}`, or nothing) — no shape of value is exempt — **with one named exception:
    `changeme`**, which the register must be able to quote because a finding is about removing that weak
    default; it is accepted as a value and nowhere widened. A quoted placeholder counts only when nothing but
    whitespace or closing punctuation touches the closing quote, so text glued to it (`"SET"realvalue`) is a
    value. Credentials in URI userinfo are caught for `postgres`, `postgresql`, `mysql`, `mongodb`,
    `mongodb+srv`, `redis`, `rediss`, `valkey`, `valkeys`, `memcached`, `amqp`, `amqps`, `ldap`, `ldaps`, `http`
    and `https`, including with an empty user name (`redis://:<password>@host`), unless the password is itself
    one of the placeholders; a URI with no userinfo at all is not a finding. The register is scanned on **four**
    levels, de-duplicated so one credential is one finding: every property NAME decoded with its structured
    path, every property whose own name is sensitive, every string leaf decoded, and the raw text with JSON
    escapes undone. The name level is the one an earlier build lacked: names were seen only in the raw file,
    where `"note\nAKIA…"` is the characters `note\nAKIA…` and the escape glues a letter to the token, hiding it
    from a word-boundary rule; after parsing, a name is scanned like any other string, at any depth and through
    arrays. The raw level still earns its place, because a duplicated JSON property is dropped by the parser and
    exists only there. A register that does not parse fails. **Not seen:** a credential under a key that carries
    no family segment, a compact name ending in `pass` or `pwd`, a key and value on different lines or in
    different table cells, and a credential that has no key at all and none of the token shapes. The tracked
    example environment files are used as a source of variable NAMES in the selftest; no value is read.
15. **Exit codes.** Every code is named in one table in the checker. Three codes are shared by two gates each —
    3 (a duplicate risk or finding identifier), 7 (a stored score or severity that differs from the method, and a
    CRITICAL without the clamp) and 10 (remediation ownership and remediation order) — and are declared as
    shared; no other code is. Exit 1 means a deliverable is missing. An internal failure — a register that is
    not JSON, a structure the gates cannot read — is exit 70 and prints one line, never a stack trace; before
    this revision such a crash also ended as exit 1, so a reader could not tell a missing file from a crash.
    A register that is not readable JSON prints a fixed logical message, never the parser's own text, which
    quotes the file's first characters. Any other internal error prints only the first line of its message, with
    every absolute path redacted: a quoted path is replaced as one span, so the message around it stays
    readable; an unquoted path is replaced from its first character to the end of the line, because a path may
    contain spaces and nothing else marks where it ends. Exit 27 means the register is nested deeper or holds
    more values than the structure budget the scanners read in full (`STRUCTURE_LIMITS` in the checker, far above
    anything the register contains);
    the scanners walk iteratively, report the budget as a finding instead of stopping quietly, and the gate
    refuses such a register before any other gate reads it.
    Exit 25 means the mutation manifest (Appendix E) is stale, recorded against a different manifest, records
    anything other than a targeted kill, or records a placebo control that did not behave as declared. Exit 26
    means a finding in the independent-review closure table (Appendix D) is no longer in a closed status: the
    table's prose and the gate are derived from the same constant, so a reopened finding cannot be described as
    closed. Exit 14 means the register is correct in content and wrong only in form: the
    derived-value gates run before the canonical-form gate, because the renderer recomputes those values and
    would otherwise have reported a tampered score or dominant dimension only as exit 14, leaving exits 7 and 20
    unreachable from the command line. Each code is reached from the real command line by the selftest, in a
    copy outside the repository.
16. **CI wiring — `DEFERRED_TO_SECURITY_INTEGRATION_PHASE`.** The checker and its selftest are not wired into
    `package.json` or any workflow, so none of the gates described here runs automatically. This does not block
    committing the artifacts, because their content is verified by the commands in §18; it must be closed before
    any of them is relied on as a continuous-integration control. This phase changed neither `package.json` nor
    `.github/workflows`.
17. **Token shapes are matched whole.** An access-key, GitHub-token, Slack-token or three-part JWT shape is
    recognised as one unbroken token. A token split by whitespace, wrapped across lines, interleaved with markup
    or assembled from fragments is not recognised, and neither is a credential encoded (base64, hex, URL
    escaping) into another form. These are limits of a shape scanner, stated rather than closed.
18. **A mutant is evidence only when it is killed for the right reason.** Appendix E records one source
    mutation per row, the selftest named for it, and the result of applying it in a temporary copy outside the
    repository. **A mutation removes its own anchor**, so in the mutated copy the manifest in the checker is
    stale and the manifest gate (exit 25) fires before the gate under test: every command-line test then fails
    whatever the mutation did, and a red suite alone proves nothing. Three things close that gap. The copy is
    **rebound** — the manifest region of the copy is re-rendered without the entries whose anchors the change
    removed and re-bound to that reduced list, and Appendix E of the copy is re-rendered from it, by the
    unmutated renderer; only that metadata is touched, the mutated code is never repaired, and a rebinding that
    does not pass the copy's own manifest gate is an `INVALID_MUTANT`, never a kill. Only the **named test** is
    run, selected by its exact name, so no other test's failure can be mistaken for a detection. The failure
    must carry the mutant's declared **fingerprint**, and a failure that is a manifest-gate failure, a manifest
    drift or a setup error is excluded by rule. Finally a **placebo** — a semantically equivalent rewrite of the
    same source text — is applied to an identically rebound copy, and the named test must stay green there, so a
    failure produced by the scaffolding rather than by the change voids the proof. Everything else is recorded
    as `ONLY_INCIDENTAL`, `SURVIVED` or `INVALID_MUTANT`, and the campaign exits non-zero. Six **placebo
    controls** test that classification itself, each with the outcome it must produce: a semantic no-op and a
    rewritten comment must `SURVIVE`; a manifest drift, an earlier gate forced to fire and an unrelated failure
    of the same named test must be `ONLY_INCIDENTAL`; a module made unparseable must be `INVALID_MUTANT`. None
    of them may be a targeted kill, and `check` refuses a record in which any of them is.
19. **What the selftest's figures mean.** The suite's test count is what `node --test` reports. Assertion
    counts in reviews of this work have differed, because an assertion inside a loop or a helper runs many
    times and is written once: any such figure is a count of assertion *call sites* in the source, it is not
    quoted in these deliverables, and nothing is gated on it. What is gated is that **no test is
    assertionless**, and it is now observed rather than read: every test runs through an assertion ledger that
    credits each assertion, when it runs, to the test that made it, and a test that ends without one fails. An
    earlier build scanned the suite's source with a regular expression instead, which counted an assertion in a
    comment or a string and credited a test with the assertions of the helper written after it. The ledger is
    itself proven on fixture tests — a comment, a string, a helper that asserts nothing, `function` and async
    callbacks, a template-literal name, and a timer that asserts after its own test has ended — and the last test
    of the suite reconciles the tests registered with the tests that ran, instead of trusting a minimum count.
    Under a name filter only the filtered tests run, so that reconciliation gates complete runs only. What the
    ledger cannot prove is that an assertion is meaningful: a test that asserts something trivially true passes.
    The suite also checks that every named test a mutant relies on exists in that file.
20. **The checker refuses to be skipped or reformatted around.** Run through a symbolic link or a Windows
    junction, it resolves both its own path and the invoked path to their real paths before deciding that it is
    the program being run, so a linked invocation checks instead of exiting 0 having done nothing. A block
    marker line must be exactly the canonical marker: leading or trailing whitespace, a tab or altered inner
    spacing on a marker line is a violation, not a tolerated variant.
21. **System paths and probes are recognised by what they are, not by what wraps them.** A system root
    (`etc`, `usr`, `proc`, `opt`, `srv`, `var/log`, `var/lib`) followed by a further segment is found wherever it
    stands — after a brace, an angle bracket, a comma, a semicolon, a curly quote, a guillemet, a dash, inside a
    code span, a table cell or emphasis, and in a `file://` URI. An earlier rule listed the wrappers it accepted,
    so any wrapper missing from the list let the path through. What disqualifies a root is only what makes it the
    tail of something else: a letter, a digit or a path character before the slash, as in a relative path or a
    URL, or a name that runs on past the root. A root named on its own, without a further segment, is prose. The
    probe rule also covers `nikto`, `sqlmap`, `sslscan`, `hydra` and `ncat` when a flag, a URL, an address or a
    dotted host follows, and `ss` only with an option cluster, so a sentence that names one of these tools still
    passes.
22. **One value can trip two gates, and the command line names the earlier one.** A credential in URI userinfo
    inside the register is also an absolute-path hit for the register's older rule (exit 11), because the scheme
    separator looks like a drive letter followed by a slash; that gate runs first, so the command line reports
    exit 11, not 22. Both findings exist — the selftest proves the secret detector sees the credential directly,
    the older rule sees the separator, and `runGates` stops at 11 — so the exit code says which gate fired first,
    not which detector saw the value.

---

## 15. Proposed path S2–S12 — `PROPOSED_NOT_AUTHORIZED`

**No document in this repository formally defines S2 through S12.** Six of them are nevertheless anchored in
an existing S0 sentence that assigns a question to a numbered phase; those anchors are preserved below and
cited. The rest are this phase's proposal. The whole mapping carries the label
**`PROPOSED_NOT_AUTHORIZED`** and confers no authority to begin any phase.

| Phase | Scope | Basis | Risks |
|---|---|---|---|
| **S2** scanning and supply chain | static analysis, secret scanning of tree and history, image and infrastructure scanning, bill of materials, artifact signing; re-verify the Phase 99 closures | **anchored** — the S0 lock §8 states "No scanner was run… S2 owns that" | R-43, R-44, R-45 |
| **S3** identity, session and multi-factor | the signing-key guard, the sid-less read-side guard, session mode FATAL, a second factor and step-up, the seed account, the password-hash authority, suspension atomicity, the five unexamined surfaces | **anchored** — the lock §7 assigns the legacy-token issuer trace to S3; the architecture inventory §2.1 and §3.1 both defer to S3 | R-01, R-02, R-03, R-04, R-05, R-06, R-41, R-64 |
| **S4** tenant and site isolation | identify and close the unscoped data layers, decide the database backstop, site-filter fail-closed and coverage, cache key namespacing, the classifier rebuild, the negative-test matrix, the central authorization decision, dead surface | **anchored** — the architecture inventory §4.3 and §5.5 and the lock §7 all assign these to S4 | R-08, R-09, R-10, R-11, R-12, R-13, R-14, R-42, R-63 |
| **S5** mutation surface and abuse controls | the pseudonymisation key and guard, the enumeration oracle, idempotency and the shared limiter, registration validation and transaction, bucket separation, upload hardening, the misclassified commercial surface | **anchored** — the lock §4 and the data-flow document §5 assign the mutation surface to S4/S5, and the webhook confirmation to S5 | R-07, R-16, R-17, R-19, R-20, R-21, R-22 |
| **S6** gateway boundary and crypto lifecycle | cross-gateway key separation, key expiry and a dual-key rotation window, the mutual-certificate decision | **anchored** — the architecture inventory §6 states "S6 and S10 own closing or formally accepting this" | R-49 |
| **S7** failure semantics and truthfulness | repository fallback refusal, external acknowledgement truthfulness, gateway revocation truthfulness, the third state for industrial reads, outage status mapping | **proposed** — no prior phase number is assigned to this cluster, and it is the largest in the register | R-32, R-33, R-34, R-35, R-36 |
| **S8** audit and tamper evidence | an audit path outside the database's failure domain, a verifiable chain, required tenancy, retention and deletion authority | **proposed** | R-37, R-38 |
| **S9** observability and detection | instrument every degraded path, login-failure durability, the stale security comments, documentation drift, origin path stability | **proposed** | R-27, R-29, R-30, R-39, R-40 |
| **S10** preconditions before any protocol client | the gate that fails a build when an industrial protocol package appears, and the written preconditions for adding one | **anchored** — the data-flow document TB-12 states "S10 must define the preconditions *before* any such dependency is added" | R-50 |
| **S11** infrastructure and container hardening | the origin allowlist and proxy limits, the transport-security header, trusted proxy and one address resolver, container runtime hardening, database role separation and transport, intra-cluster transport, version suppression, the health surface | **proposed**, except the origin question which S0-B-03 closed and handed forward | R-24, R-25, R-26, R-28, R-31, R-46, R-47, R-48 |
| **S12** recovery, runbooks and rehearsal | execute a restore with measured objectives, write and rehearse the incident runbooks | **proposed**; the architecture inventory §9.2 notes Gate I has real machinery behind it and that S0 does not assert it passes | R-51, R-52 |
| **Owner decision** | the four organization-governance questions, the certificate-token question, the two public-content questions | **anchored** — each is recorded as a policy ambiguity requiring a decision rather than a measurement | R-15, R-18, R-23 |

<!-- S1-FACT:STATE_POSITIVE_CONTROL:W -->Eleven<!-- /S1-FACT --> positive controls (R-50, R-53 through R-62) carry the phase `S1_NO_CHANGE_REQUIRED`, with acceptance
criteria whose purpose is to keep them from eroding rather than to change anything.

---

## 16. Verdict, and what this phase did not do

<!-- S1-BLOCK:verdict -->
```
S1_STATUS:                       COMPLETE
S1_RISKS:                        64
S1_FINDINGS:                     161        coverage 100%        orphans 0
S1_CRITICAL:                     0          (2 clamped from CRITICAL to HIGH, each recorded)
S1_HIGH:                         35
S1_MEDIUM:                       17
S1_LOW:                          1
S1_INFORMATIONAL:                11         (11 positive controls)
ACTIVE_PRODUCTION_EXPOSURES:     24
LATENT_DESIGN_FLAWS:             16         (12 code-confirmed runtime-unproven + 4 config-guarded)
CONFIG_GUARDED_WITH_EVIDENCE:    4          (each names its guard)
RISKS_WITH_RUNTIME_EVIDENCE:     3          (all settled from committed S0 evidence)
RUNTIME_EVIDENCE_CONFLICTS:      0
ASSURANCE_GAPS:                  10
POLICY_QUESTIONS:                3
PROVEN_AUTHENTICATION_BYPASS:    NONE DEMONSTRATED
PROVEN_TENANT_ISOLATION_BYPASS:  NONE DEMONSTRATED
PRODUCT_BYTES_CHANGED:           0
S1_COMMITTED:                    NO
```
<!-- /S1-BLOCK:verdict -->

**What this phase did NOT establish.** It is a documentation and analysis phase over committed evidence. No
scanner ran. No request was sent to any environment. No fault was injected and no database was stopped. No
exploit, token, cookie or payload was created. No environment file or secret was read. No product file,
route, guard, middleware, proxy configuration, container definition, schema, migration or workflow was
changed, and nothing was committed.

**The one sentence to carry forward.** The absence of a critical finding here is the result of a method that
refuses to call an unreachable path critical — not evidence that no critical path exists. For the four
configuration-guarded risks the guard is a value in an environment, named and cited; moving each of those
guards into code is what the first entries of the remediation order are for.

---

## 19. Next safe action

<!-- S1-NEXT-SAFE-ACTION -->

**Hand this register to independent review.** It is internally consistent, arithmetically reproducible, fully
covering, and aligned to the evidence already committed in S0. Nothing further can be learned about it without
either a reviewer's disagreement or work that belongs to a later phase.

The single highest-value piece of work it points at is **R-01's acceptance criterion**: a FATAL startup check
for the legacy signing variable, so the guard that currently holds Chain A shut moves out of the environment
and into code. It is a code change in an authorised later phase, requires no production access, and needs no
further observation — the register already holds the evidence that makes it the right first move.

**No production or network command is requested, here or anywhere else in this document.** Every presence
question this register could settle from committed evidence has been settled; the only one still open is
recorded on R-05 as that risk's own acceptance criterion rather than as a programme-level action.

---

## 17. Appendices

Everything in these appendices is **rendered by the checker and compared to this document byte for
byte**. A hand edit inside any block fails `check` with exit 21, so no figure here can drift from the
register, and the report can be regenerated from a committed file rather than from a scratch script.

### Appendix A — the management matrix

For every risk: what already protects it, what does not, the acceptance criteria, the declared
verification method and the stated residual. The first independent review found that none of this was
visible in the management document, only in the machine register.

<!-- S1-BLOCK:matrix -->
#### `R-01` — The legacy session HMAC key has no production guard, so a forged cookie can select any role

**HIGH** (4×5=20) · LATENT_CONFIG_GUARDED · dominant impact **CONFIDENTIALITY + INTEGRITY** · confidence HIGH · priority 1 · phase S3_IDENTITY_SESSION_AND_MFA

| | |
|---|---|
| **Existing controls** | The variable is set in the observed container, which is what currently holds this shut — a configuration property, not a code property.<br>• verifySession enforces an absolute 30-day ceiling on the payload's iat, so a forged token is bounded rather than eternal.<br>• jwtSecret() does throw in production, so the access-token path is guarded even though this one is not. |
| **Control gaps** | No FATAL startup check covers AUTH_SECRET itself.<br>• The guard the platform relies on evaluates a different resolution order from the primitive that consumes the key.<br>• Combined with R-02, a forged payload may omit sid and is then never revocation-checked. |
| **Acceptance criteria** | A FATAL startup check refuses to boot in production when the legacy signing variable is absent or equal to the published fallback constant, which moves the guard out of configuration and into code.<br>• The fallback constant is removed from the production code path, or made reachable only when NODE_ENV is not production, matching jwtSecret().<br>• A test asserts that signSession and verifySession cannot be reached in production without an explicit AUTH_SECRET. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | The structural defect survives the favourable configuration: the boot-time guard the platform relies on evaluates a different resolution order from the primitive that consumes this key, so nothing stops a future deploy from omitting the variable. A presence check establishes presence and nothing else — strength, entropy, independence from the other accepted names, replica consistency, rotation and whether the value was ever disclosed all lie outside it, and none of them is claimed here. |

#### `R-02` — A session token without a sid bypasses the canonical revocation check, with no mode guard on the read side

**HIGH** (4×5=20) · LATENT_CONFIG_GUARDED · dominant impact **CONFIDENTIALITY + INTEGRITY** · confidence HIGH · priority 2 · phase S3_IDENTITY_SESSION_AND_MFA

| | |
|---|---|
| **Existing controls** | The observed storage mode is database, so the mint side is active and strong: the session identifier is guaranteed non-null or the request fails closed with no cookies.<br>• verifySession's 30-day absolute iat ceiling bounds any such token.<br>• Logout clears all three cookies even when the server-side revoke throws. |
| **Control gaps** | The protection is entirely on the mint side; one future code path that signs a payload without a sid reopens the bypass and no read-side test would fail.<br>• Within the 30-day window such a token is immune to logout, admin suspension and password reset. |
| **Acceptance criteria** | isPayloadSessionActive returns false for a sid-less payload whenever the storage mode is database, leaving session-mode behaviour unchanged.<br>• A test asserts that a sid-less payload is refused in database mode and accepted in session mode.<br>• A test asserts that signSession cannot be called without a sid in database mode. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | The guard is configuration, not code: session mode still accepts sid-less tokens by design, so a mode change on the next restart reopens the bypass (R-03), and a deploy dropping the signing variable reopens the forgery route (R-01). Whether any sid-less cookie is live in the field was not determined — the code bounds that question to the 30-day ceiling rather than answering it, and answering it would require inspecting real cookies, which no phase of this programme does. |

#### `R-03` — A storage-mode change is a deferred authentication downgrade that the next restart activates

**MEDIUM** (2×5=10) · CODE_CONFIRMED_RUNTIME_UNPROVEN · dominant impact **CONFIDENTIALITY + INTEGRITY** · confidence HIGH · priority 37 · phase S3_IDENTITY_SESSION_AND_MFA

| | |
|---|---|
| **Existing controls** | W7 does detect the condition and reports it.<br>• Production is owner-verified as running database mode on the current deployment. |
| **Control gaps** | A warning does not prevent a boot, so a storage-engine change silently becomes an enforcement change.<br>• The same root cause drives the silent repository fallback in R-32. |
| **Acceptance criteria** | W7 becomes FATAL: a production process refuses to start in session mode.<br>• A test asserts the refusal, and asserts that non-production environments still boot in session mode. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | A FATAL check converts a silent downgrade into an outage, which is the correct trade for an authentication control but must be stated: a mistaken environment edit will then stop the platform rather than weaken it. |

#### `R-04` — No account-level multi-factor authentication exists, so a valid credential is sufficient everywhere

**HIGH** (3×5=15) · ACTIVE_CONFIRMED · dominant impact **CONFIDENTIALITY** · confidence HIGH · priority 3 · phase S3_IDENTITY_SESSION_AND_MFA

| | |
|---|---|
| **Existing controls** | The authentication rate limiter is fail-closed, action-isolated and audited, which raises the cost of online guessing.<br>• Sessions are server-authoritative and revocable for every sid-bearing token.<br>• Public self-registration is disabled, so accounts are created only by invitation or by an administrator. |
| **Control gaps** | No second factor on login, on privilege elevation, or on any of the 13 OWNER-only operations.<br>• No step-up requirement is demonstrated on the compliance approval and erasure-execution paths. |
| **Acceptance criteria** | A second factor exists for interactive login and can be required per organization.<br>• Step-up re-authentication is required for every OWNER-only operation and for role changes, with a test per operation.<br>• The absence or presence of a second factor is recorded on the session and visible in the audit trail. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | A second factor does not protect the standing environment-driven seed account (R-05) unless that path is covered too, and it does not reach the gateway or worker credentials, which are not interactive identities. |

#### `R-05` — A standing environment-driven privileged account exists whenever two variables are present

**HIGH** (3×5=15) · CODE_CONFIRMED_RUNTIME_UNPROVEN · dominant impact **CONFIDENTIALITY + INTEGRITY** · confidence MEDIUM · priority 19 · phase S3_IDENTITY_SESSION_AND_MFA

| | |
|---|---|
| **Existing controls** | The account is only present when both variables are set.<br>• The authentication limiter applies to it like any other identity. |
| **Control gaps** | A long-lived credential in an environment file has no rotation, no expiry and no second factor.<br>• Its use is not distinguished in the audit trail from any other administrator. |
| **Acceptance criteria** | An owner read-only production check records whether the two variables are set, as counts only and never a value.<br>• If present, the seed path is restricted to first boot, the credential is rotated, and its use is audited distinctly. |
| **Verification method** | `OWNER_READ_ONLY_PRODUCTION_CHECK` |
| **Residual risk** | The precondition is unverified, so this risk's state may move in either direction once the presence check is run. |

#### `R-06` — Two password-hashing libraries are present and the authoritative verifier is unestablished

**MEDIUM** (2×3=6) · ASSURANCE_GAP · dominant impact **CONFIDENTIALITY + AUDITABILITY** · confidence MEDIUM · priority 38 · phase S3_IDENTITY_SESSION_AND_MFA

| | |
|---|---|
| **Existing controls** | An argon2 wrapper exists and a password policy module exists. |
| **Control gaps** | A reachable legacy verifier would set the effective strength of every stored credential, and no evidence establishes whether one is reachable.<br>• No test asserts which algorithm new passwords use. |
| **Acceptance criteria** | The authoritative hashing algorithm for new passwords is named in a test.<br>• Any legacy verification path is either removed or proven to re-hash on successful verification, with a test. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | Until the verifier is established, the strength of stored credentials is unknown rather than weak; this entry records the ignorance, not a defect. |

#### `R-07` — Public candidate registration is an account-existence oracle

**MEDIUM** (4×2=8) · ACTIVE_CONFIRMED · dominant impact **CONFIDENTIALITY** · confidence HIGH · priority 42 · phase S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS

| | |
|---|---|
| **Existing controls** | A registered per-IP rate limiter is applied before any parse or write.<br>• The sibling access-request, forgot-password and accept-invite routes are all invariant and do not enumerate. |
| **Control gaps** | This one route contradicts the posture the other four implement. |
| **Acceptance criteria** | The route's response is invariant for an existing and a non-existing address.<br>• A test asserts the two responses are identical, including status and body. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | Timing differences can still distinguish the two paths; closing that requires equalising the work done, which this acceptance criterion does not demand. |

#### `R-08` — Six module data layers query the database with no organization predicate

**HIGH** (3×5=15) · CODE_CONFIRMED_RUNTIME_UNPROVEN · dominant impact **CONFIDENTIALITY** · confidence MEDIUM · priority 4 · phase S4_TENANT_AND_SITE_ISOLATION

| | |
|---|---|
| **Existing controls** | Every tenant route derives the organization from the actor, and no tenant route accepts an organizationId from the client.<br>• The tenant contract makes a query without an established tenant unwritable by type.<br>• No cross-tenant read has been demonstrated in any phase of this programme. |
| **Control gaps** | There is no database-level backstop: no row-level security (R-09).<br>• The six layers are not identified anywhere, so there is no list to test against.<br>• The assurance instrument that reports coverage is structurally unable to see the gap. |
| **Acceptance criteria** | The six layers are enumerated by name in a committed artifact, derived mechanically rather than from memory.<br>• Each one either gains an organization predicate at the query level or is proven unreachable with a foreign identifier, with a test per layer.<br>• A deterministic gate fails when a data-layer query against a root model carries no tenant predicate. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | A per-query gate is lexical in the same way the Phase 99 classifier is; without row-level security a future layer can still be written without a predicate and pass review. |

#### `R-09` — There is no database-level tenant backstop: filtering is entirely caller-side

**HIGH** (3×5=15) · ACTIVE_CONFIRMED · dominant impact **CONFIDENTIALITY** · confidence HIGH · priority 20 · phase S4_TENANT_AND_SITE_ISOLATION

| | |
|---|---|
| **Existing controls** | One connection string, no published database port, internal network only.<br>• The tenant contract and the organization actor guards concentrate most predicate construction. |
| **Control gaps** | Every tenant boundary is one forgotten where clause away from being crossed, with nothing below it to refuse.<br>• The migration role and the runtime role are the same identity (R-47), so a row-level policy could not currently be enforced against the application role alone. |
| **Acceptance criteria** | A decision is recorded on whether row-level security is adopted, with the reasoning, because adopting it changes every query path.<br>• If adopted, the runtime role is separated from the migration role first (R-47), a policy exists on each root model, and a rehearsal proves a query without a tenant context returns zero rows.<br>• If not adopted, a compensating deterministic gate is named and implemented (R-08) and the acceptance of the residual is recorded with an expiry. |
| **Verification method** | `FAULT_INJECTION_REHEARSAL` |
| **Residual risk** | Row-level security protects rows, not aggregates computed in the application, and it cannot help where the application legitimately holds a cross-tenant role such as the platform-administrative surface. |

#### `R-10` — Site-level authorization is structurally thin, and one site-filter bypass is latent

**HIGH** (3×4=12) · LATENT_CONFIG_GUARDED · dominant impact **CONFIDENTIALITY** · confidence HIGH · priority 21 · phase S4_TENANT_AND_SITE_ISOLATION

| | |
|---|---|
| **Existing controls** | Site allow-list resolution is fail-closed: no accessible site means no rows.<br>• Phase 99 fixed four separate site allow-list bypasses, so the class is known and has been remediated before.<br>• The graph loader currently refuses on the same condition that skips the filter. |
| **Control gaps** | The site-filter construction yields undefined rather than an empty allow-list, so it fails open by shape and is masked only by a neighbour.<br>• Site membership cannot be read or managed through the product at all (R-42), so the control has no administrative surface. |
| **Acceptance criteria** | The site-filter construction produces an empty allow-list rather than undefined when the allow-list cannot be resolved, with a test that asserts zero rows.<br>• Every handler that reads or writes site-scoped data is enumerated and either carries a site guard or is recorded as deliberately organization-scoped.<br>• A negative test per site-scoped handler asserts that a member without the site is refused. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | The enumeration depends on knowing which data is site-scoped, and with 54 siteId references against 275 models that judgement is itself a design question rather than a measurement. |

#### `R-11` — Ambiguous organization membership is resolved by silently picking the oldest

**MEDIUM** (3×3=9) · CODE_CONFIRMED_RUNTIME_UNPROVEN · dominant impact **CONFIDENTIALITY + INTEGRITY** · confidence HIGH · priority 43 · phase S4_TENANT_AND_SITE_ISOLATION

| | |
|---|---|
| **Existing controls** | The tenant contract refuses rather than guesses: its multiple-active-organizations state carries no organization identifier, and the compliance scope helper answers 409 in that case. |
| **Control gaps** | The billing resolver does not follow the contract's refusal, so one subsystem guesses where the rest refuse. |
| **Acceptance criteria** | The billing resolver refuses when membership is ambiguous, matching the tenant contract, and a test asserts the refusal for a two-organization member. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | Refusing changes behaviour for existing multi-organization users, so the change needs a product decision about how such a user selects an organization for billing. |

#### `R-12` — Redis keys carry no namespace, and tenant scoping of cache keys is unverified

**MEDIUM** (3×3=9) · ASSURANCE_GAP · dominant impact **CONFIDENTIALITY + INTEGRITY** · confidence MEDIUM · priority 44 · phase S4_TENANT_AND_SITE_ISOLATION

| | |
|---|---|
| **Existing controls** | Redis is not published on a host port and requires a password.<br>• The rate limiter degrades to an in-process window rather than to no limit. |
| **Control gaps** | There is no mechanism that forces a tenant-scoped key to embed the organization, so correctness rests on each call site.<br>• A flat colon-delimited namespace shared by six subsystems has no collision guard. |
| **Acceptance criteria** | Every Redis key builder is enumerated by a deterministic gate that fails the build on an unclassified one, and each is classified as tenant-scoped or global.<br>• Tenant-scoped keys are produced by a helper that cannot omit the organization, and a test asserts that two organizations cannot collide. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | A key-builder helper does not retrofit keys already written; a namespace change needs a migration or an acceptable cache-miss window. |

#### `R-13` — The privilege-reporting instrument cannot represent the privilege model it reports on

**HIGH** (3×5=15) · ASSURANCE_GAP · dominant impact **AUDITABILITY** · confidence HIGH · priority 5 · phase S4_TENANT_AND_SITE_ISOLATION

| | |
|---|---|
| **Existing controls** | No false positives were found: every classification examined was correct or under-stated.<br>• An undeclared surface with no evidence fails to unknown rather than to a permissive default, and unknown fails readiness.<br>• Comments are stripped before matching, so a commented-out guard does not count. |
| **Control gaps** | A reader or a gate that treats the two zeros as a measurement is misled, and Gate C and the Phase 99 assurance reports consume this output.<br>• The unit of counting is the handler, while the privilege boundary is per action.<br>• The token table is hand-maintained with no tie to the helpers it tracks, and carries a dead token. |
| **Acceptance criteria** | The two privileged classifications either become emittable or are removed from the schema, so no zero can be read as a measurement.<br>• The classifier reads the permission argument and joins it against the permission table to derive the tier mechanically.<br>• The unit of counting becomes path, method and action, resolving action-permission maps and ternaries.<br>• Guard helpers are registered by module provenance so a rename fails the gate, and the dead token is removed.<br>• Capability booleans such as the compensation capability can declare themselves, with the compensation boundary as the first registered example. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | A static classifier can be made accurate about declared guards and still cannot prove a guard is reached on every branch; that limit survives any rebuild and must stay stated wherever the output is cited. |

#### `R-14` — Per-tier negative authorization tests were not assessable, so refusal is argued rather than executed

**HIGH** (3×4=12) · ASSURANCE_GAP · dominant impact **AUDITABILITY** · confidence HIGH · priority 22 · phase S4_TENANT_AND_SITE_ISOLATION

| | |
|---|---|
| **Existing controls** | Every privileged call chain examined was traced to its decision point and found correctly enforced.<br>• The three places that accept a client-supplied role all clamp it, and the clamp is a recorded fix for a real prior defect. |
| **Control gaps** | For 59 privileged operations there is no executed assertion that a role one step below the requirement is refused. |
| **Acceptance criteria** | For each of the 59 privileged operations a test asserts that the role one step below the requirement receives the expected refusal status.<br>• The two existing targeted classifier tests are executed in an environment where they can run, and their result is reported.<br>• The suite runs in continuous integration so a new privileged operation without a negative test fails the build. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | A negative test per operation proves refusal for the roles it enumerates; a new role or a new action inside an existing handler is not covered until the matrix is extended. |

#### `R-15` — Four organization-governance questions are undecided, including whether an organization can lose its only owner

**MEDIUM** (2×4=8) · POLICY_AMBIGUITY · dominant impact **AVAILABILITY** · confidence HIGH · priority 45 · phase OWNER_POLICY_DECISION

| | |
|---|---|
| **Existing controls** | No role can assign the owner role by any route, which is a deliberate and load-bearing clamp.<br>• Ownership transfer is not exposed, so it cannot be abused.<br>• The compensation capability is enforced in the repository layer, not only in the client. |
| **Control gaps** | An organization that loses its owner has no holder of 13 permissions and no API path to regain one.<br>• Two sources of truth govern the compensation rule.<br>• A permission table containing entries no route consults invites a false sense of coverage. |
| **Acceptance criteria** | The owner records a decision on each of the four questions: owner immutability, the last-owner invariant, which source of truth governs the compensation rule, and whether organization deletion should exist.<br>• Each decision is then expressed as a test or as a recorded acceptance, and the permission table is reconciled with the decisions. |
| **Verification method** | `OWNER_POLICY_STATEMENT` |
| **Residual risk** | Until the decisions are recorded, an administrator action that leaves an organization without an owner is neither prevented nor known to be reachable. |

#### `R-16` — The IP pseudonymisation salt can be silently absent, turning a privacy control into a reversible hash

**HIGH** (4×4=16) · LATENT_CONFIG_GUARDED · dominant impact **CONFIDENTIALITY** · confidence HIGH · priority 6 · phase S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS

| | |
|---|---|
| **Existing controls** | The media view beacon hashes only when a salt exists and stores null otherwise — the correct posture, already implemented once.<br>• The owner-verified presence check establishes that the variable is set on the current container. |
| **Control gaps** | Two of three call sites have no guard, so the control depends on a variable name that the authentication path does not require.<br>• The construction is a plain hash of address plus secret rather than a keyed message authentication code, with no key version and no rotation path.<br>• Combined with R-26, the hashed value is a Cloudflare edge address rather than the visitor's, so the pseudonym is also useless for its stated purpose. |
| **Acceptance criteria** | A dedicated key for address pseudonymisation exists, independent of any signing key, and is read through one helper.<br>• All three call sites fail closed when the key is absent, storing null rather than an unsalted hash, with a test per site.<br>• The construction is a keyed message authentication code carrying a key version, and a rotation and migration policy is recorded.<br>• A bounded retention period for the stored pseudonyms is recorded. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | The S0 public-route inventory recorded a provisional severity of MEDIUM for this finding before S1 owned the rating; the declared method places it HIGH because exploitability is near-total once the precondition holds. Both readings are in the register: the productionState records that it is not active today. |

#### `R-17` — Six unauthenticated endpoints publish an internal commercial dashboard built from fabricated records

**MEDIUM** (5×2=10) · ACTIVE_CONFIRMED · dominant impact **CONFIDENTIALITY + AUDITABILITY** · confidence HIGH · priority 46 · phase S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS

| | |
|---|---|
| **Existing controls** | Because the module touches no database, there is no tenant data behind the routes today and therefore no cross-tenant leakage. |
| **Control gaps** | The authorization gap exists now, before the real data arrives; whatever replaces the fixtures will be tenant data and the route would then be an unauthenticated tenant-data endpoint.<br>• Project guidance forbids fake data on production paths, and these endpoints publish invented commercial relationships with named real companies.<br>• The customer-relationship data model carries no organization column, so there is no tenant predicate available to add. |
| **Acceptance criteria** | The six handlers are either removed or placed behind the same gate as every other tenant surface, before any real data is wired to them.<br>• A test asserts an anonymous request is refused.<br>• If the surface is kept, the data model gains a tenant column and a predicate, and the fixtures are removed from the production path. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | THE SEVERITY OF THIS ENTRY CHANGES CLASS THE DAY THE FIXTURES ARE REPLACED. Today the impact is reputational and architectural because no real data is behind it; with real customer data and no tenant predicate it becomes an unauthenticated cross-tenant disclosure and this register must be re-scored before that change ships. |

#### `R-18` — Public certificate verification returns a named individual with no rate limit and unprovable token entropy

**HIGH** (4×3=12) · POLICY_AMBIGUITY · dominant impact **CONFIDENTIALITY** · confidence MEDIUM · priority 23 · phase OWNER_POLICY_DECISION

| | |
|---|---|
| **Existing controls** | Phase 99 fixed the verdict itself so an expired certificate no longer verifies as valid with the holder's name attached.<br>• The token is the capability, which is a reasonable design for a verification endpoint. |
| **Control gaps** | No rate limit on a public endpoint that returns a named individual.<br>• The token generator is outside this repository, so its entropy is not reviewable here. |
| **Acceptance criteria** | The issuance path and its token generator are located and recorded; if issuance happens outside this repository, that is itself the answer and is recorded as such.<br>• The token is proven to carry at least 128 bits of cryptographically random entropy, or it is replaced.<br>• A registered rate limit is applied to the verification endpoint, with a test. |
| **Verification method** | `OWNER_POLICY_STATEMENT` |
| **Residual risk** | Until the generator is located the enumeration risk is unrated rather than low. A rate limit bounds guessing but does not make a low-entropy token acceptable for an endpoint that returns a person's name. |

#### `R-19` — Public writers have no idempotency, and one enforces its rate limit per process rather than per cluster

**HIGH** (5×3=15) · ACTIVE_CONFIRMED · dominant impact **INTEGRITY + AVAILABILITY** · confidence HIGH · priority 32 · phase S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS

| | |
|---|---|
| **Existing controls** | Both routes are honeypot-guarded with a fake-success response, so a bot learns nothing.<br>• Both bound the request body before parsing and validate every field with a schema.<br>• The access-request route does use the shared Redis limiter. |
| **Control gaps** | The sales-leads counter resets on every container restart or redeploy, and each replica enforces its own cap, so the effective limit is the stated limit multiplied by the replica count.<br>• Neither route suppresses duplicates, so the limiter is the only bound on repeated rows. |
| **Acceptance criteria** | The sales-leads route uses the shared Redis limiter with its own registered action, and a test asserts the module-local map is gone.<br>• Both lead routes suppress duplicate submissions within a bounded window, with a test. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | Duplicate suppression keyed on a collapsed client address (R-26) suppresses across every visitor behind one edge point of presence, so the key must be reconsidered together with that risk. |

#### `R-20` — The only public handler that creates a user validates nothing and writes outside a transaction

**HIGH** (5×3=15) · ACTIVE_CONFIRMED · dominant impact **INTEGRITY + AUDITABILITY** · confidence HIGH · priority 24 · phase S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS

| | |
|---|---|
| **Existing controls** | The role is hardcoded and the verified flag is false, so neither is client-settable — the critical control, and it is correct.<br>• A registered rate limiter is applied first, before any parse or write.<br>• A content-type check and a bounded body precede parsing.<br>• If the session cannot be persisted the route fails closed with no partial, non-revocable session. |
| **Control gaps** | No schema validation, so arbitrary strings are stored as user records and the unique-email constraint is the only data-quality control.<br>• No transaction, so a failure between the two writes leaves a candidate-role user with no candidate record — a state the response shape already anticipates.<br>• No honeypot and no challenge, unlike both sibling lead forms. |
| **Acceptance criteria** | Every field is validated by the repository's schema validator with explicit bounds, and the shared password policy is applied.<br>• The user and candidate writes happen in one transaction, and a test asserts that a failure in the second leaves no user row.<br>• An audit event records user creation. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | Validation does not prevent bulk registration of syntactically valid accounts; that bound remains the rate limiter, and the enumeration oracle is tracked separately as R-07. |

#### `R-21` — Unrelated public features share one rate-limit bucket, so each can exhaust the other's allowance

**HIGH** (5×3=15) · ACTIVE_CONFIRMED · dominant impact **AVAILABILITY** · confidence HIGH · priority 33 · phase S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS

| | |
|---|---|
| **Existing controls** | Every action string used by all 48 public route files is registered, so no public handler is silently unlimited.<br>• The limiter fails closed on an undeclared action and writes an audit event, so inventing an action name would block the route rather than remove the limit. |
| **Control gaps** | Bucket collision between unrelated features is invisible to the registry test, which only asserts existence. |
| **Acceptance criteria** | Dedicated actions are registered for the public media read and the view beacon, and the three handlers point at them.<br>• A test asserts that no two unrelated route modules declare the same action name.<br>• The stale comments that misstate the limiter's failure mode are removed as part of R-27. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | Separating buckets does not change that every visitor behind one edge point of presence still shares a bucket (R-26), which is the larger aggregation problem. |

#### `R-22` — The avatar upload accepts unsniffed bytes, bounds after buffering, and publishes to an unauthenticated static surface

**HIGH** (4×3=12) · ACTIVE_CONFIRMED · dominant impact **INTEGRITY + AVAILABILITY** · confidence HIGH · priority 25 · phase S5_MUTATION_SURFACE_AND_ABUSE_CONTROLS

| | |
|---|---|
| **Existing controls** | Filenames are 128-bit random with an extension from a three-item allowlist, and the uploader's filename is never used, so the stored path is unguessable.<br>• Only two writers exist under the public directory and both store images intended for public publication; no writer exists for tenant-scoped, site-scoped or industrial data.<br>• The sibling cover route demonstrates the correct pattern inside the same codebase. |
| **Control gaps** | Content type is taken on trust, so a file whose bytes are not the declared image type is stored and served from the application's own origin.<br>• The ceiling is applied after the whole body is in memory, so the proxy's fifty-megabyte allowance is the practical limit per request.<br>• Static serving bypasses middleware entirely, so neither authorization nor the content-security policy applies to the served object. |
| **Acceptance criteria** | The avatar route sniffs magic bytes using the same helper as the cover route, with a test that a mislabelled file is refused.<br>• The declared size is checked before buffering and the real length re-checked after, with a test at the boundary.<br>• A response header policy for the static uploads path is recorded, or the objects are moved out of the public directory and served through an authorizing route. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | Magic-byte sniffing identifies a container, not its contents; an image that is a valid image and also carries a payload for some other consumer is still accepted. Serving user-supplied bytes from the application's own origin remains an architectural choice tracked by the header policy criterion. |

#### `R-23` — Two public-content behaviours need a policy decision rather than a fix

**MEDIUM** (3×2=6) · POLICY_AMBIGUITY · dominant impact **INTEGRITY** · confidence HIGH · priority 47 · phase OWNER_POLICY_DECISION

| | |
|---|---|
| **Existing controls** | An authenticated identity is required to upload, so the surface is not anonymous.<br>• The locale cookie carries no identity and is set by a library behaviour rather than an application decision. |
| **Control gaps** | No requirement exists stating who may publish an avatar to the public static surface, so there is nothing to enforce.<br>• No decision exists on whether a nominally side-effect-free method may set state, nor on the cookie's consent classification. |
| **Acceptance criteria** | The owner records which roles may publish an avatar; the route then enforces it and a test asserts the refusal for a role below the requirement.<br>• The owner records whether a HEAD request may set the locale cookie and under which consent classification; the answer is then expressed in the cookie policy document or in code. |
| **Verification method** | `OWNER_POLICY_STATEMENT` |
| **Residual risk** | Until the upload requirement is recorded, the hardening in R-22 improves the handling of the bytes without settling who may submit them. |

#### `R-24` — The origin is directly reachable from the internet, so the edge can be bypassed

**HIGH** (4×4=16) · ACTIVE_CONFIRMED · dominant impact **AVAILABILITY** · confidence HIGH · priority 7 · phase S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING

| | |
|---|---|
| **Existing controls** | Every application gate still applies to a direct request: authentication, authorization and the per-action rate limiter are in the application, not at the edge.<br>• Transport security is terminated at the origin with a valid certificate, so a direct request is still encrypted.<br>• Reaching the origin directly makes the trusted client-address header carry the real caller, so the rate limiter becomes more accurate, not less. |
| **Control gaps** | Edge denial-of-service absorption, caching and any edge-layer filtering are all bypassable.<br>• The proxy has no request-rate or connection limit of its own to compensate.<br>• Whether a provider-level filter exists is unknown; what is measured is that no restriction was enforced for the observed vantage. |
| **Acceptance criteria** | Inbound traffic on the public ports is accepted only from the edge provider's published ranges, enforced in the container chain rather than in the host firewall alone, with a documented automated procedure for refreshing those ranges.<br>• Request-rate and connection limits exist at the proxy as defence in depth.<br>• The closure is re-verified from an independent external vantage, and the observation is recorded with the same rigour as the opening evidence. |
| **Verification method** | `EXTERNAL_VANTAGE_OBSERVATION` |
| **Residual risk** | An allowlist of a provider's published ranges is only as current as its refresh procedure, and it does not protect against an attacker who proxies through the edge itself. The unexplained path instability in R-30 means a single successful verification does not prove a stable posture. |

#### `R-25` — Strict transport security is set nowhere, at any layer

**HIGH** (4×3=12) · ACTIVE_CONFIRMED · dominant impact **CONFIDENTIALITY + INTEGRITY** · confidence HIGH · priority 26 · phase S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING

| | |
|---|---|
| **Existing controls** | Port eighty answers with a permanent redirect to the secure scheme.<br>• Authentication cookies are marked secure in production, so a downgraded request does not carry them.<br>• Four other response security headers are present and verified. |
| **Control gaps** | No instruction to the browser to refuse an insecure connection, so the first request of a session has no protection and no preload entry exists.<br>• The absence is confirmed from three vantages, so neither the edge nor the origin supplies it. |
| **Acceptance criteria** | The transport-security header is emitted with a defensible duration and subdomain policy, at the layer the configuration says owns it, and the documentation and the implementation agree.<br>• The header is verified present on a response from the edge and on a direct origin response.<br>• A decision on preload registration is recorded, because it is difficult to reverse. |
| **Verification method** | `EXTERNAL_VANTAGE_OBSERVATION` |
| **Residual risk** | The header protects only browsers that have already seen it, so the very first contact remains unprotected until a preload entry exists; preloading is close to irreversible and is therefore a deliberate decision rather than a default. |

#### `R-26` — The application's idea of the client address is an edge point of presence, and two extractors disagree

**HIGH** (4×4=16) · ACTIVE_CONFIRMED · dominant impact **AVAILABILITY + AUDITABILITY** · confidence HIGH · priority 8 · phase S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING

| | |
|---|---|
| **Existing controls** | Spoofing is genuinely prevented: the proxy overwrites the trusted header, and every client-settable alternative is ignored. This is a deliberate and correct choice that a prior phase made after a real defect.<br>• The authentication limiter is fail-closed and action-isolated, so over-aggregation tightens rather than loosens it. |
| **Control gaps** | Every visitor behind one edge point of presence shares a single rate-limit bucket, so one noisy visitor can exhaust the budget for many.<br>• The stored address pseudonyms identify an edge node rather than a visitor, so attribution is lost and the privacy control in R-16 protects a value that was never personal.<br>• Two independent extractors with no shared code mean a fix to one does not reach the other, and neither normalises address forms. |
| **Acceptance criteria** | The proxy declares the edge provider's ranges as trusted and recovers the original caller into the header the application already trusts, with the hop count matched to the real topology rather than copied from an example.<br>• Client-supplied forwarding and edge headers are cleared at the trust boundary rather than relying on later overwrite ordering.<br>• One server-side resolver is used by both current extractors and returns a typed result rather than a sentinel string, with deterministic normalisation of address forms.<br>• The comment that asserts the wrong topology is corrected as part of R-27. |
| **Verification method** | `SOURCE_REVIEW` |
| **Residual risk** | Trusting the edge's header is only safe while the origin cannot be reached directly; this remediation therefore depends on R-24 being closed first, or a direct request could present a forged caller address. That ordering is the single most important sequencing constraint in this register. |

#### `R-27` — Production comments assert a safety property the code does not have, and one already corrupted a security document

**HIGH** (3×4=12) · ACTIVE_CONFIRMED · dominant impact **AUDITABILITY** · confidence HIGH · priority 34 · phase S9_OBSERVABILITY_AND_DETECTION

| | |
|---|---|
| **Existing controls** | The limiter's real behaviour is comprehensively fail-closed and is covered by a registry test.<br>• The error was caught and corrected inside this programme, with the correction left visible in the document. |
| **Control gaps** | A comment that misstates a safety property in the dangerous direction will be believed by the next reader, and already was.<br>• Nothing ties a comment about a control to the control's actual behaviour. |
| **Acceptance criteria** | The two comments are corrected to state the limiter's real failure mode, and the client-address comment that asserts the wrong topology is corrected with them.<br>• Where a comment states a safety property, it names the test that proves it. |
| **Verification method** | `SOURCE_REVIEW` |
| **Residual risk** | Correcting three comments does not create a mechanism that keeps comments and behaviour aligned; the naming convention in the second criterion is a convention, not a gate. |

#### `R-28` — The platform discloses its framework and does not suppress server version tokens

**LOW** (4×1=4) · ACTIVE_CONFIRMED · dominant impact **CONFIDENTIALITY** · confidence HIGH · priority 53 · phase S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING

| | |
|---|---|
| **Existing controls** | Four other response security headers are present, and the content-security policy is nonce-based per request. |
| **Control gaps** | Both values narrow an attacker's guesswork about the stack for no functional benefit. |
| **Acceptance criteria** | The framework header is disabled in configuration and the proxy's version token is suppressed.<br>• Both absences are verified on a response from the edge and on a direct origin response. |
| **Verification method** | `EXTERNAL_VANTAGE_OBSERVATION` |
| **Residual risk** | Version suppression is cosmetic against a determined attacker, who can fingerprint the stack from behaviour; it removes a free hint, nothing more. |

#### `R-29` — Security-relevant configuration and documentation have drifted from the code they describe

**HIGH** (3×4=12) · ASSURANCE_GAP · dominant impact **AUDITABILITY** · confidence HIGH · priority 35 · phase S9_OBSERVABILITY_AND_DETECTION

| | |
|---|---|
| **Existing controls** | The route inventory is kept from drifting against the source tree by a committed check that passes on this source state.<br>• Each drift listed here was found by reading the artifacts against the code rather than by trusting either. |
| **Control gaps** | A guard name that does not exist invites a future change to invent one, or to assume a boundary is enforced where it is not.<br>• A narrative document and a generated artifact describing the same surface have no mechanism keeping them consistent.<br>• A document that quotes its own tool's test count has no gate asserting the quote.<br>• Two documents in the same phase recorded opposite statuses for one precondition, and nothing detected it; the register now carries a gate that would, but the source documents still disagree. |
| **Acceptance criteria** | The stale server name is removed from the proxy configuration, and the phantom guard token is removed from the classifier.<br>• The attack-surface narrative is regenerated from, or checked against, the committed inventory, so the two cannot disagree silently.<br>• The classification document's quoted test count is corrected, and a gate asserts that any count a security document quotes from its own tool matches the tool's output.<br>• The legacy-token document's precondition sentence is corrected to match the recorded evidence, so the two S0 documents no longer disagree. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | NEITHER SOURCE-DOCUMENT DEFECT IS FIXED BY THIS PHASE. The order authorising S1 limits the deliverables to four paths and neither of those documents is among them, so both are disclosed here rather than corrected: the quoted test count, which is cosmetic because no count bearing on a security conclusion is affected, and the precondition sentence, which is not cosmetic because this register was built from it and reported a settled condition as unknown until the reconciliation. Both remain open against the committed S0 documents. |

#### `R-30` — The network path to the origin address was unstable between two observations and the mechanism is unknown

**MEDIUM** (2×4=8) · ASSURANCE_GAP · dominant impact **AUDITABILITY** · confidence MEDIUM · priority 48 · phase S9_OBSERVABILITY_AND_DETECTION

| | |
|---|---|
| **Existing controls** | Both observations are recorded rather than reconciled by discarding one, so the instability is visible instead of averaged away.<br>• The reachability conclusion does not depend on explaining the instability, because it rests on the direct response's own signature. |
| **Control gaps** | Any future verification of R-24's closure from one request could be misled by the same instability, in either direction.<br>• No monitoring exists that would detect the path changing. |
| **Acceptance criteria** | Any verification of the origin posture uses repeated observations over time from more than one vantage, not a single request.<br>• A recorded explanation of the instability exists, or the inability to explain it is accepted in writing with the monitoring that compensates. |
| **Verification method** | `EXTERNAL_VANTAGE_OBSERVATION` |
| **Residual risk** | Explaining the instability may require evidence from the network provider that this programme cannot obtain, in which case the compensating control is repeated observation rather than understanding. |

#### `R-31` — The health surface is unauthenticated and its access logging is disabled at the proxy

**MEDIUM** (4×2=8) · ACTIVE_CONFIRMED · dominant impact **AUDITABILITY** · confidence HIGH · priority 52 · phase S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING

| | |
|---|---|
| **Existing controls** | The two handlers are declared as an internal health surface in the inventory rather than being silently unclassified.<br>• The readiness probe is the one place in the platform that records an infrastructure failure properly. |
| **Control gaps** | Requests to the health surface leave no proxy access record, so probing it is invisible at that layer.<br>• The surface is reachable without authentication on the insecure port, so it is also reachable directly at the origin. |
| **Acceptance criteria** | The health response is confirmed to disclose no version, dependency state or internal address, with a test on the response shape.<br>• A decision is recorded on whether access logging must stay off, and if it stays off the reason is written down. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | A health endpoint has to be reachable by whatever checks it; the remediation bounds what it reveals rather than who can reach it. |

#### `R-32` — A silent fallback accepts writes into process memory and reports success, including the store it claims to have used

**HIGH** (3×5=15) · CODE_CONFIRMED_RUNTIME_UNPROVEN · dominant impact **INTEGRITY + AUDITABILITY** · confidence HIGH · priority 9 · phase S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS

| | |
|---|---|
| **Existing controls** | Tenant isolation is preserved: the session repositories apply the same owner predicate, and a null owner is an impossible sentinel that sees nothing.<br>• Role enforcement is upstream in the route layer and is unaffected.<br>• The public graph reads published content only, so the fallback is not a disclosure on that surface.<br>• The enterprise-resource surface demonstrates the correct alternative in the same codebase: a controlled refusal with a stable code and no degradation to process storage. |
| **Control gaps** | A mutation is accepted, reported as successful, survives only until the container restarts, is invisible to any other replica, and gets a non-conforming identifier.<br>• Nothing is logged inside those catch blocks, so neither the caller nor the operator learns that the write did not land.<br>• No audit row records the mutation, because the audit writer is itself database-backed.<br>• The response states which store was used, and that statement is false. |
| **Acceptance criteria** | In database mode no sensitive read or write falls back to process memory: each of the 67 outage-conditional paths answers the controlled refusal the enterprise-resource layer already models, with a stable error code.<br>• No response asserts a storage mode that was not used; either the request is refused, or the mode actually used is stated.<br>• The deterministic call-site gate runs in continuous integration so a new unguarded fallback fails the build.<br>• A test asserts that a write attempted while the client is unavailable leaves no caller-visible success. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | Refusing converts a silent integrity defect into a visible outage, which is correct but changes the platform's availability profile; the two unconditional delegations that never had a database implementation are a separate design decision and are not closed by this criterion. |

#### `R-33` — An outage is acknowledged to an external party that will therefore never retry

**HIGH** (3×5=15) · CODE_CONFIRMED_RUNTIME_UNPROVEN · dominant impact **INTEGRITY + AUDITABILITY** · confidence HIGH · priority 10 · phase S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS

| | |
|---|---|
| **Existing controls** | Replay protection on the gateway envelope is unaffected: the timestamp, nonce and idempotency key are inside the signed field set.<br>• The gateway surface does not accept a tenant identifier from the envelope, so no cross-tenant claim is possible. |
| **Control gaps** | A success status is the instruction not to resend, so the data is lost rather than delayed — the one failure mode a buffering edge device cannot recover from.<br>• The audit row that would record the loss is attempted on the same unavailable client.<br>• A provider that has been told an event was received will not redeliver it, so billing state diverges silently. |
| **Acceptance criteria** | Telemetry ingestion answers a server-error status when the readings were not stored, writes no ingestion audit row, and lets the gateway buffer and retry; a test asserts the status and the absence of the audit row.<br>• A webhook the platform could not durably claim answers a server-error status so the provider retries, and no event is marked processed, ignored or failed on a path that returned early without a client.<br>• A fault-injection rehearsal with the database made unavailable shows no acknowledgement emitted for an unpersisted event, and a test asserts the same. |
| **Verification method** | `FAULT_INJECTION_REHEARSAL` |
| **Residual risk** | Returning an error invites provider retry storms during a long outage, so the remediation needs a bounded retry contract on both surfaces; the gateway's offline buffering capacity is asserted by design documents outside this repository and cannot be verified here. |

#### `R-34` — Gateway revocation and heartbeat report security outcomes that did not happen

**HIGH** (3×5=15) · CODE_CONFIRMED_RUNTIME_UNPROVEN · dominant impact **AUDITABILITY** · confidence HIGH · priority 11 · phase S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS

| | |
|---|---|
| **Existing controls** | The gateway credential itself is a proof-of-possession signature rather than a shared reference string, so revocation is the only way to invalidate it and there is no weaker path.<br>• Enrollment, rotation and revocation routes all exist, so the operator has the right surface to act through. |
| **Control gaps** | A revocation that silently did nothing is reported as a revocation that was already done, which is the one answer that stops an operator from responding further.<br>• No audit row records the attempt, so the incident timeline loses the operator's action as well as its failure.<br>• An audit row asserting a heartbeat that was never recorded makes the audit trail actively wrong rather than merely incomplete. |
| **Acceptance criteria** | Revocation distinguishes an unavailable database from a missing record and never reports already revoked for an outage; a test asserts the refusal status for each condition separately.<br>• The attempt is audited before the outcome is known, so a failed revocation leaves a trace.<br>• The heartbeat route checks that the write happened before auditing or metering it, proven by a test and by a fault-injection rehearsal with the database made unavailable. |
| **Verification method** | `FAULT_INJECTION_REHEARSAL` |
| **Residual risk** | Auditing the attempt requires an audit path that survives a database outage, which R-38's remediation must supply; until then the attempt trace is as fragile as the operation it records. |

#### `R-35` — Industrial and twin reads present an outage as an empty success, so an operator reads zero rather than unknown

**HIGH** (3×4=12) · CODE_CONFIRMED_RUNTIME_UNPROVEN · dominant impact **INDUSTRIAL_SAFETY** · confidence HIGH · priority 12 · phase S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS

| | |
|---|---|
| **Existing controls** | Confidentiality is fail-closed in the only sense that matters here: no database means no rows, so nothing is disclosed.<br>• Tenant isolation is unaffected. |
| **Control gaps** | An empty collection means both you may see nothing and I could not ask, and the client cannot tell them apart.<br>• On a plant surface that renders as zero alarms, zero assets and zero telemetry during an outage, which is a safety-relevant misrepresentation.<br>• Health functions report zeros rather than unknown, so the surface that should expose the outage also hides it. |
| **Acceptance criteria** | A third state exists and is distinguishable by the client: an empty collection means nothing, and an unavailable data source is its own signal.<br>• The 26 legacy sites are converted first and the remaining semantic sites thereafter, with the counts tracked against the committed inventory.<br>• Health functions report unknown rather than zero when they could not ask, with a test.<br>• A plant-facing surface renders the unavailable state visibly rather than as zero, verified on at least one industrial view during a fault-injection rehearsal. |
| **Verification method** | `FAULT_INJECTION_REHEARSAL` |
| **Residual risk** | A third state has to be handled by every client of these functions, so the change is wider than the server-side sites; the authorization-scope functions that legitimately return an empty collection must not be swept into it. |

#### `R-36` — An outage is rendered as a wrong domain answer: not found, duplicate, conflict, or an authentication failure

**HIGH** (3×4=12) · CODE_CONFIRMED_RUNTIME_UNPROVEN · dominant impact **AUDITABILITY** · confidence HIGH · priority 13 · phase S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS

| | |
|---|---|
| **Existing controls** | No confidentiality boundary is crossed by any of these responses.<br>• The create siblings of the diverging update paths already answer the correct service-unavailable status, so the right pattern exists in the same modules.<br>• One module in the automation subsystem already models the correct write-error mapping and is the pattern to copy. |
| **Control gaps** | On a plant surface, not found is a statement about the equipment rather than about the platform.<br>• An outage reported as an authentication failure sends users to re-authenticate pointlessly and fills every authentication-failure monitor with infrastructure noise.<br>• An internal reason string echoed to a caller is an information-disclosure defect on top of the wrong status.<br>• One academy module answers the same condition two incompatible ways across six routes. |
| **Acceptance criteria** | A database outage answers a service-unavailable status everywhere, never a not-found, duplicate, conflict, unprocessable or authentication status, and no internal reason string is echoed.<br>• The industrial and twin update paths match their create siblings, with a test per pair.<br>• The academy resolver separates its four conditions and the six routes agree with each other, with a test per route.<br>• An authentication-failure monitor is shown not to fire for a simulated outage. |
| **Verification method** | `FAULT_INJECTION_REHEARSAL` |
| **Residual risk** | Changing a status code is a client-visible contract change on roughly twenty surfaces, so it needs coordinated client handling; the public certificate route's unknown-holder response is a product decision about whether to answer at all during an outage. |

#### `R-37` — Metering and audit evidence is lost on every degraded path, and the audit writer shares the failure

**HIGH** (3×5=15) · CODE_CONFIRMED_RUNTIME_UNPROVEN · dominant impact **AUDITABILITY** · confidence HIGH · priority 14 · phase S8_AUDIT_AND_TAMPER_EVIDENCE

| | |
|---|---|
| **Existing controls** | Correlation identifiers exist on the audit model and in the logger, so a surviving trace can be joined when one exists.<br>• The metering outbox worker has a delivery path at the web tier, so metering is not purely fire-and-forget by design. |
| **Control gaps** | The audit trail and the operation it records share one failure domain, so the evidence disappears exactly when it is most needed.<br>• Usage records that are dropped cannot be reconstructed, so billing under-counts silently. |
| **Acceptance criteria** | An audit path exists that does not share the primary database's failure domain, at least for security-relevant events: authentication, authorization refusal, revocation, erasure and export.<br>• Metering either refuses the call or records the usage durably; silent loss is removed, with a test.<br>• A rehearsal demonstrates that a security-relevant event during a database outage still produces evidence. |
| **Verification method** | `FAULT_INJECTION_REHEARSAL` |
| **Residual risk** | A second audit sink adds a component that itself can fail and must be protected to the same standard as the primary; choosing one is an architectural decision this register does not make. |

#### `R-38` — The audit trail has no tamper evidence and its tenancy columns are nullable

**HIGH** (3×5=15) · ACTIVE_CONFIRMED · dominant impact **AUDITABILITY** · confidence HIGH · priority 15 · phase S8_AUDIT_AND_TAMPER_EVIDENCE

| | |
|---|---|
| **Existing controls** | The table is indexed on action, user, organization, creation time and correlation, so it is usable as a trail.<br>• A separate immutable ledger exists for reasoning runs, which demonstrates the pattern is understood in this codebase. |
| **Control gaps** | A row can be altered or deleted with no detectable trace, so the trail cannot evidence anything against someone who holds database access.<br>• Nullable tenancy means a row can exist without identifying the organization it belongs to, which weakens both tenant attribution and retention. |
| **Acceptance criteria** | Security-relevant audit rows carry a verifiable chain or signature, with a verifier that detects an altered or removed row and a test that proves the detection.<br>• The organization column is required for every row that belongs to an organization, enforced at write time.<br>• A retention and protection posture is recorded for the trail, including who can delete and under what approval. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | A chain detects tampering; it does not prevent it, and it is only as trustworthy as the place its anchor is kept. Separating the runtime role from the migration role (R-47) is what would stop the application's own credential from rewriting history. |

#### `R-39` — Brute-force detection is silently disabled while the database is unavailable

**HIGH** (3×4=12) · CODE_CONFIRMED_RUNTIME_UNPROVEN · dominant impact **AUDITABILITY** · confidence HIGH · priority 27 · phase S9_OBSERVABILITY_AND_DETECTION

| | |
|---|---|
| **Existing controls** | The outage that disables detection also prevents any login from succeeding, so this is a loss of detection rather than of enforcement.<br>• The address-keyed rate limiter is Redis-backed with an in-process fallback and is independent of the database, so online guessing is still bounded. |
| **Control gaps** | An attacker can probe during an outage without accumulating lockout state or leaving failed-login evidence, so the attempt is invisible afterwards.<br>• The masking depends on a second component's behaviour rather than on an explicit decision, so a future change to token issuance could unmask the fail-open. |
| **Acceptance criteria** | The account-lock check fails closed explicitly rather than relying on token issuance to throw, with a test.<br>• Failed-login evidence is recorded on a path that survives a database outage, demonstrated by a fault-injection rehearsal and matching R-37's audit criterion. |
| **Verification method** | `FAULT_INJECTION_REHEARSAL` |
| **Residual risk** | Recording failures outside the database depends on R-37's second sink; until that exists, the detection gap narrows rather than closes. |

#### `R-40` — Degraded paths are invisible: almost every exception path and half the call sites are silent

**HIGH** (3×5=15) · ACTIVE_CONFIRMED · dominant impact **AUDITABILITY** · confidence HIGH · priority 16 · phase S9_OBSERVABILITY_AND_DETECTION

| | |
|---|---|
| **Existing controls** | Structured logging, correlation identifiers and a safe error describer all exist and are used elsewhere.<br>• The readiness probe demonstrates the correct instrumentation inside this codebase.<br>• The deterministic inventory now measures the silence, so it can be tracked rather than guessed. |
| **Control gaps** | An outage or a transient error is invisible to an operator almost everywhere, so a silent integrity defect has no detection path at all.<br>• Without a metric there is no way to know how often the fallback in R-32 has actually been taken. |
| **Acceptance criteria** | Every degraded path records an infrastructure failure with a correlation identifier, a subsystem and a failure class, and no secret, plus a metric.<br>• An alert exists for a non-zero rate of degraded-path events in production.<br>• The deterministic inventory's silence counters run as a gate in continuous integration and are tracked over time, so the number must fall rather than drift. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | Instrumenting 211 sites is a wide, low-risk change that will generate noise before it generates signal; the alert threshold is a judgement that needs a baseline the platform does not yet have. |

#### `R-41` — A partial failure between two writes can leave a suspended member's sessions live

**MEDIUM** (2×3=6) · CODE_CONFIRMED_RUNTIME_UNPROVEN · dominant impact **CONFIDENTIALITY + AUDITABILITY** · confidence HIGH · priority 49 · phase S3_IDENTITY_SESSION_AND_MFA

| | |
|---|---|
| **Existing controls** | Organization surfaces re-read the member's role per request, so the suspended member is still refused there.<br>• The session store is fail-closed on every other condition, including an unreachable database.<br>• The null-client path is masked by an earlier refusal, so only a mid-operation exception reaches this state. |
| **Control gaps** | The two writes are not atomic and the second one's result is not checked, so the suspension is partially applied with no signal.<br>• Sessions outside the organization surfaces remain valid until expiry. |
| **Acceptance criteria** | The status update and the session-generation bump happen in one transaction, or the revocation result is checked and the operation fails as a whole.<br>• A test asserts that a failure in the second write leaves the member unsuspended rather than half-suspended. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | An atomic suspension still leaves already-issued tokens valid until the next revocation check, which is the general property of the session model rather than a defect of this path. |

#### `R-42` — Dead product surface refuses correctly where nothing can observe it, including all site-membership management

**MEDIUM** (2×3=6) · ASSURANCE_GAP · dominant impact **AUDITABILITY** · confidence HIGH · priority 50 · phase S4_TENANT_AND_SITE_ISOLATION

| | |
|---|---|
| **Existing controls** | Every one of these functions refuses correctly when it is called, so the dead surface is not a weak surface.<br>• The deterministic inventory enumerates them mechanically rather than from memory, so the list is reviewable. |
| **Control gaps** | Site membership is a security control with no administrative surface, so the thinness in R-10 cannot even be managed.<br>• A schema column with no writer is either missing functionality or stale schema, and either way nothing tests it.<br>• Dead code inflates the apparent control surface, which is how a reviewer concludes a boundary is managed when it is not. |
| **Acceptance criteria** | Each of the nine exported functions and the unwritten column is either wired to a product surface or deleted, with the decision recorded.<br>• Site membership management is addressed first, because it is a security control rather than a convenience.<br>• A gate reports an exported function in a security-relevant module with no caller, so the class cannot silently reappear. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | Deleting a function that an unreleased feature intends to use is a product decision, not a security one; the gate reports rather than decides, and a reported function may legitimately be kept. |

#### `R-43` — Continuous integration carries no security scanning of any kind

**HIGH** (4×4=16) · ACTIVE_CONFIRMED · dominant impact **CONFIDENTIALITY + INTEGRITY + AUDITABILITY** · confidence HIGH · priority 17 · phase S2_SCANNING_AND_SUPPLY_CHAIN

| | |
|---|---|
| **Existing controls** | Third-party actions are pinned by commit, the integration workflow runs with read-only content permissions, and deployment is manual with a protected environment.<br>• The dependency-audit gate is real, governed by an explicit exceptions file with expiry dates.<br>• A restore rehearsal job exists. |
| **Control gaps** | No static analysis, so an introduced injection or authorization defect has no automated detector.<br>• No secret scanning of the tree or of history anywhere, so a committed credential would be found only by a human.<br>• No container or infrastructure scanning, no dynamic testing, no software bill of materials and no artifact signing, so a built image has no provenance. |
| **Acceptance criteria** | Static analysis, secret scanning of the tree and of history, container image scanning and infrastructure scanning all run on every pull request, with a documented triage path for findings.<br>• A software bill of materials is produced per build and the image is signed, so a deployed artifact can be traced to a commit.<br>• Each new gate starts as reporting-only with a recorded date on which it becomes blocking, so the programme is not stopped by a backlog on day one. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | Scanners produce findings the team must triage; without the governance file the dependency gate already has, a new scanner becomes an ignored red light, which is worse than its absence because it teaches the team to ignore gates. |

#### `R-44` — Five dependency advisories are open in the production tree

**MEDIUM** (3×3=9) · ACTIVE_CONFIRMED · dominant impact **CONFIDENTIALITY + INTEGRITY + AVAILABILITY** · confidence MEDIUM · priority 39 · phase S2_SCANNING_AND_SUPPLY_CHAIN

| | |
|---|---|
| **Existing controls** | A committed gate measures the advisory set on every pull request, and a governance file records accepted exceptions with expiry dates.<br>• The deliberate decision not to change the lockfile inside a security-review change is recorded in each entry, so the deferral is explicit rather than accidental. |
| **Control gaps** | Five advisories remain open in the production tree, each clearable by an in-range update that has not been applied.<br>• No exploitability assessment exists for any of the five in the context of how this platform uses the package. |
| **Acceptance criteria** | Each of the five is updated in range, or accepted through the governance file with a reason and an expiry, with the dependency-audit gate green either way.<br>• For any acceptance, the reachability of the vulnerable code path in this platform is stated rather than assumed. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | An advisory count is not a risk measure: a reachable medium matters more than an unreachable high, and nothing in this register establishes reachability for these five. |

#### `R-45` — Twenty-nine Phase 99 remediations are inherited as fixed rather than re-verified in this programme

**HIGH** (3×4=12) · ASSURANCE_GAP · dominant impact **AUDITABILITY** · confidence MEDIUM · priority 28 · phase S2_SCANNING_AND_SUPPLY_CHAIN

| | |
|---|---|
| **Existing controls** | Each closure carries a retest reference, so the evidence is named and reachable.<br>• Several of the fixes were independently corroborated in this programme as a side effect: the published-predicate fix, the client-address keying fix, the certificate-expiry fix and the four site allow-list fixes were all observed in the current source while other work was done.<br>• The five tool defects in this set were found, fixed and pinned by selftests inside this programme, so their closure is this programme's own evidence rather than inherited. |
| **Control gaps** | No test behind those closures was executed in this worktree, because it has no installed dependencies, so twenty-four of the twenty-nine rest on a prior phase's word.<br>• A fix verified once is not a fix that stays verified; nothing in this programme re-measured them. |
| **Acceptance criteria** | The Phase 99 test matrix is executed in an environment where it can run, and the result is reported per finding rather than in aggregate.<br>• Any finding whose retest no longer passes is reopened in this register with its own risk entry.<br>• The regression tests for the critical and high closures run in continuous integration, so a reintroduction fails the build. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | Re-verification needs a working dependency installation, which this programme's worktree deliberately does not have; until it is run elsewhere, the critical session-cookie finding and the three high findings about session tokens, mass assignment and site allow-lists are closed on inherited evidence. |

#### `R-46` — Containers run without runtime hardening, images are unpinned, and the development compose publishes data ports

**HIGH** (3×4=12) · ACTIVE_CONFIRMED · dominant impact **CONFIDENTIALITY + INTEGRITY** · confidence HIGH · priority 18 · phase S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING

| | |
|---|---|
| **Existing controls** | Every image stage runs as a non-root user, which is the single most valuable container control and it is present.<br>• Neither data service publishes a host port in production, the container runtime socket is not mounted, health checks and log rotation exist, and nothing applies migrations on boot.<br>• Worker images carry one dependency-free script each with no database credential. |
| **Control gaps** | A compromised process can write anywhere in its filesystem, keep every capability, escalate privileges and consume unbounded memory.<br>• Outbound egress from every container is unrestricted, which is what turns an execution foothold into exfiltration.<br>• Unpinned images mean the bytes that run are not the bytes that were reviewed, which is the supply-chain half of R-43.<br>• A weak default password is a fallback that works, so it can reach production through an unset variable. |
| **Acceptance criteria** | Production services drop capabilities, forbid privilege escalation, run with a read-only root filesystem plus explicit writable mounts, and carry memory and process limits.<br>• The internal network is genuinely internal, with egress permitted only where a service needs it and documented per service.<br>• Every image is pinned by digest, with a documented refresh procedure.<br>• No weak default credential remains reachable: an unset password fails the start rather than falling back.<br>• Rollback steps are documented for each change and exercised in a rehearsal before the change ships, because these are the changes most likely to stop a healthy service. |
| **Verification method** | `FAULT_INJECTION_REHEARSAL` |
| **Residual risk** | A read-only root filesystem and capability dropping break services that write outside their declared mounts, so this must be rehearsed before it is applied; the development compose is a deliberate convenience and the remediation is to make it unusable on a reachable host rather than to harden it. |

#### `R-47` — The database connection is unencrypted by configuration and one identity holds both migration and runtime rights

**MEDIUM** (2×5=10) · ACTIVE_CONFIRMED · dominant impact **INTEGRITY + AUDITABILITY** · confidence HIGH · priority 36 · phase S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING

| | |
|---|---|
| **Existing controls** | Traffic stays on an internal container network with no published port, so interception requires a foothold on the host.<br>• Migrations are applied by a dedicated non-root stage as an explicit step, never on boot, so the schema is not changed by the running service in normal operation. |
| **Control gaps** | Transport encryption is absent by configuration rather than by decision, so it is not stated anywhere that the internal network is the control.<br>• The application's own credential can alter the schema and rewrite the audit trail, which is what makes R-38's tamper evidence unenforceable against the application itself.<br>• Row-level security cannot be meaningfully applied while one identity holds both rights, which is why R-09 depends on this. |
| **Acceptance criteria** | A runtime role exists that cannot alter the schema and cannot delete from the audit trail, and the application uses it.<br>• The migration role is used only by the migration step, with its credential unavailable to the running service.<br>• Transport encryption is either enabled and recorded, or its absence is accepted in writing with the internal network named as the compensating control.<br>• A rehearsal proves the application still works under the restricted role before the change ships. |
| **Verification method** | `FAULT_INJECTION_REHEARSAL` |
| **Residual risk** | Role separation is a migration of its own and will surface every place the application quietly relied on schema rights; it is a prerequisite for both R-09 and R-38, which is why it is scheduled with them rather than after them. |

#### `R-48` — Traffic inside the cluster is unencrypted between the proxy, the application and the cache

**MEDIUM** (2×3=6) · ACTIVE_CONFIRMED · dominant impact **CONFIDENTIALITY + INTEGRITY** · confidence HIGH · priority 51 · phase S11_INFRASTRUCTURE_AND_CONTAINER_HARDENING

| | |
|---|---|
| **Existing controls** | Neither hop is reachable from outside the host: no port is published for the application or the cache.<br>• The cache requires a password in production.<br>• Session cookies cross this hop already encrypted at the application layer in the sense that they are opaque signed tokens, so the hop does not expose a password. |
| **Control gaps** | Anything on the container network can read every request and every cached value, including rate-limit state and session-adjacent data.<br>• There is no identity between the proxy and the application, so any container can impersonate the proxy. |
| **Acceptance criteria** | A decision is recorded on whether intra-cluster encryption is adopted, with the internal network named as the alternative control if it is not.<br>• If it is not adopted, the internal network is made genuinely internal as part of R-46, so the compensating control actually holds. |
| **Verification method** | `OWNER_POLICY_STATEMENT` |
| **Residual risk** | Encrypting internal hops adds certificate lifecycle management to a platform that does not yet have one for its gateway boundary either; accepting the internal network as the control is defensible only once that network is genuinely closed. |

#### `R-49` — The gateway boundary is per-gateway shared-secret authentication, not the mutual certificate design the target architecture requires

**MEDIUM** (2×4=8) · ACTIVE_CONFIRMED · dominant impact **INTEGRITY + INDUSTRIAL_SAFETY** · confidence HIGH · priority 40 · phase S6_OT_GATEWAY_AND_CRYPTO_LIFECYCLE

| | |
|---|---|
| **Existing controls** | Authentication is proof of possession rather than knowledge of a reference string, which a prior phase fixed deliberately.<br>• The tenant is one of the signed fields and is read from the gateway's own record, so a forged envelope cannot claim another organization.<br>• Replay is bounded by a timestamp, a nonce and an idempotency key, all inside the signed field set, with a timing-safe comparison.<br>• No model stores key material and no secret or signature is logged or returned.<br>• Enrollment, rotation and revocation routes all exist. |
| **Control gaps** | A shared secret cannot be attested to a device, so a copied secret is indistinguishable from the device.<br>• No certificate lifecycle means no expiry, no renewal and no dual-key window, so rotation is an operational event rather than a routine one — and R-34 shows revocation can currently report success without acting.<br>• Cross-gateway key separation is unverified, so the blast radius of one compromised secret is unknown. |
| **Acceptance criteria** | Cross-gateway key separation is established by reading the secret provider's key derivation, and a test proves one gateway's secret fails against another's identifier.<br>• A key lifecycle exists: expiry, a dual-key validation window for rotation, and monitoring that reports a key approaching expiry.<br>• A decision is recorded on mutual certificate authentication with a target phase, or its absence is formally accepted with the compensating controls named.<br>• Revocation is proven effective end to end, which requires R-34 to be closed first. |
| **Verification method** | `SOURCE_REVIEW` |
| **Residual risk** | Gateway properties asserted by design documents outside this repository — outbound-only initiation, offline buffering bounds, signed and rollback-safe updates and per-site certificate separation — cannot be verified here, and must not be scored as present on the strength of those documents. |

#### `R-50` — No code path from the platform reaches a programmable controller, because the capability is absent

**INFORMATIONAL** (0×0=0) · POSITIVE_CONTROL · dominant impact **NONE** · confidence HIGH · priority 54 · phase S10_OT_PRECONDITIONS_BEFORE_PROTOCOL_CLIENTS

| | |
|---|---|
| **Existing controls** | The cloud-to-controller attack path does not exist because the capability does not exist.<br>• Industrial data enters only through the signed gateway-envelope surface, which is outbound-initiated by the gateway. |
| **Control gaps** | This stops being true the moment a protocol client enters the dependency manifest, which is precisely why the preconditions for adding one must be defined before it is added. |
| **Acceptance criteria** | A gate fails the build when a package capable of speaking an industrial protocol enters the dependency manifest without an approved precondition record.<br>• The preconditions for adding one are written down before any such dependency is proposed: direction of initiation, command authorisation, safety interlocking, and what must never be writable. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | An absence of capability is the strongest control available and the easiest to lose by accident, in a single dependency addition. It is recorded as a positive control with a gate rather than as a permanent property. |

#### `R-51` — Backup, restore and recovery machinery exists and none of it was executed

**MEDIUM** (2×5=10) · ASSURANCE_GAP · dominant impact **AVAILABILITY** · confidence MEDIUM · priority 41 · phase S12_DR_RUNBOOKS_AND_REHEARSAL

| | |
|---|---|
| **Existing controls** | The machinery is real and extensive, and a restore rehearsal job exists in the pipeline.<br>• Backup envelopes are encrypted with a configured key and a minimum verified-copy count.<br>• A prior phase found and fixed a defect where backup verification was silently passing, so the failure mode is known to this codebase. |
| **Control gaps** | An unexercised restore is a hypothesis; this programme produced no evidence that data can be recovered.<br>• No recovery-point or recovery-time measurement was taken. |
| **Acceptance criteria** | A restore from a production-shaped backup into an isolated environment is executed and the result recorded, including measured recovery point and recovery time.<br>• The uploads and documents volumes are included, not only the database.<br>• The rehearsal is repeated on a schedule, and a failed rehearsal is treated as an incident. |
| **Verification method** | `FAULT_INJECTION_REHEARSAL` |
| **Residual risk** | A rehearsal in an isolated environment does not prove recovery under production conditions, with real data volumes and real time pressure; it bounds the unknown rather than removing it. No destructive operation may be performed against production to close this. |

#### `R-52` — No incident runbook exists

**HIGH** (3×4=12) · ACTIVE_CONFIRMED · dominant impact **AVAILABILITY** · confidence HIGH · priority 29 · phase S12_DR_RUNBOOKS_AND_REHEARSAL

| | |
|---|---|
| **Existing controls** | Structured logging, correlation identifiers and an operator console exist, so the raw material an incident needs is present.<br>• An incident rehearsal script exists in the pipeline tooling. |
| **Control gaps** | There is no written procedure for the incidents this register makes most likely: a database outage with silent fallback, a suspected gateway compromise, or a credential exposure.<br>• R-34 shows that the one operation an operator would reach for during a gateway incident can report success without acting, and no runbook tells them to verify it. |
| **Acceptance criteria** | A runbook exists for each incident class this register identifies as likely, naming the detection signal, the first action, the verification step and the escalation path.<br>• The gateway-compromise runbook explicitly tells the operator to verify that a revocation took effect, because the current implementation can report otherwise.<br>• Each runbook is rehearsed once and corrected from what the rehearsal reveals. |
| **Verification method** | `FAULT_INJECTION_REHEARSAL` |
| **Residual risk** | An unrehearsed runbook is a document, not a capability; the rehearsal criterion is what makes this entry closable, and rehearsals are the part most likely to be deferred. |

#### `R-53` — The worker boundary is deliberately minimal and holds no database credential

**INFORMATIONAL** (0×0=0) · POSITIVE_CONTROL · dominant impact **NONE** · confidence HIGH · priority 55 · phase S1_NO_CHANGE_REQUIRED

| | |
|---|---|
| **Existing controls** | Each worker reaches the platform through one authenticated request, so the web tier's authorization and audit apply to its work.<br>• The work is leased or idempotent at the web tier, so a retry is safe.<br>• A committed test keeps the packaging boundary from eroding. |
| **Control gaps** | The boundary rests on a worker token, so token handling is the control that must not weaken. |
| **Acceptance criteria** | The packaging test continues to assert that no worker image gains application code, installed packages or a database credential.<br>• Worker token rotation is covered by whatever secret-lifecycle work R-49 produces. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | This control is a packaging property, and packaging properties erode quietly; the committed test is what keeps it, so removing that test is the real risk. |

#### `R-54` — The rate limiter fails closed on an undeclared bucket and audits the refusal

**INFORMATIONAL** (0×0=0) · POSITIVE_CONTROL · dominant impact **NONE** · confidence HIGH · priority 56 · phase S1_NO_CHANGE_REQUIRED

| | |
|---|---|
| **Existing controls** | Thirty-four actions are registered and kept honest by a committed registry test.<br>• Inventing a new action name would block the route outright and raise an audited error, so it cannot be used to remove a limit.<br>• The in-process fallback is tighter under degradation, never unlimited. |
| **Control gaps** | The registry enforces that an action exists, not that it is semantically distinct, which is the gap R-21 sits in. |
| **Acceptance criteria** | The registry test continues to assert that every action used by a route is registered.<br>• A test asserts the refusal on an undeclared action, so the behaviour this entry records cannot regress silently. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | The product comments that describe this control still state the opposite, which is tracked as R-27; a reader who trusts the comment will still reach the wrong conclusion until those are corrected. |

#### `R-55` — No role can assign organization ownership, and every client-supplied role is clamped

**INFORMATIONAL** (0×0=0) · POSITIVE_CONTROL · dominant impact **NONE** · confidence HIGH · priority 57 · phase S1_NO_CHANGE_REQUIRED

| | |
|---|---|
| **Existing controls** | The clamp is applied after a permission check, so both the permission and the target role are validated.<br>• The invitation path validates membership of a role set and then applies the clamp, so the broader set is harmless only because the second check exists.<br>• No route contains a direct role comparison, so there is no second path that could diverge. |
| **Control gaps** | The clamp is load-bearing and its removal would silently restore a known defect; the negative tests that would catch that are the subject of R-14. |
| **Acceptance criteria** | A test asserts that no role can assign ownership through any route that accepts a role.<br>• The clamp is covered by the negative-test matrix produced for R-14. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | Because ownership cannot be assigned at all, an organization that loses its owner cannot regain one through the platform; that consequence is the policy question in R-15 rather than a defect in this control. |

#### `R-56` — The compliance organization-scope helper has a complete fail-closed ladder

**INFORMATIONAL** (0×0=0) · POSITIVE_CONTROL · dominant impact **NONE** · confidence HIGH · priority 58 · phase S1_NO_CHANGE_REQUIRED

| | |
|---|---|
| **Existing controls** | An unavailable database produces a refusal rather than a fallback, which is the opposite of the repository fallback in R-32 and shows the correct pattern exists.<br>• An ambiguous membership refuses rather than guessing, unlike the billing resolver in R-11. |
| **Control gaps** | The permission is an argument, so the privilege tier is invisible to the classifier — which is R-13, a reporting gap rather than an enforcement one. |
| **Acceptance criteria** | A test exists for each rung of the ladder, so a future change cannot remove one silently.<br>• This helper is used as the reference pattern when R-11 and R-32 are remediated. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | The ladder protects the thirty-five compliance route files that use it; the rest of the estate does not, which is the asymmetry R-63 describes. |

#### `R-57` — The enterprise-resource surface is the reference implementation of the target failure policy

**INFORMATIONAL** (0×0=0) · POSITIVE_CONTROL · dominant impact **NONE** · confidence HIGH · priority 59 · phase S1_NO_CHANGE_REQUIRED

| | |
|---|---|
| **Existing controls** | The four-gate chain is uniform, so there is no per-route judgement to get wrong.<br>• Every write is origin-checked, which no other module does.<br>• Financial fields are nulled rather than zeroed when the capability is absent, and a flag tells the client the difference between zero and withheld. |
| **Control gaps** | The capability is a derived boolean with no textual signature, so no classifier can see it — which is R-13, and the remediation there should register this capability as its first example. |
| **Acceptance criteria** | The four-gate chain and the controlled refusal are named as the target pattern in the remediation of R-32 and R-36.<br>• The derived capability is the first entry in the capability registry produced for R-13. |
| **Verification method** | `SOURCE_REVIEW` |
| **Residual risk** | A reference implementation inside the same codebase is the strongest argument that the rest of the estate can reach the same standard; it is also evidence that the standard is not currently applied, which is why the risks it contrasts with are scored where they are. |

#### `R-58` — There is exactly one mutation transport, because the framework's alternative is unused

**INFORMATIONAL** (0×0=0) · POSITIVE_CONTROL · dominant impact **NONE** · confidence HIGH · priority 60 · phase S1_NO_CHANGE_REQUIRED

| | |
|---|---|
| **Existing controls** | The route inventory is a complete enumeration of the mutation surface rather than a sample of it.<br>• There is no transport that bypasses route-level authorization. |
| **Control gaps** | The property is maintained by convention; a single server action would silently widen the surface and the inventory would not report it. |
| **Acceptance criteria** | A gate fails the build when a server action is introduced without an explicit decision, because it would widen the mutation surface beyond the inventory. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | The property is what makes the route inventory meaningful; losing it would invalidate every count in this register that is derived from the handler set. |

#### `R-59` — The session store and the tenant contract both fail closed by construction

**INFORMATIONAL** (0×0=0) · POSITIVE_CONTROL · dominant impact **NONE** · confidence HIGH · priority 61 · phase S1_NO_CHANGE_REQUIRED

| | |
|---|---|
| **Existing controls** | The refusal on an unreachable database is the correct direction and is the opposite of the repository fallback in R-32.<br>• The contract's type design removes a whole class of defect rather than guarding against it at each call site.<br>• The screening in R-60 confirmed these two by tracing their callers rather than by reading their names. |
| **Control gaps** | The session store's force is undermined by the one sid-less branch described in R-02, which is a branch above it rather than a defect in it.<br>• The contract's guarantee is undermined where a data layer queries without a predicate at all, which is R-08. |
| **Acceptance criteria** | Tests assert the fail-closed behaviour of the session store on each of its four conditions, including an unreachable database.<br>• A test asserts that the tenant contract's ambiguous and unavailable states carry no organization identifier. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | Both controls are correct and both are bypassed by a path above them, which is the pattern worth carrying forward: a fail-closed core does not make the system fail closed. |

#### `R-60` — Twelve security-control dependencies were traced and confirmed to deny rather than to succeed emptily

**INFORMATIONAL** (0×0=0) · POSITIVE_CONTROL · dominant impact **NONE** · confidence HIGH · priority 62 · phase S1_NO_CHANGE_REQUIRED

| | |
|---|---|
| **Existing controls** | The session revocation check, both actor contexts, the login credential lookup, three entitlement reads, the egress policy store, the academy request scope, the candidate retention check and two tenant-context readers all deny when the database is unavailable.<br>• The academy request scope binds its callers in a comment: an empty result must be treated as no access, never as no filter.<br>• The candidate retention check states that an outage is a refusal and never an acceptance, on a public path. |
| **Control gaps** | The inventory had been publishing a wrong verdict on the platform's session, tenant, entitlement and egress controls, which is the reporting lesson rather than an enforcement one. |
| **Acceptance criteria** | Each of the twelve has a test asserting that an unavailable database produces a denial rather than an empty success.<br>• The fingerprint-pinned adjudications that record these twelve remain under the deterministic gate, so a code change that alters them fails the build. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | These twelve were found only because the residual was screened rather than assumed; the same class of misclassification may exist wherever a rule reads a return value without reading the caller, which is the documented limitation of the instrument. |

#### `R-61` — No public handler accepts a tenant, user or role identifier, and every privileged column a public writer sets is hardcoded

**INFORMATIONAL** (0×0=0) · POSITIVE_CONTROL · dominant impact **NONE** · confidence HIGH · priority 63 · phase S1_NO_CHANGE_REQUIRED

| | |
|---|---|
| **Existing controls** | Every public route file's rate-limit action is registered, and the limiter fails closed on an undeclared one, so no public handler is silently unlimited.<br>• The anti-enumeration posture is real and consistent across four of the five authentication writers.<br>• Published predicates live in the data layer where no route may restate them. |
| **Control gaps** | One route contradicts the enumeration posture, which is R-07.<br>• Six handlers are classified as misclassified rather than public, which is R-17. |
| **Acceptance criteria** | A gate asserts that no handler on the public allowlist reads a tenant, user or role identifier from the request.<br>• The allowlist keeps a written justification per entry, as it does now. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | This was established by reading fifty handlers at one commit; it is a property of that reading, and only a gate makes it a property of the repository. |

#### `R-62` — The gateway envelope is canonicalised and replay-bounded by construction

**INFORMATIONAL** (0×0=0) · POSITIVE_CONTROL · dominant impact **NONE** · confidence HIGH · priority 64 · phase S1_NO_CHANGE_REQUIRED

| | |
|---|---|
| **Existing controls** | Canonicalising by construction removes the whole class of signature-confusion defects that arise from serialising caller input.<br>• The tenant is a signed field read from the gateway's own record, so a forged envelope cannot claim another organization.<br>• An unresolvable key reference produces a rejection rather than a default. |
| **Control gaps** | The signature is only as good as the secret's separation and lifecycle, which is R-49. |
| **Acceptance criteria** | Tests assert the canonical byte order, the timing-safe comparison and the rejection of an unknown algorithm.<br>• A test asserts that an envelope claiming a different organization fails verification. |
| **Verification method** | `AUTOMATED_TEST` |
| **Residual risk** | A correct signature scheme over a shared secret is still a shared-secret scheme; this entry records the quality of the construction, not the strength of the identity, which is R-49. |

#### `R-63` — There is no central authorization choke point for the application interface

**HIGH** (3×4=12) · ACTIVE_CONFIRMED · dominant impact **CONFIDENTIALITY** · confidence HIGH · priority 30 · phase S4_TENANT_AND_SITE_ISOLATION

| | |
|---|---|
| **Existing controls** | Every handler must prove authorization evidence in its own source or be classified unknown, and unknown fails readiness.<br>• The enterprise-resource module shows a uniform four-gate chain is achievable across a whole module.<br>• There is only one mutation transport, so the surface is at least completely enumerable.<br>• No handler is currently classified unknown. |
| **Control gaps** | A new handler that forgets its gate is caught only by a lexical classifier that cannot see past the route file, so the depth of the check does not match the depth of the risk.<br>• Static assets served from inside the public directory receive neither authorization nor a content policy, which is the surface R-22 writes to.<br>• The classifier's own limitations are the subject of R-13, so the compensating control for this architectural choice is itself a known assurance gap. |
| **Acceptance criteria** | A decision is recorded on whether a shared enforcement wrapper is adopted for the interface, with the enterprise-resource chain as the candidate pattern, because retrofitting it touches every handler.<br>• Until then, the classifier is strengthened per R-13 so that a handler without a reached gate cannot pass as classified.<br>• A response-header policy covers the static upload path, which middleware does not reach. |
| **Verification method** | `DETERMINISTIC_TOOL_GATE` |
| **Residual risk** | A central wrapper concentrates the decision and therefore concentrates the failure: a defect in it would affect every handler at once. That is a better trade than five hundred and seventy-two independent decisions, and it is still a trade, which is why the first criterion is a recorded decision rather than an implementation. |

#### `R-64` — Five security-relevant surfaces were declared out of scope in the source phase and remain unexamined

**HIGH** (3×4=12) · ASSURANCE_GAP · dominant impact **CONFIDENTIALITY + INTEGRITY** · confidence LOW · priority 31 · phase S3_IDENTITY_SESSION_AND_MFA

| | |
|---|---|
| **Existing controls** | Each of the five is recorded as unexamined rather than assumed sound, which is why they appear here at all.<br>• The inventory reports no unauthenticated webhook, which is a lexical result rather than a reading of the signature check.<br>• The document volume is outside the public directory and is reached only through an authorizing path. |
| **Control gaps** | A single-sign-on implementation is an authentication surface and nothing is known about it.<br>• The platform-administrative tier is the largest privileged classification in the inventory and has never been audited handler by handler.<br>• A webhook signature check is the only thing standing between a payment provider's identity and an unauthenticated write. |
| **Acceptance criteria** | Each of the five is examined and its result recorded, with the webhook signature check and the platform-administrative tier taken first because they carry the most authority.<br>• Any finding is added to this register with its own risk entry rather than appended to this one.<br>• This entry is closed only when all five have been read, not when a subset has. |
| **Verification method** | `SOURCE_REVIEW` |
| **Residual risk** | THE CONFIDENCE ON THIS ENTRY IS LOW AND THE SCORE IS THEREFORE THE LEAST RELIABLE IN THE REGISTER. It is an estimate of the risk of not knowing, derived from what these surfaces are rather than from what they contain, and it may move sharply in either direction once they are read. |
<!-- /S1-BLOCK:matrix -->

### Appendix B — scoring calibration

<!-- S1-BLOCK:calibration -->
```
SCORED_RISKS                 53   (the 11 positive controls score 0 by construction)
HIGH_COUNT                   35
HIGH_PERCENT_OF_SCORED       66%
DISTINCT_SCORES_USED         9 of 14 reachable

score histogram
   4  # (1)
   6  ##### (5)
   8  ##### (5)
   9  ### (3)
  10  #### (4)
  12  ############### (15)
  15  ############## (14)
  16  #### (4)
  20  ## (2)

likelihood distribution
  L=2  10
  L=3  27
  L=4  12
  L=5  4

impact distribution
  I=1  1
  I=2  4
  I=3  13
  I=4  19
  I=5  16
```

**What this means, and it is a weakness of the method rather than of the estate.** 35 of 53 scored risks (66%) land in HIGH, and only 9 of the 14 reachable scores are used. Likelihood clusters because it is a *mean* of four factors, and the HIGH band spans 12 to 19, which is wide. **Severity therefore does not order the work on its own.** The remediation order in §12 is a severity-consistent total order over `remediationPriority`, and `productionState` is what separates a confirmed exposure from a configuration-guarded one inside the same band. Reading the band alone will mislead; the register is built so that nobody has to.
<!-- /S1-BLOCK:calibration -->

### Appendix C — the dominant impact dimension

Which axis set each risk's band, because `max()` does not say.

<!-- S1-BLOCK:dominant -->
| Dominant impact dimension | Scored risks | Of which HIGH |
|---|---|---|
| AUDITABILITY | 14 | 11 |
| CONFIDENTIALITY + INTEGRITY | 10 | 6 |
| CONFIDENTIALITY | 9 | 7 |
| AVAILABILITY | 5 | 3 |
| INTEGRITY + AUDITABILITY | 4 | 3 |
| CONFIDENTIALITY + AUDITABILITY | 3 | 0 |
| INTEGRITY + AVAILABILITY | 2 | 2 |
| AVAILABILITY + AUDITABILITY | 1 | 1 |
| CONFIDENTIALITY + INTEGRITY + AUDITABILITY | 1 | 1 |
| CONFIDENTIALITY + INTEGRITY + AVAILABILITY | 1 | 0 |
| INDUSTRIAL_SAFETY | 1 | 1 |
| INTEGRITY | 1 | 0 |
| INTEGRITY + INDUSTRIAL_SAFETY | 1 | 0 |

**14 risks take their impact from `AUDITABILITY` alone, 11 of them HIGH.** That is the register's most important calibration caveat: `max()` is correct for security impact — averaging would dilute a confidentiality breach — but it makes one number stand for very different kinds of harm. An `ASSURANCE_GAP` risk can reach HIGH because the platform cannot *evidence* a control, not because data can leak. The dimension column above is derived from the factors on every run and gated, so the kind of harm always travels with the band.
<!-- /S1-BLOCK:dominant -->

### Appendix D — independent review closure

The findings of the first independent adversarial review of this register, and what was done about each.

<!-- S1-BLOCK:closure -->
| Review finding | Reviewed severity | Status | Where it was fixed | Test or gate that proves it |
|---|---|---|---|---|
| `S1-RV-001` | MEDIUM | **FIXED** | report §4 and §6 prose | runtimeEvidenceContradictions now scans the report; 4 selftests |
| `S1-RV-002` | MEDIUM | **FIXED** | risk-register-check.mjs — runtimeEvidenceContradictions(reg, md) | markdown-contradiction selftests, incl. a superseded historical quote that must pass |
| `S1-RV-003` | MEDIUM | **FIXED** | risk-register-check.mjs — findingUniverseViolations | EDGE-02 deletion, H-1 plus ownership deletion, invented finding, LOCK count and hash |
| `S1-RV-004` | LOW | **FIXED** | risk-register-check.mjs — secretShapeViolations | one selftest per shape class, plus harmless placeholders that must pass |
| `S1-RV-005` | LOW | **FIXED** | register R-52 affectedAssets | asset-coherence selftest; score unchanged at 12 |
| `S1-RV-006` | LOW | **FIXED** | report appendix A, generated | markdownBlockDrift over the matrix block |
| `S1-RV-007` | LOW | **FIXED** | R-05, R-40, R-44, R-46 criteria + verificationLinkageViolations | linkage selftests: missing, wrong and correct method |
| `S1-RV-008` | INFORMATIONAL | **FIXED** | .gitattributes and report §14.2 | git check-attr on all four artifacts; 0 CR bytes |
| `S1-RV-009` | INFORMATIONAL | **FIXED_BY_DISCLOSURE_AND_DERIVED_PRESENTATION** | report appendix B, generated | markdownBlockDrift over the calibration block |
| `S1-RV-010` | INFORMATIONAL | **FIXED_BY_DISCLOSURE_AND_DERIVED_PRESENTATION** | register dominantImpact + report appendix C | dominantImpactViolations; tie ordering is the fixed factor order |
| `S1-RV-011` | INFORMATIONAL | **FIXED** | privilegeAccessibility across all four artifacts | zero occurrences of the old key; monotonic direction asserted |

No review finding is OPEN. The two marked `FIXED_BY_DISCLOSURE_AND_DERIVED_PRESENTATION` were calibration criticisms of the scoring method, not defects in the data: the bands and every severity are unchanged, and what was added is derived presentation so a reader can see the saturation and the dominant harm without recomputing them. **The review identifiers are deliberately NOT security findings** — they are not among the register's 161 and they own no risk.
<!-- /S1-BLOCK:closure -->

### Appendix E — the mutation manifest

<!-- S1-BLOCK:mutations -->
| Mutant | Target | Mutation | Named test | Observed |
|---|---|---|---|---|
| `FA-01a` | secret detector | trailing digits no longer split off a segment | S1-FA-01: a credential name with digits glued to its family fails in every syntax and at every register level | **TARGETED_KILL** |
| `FA-01b` | secret detector | only a digit segment after an underscore is dropped, a glued number is kept | S1-FA-01: a credential name with digits glued to its family fails in every syntax and at every register level | **TARGETED_KILL** |
| `FA-01c` | secret detector | camelCase no longer split into segments | S1-FA-01: a credential name with digits glued to its family fails in every syntax and at every register level | **TARGETED_KILL** |
| `FA-01d` | secret detector | a family matched as a substring of the name | S1-FA-01: digits never make an ordinary word a credential name | **TARGETED_KILL** |
| `FA-02a` | structure walk | the value walk skips past depth 64 again, quietly | S1-FA-02: a secret or a command nested 60, 64, 65 and 128 levels deep is a real finding, with its path | **TARGETED_KILL** |
| `FA-02b` | structure walk | a key walk past the budget returns as if complete | S1-FA-02: an object inside arrays at depth is walked, and the walk stops only at the budget, loudly | **TARGETED_KILL** |
| `FA-02c` | structure walk | the key walk skips past depth 64 again, quietly | S1-FA-02: a secret or a command nested 60, 64, 65 and 128 levels deep is a real finding, with its path | **TARGETED_KILL** |
| `FA-02d` | structure walk | a property's path is not propagated to its subtree | S1-FA-02: an object inside arrays at depth is walked, and the walk stops only at the budget, loudly | **TARGETED_KILL** |
| `FA-02e` | check wiring and exit table | the structure gate removed from runGates | S1-FA-02 wiring: a register past the structure budget stops runGates with exit 27 before any other gate | **TARGETED_KILL** |
| `FA-03b` | error reporting | a quoted path is no longer redacted as one span | S1-FA-03: a path with spaces is redacted whole — quoted, unquoted, UNC, POSIX, Unicode, several in one message | **TARGETED_KILL** |
| `FA-03c` | error reporting | a UNC path no longer starts a path | S1-FA-03: a path with spaces is redacted whole — quoted, unquoted, UNC, POSIX, Unicode, several in one message | **TARGETED_KILL** |
| `FA-03d` | error reporting | an internal error printed without redaction | S1-FA-03: the real command line prints an internal error with every path redacted and no stack trace | **TARGETED_KILL** |
| `FA-03e` | error reporting | an unreadable register prints the parser's quotation of the file | S1-FA-03: a register that is not JSON prints a fixed logical message, never the parser's quotation of it | **TARGETED_KILL** |
| `FA-04a` | assertion ledger | a test that made no assertion no longer fails | S1-FA-04: the ledger fails exactly the tests that run no assertion, whatever their source text looks like | **TARGETED_KILL** |
| `FA-04b` | assertion ledger | one record shared by every test, so an earlier test's assertions count for a later one | S1-FA-04: the ledger fails exactly the tests that run no assertion, whatever their source text looks like | **TARGETED_KILL** |
| `FA-04c` | assertion ledger | a direct assert() call is not counted | S1-FA-04: the ledger fails exactly the tests that run no assertion, whatever their source text looks like | **TARGETED_KILL** |
| `FA-04d` | assertion ledger | an assertion is credited to the test started last, not to the test that made it | S1-FA-04: the ledger fails exactly the tests that run no assertion, whatever their source text looks like | **TARGETED_KILL** |
| `FA-04e` | assertion ledger | registered tests are not recorded, so the reconciliation has nothing to compare | S1-FA-04: the ledger fails exactly the tests that run no assertion, whatever their source text looks like | **TARGETED_KILL** |
| `FA-05b` | forbidden content | a file URI no longer names a system path | S1-FA-05: a system path is found whatever wraps it — prose, code span, table cell, emphasis, and every JSON level | **TARGETED_KILL** |
| `FA-05c` | forbidden content | the etc root dropped from the system-path rule | S1-FA-05: a system path is found whatever wraps it — prose, code span, table cell, emphasis, and every JSON level | **TARGETED_KILL** |
| `FA-05d` | forbidden content | the end-of-segment boundary removed, so a longer name matches | S1-FA-05: URLs, relative paths and words that are not system paths pass | **TARGETED_KILL** |
| `FA-I1a` | forbidden content | hydra dropped from the extended probe rule | S1-FA I1: nikto, sqlmap, sslscan, hydra, ncat and ss in command position fail in Markdown and at every JSON level | **TARGETED_KILL** |
| `FA-I1b` | forbidden content | ss dropped from the extended probe rule | S1-FA I1: nikto, sqlmap, sslscan, hydra, ncat and ss in command position fail in Markdown and at every JSON level | **TARGETED_KILL** |
| `FA-I1c` | forbidden content | ss matched inside any word, without a boundary | S1-FA I1: prose that names the same tools passes | **TARGETED_KILL** |
| `FA-I2a` | secret detector | the compact-name rule removed | S1-FA I2: dotted and compact credential names fail; words that merely contain a family do not | **TARGETED_KILL** |
| `FA-I2b` | secret detector | a dot no longer joins two segments of a name | S1-FA I2: dotted and compact credential names fail; words that merely contain a family do not | **TARGETED_KILL** |
| `FA-I2c` | secret detector | the assignment key stops at a dot | S1-FA I2: dotted and compact credential names fail; words that merely contain a family do not | **TARGETED_KILL** |
| `R3-B01` | block parser and drift | block extraction trims the text | whitespace at either edge of a block is drift | **TARGETED_KILL** |
| `R3-B02` | block parser and drift | parser ignores an unterminated block | a known block whose CLOSING marker is missing is UNTERMINATED, named as such | **TARGETED_KILL** |
| `R3-B03` | block parser and drift | block order check removed | reordering the blocks fails, and each invariant is asserted on its own | **TARGETED_KILL** |
| `R3-B04` | block parser and drift | block drift comparison disabled | a hand edit inside a generated block fails, and the failure names the line | **TARGETED_KILL** |
| `R3-B05` | block parser and drift | headline panel left out of the generated blocks | the report carries no contradiction of the evidence the register holds | **TARGETED_KILL** |
| `R3-D01` | secret detector | sensitive-key suffix anchor removed (any key CONTAINING a family word) | a verdict token or a hash under a NON-sensitive key is not a credential; under a sensitive key it is | **TARGETED_KILL** |
| `R3-D02` | secret detector | key name stops at an underscore | every secret shape class is detected | **TARGETED_KILL** |
| `R3-D03` | secret detector | long hex values exempt from the placeholder rule | a verdict token or a hash under a NON-sensitive key is not a credential; under a sensitive key it is | **TARGETED_KILL** |
| `R3-D04` | secret detector | UPPER_SNAKE values exempt | placeholders and evidence states pass — and only the documented, exact ones | **TARGETED_KILL** |
| `R3-D05` | secret detector | any value starting ${ is an environment reference | placeholders and evidence states pass — and only the documented, exact ones | **TARGETED_KILL** |
| `R3-D06` | secret detector | bare value truncated at ; \| , * ) | a placeholder PREFIX never excuses the rest of the value | **TARGETED_KILL** |
| `R3-D07` | secret detector | an unclosed quote or a glued closing quote is no longer its own finding | under a sensitive key every non-placeholder value is a credential | **TARGETED_KILL** |
| `R3-D08` | secret detector | a quoted value closes on EITHER quote character | S1-R4 FR-02: nothing may be glued to a quoted placeholder | **TARGETED_KILL** |
| `R3-D09` | secret detector | decoded string leaves not scanned for assignments | nested objects, nested arrays and several string leaves are all walked | **TARGETED_KILL** |
| `R3-D10` | secret detector | sensitive JSON property names not checked | a sensitive JSON PROPERTY is detected by its own name; a placeholder value passes | **TARGETED_KILL** |
| `R3-D11` | secret detector | findings are not de-duplicated | S1-R5 F-03: benign property names pass, and de-duplication keeps the STRUCTURED_KEY witness | **TARGETED_KILL** |
| `R3-D12` | secret detector | raw register scan removed | the RAW register level catches an assignment that only a duplicated JSON key carries | **TARGETED_KILL** |
| `R3-D13` | secret detector | secret id takes the raw value, trailing markup included | nested objects, nested arrays and several string leaves are all walked | **TARGETED_KILL** |
| `R3-D14` | secret detector | the JSON-structure excuse widened to ANY unclosed quote | a register string that merely ENDS in a key and an equals sign is not a finding, but an open quote inside a string still is | **TARGETED_KILL** |
| `R3-D15` | secret detector | the JSON-structure excuse removed | a register string that merely ENDS in a key and an equals sign is not a finding, but an open quote inside a string still is | **TARGETED_KILL** |
| `R3-F01` | forbidden content | HH:MM:SS rule neutered | reportForbiddenHits reports the line and the class, not just a boolean | **TARGETED_KILL** |
| `R3-F02` | forbidden content | network / privilege command rule neutered | every forbidden family is caught in the report AND the register, in prose, inline code, a fence and a table cell | **TARGETED_KILL** |
| `R3-F03` | forbidden content | system absolute path rule neutered | every forbidden family is caught in the report AND the register, in prose, inline code, a fence and a table cell | **TARGETED_KILL** |
| `R3-F04` | forbidden content | register decoded forbidden-content scan removed | every forbidden family is caught in the report AND the register, in prose, inline code, a fence and a table cell | **TARGETED_KILL** |
| `R3-F05` | forbidden content | remote-shell rule back to user@host directly after the tool | every forbidden family is caught in the report AND the register, in prose, inline code, a fence and a table cell | **TARGETED_KILL** |
| `R3-F06` | forbidden content | forbidden rules not applied to the report | an absolute path, a date-time or a command in the REPORT fails | **TARGETED_KILL** |
| `R3-K01` | historical-marker pin | marker count check removed | a third marker, a removed marker, an edited line and a look-alike are each refused | **TARGETED_KILL** |
| `R3-K02` | historical-marker pin | unpinned marker line allowed | a genuine superseded quotation passes with the exact marker on its own line | **TARGETED_KILL** |
| `R3-K03` | historical-marker pin | missing or edited pinned line not noticed | a third marker, a removed marker, an edited line and a look-alike are each refused | **TARGETED_KILL** |
| `R3-K04` | historical-marker pin | look-alike marker not noticed | a marker disguised by whitespace or Unicode neither exempts nor goes unnoticed | **TARGETED_KILL** |
| `R3-K05` | historical-marker pin | pins not applied inside reportContradictions | a genuine superseded quotation passes with the exact marker on its own line | **TARGETED_KILL** |
| `R3-K06` | historical-marker pin | marker digest takes a lower-cased line | the report carries no contradiction of the evidence the register holds | **TARGETED_KILL** |
| `R3-K07` | historical-marker pin | several markers on one line allowed | a third marker, a removed marker, an edited line and a look-alike are each refused | **TARGETED_KILL** |
| `R3-L01` | verification linkage | negation / hedge guard removed from the linkage | every verification method has a real operational positive and a real negative | **TARGETED_KILL** |
| `R3-L02` | verification linkage | hedge guard removed alone | a negated or hedged sentence is not evidence of the method, but a negation elsewhere in the sentence is harmless | **TARGETED_KILL** |
| `R3-L03` | verification linkage | bare 'gate' accepted for the tool-gate method | a criterion that merely mentions a keyword is refused | **TARGETED_KILL** |
| `R3-L04` | verification linkage | bare 'observation' accepted for the vantage method | every verification method has a real operational positive and a real negative | **TARGETED_KILL** |
| `R3-L05` | verification linkage | bare 'in a test' accepted for the test method | every verification method has a real operational positive and a real negative | **TARGETED_KILL** |
| `R3-L06` | verification linkage | bare 'is recorded' accepted for the policy method | every verification method has a real operational positive and a real negative | **TARGETED_KILL** |
| `R3-L07` | verification linkage | bare 'declares' accepted for source review | every verification method has a real operational positive and a real negative | **TARGETED_KILL** |
| `R3-L08` | verification linkage | bare 'rehearsal' accepted for fault injection | every verification method has a real operational positive and a real negative | **TARGETED_KILL** |
| `R3-T01` | narrative figures | narrative completeness scan removed | the two figures that went stale are caught, in both shapes | **TARGETED_KILL** |
| `R3-T02` | narrative figures | fact value comparison removed | the two figures that went stale are caught, in both shapes | **TARGETED_KILL** |
| `R3-T03` | narrative figures | unknown fact keys allowed | a new count typed into the narrative without a marker is refused, and a malformed marker is too | **TARGETED_KILL** |
| `R3-T04` | narrative figures | malformed fact marker not noticed | a new count typed into the narrative without a marker is refused, and a malformed marker is too | **TARGETED_KILL** |
| `R3-T05` | narrative figures | narrative fact gate not wired into check | S1-R5 F-01 wiring: a stale narrative figure stops runGates with exit 24 | **TARGETED_KILL** |
| `R3-T06` | narrative figures | fact markers read from a stale hard-coded count | the facts a marker may name cover every figure the review required | **TARGETED_KILL** |
| `R3-X01` | check wiring and exit table | dominant-impact gate removed from check | S1-R5 F-01 wiring: a stored dominant impact stops runGates with exit 20 | **TARGETED_KILL** |
| `R3-X02` | check wiring and exit table | canonical-form gate removed from check | S1-R5 F-01 wiring: a register in non-canonical form stops runGates with exit 14 | **TARGETED_KILL** |
| `R3-X03` | check wiring and exit table | secret gate removed from check | S1-R5 F-01 wiring: a secret in a deliverable stops runGates with exit 22 | **TARGETED_KILL** |
| `R3-X04` | check wiring and exit table | forbidden-content gate removed from check | S1-R5 F-01 wiring: an operational command in a deliverable stops runGates with exit 23 | **TARGETED_KILL** |
| `R3-X05` | check wiring and exit table | block gate removed from check | S1-R5 F-01 wiring: a hand edit inside a generated block stops runGates with exit 21 | **TARGETED_KILL** |
| `R3-X06` | check wiring and exit table | summary drift reports the block-drift code | S1-R5 F-01 wiring: summary drift stops runGates with exit 13 | **TARGETED_KILL** |
| `R3-X07` | check wiring and exit table | undeclared shared exit: finding universe reports the linkage code | S1-R5 F-01 wiring: a shrunken finding universe stops runGates with exit 18 | **TARGETED_KILL** |
| `R3-X08` | check wiring and exit table | a shared exit is no longer declared | the exit table is honest: names are distinct, shared codes are declared, and nothing else is shared | **TARGETED_KILL** |
| `R3-X09` | check wiring and exit table | linkage gate removed from check | S1-R5 F-01 wiring: an unlinked verification method stops runGates with exit 19 | **TARGETED_KILL** |
| `R3-X10` | check wiring and exit table | contradiction gate removed from check | S1-R5 F-01 wiring: a contradiction of the runtime evidence stops runGates with exit 15 | **TARGETED_KILL** |
| `R4-01a` | secret detector | the pass / pwd / passphrase families removed | S1-R4 FR-01: SMTP_PASS and its shapes fail; look-alike names do not | **TARGETED_KILL** |
| `R4-01b` | secret detector | trailing qualifier segments no longer stripped | S1-R5 F-04: only the closed metadata suffixes and look-alike words are exempt | **TARGETED_KILL** |
| `R4-02` | secret detector | text glued to a closing quote is ignored | S1-R4 FR-02: nothing may be glued to a quoted placeholder | **TARGETED_KILL** |
| `R4-03a` | narrative figures | the truthfulness lead types a figure instead of deriving it | S1-R4 FR-03: the truthfulness lead is rendered from the register | **TARGETED_KILL** |
| `R4-03b` | narrative figures | the unmarked-count scan back to two intervening words | S1-R4 FR-03: a typed 'N of the M HIGH risks' claim is refused | **TARGETED_KILL** |
| `R4-04a` | renderer figures | the calibration block types the positive-control count | S1-R4 FR-04: renderer figures move with the register | **TARGETED_KILL** |
| `R4-04b` | renderer figures | the closure block types the finding count | S1-R4 FR-04: renderer figures move with the register | **TARGETED_KILL** |
| `R4-04c` | renderer figures | the reachable-score count typed as 25 | S1-R4 FR-04: renderer figures move with the register | **TARGETED_KILL** |
| `R4-05a` | forbidden content | the scanner / probe rule neutered | S1-R5 F-05: a wrapped system path or a probe command fails in Markdown and at every JSON level | **TARGETED_KILL** |
| `R4-05b` | forbidden content | the var/log, usr and proc roots dropped from the system-path rule | S1-R5 F-05: a wrapped system path or a probe command fails in Markdown and at every JSON level | **TARGETED_KILL** |
| `R4-07a` | secret detector | a connection string must name a user again | S1-R4 FR-07: credential-bearing Redis URLs fail; credential-free and placeholder ones pass | **TARGETED_KILL** |
| `R4-07b` | secret detector | every connection-string password exempt | S1-R4 FR-07: credential-bearing Redis URLs fail; credential-free and placeholder ones pass | **TARGETED_KILL** |
| `R4-08` | check wiring and exit table | the entry point compared as raw strings again | S1-R4 FR-08: the checker run through a junction or symlink still checks | **TARGETED_KILL** |
| `R4-10` | block parser and drift | a non-canonical block marker line accepted | S1-R4 FR-10: a block marker line must be exactly canonical | **TARGETED_KILL** |
| `R4-11` | check wiring and exit table | an internal failure exits 1 like a missing file | S1-R4 FR-11: an internal failure exits 70 without a stack trace | **TARGETED_KILL** |
| `R4-12a` | mutation manifest | the manifest gate removed from check | S1-R5 F-01 wiring: a mutation record that is not a targeted kill stops runGates with exit 25 | **TARGETED_KILL** |
| `R4-12b` | mutation manifest | a campaign recorded against a different manifest accepted | S1-R4 FR-12 / S1-R5 F-01: the mutation manifest is bound, current, and every mutant is a TARGETED_KILL | **TARGETED_KILL** |
| `R4-12c` | mutation manifest | a recorded survivor accepted | S1-R4 FR-12 / S1-R5 F-01: the mutation manifest is bound, current, and every mutant is a TARGETED_KILL | **TARGETED_KILL** |
| `R4-12d` | mutation manifest | a stale anchor accepted | S1-R4 FR-12 / S1-R5 F-01: the mutation manifest is bound, current, and every mutant is a TARGETED_KILL | **TARGETED_KILL** |
| `R4-M15` | secret detector | raw token-shape scan removed from a register that parses | S1-R5 M15: a token shape that only a duplicated JSON key carries is caught at the RAW level | **TARGETED_KILL** |
| `R5-03a` | secret detector | the decoded scan of property NAMES removed from the secret detector | S1-R5 F-03: every property NAME is scanned decoded, with its path, for secret shapes and assignments | **TARGETED_KILL** |
| `R5-03b` | forbidden content | the decoded scan of property NAMES removed from the forbidden-content detector | S1-R5 F-03: every property NAME is scanned for forbidden content at the STRUCTURED_KEY level | **TARGETED_KILL** |
| `R5-03c` | secret detector | the key walk no longer descends into arrays (S1-FA-02: array traversal removed) | S1-R5 F-03: every property NAME is scanned decoded, with its path, for secret shapes and assignments | **TARGETED_KILL** |
| `R5-04a` | secret detector | only the WHOLE key name judged, so a qualifier hides the family again | S1-R5 F-04: an unknown qualifier after a credential family stays sensitive in every syntax | **TARGETED_KILL** |
| `R5-05a` | forbidden content | the closed wrapper allowlist restored: only listed wrappers may precede a system path (S1-FA-05) | S1-FA-05: a system path is found whatever wraps it — prose, code span, table cell, emphasis, and every JSON level | **TARGETED_KILL** |
| `R5-05b` | forbidden content | a DNS record type no longer makes dig an invocation | S1-R5 F-05: a wrapped system path or a probe command fails in Markdown and at every JSON level | **TARGETED_KILL** |
| `R5-05c` | forbidden content | the dotted `testssl.sh` invocation dropped from the scanner rule | S1-R5 F-05: a wrapped system path or a probe command fails in Markdown and at every JSON level | **TARGETED_KILL** |
| `R5-C01` | mutation classifier | a red suite counted as the named test failing | S1-R5 F-02 classifier: a green named test is SURVIVED even when another test fails | **TARGETED_KILL** |
| `R5-C02` | mutation classifier | the failure fingerprint no longer checked | S1-R5 F-02 classifier: a failure without the fingerprint is ONLY_INCIDENTAL | **TARGETED_KILL** |
| `R5-C03` | mutation classifier | the placebo control removed | S1-R5 F-02 classifier: a red placebo voids the kill | **TARGETED_KILL** |
| `R5-C04` | mutation classifier | the manifest-gate exclusion removed, so an incidental failure counts | S1-R5 F-02 classifier: a failure that only reaches exit 25 is ONLY_INCIDENTAL | **TARGETED_KILL** |
| `R5-C05` | mutation classifier | the setup-failure exclusion removed | S1-R5 F-02 classifier: a setup error is INVALID_MUTANT, never a kill | **TARGETED_KILL** |
| `R5-C06` | mutation campaign | a deviation no longer fails the campaign | S1-R5 F-02 campaign: anything but a TARGETED_KILL makes the campaign exit non-zero | **TARGETED_KILL** |
| `R5-C07` | mutation campaign | a filtered-out test read as a result | S1-R5 F-02 tap: the parser keeps ok and not ok results, drops skipped ones, and never reads the stack | **TARGETED_KILL** |
| `R5-C08` | mutation campaign | the stack frames read as failure evidence | S1-R5 F-02 tap: the parser keeps ok and not ok results, drops skipped ones, and never reads the stack | **TARGETED_KILL** |
| `R5-C09` | mutation campaign | the rebinding no longer verified before it is used | S1-R5 F-01 rebinding: a copy is rebound by metadata only, and the placebo copy is rebound the same way | **TARGETED_KILL** |
| `R5-C10` | mutation campaign | the rebinding keeps entries whose anchors the change removed | S1-R5 F-01 rebinding: a copy is rebound by metadata only, and the placebo copy is rebound the same way | **TARGETED_KILL** |
| `R5-I02a` | review closure | the open-finding rule neutered, so no status is ever open | S1-R5 I-02: an open review finding changes the closure text and turns the gate red | **TARGETED_KILL** |
| `R5-I02b` | review closure | the closure sentence typed instead of derived | S1-R5 I-02: an open review finding changes the closure text and turns the gate red | **TARGETED_KILL** |
| `R5-I03a` | error reporting | an unquoted path is redacted only up to the first whitespace again (S1-FA-03) | S1-FA-03: a path with spaces is redacted whole — quoted, unquoted, UNC, POSIX, Unicode, several in one message | **TARGETED_KILL** |
| `R5-I03b` | error reporting | the missing-register message carries the absolute path again | S1-R5 I-03: a missing register exits 1 and prints no absolute path and no stack trace | **TARGETED_KILL** |
| `R5-I04a` | secret detector | a leading underscore hides a credential name again | S1-R5 I-04: leading underscores do not hide a credential name | **TARGETED_KILL** |
| `R5-I05a` | secret detector | the valkey, memcached, ldap and http schemes dropped from the URI rule | S1-R5 I-05: credentials in URI userinfo fail for every scheme; credential-free and placeholder URIs pass | **TARGETED_KILL** |

| Placebo control | Kind | What it does | Named test | Expected | Observed |
|---|---|---|---|---|---|
| `C-01` | SEMANTIC_NOOP | the secret gate's condition rewritten with the same meaning | S1-R5 F-01 wiring: a secret in a deliverable stops runGates with exit 22 | SURVIVED | **SURVIVED** |
| `C-02` | COMMENT_OR_WHITESPACE | a comment above the same gate rewritten | S1-R5 F-01 wiring: a secret in a deliverable stops runGates with exit 22 | SURVIVED | **SURVIVED** |
| `C-03` | MANIFEST_DRIFT_ONLY | a recorded result edited inside the manifest, so only the manifest gate fires | every exit code of `check` is reachable from the command line, with the code the table names | ONLY_INCIDENTAL | **ONLY_INCIDENTAL** |
| `C-04` | SETUP_BREAK | the module made unparseable, so nothing under test runs | S1-R5 F-01 wiring: a secret in a deliverable stops runGates with exit 22 | INVALID_MUTANT | **INVALID_MUTANT** |
| `C-05` | EARLIER_GATE | an earlier gate forced to fire, so the named test fails with another code | S1-R5 F-01 wiring: a secret in a deliverable stops runGates with exit 22 | ONLY_INCIDENTAL | **ONLY_INCIDENTAL** |
| `C-06` | UNRELATED_FAILURE | the gate's label reworded, so the named test fails for another reason | S1-R5 F-01 wiring: a secret in a deliverable stops runGates with exit 22 | ONLY_INCIDENTAL | **ONLY_INCIDENTAL** |

```
MUTATION_MANIFEST_VERSION    s1-mut-2
MUTANTS_TOTAL                127
TARGETED_KILL                127
ONLY_INCIDENTAL              0
SURVIVED                     0
INVALID_MUTANT               0
PLACEBO_CONTROLS             6
CONTROLS_AS_EXPECTED         6
MANIFEST_SHA256              84977cd9b4394e031b7fe7dc480a3dee2402b966034e7f1a283b47bf612c1bc1
CAMPAIGN_BOUND_TO            84977cd9b4394e031b7fe7dc480a3dee2402b966034e7f1a283b47bf612c1bc1
```

Each mutant is applied to the checker's own source in a temporary copy outside the repository, and only its named test is run. **A mutant counts as TARGETED_KILL only when** its anchor occurs exactly once, the named test ran and failed, the failure carries the mutant's fingerprint, the failure is not the manifest gate, a manifest drift or a setup error, and a semantically equivalent placebo on the same source text leaves the named test green. Because a mutation removes its own anchor, this list is, in the mutated copy only, rebound to the entries whose anchors survive, and Appendix E of the copy is re-rendered from it; the mutated code is never repaired, and the placebo copy is rebound the same way, so a failure caused by the scaffolding appears in the placebo and voids the proof. The placebo controls prove the classifier does not mistake a no-op, a drift, a setup break, an earlier gate or an unrelated failure for a kill. `check` refuses a record bound to a different list, any result other than TARGETED_KILL, and any control whose result differs from its expectation (exit 25). The campaign is reproduced by the `mutants` mode (§18).
<!-- /S1-BLOCK:mutations -->

---

## 18. Reproduction manifest

```bash
# the register and its gate
node scripts/security/s1/risk-register-check.mjs generate     # canonicalise in place
node scripts/security/s1/risk-register-check.mjs check        # every invariant, exit 0 when clean
node scripts/security/s1/risk-register-check.mjs summary      # the computed counters

# determinism
node scripts/security/s1/risk-register-check.mjs generate
sha256sum docs/security/s1-risk-register.json
node scripts/security/s1/risk-register-check.mjs generate
sha256sum docs/security/s1-risk-register.json                 # identical

# the selftest
node --test scripts/security/s1/__tests__/risk-register.selftest.mjs

# the mutation campaign behind Appendix E, in a temporary copy outside the repository
node scripts/security/s1/risk-register-check.mjs mutants --workers=6

# the surrounding gates
npm run security:phase99:inventory:check                      # exit 0
node scripts/security/s0/getprisma-callsite-inventory.mjs check
node scripts/security/s0/getprisma-callsite-inventory.mjs coverage

# independent accounting, using none of the checker's own functions
node -e "const j=require('./docs/security/s1-risk-register.json');
  const sev={}; for(const r of j.risks) sev[r.severity]=(sev[r.severity]||0)+1;
  const own={}; for(const r of j.risks) for(const f of r.sourceFindingIds) own[f]=(own[f]||0)+1;
  console.log('risks',j.risks.length,'findings',j.findings.length);
  console.log('severities',JSON.stringify(sev));
  console.log('findings owned twice',Object.keys(own).filter(k=>own[k]>1).length);
  console.log('findings with no status',j.findings.filter(f=>!f.status).length);
  const bad=j.risks.filter(r=>r.severity==='CRITICAL'&&r.productionState!=='ACTIVE_CONFIRMED');
  console.log('critical without active-confirmed',bad.length)"

# isolation
git status --porcelain --untracked-files=all
git diff --stat HEAD                                          # .gitattributes only: S1 is uncommitted by instruction
                                                              # status: ' M .gitattributes' and four untracked artifacts
sha256sum docs/security/EDGE-ORIGIN-AND-CLIENT-IP.md          # unchanged from the S0 closure
```
