# SECURITY-THREAT-MODEL.md

HFCC threat model. Phase 0 — design only.

Method: STRIDE per trust boundary, plus the plant-specific hazards that generic
web threat modelling misses. Every control names *where* it is enforced, and
every threat names its **negative control** (the test that proves the attack
fails).

---

## 1. TRUST BOUNDARIES

```
TB-1  Internet  -> Intake plane        (unauthenticated-but-tokened, EXTERNAL PARTY)
TB-2  Internet  -> Control plane       (authenticated human session)
TB-3  DMZ Relay -> Ingest plane        (machine credential, no human)
TB-4  Collector -> Relay               (plant-internal, one-way)
TB-5  OPC UA    -> Collector           (OT network, read-only session)
TB-6  Tenant A  -> Tenant B            (logical, inside one database)
TB-7  Site A    -> Site B              (logical, inside one tenant)
TB-8  Operator  -> Credential plane    (privilege elevation, step-up)
TB-9  Mutable   -> Evidence/audit      (append-only)
```

**TB-1 is the highest-risk boundary** and it is new: HFCC deliberately gives a
party who has **no Hermes account** a credentialed path into a tenant's data.
Nothing else in the platform does that at this scale. Sections 3 and 4 are
mostly about TB-1.

**TB-6 and TB-7 are the highest-impact boundaries.** A cross-tenant leak here
is not a privacy incident; it is one factory's plant topology, tag list and
network diagram delivered to a competitor.

---

## 2. ASSETS, RANKED BY CONSEQUENCE

| # | Asset | Loss consequence |
|---|---|---|
| A-1 | **Ability to write to a PLC** | **physical harm, plant damage.** Mitigated by non-existence: no write path exists anywhere. |
| A-2 | Factory OPC UA credentials | full OT read, and a foothold for a future write path |
| A-3 | Plant network diagram, VLANs, DMZ layout, firewall refs | a targeting map for an OT attack |
| A-4 | Tag list | reveals the process, recipes and safety interlocks |
| A-5 | Hermes gateway credential | telemetry forgery, tenant data poisoning |
| A-6 | Evidence pack / FAT sign-off | a fraudulent commissioning record |
| A-7 | Intake invitation token | lateral access to A-2…A-4 |
| A-8 | Audit / transition chain | repudiation of who did what |
| A-9 | Certificate fingerprints | MITM preparation |

> **A-2 is protected structurally, not procedurally.** Hermes has **no writable
> secret store** — `src/lib/ot-edge/secret-manager.ts` is resolve-only
> (`ot-no-writable-secret-store`). There is no column, no API and no code path
> that could persist a factory OPC UA password. A reviewer does not have to
> trust that HFCC *chooses* not to store it; HFCC *cannot*.

---

## 3. THREATS — TB-1, THE INTAKE PLANE

| id | Threat | STRIDE | Control | Where enforced | Negative control |
|---|---|---|---|---|---|
| T1-01 | Token guessed / brute-forced | S | ≥256-bit CSPRNG token; lookup by SHA-256; constant-time compare; rate limit per IP + `tokenPrefix`; lockout | invitation guard | `N-INT-01` 10 000 random tokens → all 401, constant-time within tolerance |
| T1-02 | Token replayed after submission | S | `submittedAt` set ⇒ single-use; second submit `409 invitation_spent` | DB + applier | `N-INT-02` |
| T1-03 | Token used after expiry | S | `expiresAt > now()` checked server-side on **every** call | guard | `N-INT-03` |
| T1-04 | Token used after revocation | S | `revokedAt IS NULL` required | guard | `N-INT-04` |
| T1-05 | **Token used to reach another site or tenant** | E | scope comes from the **token row**, never a path/body parameter; there is no site/tenant parameter on this plane at all | route shape | `N-INT-05` — attempt every intake route with a foreign `requestId` → 404 |
| T1-06 | Token used to reach the dashboard | E | middleware excludes `/factory-intake` from the authenticated shell; intake session type cannot satisfy `requireSession()` | middleware + guard | `N-INT-06` — every `/dashboard/*` route with an intake token → 401/404 |
| T1-07 | Token leaked via URL (log, Referer, analytics) | I | token travels in the **URL fragment**, sent as a `Bearer` header; never a query string | invitation email + client | `N-INT-07` — assert no access-log line and no `Referer` contains the token |
| T1-08 | Token enumeration via differential responses/timing | I | invalid, expired, revoked and non-existent all return the **same** body and status; hash lookup makes work identical | guard | `N-INT-08` |
| T1-09 | Malicious tag CSV — formula injection | T | first char in `= + - @ TAB CR` ⇒ **row REJECTED**, not neutralised | parser | `N-CSV-01` for each prefix |
| T1-10 | Malicious upload — polyglot / wrong type | T | MIME allowlist checked against **sniffed** content, not the declared header; extension allowlist; no execution path | upload guard | `N-UP-01` (PNG-headed CSV, HTML-in-XLSX, zip bomb) |
| T1-11 | Upload DoS (size / rows / errors) | D | byte cap **before buffering**; row cap during streaming parse; `rowErrors` capped at 200 with a truncation flag | parser | `N-UP-02` |
| T1-12 | Zip-bomb / XXE via XLSX | D | decompressed-size cap; XML external entities **disabled**; no DTD | parser | `N-UP-03` |
| T1-13 | Path traversal via filename | T | filename normalised to a **basename**; `storageKey` is server-derived and never client-influenced | upload guard | `N-UP-04` (`../../etc/passwd`, UNC, NTFS stream, long-path) |
| T1-14 | Stored XSS via a tag display name | T | React escapes by default; **no `dangerouslySetInnerHTML` anywhere in HFCC**; a gate test greps for it | render + gate test | `N-XSS-01` |
| T1-15 | **SSRF via `endpointUrl`** | E | scheme allowlist `opc.tcp:` **only**; host parsed and stored separately; **Hermes never dials it** — only the plant-side Collector does; no CORE-side fetch of any plant-supplied URL exists | Zod + architecture | `N-SSRF-01` — `http://169.254.169.254/`, `file://`, `gopher://`, DNS-rebind host → all refused, and assert **zero** outbound socket from CORE |
| T1-16 | CSRF on an intake mutation | T | `Bearer` header token (not a cookie) ⇒ not ambiently sent; `SameSite` cookies elsewhere; origin check | guard | `N-CSRF-01` |
| T1-17 | Intake submits forged completeness | T | completeness recomputed **server-side** from stored rows; `readOnlyConfirmed` / `mocConfirmed` are explicit stored booleans, not derived from a summary field | T-04 guard | `N-ST-04` |

> **T1-15 deserves emphasis.** The classic SSRF mitigation is an allowlist of
> destinations. HFCC's mitigation is stronger and structural: **CORE never makes
> an outbound connection to a plant-supplied address at all.** Connectivity
> checks are pulled and executed by the plant-side agent. The allowlist is
> defence-in-depth for a URL that is only ever *stored and displayed*. The
> negative control asserts the absence of a socket, not merely a rejected URL —
> because a future contributor adding a "test this endpoint from the server"
> convenience is exactly how this class of hole gets drilled.

---

## 4. THREATS — TB-6 / TB-7, TENANT AND SITE ISOLATION

| id | Threat | Control | Negative control |
|---|---|---|---|
| T6-01 | Client-supplied `organizationId` honoured | tenant resolved from `ActiveOrganizationSelection[sid]` only; no HFCC Zod schema **declares** an `organizationId` field, so one cannot be sent | `N-TEN-01` — post a foreign `organizationId` in body/query/header on every mutation → ignored, operation scoped to the session's tenant |
| T6-02 | `findUnique({ id })` then compare | **every** HFCC lookup is `findFirst({ where: { id, organizationId } })`; a gate test greps HFCC source for `findUnique` on HFCC models | `N-TEN-02` |
| T6-03 | Cross-tenant existence leak via 403-vs-404 | cross-tenant ⇒ **404**, identical to absent | `N-TEN-03` — compare byte-for-byte responses for absent vs. foreign id |
| T6-04 | Nested write reaching another tenant | every nested create re-resolves the parent scoped; FKs composite-indexed with `organizationId` | `N-TEN-04` |
| T6-05 | Cross-**site** read inside one tenant | `requireSitePermission` as a **second** axis after the org check (two unrelated RBAC axes, per Phase 94C1) | `N-SITE-01` — org ADMIN without site B → 404 on site B's request |
| T6-06 | Aggregate/count leaking other tenants | every aggregate is org-filtered **in SQL**; counts never computed in application code over an unfiltered set | `N-TEN-05` |
| T6-07 | Idempotency key collision across tenants | `@@unique([organizationId, operation, keyHash])` | `N-TEN-06` — same key, two tenants, two independent results |
| T6-08 | Evidence download by id from another tenant | `storageKey` resolved only through an org-scoped row; no direct key access | `N-TEN-07` |

> **A count-based fail-closed scope check is the established pattern here**
> (Phase 90B knowledge tenancy). Where HFCC must decide "does this user have
> access to all of these ids", it counts the accessible subset and refuses
> unless the count matches — rather than filtering and proceeding with fewer.

---

## 5. THREATS — TB-8, THE CREDENTIAL PLANE

| id | Threat | Control | Negative control |
|---|---|---|---|
| T8-01 | **API key used to manage credentials** | `refuseApiKeyCredential` runs **before any lookup** → `401 session_required` | `N-CRED-01` — industrial.write key, admin-scope key, and gateway device key each on every credential route |
| T8-02 | Credential issued without step-up | `requireRecentAuth` on T-08, T-14, T-21 and every provisioning route (owner **D-1**) | `N-CRED-02` — valid session, stale auth → 401 `recent_auth_required` |
| T8-03 | Credential re-readable after issuance | no column stores plaintext; the only copy is the issuing response body | `N-CRED-03` — exhaustive: no HFCC GET returns a credential-shaped value |
| T8-04 | Credential in HTML / RSC flight data | credential never enters a server component's props or the RSC payload | `N-CRED-04` — fetch the page, grep the **whole** flight payload |
| T8-05 | Credential in logs / audit / telemetry | logger redaction; `AuditLog.metadata` schema forbids secret-shaped keys | `N-CRED-05` + a repository secret scan |
| T8-06 | **Revoked credential still works** | owner **D-7**: a REVOKED binding revokes its API key on **every** path | `N-CRED-06` — revoke, then retry with the OLD key; also probe the key against *every* industrial route, not just the one revoked |
| T8-07 | Legacy `apiKeyId` written without step-up | owner **D-4**: session + step-up required | `N-CRED-07` |
| T8-08 | Unbound `industrial.write` key can PATCH `apiKeyId` | known Combined-tree behaviour (CONV FR-4); HFCC's routes refuse it; owner **D-6**: a legacy binding accepts **only** a key with exactly `industrial.write` | `N-CRED-08` |
| T8-09 | Package downloaded with no receipt | the download route records `downloadedAt/By/Count` in the **same transaction** as the stream authorisation | `N-CRED-09` |
| T8-10 | Package tampered after sealing | manifest + per-file SHA-256 + `manifestSha256` over the canonicalised manifest; `SEALED` rows immutable | `N-CRED-10` — flip one byte, verification fails |

> **T8-06's negative control is deliberately broader than the obvious test.**
> FC1 finding **F-021** was exactly this: a REVOKED binding left its `ApiKey`
> valid, and because the gateway column no longer referenced it,
> `refuseGatewayDeviceKey` stopped seeing it — so a "revoked" device key could
> still create assets. **Three test suites passed while that hole was open.**
> What found it was a cheap lab probe with the *old* key after rotation. HFCC's
> `N-CRED-06` therefore retries the revoked key against every industrial route,
> not only the route it was revoked on.

---

## 6. THREATS — TB-3, THE INGEST PLANE

| id | Threat | Control | Negative control |
|---|---|---|---|
T3-01 | Forged telemetry from a stolen credential | credential binding verified per request; `GatewayEnvelopeNonce` replay guard; HFCC displays `provenance`, never trusts `source` | `N-ING-01`
T3-02 | **Client-declared provenance accepted** | owner **D-2**: `source` is **never** used for provenance; provenance is server-derived from the verified credential and gateway profile | `N-ING-02` — post `source: "FACTORY"` from a simulator gateway → still `SIMULATED`
T3-03 | **Backfill rendered as LIVE** | freshness from `receivedAt`; a reading whose `timestamp` is far behind `receivedAt` is `REPLAY`; `REPLAY` is **never** LIVE (owner **D-5**) | `N-ING-03` — ingest a 3-hour-old measurement now; assert `REPLAY`, not LIVE
T3-04 | `UNKNOWN` provenance upgraded | owner **D-5**: `UNKNOWN` is never upgraded, `source` never upgrades it, **no backfill** | `N-ING-04`
T3-05 | Future timestamps poisoning "latest" | `timestamp` is untrusted and never orders "latest"; `receivedAt` does | `N-ING-05` — 20 001 future-dated pairs (the measured Combined-tree scenario) → ordering unaffected
T3-06 | Ingest advances the state machine | the ingest plane cannot call `applyTransition`; T-10/T-11 are **system** transitions driven by a server-side evaluator reading stored observations | `N-ING-06`
T3-07 | Duplicate / out-of-order silently dropped | counted into `ShadowSession` and displayed; never hidden | `N-ING-07`
T3-08 | **DB outage answers 401 and halts the relay** | `503 upstream_unavailable` when the lookup cannot be performed; `401` only for a genuinely wrong credential | `N-ING-08` — induce a DB outage, assert 503, assert the relay resumes after recovery
T3-09 | Unbounded ingest exhausting the DB | batch size caps; rate limiting; `TelemetryRecord` is **unpartitioned** on `main`, so every read path is time-bounded and limited | `N-ING-09`
T3-10 | Statement-timeout starvation | bounded queries + statement timeout isolation (measured PASS in the Combined tree, MQ-4) | `N-ING-10`

---

## 7. THREATS — TB-9, EVIDENCE AND AUDIT

| id | Threat | Control | Negative control |
|---|---|---|---|
T9-01 | Transition row edited | hash chain; `@@unique([requestId, sequence])`; applier never updates a transition | `N-AUD-01` — edit a row directly in SQL, chain verification fails and names the row
T9-02 | Transition row deleted | sequence gap detected by the verifier | `N-AUD-02`
T9-03 | Chain forked | unique `(requestId, sequence)` makes a fork a DB error | `N-AUD-03`
T9-04 | Hash recomputed over re-ordered JSON | **JCS (RFC 8785)**, never `JSON.stringify` | `N-AUD-04` — verify across key orderings and number formats
T9-05 | Forged timestamp | `occurredAt` server-set; **strict RFC 3339, UTC `Z`, real calendar, Gregorian leap, no leap second, `-00:00` refused** | `N-AUD-05` — the R21-F11 timestamp battery
T9-06 | Sealed evidence mutated | `sealedAt` set ⇒ immutable; replacement via `supersededById` | `N-AUD-06` — direct UPDATE refused
T9-07 | Missing reason / actor | `reason` non-null and applier-enforced; `actorUserId` null **only** when `actorKind = SYSTEM` | `N-AUD-07`
T9-08 | **Chain presented as tamper-proof** | documentation and UI say tamper-**evident**; third-party anchoring is out of scope (**OD-H**) | reviewed as copy, in all three locales
T9-09 | Pack manifest self-reference | the manifest is not an artifact listed inside itself | `N-AUD-08`

> **T9-08 is an honesty control, not a technical one.** The chain detects
> tampering by anyone who cannot rewrite every subsequent row *and* the stored
> head. A database administrator can. Describing it as tamper-proof in a
> commissioning document that a customer may rely on would be a
> misrepresentation, so the wording is fixed in all three locales.

---

## 8. THREATS — SAFETY AND THE PLANT ITSELF

These are the threats a generic web threat model omits, and they are the ones
with physical consequences.

| id | Threat | Control | Negative control |
|---|---|---|---|
P-01 | **A write/command path reaches a PLC** | `readOnlyMode @default(true)`; no write opcode exists; Collector is a read-only client; `AutomationTag` carries no value; Digital Twin invariant | `N-SAFE-01` — a gate test greps the whole HFCC + ot-edge surface for write/command verbs and asserts **zero**; connectivity check **C-17** is a positive no-write proof against the server |
P-02 | **A SIMULATOR result shown as a FACTORY PASS** | `executionMode` server-set from the gateway profile; readiness treats non-`FACTORY` as unsatisfied; the three FAT tallies are never merged; real execution disabled while no adapter exists | `N-SAFE-02` — a fully-passing SIMULATOR run must not yield `FAT_PASSED`, must not raise the score, must not clear a blocker |
P-03 | **`FAIL`/`NOT_RUN`/`NOT_MEASURED` counted as PASS** | counting rule is absolute; T-14 requires zero of each **and** zero missing required checks | `N-SAFE-03` — one `NOT_MEASURED` among 23 `PASS` → T-14 refused |
P-04 | A readiness average hides a security blocker | two-stage, non-commutative; a blocker **replaces** the score | `N-SAFE-04` — one BLOCKER + everything else perfect → `HOLD`, no number emitted |
P-05 | A premature readiness claim | `FACTORY_READY`/`PILOT_READY`/`DEPLOY_READY`/`PRODUCTION_READY` forbidden in any rendered surface without an owner ruling | `N-SAFE-05` — a gate test greps the build output **and** all three i18n catalogues |
P-06 | Stale data read as current during an outage | freshness from `receivedAt`; `STALE` and `DISCONNECTED` are distinct, explicit states | `N-SAFE-06` |
P-07 | MITM on the OPC UA session | fingerprint pinning; observed-vs-declared mismatch ⇒ `MISMATCH` + automatic `BLOCKER`; `SecurityPolicy.NONE` and deprecated Basic128Rsa15/Basic256 raise blockers | `N-SAFE-07` |
P-08 | Clock skew corrupting ordering and evidence | NTP offset is check **C-14**; offset beyond tolerance raises a blocker; server time is authoritative for everything stored | `N-SAFE-08` |
P-09 | A disabled UI control taken for a gate | **every** HOLD is enforced at the route handler; the UI mirrors server state | `N-SAFE-09` — call every gated route directly with a fully-privileged session while held → refused `423` |

> **P-09 is the lesson of Gate A, restated as a test.** "Pre-existing" and
> "out of scope" were not allowed to excuse an unenforced boundary then, and a
> disabled button is not allowed to stand in for one now. The negative control
> bypasses the UI entirely — which is what an attacker, or a hurried engineer
> with `curl`, will do.

---

## 9. CONTROL COVERAGE AGAINST THE BRIEF'S CHECKLIST

| Required | Where |
|---|---|
tenant isolation | §4; every model `organizationId`; DB-level filtering
CSRF | header-token intake; `SameSite` cookies; origin check (T1-16)
SSRF protection | §3 T1-15 — structural: CORE never dials a plant URL
XSS protection | React escaping; **no `dangerouslySetInnerHTML`**, gate-tested
safe file upload | §3 T1-10..T1-13
CSV formula-injection prevention | §3 T1-09 — **reject**, not neutralise
rate limiting | intake per IP (`X-Real-IP` only) + per `tokenPrefix`; control plane per session
idempotency | `IdempotencyKey`; same-key-different-payload ⇒ 409
replay protection | `submittedAt`, `useCount`, `GatewayEnvelopeNonce`
invitation expiration / revocation | `expiresAt`, `revokedAt`, checked every call
step-up | `requireRecentAuth` on T-08 / T-14 / T-21 and all provisioning
least privilege | six separate permissions; execute ≠ approve
audit | `AuditLog` + hash-chained `FactoryStateTransition`
HttpOnly session | existing session system, unchanged
CSP compatibility | **no inline script or style** in HFCC
X-Frame-Options / frame-ancestors | `DENY` + `'none'` (already in force)
no secret in HTML/RSC | §5 T8-04, with a full-flight-payload grep
no secret in logs | §5 T8-05 + repository secret scan
no credential in telemetry | §5 T8-05
fail-closed authorization | every guard refuses on error; no `catch → allow`
ownership lookup **after** authentication | guard order §2 of the API contract
negative controls for cross-tenant access | §4, all eight

---

## 10. RESIDUAL RISKS — ACCEPTED AND DECLARED

| id | Residual risk | Why it remains | Mitigation |
|---|---|---|---|
R-01 | **Hermes cannot verify the plant actually uses a read-only OPC UA user** beyond what check C-08 observes | a server may expose read-only behaviour to one session and not another | C-08 + C-17 (no-write proof) + `readOnlyConfirmed` as a **declared, attributed** confirmation by a named contact, with MOC reference. Declared ≠ verified, and the UI says so. |
R-02 | The audit chain is tamper-**evident**, not tamper-**proof** | no external anchoring | declared in copy; **OD-H** |
R-03 | Single-slot credential rotation on `main` (one `apiKeyId`) has a cutover, not an overlap | FC1's `GatewayCredentialBinding` is not merged | UI states the cutover; **OD-B** |
R-04 | No DB-level `(gateway, sequenceId)` dedup on `main` | documented as deferred in the schema | duplicates detected and displayed, never claimed impossible |
R-05 | `TelemetryRecord` is unpartitioned | partitioning explicitly deferred by the schema | every read bounded + limited; growth monitored |
R-06 | The SIMULATOR/real-adapter boundary depends on `EdgeGatewayProfile.simulatorMode` being correct | an operator could mis-provision a gateway as non-simulator | provisioning requires step-up and is audited; `executionMode` is immutable on a recorded result |
R-07 | `touchGatewayHeartbeat(id)` takes **no `organizationId`** while every sibling in `src/lib/industrial/gateways.ts` does | measured asymmetry; cause not yet established | **flagged for Phase-1 verification before HFCC calls it.** Not asserted as a defect here — it may be safe because the id is resolved from an already-verified binding. It must be read before use. |
R-08 | Intake is a genuinely external party with a credential | inherent to the requirement | the entire §3 control set; the plane can reach exactly one request and nothing else |
R-09 | `OI-FC1-19` (first-render false `UNKNOWN`) and `OI-FC1-24` (ingest median 4.9 s at 500) carried from FC1 | FC1 not merged; they apply only under Tier B | re-measure if FC1 lands |

---

## 11. SECRET-HANDLING RULES — ABSOLUTE

1. HFCC **never** reads, prints, logs or stores: env files, API keys, OAuth
   tokens, DB/Redis passwords, SSH or TLS private keys, cloud or payment
   credentials, session secrets.
2. No HFCC model declares a field matching
   `/pass(word)?|secret|privateKey|keystore|pfx|credential$/i`. **Gate-tested.**
3. A factory OPC UA credential never reaches CORE. There is no column for it.
4. The Hermes gateway credential exists in plaintext only in the issuing
   response body, in memory, once.
5. `.env.example` documents variable **names** only.
6. A repository secret scan runs in CI.

> **Secret-scan calibration, learned the hard way (FC1 F-039):** a scan whose
> name filter is too broad flags identifier slugs and cuids and refuses a
> clean pack. The working configuration excludes **only** declared identifier
> keys that have identifier shapes, listed by key. A scan nobody can pass gets
> switched off, which is worse than a calibrated one.
