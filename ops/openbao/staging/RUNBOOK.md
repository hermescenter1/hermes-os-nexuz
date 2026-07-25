# Hermes OS — OpenBao Hardened **STAGING** Runbook (PHASE 94D0G)

> **Scope: staging / canary ONLY.** This stack is not production, activates
> nothing in production, enrolls no gateway, and wires into no application
> runtime. Production values and activation remain subject to **PHASE 94D0H**.
> This document contains **no** real tokens, Role IDs, Secret IDs, unseal shares,
> recovery keys, private keys, certificate contents, production hostnames, or IPs
> other than the documented loopback example `127.0.0.1`.

## 1. Topology

- One dedicated Compose stack: [`docker-compose.openbao-staging.yml`](../../../docker-compose.openbao-staging.yml).
- Project name (always): **`hermes-openbao-staging`**.
- One service: `openbao`. No application services; never joined to `hermes_internal`; never combined with `docker-compose.yml` / `docker-compose.prod.yml`.
- One **dedicated staging bridge network with loopback-only host publication** (`openbao_staging`): `driver: bridge`, `attachable: false`, bridge option `com.docker.network.bridge.host_binding_ipv4: "127.0.0.1"`. It is logically isolated from every Hermes application network but is **not** an `internal: true` network (that suppressed the required host-loopback listener on the verified Docker host) and must not be called air-gapped — see §5.
- API published on **loopback only**: `127.0.0.1:${OPENBAO_STAGING_PORT:-8200}:8200`. Cluster port `8201` is only `expose`d inside the network (never published).
- Persistence: **one** Compose-scoped named volume, `openbao_data` (Raft). The audit log lives on an **operator host directory** (bind mount, below) so host-side logrotate can reach it.
- Read-only server config bind-mounted from [`openbao.hcl`](openbao.hcl); operator TLS dir bind-mounted read-only at `/openbao/tls`; audit dir bind-mounted **writable** at `/openbao/audit`.

### Non-root runtime model

- OpenBao runs **directly as UID 100 : GID 1000** — the identity verified against the pinned image `openbao/openbao:2.5.4` (`user: "100:1000"` in Compose).
- The image's **default root entrypoint is bypassed** (`entrypoint: [bao]`): `docker-entrypoint.sh` would start as root and drop privileges via `su-exec`, which `cap_drop: ALL` correctly prevents. **No root process is needed** for the service, and **no capability is added** — `cap_drop: ALL` stays enforced with no `cap_add` (never add SETUID/SETGID/CHOWN/IPC_LOCK).
- `init: true` provides PID-1 signal handling for the directly-started `bao` process.
- Raft persistence lives at **`/openbao/file`** (the image's `100:1000`-owned data directory), on the `openbao_data` volume.
- **Host bind-mount ownership is a startup prerequisite** (audit dir, TLS files — below). An ownership mismatch must **fail closed**: OpenBao exits or the audit device cannot write; do not "fix" it by adding capabilities.
- **Failure of the non-root runtime gate blocks PHASE 94D0H.**

### Required environment variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `OPENBAO_STAGING_TLS_DIR` | yes | Host dir with `ca.crt`/`tls.crt`/`tls.key`, outside the repo; mounted read-only. |
| `OPENBAO_STAGING_AUDIT_DIR` | yes | Host dir for `audit.log`, outside the repo; must **already exist** — Compose fails closed (`create_host_path: false`) rather than silently creating it. Create it **before** `config`/`up`. |
| `OPENBAO_STAGING_PORT` | optional | Loopback host port (default `8200`). |

### Audit directory requirements (Linux staging)

- Must be **outside the repository** and never under a publicly served path, and must **already exist** before Compose validation or startup.
- Owner must be **`100:1000`** (the verified identity of the pinned image) and mode should be **`0700`**, so OpenBao can create/write `audit.log`. Ownership preparation is an **explicit operator action** — project scripts never recursively `chown` arbitrary host paths.
- **Windows Docker Desktop does not prove Linux bind-mount ownership** — verify on the Linux staging host.
- Audit logs are **sensitive**: normal teardown does **not** delete them, volume-purge does **not** delete them, and archival/deletion follows a **separate operator retention process**.

## 2. Image version pin

`openbao/openbao:2.5.4` — never `latest`. Snapshot format compatibility is tied to this pin; do not change it without a fresh backup/restore test. The runtime identity (`100:1000`) was verified **against this pin**: any future image-version change requires repeating

```bash
docker run --rm --entrypoint id openbao/openbao:<new-version> openbao
```

and reviewing the UID/GID (and directory ownership) **before** deployment.

## 3. Raft persistence & single-node limitation

Integrated **Raft** storage at `/openbao/file` (the image's `100:1000`-owned data directory), `node_id = hermes-openbao-staging-1`. This is a **single node**: it is **not** highly available and provides **no** automatic failover. Encrypted snapshot backups are the only recovery mechanism — **backups are not HA**. A node loss without a good snapshot is unrecoverable.

## 4. TLS file requirements

The operator provisions, out of band, a directory (outside the repository) referenced by `OPENBAO_STAGING_TLS_DIR` and mounted read-only at `/openbao/tls`, containing:

- `ca.crt` — CA chain used by clients (`BAO_CACERT`); must be **readable by UID 100**.
- `tls.crt` — server certificate; must be **readable by UID 100**.
- `tls.key` — server private key, **mode `0600`** on the host and **readable by UID 100** — which normally means ownership **`100:1000`**. **Never committed** and never baked into an image (`.dockerignore` already excludes `deploy/`; keep the dir outside the repo regardless).

The committed configuration file is bind-mounted read-only and must likewise be **readable by UID 100**. Preparing this ownership is an explicit operator action on the Linux staging host (Windows Docker Desktop does not prove it).

Certificate SANs **must** include `127.0.0.1`, `localhost`, and `openbao`. Document the issuing CA and the renewal/rotation process for your environment.

## 5. Network isolation & firewall verification

**Network model.** `openbao_staging` is a **dedicated staging-only bridge**: logically isolated from all Hermes application networks (never `hermes_internal`, production, PostgreSQL, Redis, nginx, any application service, or any externally named shared network), **not** an `internal: true` air-gapped network, reachable from the host **only** through the explicitly published loopback API port, and not reachable through any public host interface. Removing `internal: true` (required so the host-loopback listener is actually created) **permits normal bridge-network external routing from the container** — the container can route outward like any bridge-attached container, which is why the host-side verification below is mandatory.

**Linux staging verification (read-only), all of which the operator must run:**

```bash
# 1. Engine version + the running service
docker version --format '{{.Server.Version}}'
docker compose \
  -p hermes-openbao-staging \
  -f docker-compose.openbao-staging.yml \
  ps

# 2-4. Published ports: expect ONLY 127.0.0.1:<port> for 8200/tcp, nothing for 8201
docker inspect <container-id>
docker port <container-id> 8200/tcp        # expect: 127.0.0.1:<port>
ss -lntp | grep 8200                       # expect 127.0.0.1:<port> only — never
                                           # 0.0.0.0, ::, the public IP or LAN IP

# 5. The network is dedicated: only the openbao service is attached
docker network inspect \
  hermes-openbao-staging_openbao_staging
```

Acceptance requirements (each one **blocks PHASE 94D0H** if it fails):

1. Docker Engine version and its port-publishing behaviour verified. **Engine ≥ 28 is required**, or compensating **verified** host-firewall restrictions must be in place — older engines had known localhost-port exposure behaviour toward hosts on the same layer-2 network.
2. The API listener is bound **only** to `127.0.0.1`.
3. No listener on `0.0.0.0`, `::`, the server's public IP, or its private LAN IP.
4. Port `8201` is **not** published (container-network-only via `expose`).
5. OpenBao is attached to no shared network (`hermes_internal` or otherwise).
6. Host firewall policy **denies inbound 8200 from non-loopback interfaces** (operator-managed — project scripts never modify firewall settings).
7. A connection test from a **remote machine** to port 8200 **fails** (e.g. from another host: `curl --connect-timeout 5 https://<staging-host-address>:8200/v1/sys/health` must time out or be refused — substitute your own address; no real hostname/IP is documented here).
8. No Docker daemon direct-routing or trusted-interface configuration exposes the container address externally.

## 6. Initialization (manual, fail-closed)

The container starts **UNINITIALIZED and SEALED** — the healthcheck stays `unhealthy` until an operator initializes and unseals. There is **no** init/unseal automation script by design.

1. Validate the TLS files exist and `tls.key` is mode `0600`.
2. Render/validate config: `docker compose -f docker-compose.openbao-staging.yml config -q`.
3. Start only this stack (see §1).
4. Confirm uninitialized + sealed: `docker exec <container> bao status` (non-zero).
5. Initialize **manually**: `bao operator init` (on the host, over `https://127.0.0.1:8200`).
6. **Immediately move** the unseal shares and initial root token **out of band**.

## 7. Where unseal/root material must NEVER be stored

Never in: Git, any repository file, Compose YAML, PostgreSQL, application `.env`
files, application-intended Docker volumes, shell history, or command logs. Keep
shares split across custodians; store the initial root token offline.

## 8. Manual threshold unseal & re-unseal drill

Unseal with the threshold number of shares: `bao operator unseal` (repeat). **Manual unseal is required after every restart in this phase** — `restart: unless-stopped` restarts the container, but it comes up **sealed**. Practise the re-unseal drill: restart the stack, confirm it returns sealed/unhealthy, unseal, confirm healthy. Auto-unseal / Transit Seal / cloud KMS are **explicitly deferred** to 94D0H.

## 9. PHASE 94D0F bootstrap compatibility & initial-root revocation

After unseal, create only the **minimum temporary operator authority** needed for the 94D0F bootstrap, then run it from the OpenBao host through the **loopback TLS** endpoint:

- The 94D0F [`approle-bootstrap.sh`](../bootstrap/approle-bootstrap.sh) and the least-privilege launcher/live test are **loopback-guarded** — run them on the OpenBao host with `BAO_ADDR=https://127.0.0.1:8200` and `BAO_CACERT=/…/ca.crt`.
- Verify the AppRole lifecycle (bootstrap + least-privilege live test PASS).
- **Revoke the initial root token** after bootstrap + verification: `bao token revoke -self` (or by accessor). The application uses AppRole only — **no root token** in Compose, images, or application containers.
- Record only non-sensitive completion metadata (timestamps, resource names — never credentials).

## 10. Declarative audit configuration & sensitivity

The file audit device is defined **declaratively** in `openbao.hcl` as `audit "file" "staging-file"` with an `options` block (`unsafe_allow_api_audit_creation = false` forbids API/CLI creation; no socket audit). It is hashed (`log_raw = "false"`), mode `0600`, writing to `/openbao/audit/audit.log` on the **host audit directory** (`OPENBAO_STAGING_AUDIT_DIR`). **Audit logs are sensitive** (request metadata, HMAC'd values) — restrict access; never paste contents into tickets, chat, or this repo.

## 11. Audit-disk exhaustion behaviour (fail-closed)

An OpenBao file audit device is **blocking**: if it cannot write (disk full, permissions), OpenBao **stops servicing requests**. Monitor free space on the audit volume and alert early. Rotation (below) plus disk monitoring prevent an audit-induced outage.

## 12. Logrotate installation & SIGHUP

[`logrotate-openbao-audit.conf`](logrotate-openbao-audit.conf) is an **installation template**: substitute every `__PLACEHOLDER__` (`__OPENBAO_STAGING_AUDIT_DIR__`, `__HERMES_REPOSITORY_ABSOLUTE_PATH__`, `__OPENBAO_FILE_OWNER__`, `__OPENBAO_FILE_GROUP__`), **review the result**, then install as `/etc/logrotate.d/hermes-openbao-audit`. **Do not install it before all placeholders are replaced and reviewed.** logrotate runs on the **Docker host** and rotates **only** `__OPENBAO_STAGING_AUDIT_DIR__/audit.log` (daily / 50M / rotate 30 / compress+delaycompress; rename-then-recreate, **never** `copytruncate`; `create 0600` with the operator-substituted owner/group matching OpenBao's runtime user — verified **`100:1000`** for the pinned `openbao/openbao:2.5.4`; re-verify on any image change). `postrotate` sends **SIGHUP** only to the `openbao` service of project `hermes-openbao-staging` via the exact staging Compose file — never by container-name matching, never a production container — and it never deletes the active file.

## 13. Backup: token requirements & age public-key model

[`scripts/openbao-snapshot-backup.sh`](../../../scripts/openbao-snapshot-backup.sh) runs on the OpenBao host with a **short-lived operator token** via `BAO_TOKEN` (never a root token; never printed), requires HTTPS loopback `BAO_ADDR` + readable `BAO_CACERT`, and encrypts with **age** using a **recipient public key only** (`OPENBAO_BACKUP_AGE_RECIPIENT` or `…_FILE`). The **age private identity is never present on the OpenBao host.** The raw snapshot lives only in a tmpfs path and is removed by a guaranteed trap (best-effort removal — not cryptographic erasure). Output is a mode-600 `…​.snap.age` plus a SHA-256 sidecar (atomic rename) in `/backups/openbao` (already git-ignored). Retention runs only after a successful backup and never deletes the newest.

## 14. Restore-host private-key model & throwaway restoration test

[`scripts/openbao-snapshot-restore.sh`](../../../scripts/openbao-snapshot-restore.sh) is a **restore-TEST**, not a disaster overwrite. It requires `OPENBAO_RESTORE_CONFIRM=RESTORE-TO-THROWAWAY`, a throwaway marker, and a throwaway target (`OPENBAO_RESTORE_ADDR` distinct from the main staging endpoint, HTTPS + trusted CA + its own token). The **age private identity lives only on the isolated restore host, outside the repository.** It verifies the encrypted artifact's checksum **before** decrypting, decrypts to tmpfs with guaranteed cleanup, restores with `bao operator raft snapshot restore` (**no `-force`**, seal-key consistency preserved), and reports success **only** if the throwaway target is healthy and unsealed. It never stops/overwrites the main staging service and never deletes its volume. A compatible throwaway target and appropriate out-of-band seal material are **operator responsibilities**.

## 15. Encrypted-backup verification

Integrity is checked via the SHA-256 sidecar over the encrypted artifact (verified before any decrypt in the restore-test). A full restore-test into a throwaway target is the end-to-end verification and is an acceptance gate (§21).

## 16. Restart & OpenBao-outage behaviour

- **Restart:** container restarts (`unless-stopped`) but returns **sealed** → manual unseal required.
- **Outage / sealed / audit-blocked:** OpenBao serves no secrets. The application's 94D0F path is **not wired** in this phase, so staging OpenBao downtime does not affect the app; the fail-closed posture is intentional.

## 17. Safe rollback & guarded volume deletion

[`scripts/openbao-staging-teardown.sh`](../../../scripts/openbao-staging-teardown.sh):

- `down` — removes only this project's containers + network; the `openbao_data` volume **and the host audit directory with all audit logs are preserved**; never `-v`, never prune.
- `purge-volumes` — requires `OPENBAO_TEARDOWN_CONFIRM=DELETE-STAGING-VOLUMES`, verifies the Compose **project label**, and removes only the exact `hermes-openbao-staging_openbao_data` volume (unknown matching volumes are rejected). There is no audit volume: the script **never** recurses into `OPENBAO_STAGING_AUDIT_DIR` and never deletes or truncates `audit.log`. It never touches `postgres_data`, `redis_data`, `uploads_data`, `hermes_internal`, or any production resource.
- `restore-test-down` — tears down only an explicitly allow-listed, separately named restore-test project (never the main project), with its own confirmation.

## 18. Non-goals (this phase)

No production activation. No gateway enrollment. No application runtime wiring. No Prisma/migration/database/API/UI change. No auto-unseal. No modification of existing production Compose, Dockerfile, `deploy/`, or the 94D0F assets.

## 19. Quick reference (commands)

```bash
# Create the audit dir FIRST (Compose fails closed if it is absent), with the
# ownership verified from the pinned image's runtime user — see §1.
# Validate config only (no pull, no start)
OPENBAO_STAGING_TLS_DIR=/etc/hermes-openbao/tls \
OPENBAO_STAGING_AUDIT_DIR=/var/log/hermes-openbao-audit \
  docker compose -f docker-compose.openbao-staging.yml config -q

# Start / stop
OPENBAO_STAGING_TLS_DIR=/etc/hermes-openbao/tls \
OPENBAO_STAGING_AUDIT_DIR=/var/log/hermes-openbao-audit \
  docker compose -p hermes-openbao-staging -f docker-compose.openbao-staging.yml up -d
scripts/openbao-staging-teardown.sh down
```

## 20. Memory and swap protection (no-mlock model)

1. **OpenBao 2.5.4 no longer supports mlock.** The option has been removed; `bao operator validate-config` rejects `disable_mlock`, so it must **not** appear in the server configuration in any form. Consequently the container grants **no** Linux capability at all (`cap_drop: ALL`, no `cap_add`).
2. In-memory secret protection is instead enforced at the **cgroup** level. The staging service pins: `mem_limit: 768M`, `memswap_limit: 768M`, `mem_swappiness: 0` — the memory+swap ceiling equals the memory ceiling, so the container has **zero swap allowance**, and swappiness 0 tells the kernel never to prefer swapping it.
3. **After startup on the Linux staging host,** the operator must verify the effective cgroup swap limit and that the container cannot consume swap. Safe, state-free checks:

```bash
# Docker's resolved limits (bytes). Expect Memory and MemorySwap BOTH 805306368.
# MemorySwappiness: 0 on a cgroup v1 host; on cgroup v2 the kernel has no
# per-container swappiness knob, so the value may be null/ignored — there the
# authoritative control is memory.swap.max = 0 (checked next).
docker inspect -f '{{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.MemorySwappiness}}' \
  $(docker compose -p hermes-openbao-staging -f docker-compose.openbao-staging.yml ps -q openbao)

# cgroup v2, from inside the container (read-only; expect memory.swap.max = 0):
docker exec $(docker compose -p hermes-openbao-staging -f docker-compose.openbao-staging.yml ps -q openbao) \
  sh -c 'cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.swap.max'
```

Note: some Docker Compose versions omit `mem_swappiness` from `docker compose
config` canonical output even though it is set in the YAML — verify on the
running container as above, not from the rendered config.

4. Host swap must either be **encrypted**, or be **disabled for the OpenBao workload through cgroup controls** (the settings above). Do **not** run a global `swapoff` automatically, and no project script modifies host swap configuration — host-level swap policy is an explicit operator decision.
5. **Failure to verify swap protection blocks PHASE 94D0H acceptance.**
6. **Windows local validation does not prove Linux staging-host swap enforcement** — `mem_swappiness`/cgroup checks are only meaningful on the Linux staging host.

## 21. Acceptance gates before PHASE 94D0H

1. Container starts **sealed + uninitialized** and stays fail-closed (unhealthy).
2. Listener is **TLS-only**; no plaintext; valid chain; SANs include `127.0.0.1`/`localhost`/`openbao`.
3. Manual `init` + threshold `unseal` succeed; shares + initial root token stored out-of-band; **initial root token revoked** after bootstrap.
4. Declarative file audit device active and writing **hashed** entries; logrotate installed and SIGHUP-tested.
5. 94D0F bootstrap + least-privilege live test **PASS** over the loopback TLS endpoint.
6. Encrypted snapshot backup + checksum verify + **restore-test into a throwaway target** PASS.
7. **No public port** (`ss`/`nmap` show loopback/private only); host firewall verified.
8. Resource limits enforced (`docker stats` within `cpus`/`mem_limit`); **swap protection verified per §20** (equal memory/memory+swap limits, swappiness 0, host swap encrypted or cgroup-denied) — unverified swap protection blocks 94D0H.
9. Rollback removes only staging containers/network; guarded volume purge removes only the two staging volumes.
10. No secret tracked in Git (`git ls-files` review) and none in image layers; verify the declarative-audit / rekey-endpoint / request-limit options against `openbao/openbao:2.5.4` (see `openbao.hcl` note).
