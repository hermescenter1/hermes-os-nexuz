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

## 5. Credential ownership & the non-root runtime (IMPORTANT — corrected)

The `hermes-web` container runs as the image's **non-root UID 1001**. Docker
Compose does **not** remap uid/gid/mode for a bind mount, so the container reads
the host files exactly as they are on disk.

- The **canonical** AppRole files stay `root:root 0600` and are NOT changed:
  ```
  /etc/hermes-openbao/app/role-id     root:root 0600
  /etc/hermes-openbao/app/secret-id   root:root 0600
  ```
  (0600 root-only — a non-root container cannot read these directly. Do not
  loosen them.)
- **[PROD]** Create out-of-repo, read-only **RUNTIME COPIES** owned by root and a
  **dedicated runtime group** so — and only so — the UID-1001 process can read
  them. Pick/create a dedicated GID (`<runtime-gid>`), then:
  ```bash
  install -d -o root -g root -m 0710 /etc/hermes-openbao/runtime
  install -o root -g <runtime-gid> -m 0440 /etc/hermes-openbao/app/role-id   /etc/hermes-openbao/runtime/role-id
  install -o root -g <runtime-gid> -m 0440 /etc/hermes-openbao/app/secret-id /etc/hermes-openbao/runtime/secret-id
  ```
  Result — exactly what the deploy workflow enforces before activating:
  ```
  /etc/hermes-openbao/runtime            root:root         0710   (dir; traversable only by owner+group)
  /etc/hermes-openbao/runtime/role-id    root:<runtime-gid> 0440
  /etc/hermes-openbao/runtime/secret-id  root:<runtime-gid> 0440
  /etc/hermes-openbao/ca.crt             root:root         0644   (public cert; read-only, world-readable ok)
  ```
- [ ] Copies are regular files, never symlinks (the runtime AND the workflow
      reject symlinks).
- [ ] The container is run as `1001:<runtime-gid>` (the overlay's `user:`), so the
      process's supplementary GID matches the `0440` copies' group.
- [ ] No command prints a credential; the plaintext SecretID never touches a shell
      history or a log.

> **Note on erasure.** Ordinary `rm` is not cryptographic secure erasure. Treat
> the runtime directory as a secret store and restrict it.

---

## 6. Activation marker (`/etc/hermes-openbao/activation.env`) — the stable gate

Activation is **persistent across deploys** via a root-owned marker the deploy
workflow reads on every run. This closes the gap where a plain redeploy dropped
the overlay.

- **[PROD]** Create the marker as a `root:root` regular file with **no `other`
  permissions** (e.g. `0600`), containing ONLY these five **non-secret** lines
  (no secret values, no comments, no blank-padding tricks — one `KEY=VALUE` each):
  ```
  OPENBAO_ROLE_ID_HOST_FILE=/etc/hermes-openbao/runtime/role-id
  OPENBAO_SECRET_ID_HOST_FILE=/etc/hermes-openbao/runtime/secret-id
  OPENBAO_CA_HOST_FILE=/etc/hermes-openbao/ca.crt
  OPENBAO_PRIVATE_IP=<private IPv4 of the OpenBao host>
  OPENBAO_RUNTIME_GID=<runtime-gid>
  ```
  ```bash
  install -o root -g root -m 0600 /dev/null /etc/hermes-openbao/activation.env
  # then write the five KEY=VALUE lines with an editor (no secrets)
  ```
- The workflow **rejects** the marker (fail closed → base compose) if it is a
  symlink, not `root:root`, has any `other` bit, or contains a duplicate/unknown
  key, a shell command / command-substitution, or any non-`KEY=VALUE` line. It
  also re-checks the source files (out-of-repo regular non-symlinks; role/secret
  `root:<runtime-gid>` mode exactly `0440`; CA read-only and runtime-readable),
  validates the private IPv4 (RFC1918 only) and the numeric GID, and runs
  `docker compose config` on both files before touching the running stack.

**Marker absent → every deploy stays base-only (backend disabled).**
**Marker present & valid → every deploy activates the overlay.**

---

## 7. Backend activation & deploy

The remaining OpenBao settings the overlay sets itself (non-secret):
`OT_SECRET_BACKEND=openbao`, `OPENBAO_ENDPOINT=https://openbao:8200`,
`OPENBAO_KV_MOUNT=hermes-kv`, `OPENBAO_KV_PREFIX=gateways`,
`OPENBAO_APPROLE_MOUNT=approle`, the two `/run/secrets/*` file paths,
`NODE_EXTRA_CA_CERTS=/run/secrets/openbao_ca`, and the bounded-client settings.
`https://openbao:8200` resolves to `OPENBAO_PRIVATE_IP` via the overlay's
`extra_hosts`. An enabled-but-incomplete configuration **fails startup** — it
never falls back.

Activate by running the normal **Production Deploy** workflow (manual dispatch,
pinned SHA) with the marker in place. The workflow deploys with BOTH files:
```bash
# (executed by the workflow on the server; shown for reference)
docker compose -p hermes -f docker-compose.prod.yml -f docker-compose.prod.openbao.yml \
  --env-file .env.production up -d --build --no-deps hermes-web
```
Then it verifies inside the container: `OT_SECRET_BACKEND=openbao`; the three
`/run/secrets/*` files are regular, read-only and readable by the runtime UID/GID;
`/etc/hosts` resolves `openbao`; and the healthcheck is healthy. **If verification
fails after recreate, the workflow automatically rolls back to the base compose
(backend disabled) and re-verifies health** — without printing any credential.

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

Rollback is to **disable the backend** by making activation absent, then
redeploying base-only — enrollment fails closed and the envelope verifier reverts
to env-backed keys; already-issued device credentials keep working until rotated.

1. **[PROD]** Remove or disable the marker so future deploys stay base-only:
   ```bash
   # remove it, or rename it so it no longer exists at the canonical path
   rm -f /etc/hermes-openbao/activation.env
   ```
2. Redeploy via the **Production Deploy** workflow (pinned SHA). With the marker
   absent the workflow deploys **base compose only** (backend disabled). Or, for an
   immediate manual rollback on the host:
   ```bash
   # [PROD] recreate hermes-web from the base compose only (no overlay)
   docker compose -p hermes -f docker-compose.prod.yml --env-file .env.production up -d --build --no-deps hermes-web
   ```
- [ ] Confirm `health.secretBackend.status = "disabled"`.

> The deploy workflow ALSO rolls back automatically: if activation verification
> fails after recreate, it recreates `hermes-web` from base compose (backend
> disabled) and re-verifies health — no credential is printed. Revoked credentials
> **remain revoked** (DB lifecycle is authoritative).

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

> Final reminder: **no command in this runbook prints a secret**; canonical
> credentials stay `root:root 0600` and runtime copies are `root:<runtime-gid>
> 0440` — moved via files and stdin only. If a step seems to require echoing a
> token, stop — you are doing it wrong.
