# Phase 95 — OpenBao OT Credential Plane: Production Activation Runbook

> **Owner-controlled.** This runbook is executed by the platform owner/operator,
> not by CI and not by any agent. It assumes the external prerequisites (private
> transport, TLS CA, DNS, snapshot gate, AppRole delivery, systemd persistence,
> reboot/unseal validation) are already established **outside this repository**.
>
> **No command below prints a secret.** RoleID, SecretID, tokens, unseal keys and
> recovery keys are handled via files and stdin only — never argv, never stdout.
> Placeholders like `<openbao-host>`, `<deploy-user>`, `<gateway-id>` and
> `/secure/outside/repo/hermes-openbao/` must be substituted for your environment.
> **Never commit real addresses, keys, or credentials to this repository.**

---

## 0. Trust boundaries & architecture

```
[ Production app host ]  --private transport (WireGuard/mTLS)-->  [ OpenBao host ]
  hermes-web container                                             bao server (Raft)
   │ reads role_id/secret_id files (RO, /run/secrets)               KV v2: <mount>/data/<prefix>/*
   │ AppRole login → short-TTL token (memory only)                  AppRole: hermes-gateway
   │ KV v2 create/read/patch/delete on its prefix only              least-privilege policy
   ▼
  PostgreSQL: opaque signingKeyRef + lifecycle metadata ONLY (never the secret)
```

- The application authenticates **only** with `role_id` + `secret_id` and receives
  a short-TTL AppRole token. **No root token ever reaches application config.**
- The private transport, TLS termination, and DNS are **external prerequisites**.
  The repository encodes **no** infrastructure address.

**Command locations.** Each step is tagged **[OPENBAO]** (run on the OpenBao host
or an admin workstation with a scoped admin token) or **[PROD]** (run on the
Production app host). Never run OpenBao admin commands from the Production app host.

---

## 1. Exact prerequisites (verify before activation)

- [ ] Private transport (WireGuard/mTLS) up; Production can reach `<openbao-host>`
      on the OpenBao port over the private link only.
- [ ] OpenBao reachable over **HTTPS** with a valid certificate for its private
      hostname; the private CA is installed at
      `/secure/outside/repo/hermes-openbao/openbao-ca.pem`.
- [ ] OpenBao is **initialized and unsealed**, and unseal/recovery behaviour has
      been **independently validated** (see §17). **Do not reboot** the OpenBao
      host until this is proven.
- [ ] KV v2 mount `<mount>` and least-privilege policy reviewed (§3).
- [ ] AppRole `hermes-gateway` exists; `role_id`/`secret_id` delivered (§4–§5).
- [ ] A recent **encrypted Raft snapshot** exists and restores cleanly (§2).

---

## 2. Mandatory encrypted Raft snapshot gate (do this FIRST)

Activation must not proceed without a verified, encrypted, off-host snapshot.

**[OPENBAO]**
```bash
# Take a snapshot using the backup-only AppRole/policy (read-only on the snapshot
# path). See ops/openbao/policy/hermes-staging-raft-backup.hcl for the shape.
bash scripts/openbao-snapshot-backup.sh          # writes an encrypted snapshot off-host
```
- [ ] Snapshot encrypted at rest, stored off the OpenBao host.
- [ ] Restore rehearsed on a **disposable** OpenBao (never the production node) —
      see §18. Do not continue until a restore has succeeded at least once.

---

## 3. Policy review

Review the least-privilege policy that the AppRole will carry. It must grant
**exactly** the six KV v2 operations and nothing else:

```hcl
path "<mount>/data/<prefix>/*"     { capabilities = ["create","read","patch","delete"] }
path "<mount>/metadata/<prefix>/*" { capabilities = ["read","delete"] }
```
Source of truth: [`ops/openbao/policy/hermes-gateway-kv.hcl.tpl`](../../ops/openbao/policy/hermes-gateway-kv.hcl.tpl).

- [ ] No `update`, `list`, `sudo`, `sys/*`, `auth/token/*`, other KV prefixes, or
      any root/admin path.
- [ ] `token_no_default_policy = true` (so `auth/token/lookup-self` is denied).
- [ ] Bounded `token_ttl` / `token_max_ttl`; `token_type = service` (revocable).

---

## 4. AppRole bootstrap

**[OPENBAO]** Use the repository tooling (LAB defaults; substitute production
values). It is idempotent, fails closed on unexpected existing config, and writes
`role_id`/`secret_id` to `BAO_OUT_DIR` (outside the repo), mode `600`, atomically —
never to stdout.

```bash
export BAO_ADDR=https://<openbao-host>:<port>
export BAO_TOKEN=<scoped admin bootstrap token>     # env only; never argv/stdout
export BAO_MOUNT=<mount> BAO_AUTH_MOUNT=approle BAO_PREFIX=<prefix>
export BAO_ROLE=hermes-gateway BAO_POLICY=hermes-gateway-kv
export BAO_OUT_DIR=/secure/outside/repo/hermes-openbao
bash ops/openbao/bootstrap/approle-bootstrap.sh
```
Full detail: [`ops/openbao/RUNBOOK.md`](../../ops/openbao/RUNBOOK.md).

---

## 5. Secure credential-file delivery to Production

**[PROD]** Deliver the three files out-of-repo, owned by `<deploy-user>`, mode
`0400`, regular files (never symlinks — the runtime rejects symlinked credential
files):

```
/secure/outside/repo/hermes-openbao/role_id           (0400)
/secure/outside/repo/hermes-openbao/secret_id         (0400)
/secure/outside/repo/hermes-openbao/openbao-ca.pem    (0444 ok — public cert)
```
- [ ] `stat -c '%a %U' <file>` shows `400 <deploy-user>` for role_id/secret_id.
- [ ] Files are regular (not symlinks): `test -f <f> && ! test -L <f>`.
- [ ] Transfer channel encrypted; the plaintext SecretID never touches a shell
      history or a log.

> **Note on erasure.** Ordinary `rm` is not cryptographic secure erasure. Treat
> the delivery directory as a secret store and restrict it.

---

## 6. Compose mounts (read-only, opt-in overlay)

**[PROD]** The base stack stays disabled. Enable via the overlay only:
```bash
export OPENBAO_ROLE_ID_HOST_FILE=/secure/outside/repo/hermes-openbao/role_id
export OPENBAO_SECRET_ID_HOST_FILE=/secure/outside/repo/hermes-openbao/secret_id
export OPENBAO_CA_HOST_FILE=/secure/outside/repo/hermes-openbao/openbao-ca.pem
```
Overlay: [`docker-compose.prod.openbao.yml`](../../docker-compose.prod.openbao.yml)
mounts all three **read-only** at `/run/secrets/*`. Unset host paths → compose
fails fast (`:?` guard). The Compose project stays `hermes`.

---

## 7. Backend activation

**[PROD]** In `.env.production` set (names documented in `.env.example`):
```
OT_SECRET_BACKEND=openbao
OPENBAO_ENDPOINT=https://<openbao-host>:<port>
OPENBAO_KV_MOUNT=<mount>
OPENBAO_KV_PREFIX=<prefix>
OPENBAO_APPROLE_MOUNT=approle
OPENBAO_APPROLE_ROLE_ID_FILE=/run/secrets/openbao_role_id
OPENBAO_APPROLE_SECRET_ID_FILE=/run/secrets/openbao_secret_id
NODE_EXTRA_CA_CERTS=/run/secrets/openbao_ca
# optional: OPENBAO_REQUEST_TIMEOUT_MS, OPENBAO_MAX_RESPONSE_BYTES, OPENBAO_EXPIRY_SKEW_SECONDS
```
An enabled-but-incomplete configuration **fails startup** — it never falls back.

---

## 8. Canary sequence

Deploy to a **single** canary instance first.
```bash
# [PROD] bring up canary with both compose files
docker compose -p hermes -f docker-compose.prod.yml -f docker-compose.prod.openbao.yml \
  --env-file .env.production up -d hermes-web
```
- [ ] `GET /api/health` is 200.
- [ ] `GET /api/admin/observability` (admin) shows
      `health.secretBackend.status = "configured_not_checked"` (not `degraded`).

---

## 9. Authenticated enroll / rotate / revoke smoke test

**[PROD]** As an authorized operator against the canary, for a disposable test
gateway `<gateway-id>` (never a real production gateway):
- [ ] `POST /api/ot/gateways/<gateway-id>/enrollment` → 201, credential returned
      **once**, `Cache-Control: no-store`.
- [ ] `POST /api/ot/gateways/<gateway-id>/enrollment/rotate` → 200, new version,
      old credential no longer valid.
- [ ] `POST /api/ot/gateways/<gateway-id>/enrollment/revoke` → 200; a subsequent
      envelope with the revoked credential is rejected.
- [ ] `DELETE /api/ot/gateways/<gateway-id>/enrollment` → 200.

---

## 10. Log & audit scan

- [ ] Application logs contain **no** token, role_id, secret_id, or credential.
- [ ] Audit rows for the smoke test carry only org/site/gateway ids + outcome —
      no `signingKeyRef`, no secret.
- [ ] Metrics show `ot_enrollment_*` counters; no high-cardinality labels.

---

## 11. Soak gate

- [ ] Run the canary ≥ 24 h. No `authentication_failed` / `tls_failed` /
      `unreachable` transitions attributable to the backend.
- [ ] Token re-authentication occurs at the expected lease cadence.
- [ ] Only then roll the remaining instances.

---

## 12. Rollback

Fastest safe rollback is to **disable the backend** — enrollment fails closed and
the envelope verifier reverts to env-backed keys; already-issued device
credentials keep working until rotated.
```bash
# [PROD] set OT_SECRET_BACKEND= (unset) in .env.production, redeploy WITHOUT the overlay
docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production up -d hermes-web
```
- [ ] Confirm `health.secretBackend.status = "disabled"`.
Revoked credentials **remain revoked** (DB lifecycle is authoritative).

---

## 13. SecretID rotation

**[OPENBAO]** Issue a fresh SecretID, verify a login with it, then retire the old
one by accessor (staged — the old credential stays usable until the new one is
verified). Never handle the SecretID value on argv.
```bash
# Re-run bootstrap to issue a new secret_id into BAO_OUT_DIR, deliver to PROD (§5),
# verify canary login, then:
export BAO_AUTH_MOUNT=approle BAO_ROLE=hermes-gateway
export BAO_SECRET_ID_ACCESSOR_FILE=/secure/outside/repo/hermes-openbao/old_secret_id_accessor
bash ops/openbao/bootstrap/revoke.sh destroy-secret-id
```

---

## 14. Token / SecretID compromise response

1. **[OPENBAO]** Revoke the affected token by accessor
   (`revoke.sh revoke-token`) and/or destroy the SecretID by accessor
   (`revoke.sh destroy-secret-id`).
2. **[OPENBAO]** If the AppRole itself is suspect, `revoke.sh delete-role`
   (invalidates every SecretID; issued tokens expire at TTL).
3. **[PROD]** Deliver a fresh SecretID (§5) and redeploy; or roll back (§12).
4. Rotate any device credentials issued during the exposure window (§9 rotate).

---

## 15. CA rotation

1. **[PROD]** Add the new CA to the trust bundle mounted at `/run/secrets/openbao_ca`
   (concatenate old+new during the overlap window).
2. Roll instances; confirm `configured_not_checked` and successful real logins.
3. Remove the old CA after the OpenBao certificate is reissued under the new CA.
   Native `fetch` verifies hostname + CA throughout — a mismatch fails closed.

---

## 16. OpenBao unavailable / WireGuard unavailable

- **OpenBao unreachable:** enrollment/rotation fail closed
  (`SECRET_BACKEND_UNAVAILABLE`); **revocation still succeeds** (DB-authoritative);
  existing device auth continues (env/verifier path unaffected). Do **not** create
  a plaintext fallback. Restore the backend, then resume issuance.
- **WireGuard/private transport down:** identical failure mode — the endpoint is
  simply unreachable. Repair the transport; no application change. Never expose
  OpenBao over the public internet as a workaround.

---

## 17. OpenBao sealed / reboot procedure

- A sealed OpenBao is `unreachable` from the app's perspective — same fail-closed
  behaviour as §16.
- **Reboot is PROHIBITED until unseal/recovery behaviour is independently
  established** on the production node (auto-unseal configured and validated, or a
  documented, rehearsed manual unseal with the recovery keys held by the owner).
  Unseal keys / recovery keys are **never** placed in application config or this
  repository.

---

## 18. Disaster recovery & restore rehearsal

- **[OPENBAO, disposable node only]** Restore the latest encrypted snapshot to a
  throwaway OpenBao and verify KV v2 data + AppRole are intact:
  ```bash
  bash scripts/openbao-snapshot-restore.sh      # against a DISPOSABLE node
  ```
- Never restore onto the production node as a test.
- The application-side lifecycle is independently rehearsed in CI by the
  disposable-OpenBao job (`phase95-openbao`) — real create/rotate/revoke/delete +
  least-privilege login/deny — against an in-memory dev server.

---

## 19. Evidence collection

Collect and archive (secret-free):
- [ ] Snapshot + successful restore log (§2, §18).
- [ ] Policy diff/review sign-off (§3).
- [ ] Canary `health.secretBackend` readings (§8, §11).
- [ ] Smoke-test request/response status codes with `no-store` headers (§9).
- [ ] Log/audit scan showing no credential leakage (§10).
- [ ] CI `phase95-openbao` job result (green).

---

## 20. Command-location summary

| Step | Location | Never |
| --- | --- | --- |
| Snapshot / restore / policy / AppRole / SecretID / token revoke | **[OPENBAO]** | run from the app host |
| File delivery / Compose / activation / canary / smoke / rollback | **[PROD]** | print a secret to stdout |
| Reboot OpenBao | **[OPENBAO]** | before unseal/recovery is proven (§17) |

> Final reminder: **no command in this runbook prints a secret**; all credential
> material moves via files (mode `0400`) and stdin. If a step seems to require
> echoing a token, stop — you are doing it wrong.
