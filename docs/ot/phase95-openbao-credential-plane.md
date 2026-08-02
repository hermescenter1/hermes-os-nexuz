# Phase 95 — OpenBao-Backed OT Credential Plane (Application & Repository Closure)

> **Status.** Application/repository closure only. The backend ships **DISABLED
> BY DEFAULT**. Production activation is a separate, owner-controlled step (see
> [`phase95-activation-runbook.md`](./phase95-activation-runbook.md)). Nothing in
> this phase contacts Production or OpenBao, generates real credentials, or
> changes OpenBao state.

Phase 94 delivered the OpenBao KV v2 adapter, the AppRole token provider, the
fail-closed runtime composition, the enrollment lifecycle, the least-privilege
policy template, the AppRole bootstrap/rollback tooling, and a lab runbook — but
left them **unwired in production and disabled by default**. Phase 95 closes the
remaining application/repository gaps so a later activation is safe, repeatable
and evidenced. It does **not** rebuild Phase 94.

---

## 1. EXISTING_STATE_MATRIX

Classification of every relevant artifact as of base `911a2d7`.

| Area | Artifact | Classification | Phase 95 action |
| --- | --- | --- | --- |
| Writable contract | `src/lib/ot-edge/secret-manager.ts` | COMPLETE | reuse unchanged |
| KV v2 adapter | `src/lib/ot-edge/openbao-secret-manager.ts` | PARTIAL | **hardened**: redirect reject, timeout, response-size bound |
| AppRole token provider | `src/lib/ot-edge/openbao-approle-token-provider.ts` | PARTIAL | **hardened**: redirect reject, timeout, response-size bound |
| Runtime composition | `src/lib/ot-edge/openbao-runtime-composition.ts` | PARTIAL | thread bounded-client config |
| Runtime resolver | `src/lib/ot-edge/secret-backend.ts` | PARTIAL | **hardened**: symlink/non-regular credential-file reject; new bounded env |
| Enrollment lifecycle | `src/lib/ot-edge/services/enrollment-service.ts` | COMPLETE | reuse unchanged (atomic + compensating + fail-closed) |
| Enrollment routes | `src/app/api/ot/gateways/[id]/enrollment/**` | COMPLETE | reuse (no-store, resolveOtServices) |
| Least-privilege policy | `ops/openbao/policy/hermes-gateway-kv.hcl.tpl` | COMPLETE (lab) | reuse; documented for production |
| AppRole bootstrap/rotation/rollback | `ops/openbao/bootstrap/{approle-bootstrap,revoke}.sh` | COMPLETE (lab) | reuse; referenced by activation runbook |
| Lab runbook | `ops/openbao/RUNBOOK.md` | COMPLETE (lab) | reuse |
| Env documentation | `.env.example` (OT Edge block) | PARTIAL | add the two new bounded-client vars + CA note |
| Readiness / observability | secret-backend health surface | **MISSING** | **new** `secret-backend-health.ts` + console/API panel |
| Prod Compose wiring | `docker-compose.prod.yml` | **MISSING** | **new** disabled-by-default overlay `docker-compose.prod.openbao.yml` |
| Disposable OpenBao CI rehearsal | `.github/workflows/ci.yml` | **MISSING** | **new** `phase95-openbao` job + `scripts/ci/phase95-openbao-rehearsal.mjs` |
| Adversarial tests (redirect/timeout/size/symlink/…) | existing suites | **MISSING** (8 gaps) | **new** `phase95-adversarial-hardening.test.ts` |
| Production activation / DR runbook | — | **MISSING** | **new** `phase95-activation-runbook.md` |
| Private transport (WireGuard/mTLS), TLS CA install, DNS, snapshot gate, AppRole credential delivery, systemd persistence, reboot/unseal validation | infrastructure | EXTERNAL_OWNER_CONFIGURATION | documented as prerequisites only |
| Real OpenBao server init/unseal/Raft, real AppRole SecretIDs, production `.env` | infrastructure | OUT_OF_SCOPE | never touched |

---

## 2. Threat model & invariants (with enforcement)

Every invariant below is enforced in code and covered by a deterministic test.
File anchors are given for the primary enforcement point.

### Credential material never persists or leaks
- **Plaintext secret exists only as bounded in-memory bytes, returned exactly once.**
  `enrollment-service.ts` generates 32 bytes, wipes them (`raw.fill(0)`) on every
  path, and PostgreSQL stores only the opaque reference + lifecycle metadata.
- **SecretID / RoleID / client token never in Git, env, image layers, argv, logs,
  audit, metrics, errors or responses.** The adapters read the token per request
  and never cache/log it; errors carry a fixed code only (`SecretManagerError`).
  Audit uses an allow-list; `metrics.ts` forbids `signingKeyRef`/`nonce` labels.
- **RoleID/SecretID come from dedicated files, not request input**, read at login
  time (`secret-backend.ts` `readCredentialFile`, line 66).

### Transport is bounded and cannot be redirected or downgraded
- **HTTPS required except an explicit loopback lab** — endpoint scheme is checked
  in both adapter factories; a non-loopback `http:` endpoint fails closed.
- **Redirects are rejected** — every request sets `redirect: "error"`
  (`openbao-secret-manager.ts:172`, `openbao-approle-token-provider.ts:143`), so a
  3xx cannot bounce a token to another origin.
- **Request URLs are pinned to the configured origin** (SSRF) — `urlFor`/`loginUrl`
  assert `new URL(...).origin === origin`.
- **Timeouts are bounded** — every request runs under an `AbortController` timer
  (`openbao-secret-manager.ts:169`); default 5 s, hard ceiling 120 s.
- **Response size is bounded** — a declared `Content-Length` over the byte bound
  fails closed (`assertResponseSize`, `openbao-secret-manager.ts:156`); default
  64 KiB, ceiling 1 MiB. The timeout bounds the rare no-length case.
- **TLS hostname and configured CA are verified** — native `fetch` verifies the
  hostname and the CA chain (private CA trusted via `NODE_EXTRA_CA_CERTS`).

### Bounded, non-recursive authentication
- **Token is memory-only, served until just before lease expiry, then re-auth.**
  Re-authentication is bounded — one `login()` per expiry, **no recursive retry**
  (`openbao-approle-token-provider.ts` `getToken`).
- **Single-flight login** — concurrent callers share one in-flight login
  (`inflight`, line 199); a failed login is never cached.

### Fail closed, never fall back
- **Disabled mode makes zero network calls** — `OT_SECRET_BACKEND !== "openbao"`
  → `manager = null`, no env read, no request (`secret-backend.ts`).
- **Enabled-but-invalid throws** — a missing/invalid variable throws
  `PROVIDER_UNAVAILABLE`; it never falls back to an env HMAC key, PostgreSQL, an
  in-memory provider, a root token, or anonymous access.
- **Backend outage never causes plaintext fallback**; a bad reference resolves to
  a single generic denial (`writableSecretProvider`), never a distinct
  revoked-vs-unknown signal.

### Isolation, atomicity, compensation (Phase 94, reused)
- Tenant + site scope enforced upstream (route kit) and again at every repo call;
  a foreign id is byte-identical to a missing one.
- Create/rotate/revoke/delete are atomic-or-compensating; rotation never
  invalidates the active credential before the replacement commits; a failed DB
  write deletes the just-created secret; revocation succeeds DB-only even with the
  backend down.

### Credential-file hardening (Phase 95)
- A **symlinked or non-regular** credential file is rejected before any read
  (`secret-backend.ts:68`). File **mode** is enforced host-side (bootstrap
  `umask 077`/`0600`; runbook mandates `0400`); a container Docker file-secret is
  intentionally `0444`, so the runtime does not additionally reject on
  world-readability, which would break the documented deployment.

---

## 3. Disabled-by-default proof

- `readSecretBackendReadiness()` returns `disabled` and performs **zero** network
  calls unless `OT_SECRET_BACKEND === "openbao"` — asserted with a `fetch` spy in
  `secret-backend-health.test.ts`.
- `secret-backend.test.ts` asserts disabled resolution makes zero manager calls
  and reads no configuration.
- `docker-compose.prod.yml` contains no `OT_SECRET_BACKEND` and no `openbao`
  reference — asserted by `phase95-compose-overlay.static.test.ts`. Activation
  requires BOTH `-f docker-compose.prod.openbao.yml` AND three explicit host-path
  env vars (`:?` guards), so nothing activates by accident.

---

## 4. Bounded-client configuration

| Variable | Default | Range | Meaning |
| --- | --- | --- | --- |
| `OPENBAO_REQUEST_TIMEOUT_MS` | 5000 | 1..120000 | per-request abort timeout |
| `OPENBAO_MAX_RESPONSE_BYTES` | 65536 | 1..1048576 | declared-response-size bound |
| `OPENBAO_EXPIRY_SKEW_SECONDS` | 30 | ≥ 0 | re-auth this many seconds before lease expiry |

An out-of-range value fails closed at construction.

---

## 5. Observability

`readSecretBackendReadiness()` (network-free, config-derived) is surfaced in the
Phase 92/93 operator console model and in `GET /api/admin/observability`
(`health.secretBackend`). It reports `disabled` / `configured_not_checked` /
`degraded` only — it **never** reports `healthy` (no live probe runs on an admin
snapshot; a disabled/uninstrumented dependency is never shown healthy).
`classifySecretBackendOutcome()` produces the reachable/authenticated states
(`healthy` / `authentication_failed` / `tls_failed` / `unreachable`) **only** from
real credential-operation outcomes. A rendered operator-console **panel** is
deferred: legitimate six-cell visual acceptance requires an authenticated admin
session backed by a database, which this environment cannot provide —
`VISUAL_ACCEPTANCE_BLOCKED_BY_ENVIRONMENT`.
