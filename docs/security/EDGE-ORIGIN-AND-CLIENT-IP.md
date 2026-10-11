# Hermes OS — Edge, Origin Exposure and Client-IP Trust Chain (S0-B-03)

**Program:** Hermes Security Dragon
**Addresses:** `S0-B-03` — is the origin Cloudflare-only, and does the application receive the real client IP?
**Produced:** 2026-10-10 · **Revision 2:** 2026-10-11
**Status:** closed with findings. The one outstanding question — reachability of the origin from a vantage
independent of both the production host and the audit environment — was answered on 2026-10-11 by owner-supplied
evidence from a phone on an independent network (§6.7). `ORIGIN_CONTROL_VERDICT` moves from `UNPROVEN` to
`PUBLICLY_REACHABLE`. No verdict from revision 1 was deleted; the superseded ones are retained, dated and marked.

---

## 1. Scope

The chain is audited as one system:

```
Internet client → Cloudflare → origin IP / host firewall → Docker published ports
→ Nginx → forwarded headers → Next.js → IP extraction → rate limiters → audit / IP hashing
```

Read-only throughout. No configuration was changed, nothing was restarted or reloaded, no firewall rule was
touched, no header was spoofed, no authenticated request was made, no token or cookie was created, and no scanner
was run. Exactly one external request was made against the owner's infrastructure (§14), under prior written
authorisation.

---

## 2. Source lock

| Field | Value |
|---|---|
| Worktree | `E:\hermes-security-dragon` |
| Branch | `feature/hermes-security-dragon` |
| Source SHA | `bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2` |
| `HEAD` at audit | `ca89fad749cd0372a3688fdc710ab842672db4cc` |
| Commits above the lock | `95c65530`, `e82dcbaf`, `ca89fad7` — **documentation only**, 0 product bytes |
| `origin/main` | `e9961048` — advanced beyond the lock. Not contamination; no merge, rebase or cherry-pick was performed. |
| Worktree before this audit | clean; `git status --short --untracked-files=all` empty; no `MERGE_HEAD`; no rebase |

---

## 3. L-5 production evidence

| Field | Value |
|---|---|
| Evidence | `AUTH_SECRET=SET` — owner-supplied, read-only presence check inside the running `hermes-web` container |
| `L5_PRODUCTION_STATUS` | `LATENT_DESIGN_FLAW` |
| `L5_ACTIVE_IN_CURRENT_CONTAINER` | `NO` |
| `L5_EMERGENCY_STOP` | `RELEASED` |
| `L5_REMEDIATION_REQUIRED` | `YES` |
| `L5_FINAL_SEVERITY` | `DEFER_TO_S1` |
| `B02_REOPEN_REQUIRED` | `NO` |

**What the evidence proves:** the hardcoded fallback in `src/lib/auth/crypto.ts:31-33` is not active in the
current container, and cookie forgery based on that published constant is therefore **not demonstrated** in
production as it now runs.

**What it does not prove:** the key's strength or entropy; its independence from `JWT_SECRET` or
`JWT_ACCESS_SECRET`; its uniqueness across environments; that every replica holds the same value; that it is
rotated; when it was created; that it was never previously disclosed; or that it will still be set after the next
deploy. No secret value was read, compared, hashed or displayed.

The structural defect is unchanged: the **FATAL** boot checks are evaluated against `jwtSecret()`, which accepts
three other variable names, so nothing at startup fails when `AUTH_SECRET` specifically is absent.

---

## 4. Repository evidence manifest

Every command below was run in the security worktree at the locked SHA.

```
grep -rc 'real_ip_header\|real_ip_recursive\|set_real_ip_from' deploy/nginx/
git ls-files | grep -iE 'nginx|\.conf$'
git grep -in 'cf-connecting-ip|x-real-ip|x-forwarded-for|true-client-ip|forwarded' -- src scripts
git grep -n 'headers.get("x-|request\.ip|req\.ip\b|\.socket\.remoteAddress' -- src
git grep -l resolveClientIp -- src
sed -n '/export async function checkRateLimit/,/^}/p'  src/lib/auth/rate-limiter.ts
sed -n '/function redisKey/,/^}/p'                     src/lib/auth/rate-limiter.ts
sed -n '/function refuseUndeclaredAction/,/^}/p'       src/lib/auth/rate-limiter.ts
sed -n '/^function memCheck/,/^}/p'                    src/lib/auth/rate-limiter.ts
git grep -n ipHash -- src prisma/schema.prisma
grep -nE '^  [a-z-]+:|ports:|networks:|driver: bridge|internal:' docker-compose.prod.yml
```

Files read in full or in the relevant part: `deploy/nginx/default.conf`, `deploy/nginx/mail.conf`,
`docker-compose.prod.yml`, `src/lib/security/request-guards.ts`, `src/lib/auth/rate-limiter.ts`,
`src/lib/api/rate-limit.ts`, `src/lib/ot-edge/http/machine-auth.ts`, `src/app/api/sales/leads/route.ts`,
`src/app/api/auth/access-request/route.ts`, `src/app/api/media/public/videos/route.ts`,
`src/app/api/media/public/videos/[slug]/route.ts`, `src/app/api/media/public/videos/[slug]/view/route.ts`,
`src/app/api/operations/alerts/route.ts`, `src/app/api/operations/intelligence/route.ts`,
`src/lib/eng-graph/public-guard.ts`, `prisma/schema.prisma` (the three `ipHash` models).

Only three `.conf` files exist in the repository: the two nginx ones above and
`ops/openbao/staging/logrotate-openbao-audit.conf` (unrelated).

---

## 5. Edge-to-application topology

```
client ──HTTPS──► Cloudflare edge ──HTTPS──► 185.80.196.163 : 80/443
                                                   │
                                   host firewall (NOT in the repository)
                                                   │
                            Docker published ports  "80:80"  "443:443"   ← no host-IP prefix
                                                   │
                                        nginx (hermes_internal, bridge)
                                                   │  plain HTTP
                                        hermes-web : 3000  (publishes nothing)
                                                   │
                                     resolveClientIp(req) → x-real-ip only
                                                   │
                        ┌──────────────────────────┼──────────────────────────┐
                 rate limiters              audit / logging            ipHash columns
            (3 implementations)           (correlationId)        ArticleView · SalesLead · MediaViewEvent
```

---

## 6. Origin exposure

### 6.1 What the repository shows

`docker-compose.prod.yml` publishes host ports from exactly one service:

| Service | Ports | Note |
|---|---|---|
| `nginx` | `"80:80"`, `"443:443"` | **No host-IP prefix.** Docker therefore binds all interfaces (`0.0.0.0` and, with IPv6 enabled, `::`). |
| `uptime-kuma` | `"3001:3001"` | behind `profiles: ["monitoring"]`; not started by a plain `docker compose up` |
| `hermes-web`, workers, `postgres`, `redis` | none | internal only |

`hermes_internal` is `driver: bridge` and **not** `internal: true`, so containers retain outbound egress.

**Finding EDGE-01.** Because the port mappings carry no host-IP prefix, the repository configuration asks Docker
to accept 80/443 from any source. Docker installs its own `DOCKER`/`DOCKER-USER` iptables chains ahead of the
`INPUT` path, so a UFW rule alone does not necessarily restrict a published container port. Whether the origin is
restricted to Cloudflare therefore **cannot be determined from the repository at all** — it depends entirely on
host firewall state that is not version-controlled here. There is no `set_real_ip_from`, no documented Cloudflare
allowlist, and no infrastructure-as-code for the firewall anywhere in the tree.

### 6.2 The real production address, and the stale one

Owner-supplied runtime evidence:

| Field | Value |
|---|---|
| `LOCAL_SOURCE_IPV4` | `51.195.255.7` |
| `EGRESS_PUBLIC_IPV4` | `51.195.255.7` |
| `EXPECTED_ORIGIN_IP_ON_HOST` | **`NO`** — `185.80.196.163` is on **no interface** of this host |

**Finding EDGE-05 — configuration drift.** `deploy/nginx/default.conf` still lists `185.80.196.163` in
`server_name` (lines 4 and 30) while the host's actual address is `51.195.255.7`. The stale entry is harmless in
itself — an unmatched `server_name` token simply never matches — but it is a false statement about the deployment
embedded in the configuration, and it is what caused the first direct-origin test to be aimed at an address that
is not the origin. **The nginx file was not changed; S0 is audit-only.**

### 6.3 The first direct test was invalid — correction

An earlier revision of this document stated that *"the network path to `185.80.196.163:443` is open from the
public internet"*. **That claim is withdrawn.** It was not supported by the evidence then available:

- the request's actual peer (`remote_ip`) was **not recorded**, so nothing established which host answered;
- `185.80.196.163` is **not** an address of the current production host (EDGE-05);
- the response carried the **complete Cloudflare edge signature**, so it cannot be attributed to any origin.

The accurate statement is: *a request issued with `--resolve` for `185.80.196.163` received a Cloudflare-served
response; the final peer was not recorded; that address belongs to no interface of the current host; therefore
that test is **invalid and irrelevant** for determining the current origin's exposure, and **no claim of
direct-origin reachability is derived from it**.*

For completeness, two checks made at the time stand on their own: `185.80.196.163` is in **none** of
Cloudflare's 15 published IPv4 ranges (`https://www.cloudflare.com/ips-v4`), and no local proxy environment or
`~/.curlrc` existed that could have voided `--resolve`.

### 6.4 The final direct test against the real origin

Full result in §15. Executed once, against `51.195.255.7`, with `--noproxy '*'` and `remote_ip` captured.

| Field | Value |
|---|---|
| `REMOTE_IP` | **`51.195.255.7`** — the peer is confirmed to be the production host |
| `HTTP_CODE` | **`200`** |
| `SSL_VERIFY_RESULT` | **`0`** — certificate chain validated for `hermesnovin.com` |
| `Server` | **`cloudflare`** |
| `CF-RAY` | **present** (`a4868054fa7bec0d-LHR`) |
| `cf-cache-status` | **present** (`DYNAMIC`) |
| `strict-transport-security` | **absent** |

**This test is NOT valid for origin attribution, and the reason is instructive.** The response bears the full
Cloudflare edge signature — `Server: cloudflare`, `CF-RAY`, `cf-cache-status`,
`Speculation-Rules: "/cdn-cgi/speculation"`, `alt-svc: h3`. Those are edge artifacts; neither nginx nor Next.js
emits them. The origin self-check in §6.5 proves the real origin answers with `Server: nginx/1.31.2` and **no**
Cloudflare headers. The two observations are mutually exclusive, so the external request did not reach the origin.

**Correction to how `remote_ip` was read.** An earlier revision treated `REMOTE_IP=51.195.255.7` as proof that the
packets terminated at the production host, and concluded from the HTTP 200 that *"there is no network-level
control preventing arbitrary sources from reaching `51.195.255.7:443`"*. **That inference is withdrawn.**
`curl`'s `%{remote_ip}` reports the address curl **dialled** after name resolution — it is not a verified
end-to-end peer identity. A transparent L3/L4 interception, a DNAT redirect or a device-level tunnel is
**invisible** to it: curl still reports the address it was told to use. So `remote_ip` confirms only that
`--resolve` was honoured, never which machine answered.

**TLS, recorded separately as required:** `SSL_VERIFY_RESULT=0`, so a certificate valid for `hermesnovin.com` was
presented. Consistent with a Cloudflare edge certificate; **not** evidence about network access control, and not
evidence of which host answered.

**Still correct, and deliberately kept (2026-10-11).** Everything in this subsection stands. The withdrawal of the
`remote_ip` inference was and remains right: `%{remote_ip}` is the address curl dialled, never a verified peer
identity, so it cannot by itself attribute a response to a host. What revision 1 could not do was obtain a
response whose **own signature** identified the answering host. §6.7 now has one, and it is that signature — not
`remote_ip` — that closes the verdict.

### 6.5 Origin self-check — the decisive evidence

Owner-supplied, executed **on the production host itself**, read-only.

| | Test A — loopback | Test B — the host's own public interface |
|---|---|---|
| `REMOTE_IP` | `127.0.0.1` | `51.195.255.7` |
| `HTTP_CODE` | `200` | `200` |
| `SSL_VERIFY_RESULT` | `0` | `0` |
| **`Server`** | **`nginx/1.31.2`** | **`nginx/1.31.2`** |
| `CF-RAY` | **absent** | **absent** |
| `cf-cache-status` | **absent** | **absent** |
| `strict-transport-security` | **absent** | **absent** |

Both responses came from the real Hermes origin stack and agree with each other on the security headers and the
application response.

```
ORIGIN_SELF_LOOPBACK_VERDICT          = DIRECT_NGINX_CONFIRMED
ORIGIN_SELF_PUBLIC_INTERFACE_VERDICT  = DIRECT_NGINX_CONFIRMED
EXTERNAL_CLAUDE_TEST_VERDICT          = INVALID_FOR_ORIGIN_ATTRIBUTION
EXTERNAL_TEST_INTERFERENCE_TYPE       = UNKNOWN
MAGIC_TRANSIT_EVIDENCE                = NONE
BYOIP_EVIDENCE                        = NONE
SPECTRUM_EVIDENCE                     = NONE
```

Established by this self-check:

1. `51.195.255.7` **is** the public address of the current origin stack.
2. The Hermes nginx answers **directly** on that address.
3. The genuine origin response carries `Server: nginx/1.31.2`.
4. The genuine origin response carries **no** `CF-RAY` and **no** `cf-cache-status`.
5. **HSTS is absent on the direct origin response** — the existing HSTS finding, now confirmed at the origin
   itself and not only through the edge.
6. The external test from the audit environment is therefore **invalid for judging the origin's network
   behaviour**, despite its `remote_ip` value.
7. That external request passed through some intermediary — a VPN, Cloudflare WARP, a transparent proxy, SNI
   interception, or an execution-environment restriction.
8. **Which intermediary is not established**, and none is asserted here.

### 6.6 EDGE-06 — `RECLASSIFIED_AS_TEST_ENVIRONMENT_INTERFERENCE`

**Original claim (2026-10-10, first revision of this document):** "a Cloudflare-fronted response arrives on the
origin's own address", with BYOIP / Magic Transit named as the hypothesis that explained the most.

**Reclassified 2026-10-10, the same day, on the origin self-check in §6.5.** The premise was false: the origin
does **not** answer with Cloudflare headers. The anomaly lay in the **audit environment's network path**, not in
the production edge.

- `BYOIP_EVIDENCE: NONE` · `MAGIC_TRANSIT_EVIDENCE: NONE` · `SPECTRUM_EVIDENCE: NONE`
- No positive evidence exists for any of the three, and none may remain as a working hypothesis.
- `EXTERNAL_TEST_INTERFERENCE_TYPE: UNKNOWN`.

The identifier **EDGE-06 is retired to this reclassification and will not be reused** for any other finding, so
the withdrawal stays traceable. **Revision 2 does not revive it.** The evidence in §6.7 came from a different
vantage and a different date; it is recorded under new identifiers, and nothing in it restores the retired claim
or its BYOIP / Magic Transit / Spectrum hypotheses, for which there is still no evidence.

### 6.7 Independent-vantage evidence — 2026-10-11, and the origin verdict it closes

Owner-supplied, executed on **Termux on a phone, on a network independent of both the production host and the
audit environment**, using the command pre-registered in §19. Two runs, 23 seconds apart, same device, same
command, same destination (`--resolve hermesnovin.com:443:51.195.255.7`), `PROXY_ENV=NONE` on both. No further
request was made, by the owner or by this audit.

| | **Run 1** — 2026-10-11 15:38:11 UTC | **Run 2** — 2026-10-11 15:38:34 UTC |
|---|---|---|
| `PROXY_ENV` | `NONE` | `NONE` |
| destination requested | `hermesnovin.com:443:51.195.255.7` | `hermesnovin.com:443:51.195.255.7` |
| `REMOTE_IP` | `51.195.255.7` | `51.195.255.7` |
| `HTTP_CODE` | `200` | `200` |
| protocol | `HTTP/2 103` then `HTTP/2 200` | `200` |
| **`Server`** | **`cloudflare`** | **`nginx/1.31.2`** |
| `CF-RAY` | **present** — `a48ef34bfa24eff0-ARN` | **absent** |
| `cf-cache-status` | **present** — `DYNAMIC` | **absent** |
| other Cloudflare response headers | present | **absent** |
| `strict-transport-security` | **absent** | **absent** |
| `x-powered-by` | not recorded | **`Next.js`** present |
| `Set-Cookie` | not recorded | **`NEXT_LOCALE` set on a `HEAD`** |
| TLS | `SSL_VERIFY_RESULT=0` | run without `--insecure`; curl raised **no** TLS error. **The numeric `ssl_verify_result` is not present in the delivered text of run 2 and is therefore not recorded here** — curl's default verification succeeded, which is all that is evidenced |

**What run 2 proves.** Public reachability is an **existential** statement: it is established by one request that
arrives, not by a majority of requests. Run 2 is that request. Its identification of the answering host does not
rest on `remote_ip` — which §6.4 correctly refuses as a peer identity — but on the **response signature**:
`Server: nginx/1.31.2` with no `CF-RAY`, no `cf-cache-status` and no other Cloudflare header, plus
`x-powered-by: Next.js` and the `NEXT_LOCALE` cookie on a `HEAD`. That signature is exactly what the origin
self-check of 2026-10-10 recorded on the host's own public interface (§6.5), and it is mutually exclusive with the
Cloudflare edge signature. A request issued from outside both the production host and the audit environment
therefore reached the Hermes origin stack directly.

```
INDEPENDENT_VANTAGE_RUN_1_VERDICT = EDGE_ROUTED_OR_INTERCEPTED
INDEPENDENT_VANTAGE_RUN_2_VERDICT = DIRECT_ORIGIN_REACHED_FROM_EXTERNAL_VANTAGE
ORIGIN_CONTROL_VERDICT            = PUBLICLY_REACHABLE
```

**Run 1 is not discarded.** It is recorded as a genuine observation of the same destination being
**`EDGE_ROUTED_OR_INTERCEPTED`** 23 seconds earlier. Both observations are real; they are not reconciled by
declaring one invalid.

**The cause of the difference is not established, and nothing is asserted about it.** Two responses to the same
destination from the same device 23 seconds apart indicate **unstable routing or interception** on the path. No
evidence identifies the mechanism, and none is claimed: `BYOIP_EVIDENCE: NONE`, `MAGIC_TRANSIT_EVIDENCE: NONE`,
`SPECTRUM_EVIDENCE: NONE`, `MOBILE_CARRIER_INTERCEPTION_EVIDENCE: NONE`,
`ANYCAST_OR_DNS_VARIANCE_EVIDENCE: NONE`. `PATH_INSTABILITY_CAUSE: UNKNOWN`. Recorded as **EDGE-10**.

**A deviation from the pre-registered protocol, recorded rather than smoothed over.** The adjudication table in
§19 was written in advance and says that a response bearing `Server: cloudflare` or any `CF-RAY` means the vantage
is not independent and that the request must **not** be repeated from it. Run 1 bore both; run 2 repeated the
request from the same device anyway. That is a departure from the protocol as written and it is stated here
plainly. It matters for two reasons, and only the first weakens anything:

1. The table's rule encoded an **assumption** — that a Cloudflare-signed response implies a tainted vantage. Run 2
   falsified that assumption for this vantage: the same device, 23 seconds later, with no proxy and no
   configuration change, reached the origin directly. A Cloudflare-signed response therefore evidences the
   **path at that instant**, not the cleanliness of the vantage.
2. The conclusion drawn here does not depend on the discarded assumption. It needs only that the request
   originated outside both the production host and the audit environment — established by the vantage itself
   (Termux, independent network, `PROXY_ENV=NONE`) — and that the response came from the origin, established by
   the response signature. Both hold for run 2 independently of how run 1 is read.

**What this evidence does not prove.** It does not establish how the provider is configured, whether an OVH or
upstream filter exists, nor that every source address on the internet can reach the origin. The verdict is that
**no effective external restriction was enforced for the observed vantage**; a provider-level control may exist
and, from this vantage, did not prevent direct access. It also proves nothing about IPv6, which no run touched.

**HSTS is absent in both runs**, on the Cloudflare-served response and on the direct origin response alike. The
existing HSTS finding is now confirmed from three distinct vantages: the edge, the host itself (§6.5) and an
independent external network.

---

## 7. Docker and firewall boundary

### 7.1 Repository state

| Control | State in the repository |
|---|---|
| Host-IP-scoped port publishing | **absent** — `"80:80"` / `"443:443"` |
| `internal: true` on the app network | **absent** |
| Firewall as code (UFW / nftables / iptables) | **absent entirely** |
| `DOCKER-USER` rules | **absent entirely** |
| Cloudflare IP allowlist | **absent** |
| Documented procedure for updating Cloudflare ranges | **absent** |

### 7.2 Host runtime state — owner-supplied, read-only

| Fact | Value |
|---|---|
| nginx listener, port 80 | bound on **`0.0.0.0` and `::`** |
| nginx listener, port 443 | bound on **`0.0.0.0` and `::`** |
| UFW, ports 80 and 443 | **`ALLOW IN` from `Anywhere`**, on both IPv4 and IPv6 |
| `DOCKER-USER` chain | **no allowlist and no restricting rule** |
| Docker NAT for 80/443 | **public DNAT** to the nginx container |
| Host-level Cloudflare-only restriction | **none** |
| Live nginx `real_ip_header` | **absent** |
| Live nginx `real_ip_recursive` | **absent** |
| Live nginx `set_real_ip_from` | **absent** |
| Live nginx `X-Real-IP` source | `$remote_addr` |
| Live nginx `X-Forwarded-For` source | `$proxy_add_x_forwarded_for` |
| `server_name` | still carries `185.80.196.163` while the host is `51.195.255.7` (EDGE-05) |

**Finding EDGE-01 (updated with runtime evidence).** There is **no host-level restriction of any kind** on
inbound 80/443. The repository's configuration already asked for all-interface publishing, and the runtime
confirms it: UFW allows Anywhere on both address families, `DOCKER-USER` is empty of restrictions, and Docker
DNATs both ports publicly. The live nginx configuration matches the repository: the real-IP module is entirely
unconfigured.

This closes the *host-level* half of the origin question definitively. What remains open is whether anything
**upstream of the host** restricts or intercepts that path — see EDGE-06 and §13.

**Provider-level firewall: no evidence either way.** Nothing in the repository, and nothing in the runtime
evidence supplied, speaks to a provider-level or Cloudflare-level network control. It may exist; it is simply not
established, and this document does not assume it in either direction.

---

## 8. Nginx real-IP configuration

Measured across both config files:

| Directive | `default.conf` | `mail.conf` |
|---|---|---|
| `real_ip_header` | **0** | **0** |
| `real_ip_recursive` | **0** | **0** |
| `set_real_ip_from` | **0** | **0** |
| `proxy_set_header` | 11 | 7 |
| `proxy_add_x_forwarded_for` | 2 | 1 |
| `remote_addr` | 2 | 1 |

**Finding EDGE-03.** The `ngx_http_realip_module` is not configured at all. Consequently `$remote_addr` is the
peer nginx actually sees — Cloudflare's edge, if Cloudflare is in front — and every header nginx derives from
`$remote_addr` carries that value rather than the visitor's address.

What nginx sends upstream (`deploy/nginx/default.conf`):

```
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;                 ← the peer, not the visitor
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;   ← appends to whatever arrived
proxy_set_header X-Forwarded-Proto https;
proxy_set_header X-Forwarded-Host  $host;
proxy_set_header Upgrade           $http_upgrade;
proxy_set_header Connection        "upgrade";
```

**`CF-Connecting-IP` is neither read, rewritten nor stripped.** It passes through untouched if present, and
nothing downstream consults it (§10).

---

## 9. Header trust-chain table

| Header | External sender can set it? | Cloudflare behaviour | Nginx source / rewrite | Value reaching the app | App consumer | Trust decision | Spoofable at the app? | Normalisation | Failure behaviour | Security impact |
|---|---|---|---|---|---|---|---|---|---|---|
| **`X-Real-IP`** | Yes, but irrelevant — nginx **overwrites** it | passes through / may set its own | `proxy_set_header X-Real-IP $remote_addr` — **overwritten every time** | nginx's peer address | `resolveClientIp` (33 call sites) and `ot-edge/http/machine-auth.ts:57` | **TRUSTED** | **No** — overwritten at the proxy | none: `.trim()` only; no IPv4/IPv6 canonicalisation, no port stripping | absent or blank → the literal string `"unknown"` | correct *if* nginx's peer is the visitor; **wrong if Cloudflare is the peer** (§10, IP-01) |
| **`X-Forwarded-For`** | **Yes** — left-most entry is client-controlled | appends the visitor address | `$proxy_add_x_forwarded_for` — **appends**, never replaces | multi-hop list with an attacker-controlled left-most entry | **none** — no production code reads it | **NOT TRUSTED, by deliberate design** | n/a | n/a | n/a | the Phase 93 fix; a CI gate flags any file mentioning it (`scripts/ci/phase99-security-readiness-eval.mjs:191`) |
| **`CF-Connecting-IP`** | Yes (nothing strips it) | sets it to the real visitor address | **not referenced** — passed through untouched | present but **ignored** | **none** — two comments only (`request-guards.ts:22`, `media/public/videos/route.ts:32`) | **NOT TRUSTED** | n/a — unused | n/a | n/a | the one header that would carry the true visitor IP is discarded (IP-02) |
| **`Forwarded`** (RFC 7239) | Yes | not set | not referenced | ignored | **none** — 0 code occurrences | n/a | n/a | n/a | n/a | none |
| **`True-Client-IP`** | Yes | Enterprise-only | not referenced | ignored | **none** — 0 occurrences anywhere | n/a | n/a | n/a | n/a | none |

The design is internally consistent and **not spoofable**: the single trusted header is the one the proxy
overwrites, and every client-settable alternative is ignored. The defect is not spoofability — it is **which**
address that trusted header carries.

---

## 10. Application IP extractors

There are **two**, with identical semantics and no shared code:

| # | Site | Implementation | Callers |
|---|---|---|---|
| 1 | `src/lib/security/request-guards.ts:32-36` | `resolveClientIp(req)` → `req.headers.get("x-real-ip")`, trimmed; falls back to the literal `"unknown"` | **33 production files** |
| 2 | `src/lib/ot-edge/http/machine-auth.ts:57` | `req.headers.get("x-real-ip")?.trim() \|\| "unknown"` — an independent re-implementation, **not a call** to `resolveClientIp` | the OT machine-auth path |

No other IP source exists: `git grep` for `request.ip`, `req.ip`, `.socket.remoteAddress` and direct `x-`-header
reads returns only unrelated headers (`x-correlation-id`, `x-request-id`, `x-indexnow-secret`,
`x-content-type-options`).

**Finding IP-01 — the trusted header carries the wrong address.** `resolveClientIp`'s own documentation
(`request-guards.ts:19-30`) states the premise: *"This deployment is nginx (Let's Encrypt, no Cloudflare)"*, and
reasons from it that `X-Real-IP` "is the proxy's view of the peer and cannot be spoofed by the client". The
first half is now false — production returns `Server: cloudflare` and `CF-RAY` — and the file even anticipates the
consequence: *"Behind a future CF edge, `X-Real-IP` would resolve to the CF IP (over-aggregating, never a bypass);
re-enabling CF trust would require a `set_real_ip_from` allowlist at the proxy."* That allowlist does not exist
(§8). So the stated mitigation was never applied after the edge changed.

Effect: every visitor arriving through one Cloudflare PoP shares a single identity for every purpose below. This
is **not** an authentication bypass and **not** spoofable — it is aggregation.

**Finding IP-02 — the correct value is available and discarded.** Cloudflare supplies `CF-Connecting-IP` on every
request. Nothing reads it, and nginx does not strip it, so the true visitor address arrives at the application and
is thrown away.

**Finding IP-03 — no normalisation.** Neither extractor canonicalises. An IPv6 address, an IPv4-mapped IPv6 form
(`::ffff:1.2.3.4`), a bracketed form or a value with a port produce **distinct** limiter keys for the same client,
and `"unknown"` is a single shared bucket for every request that arrives without the header.

**Finding IP-04 — duplicated extraction logic.** Fixing `resolveClientIp` would not reach
`ot-edge/http/machine-auth.ts:57`. There is no single utility, so a correction must be applied twice or
centralised first.

---

## 11. Rate-limiter inventory

Three independent implementations exist.

### 11.1 `src/lib/auth/rate-limiter.ts` — the authentication / abuse limiter

| Property | Finding |
|---|---|
| Backend | Redis `INCR` + expiry, with an in-process `memCheck` fallback when Redis is unavailable |
| Key | `` `rl:auth:${action}:${identifier}:${windowId}` `` — **per-action namespace**, fixed window |
| Registered actions | **34** |
| Undeclared action | **fails CLOSED** — `checkRateLimit` returns `false`, `memCheck` returns `false`, `retryAfter` returns the default window, and `refuseUndeclaredAction` logs an error **and writes an audit event** (`INFRA_AUDIT.RATE_LIMITER_DEGRADED`) |
| Redis unavailable | degrades to the in-process window — never to no limit |
| Keying | `resolveClientIp` for anonymous surfaces; `user.id` for authenticated ones (e.g. `journal-comment-create`, `journal-reaction-set`) |
| Labels | `PARTIALLY_DISTRIBUTED`, `ACTION_ISOLATED`, `FAIL_CLOSED`, `KEYING_COLLAPSED` (IP-01) for the IP-keyed actions; `KEYING_TRUSTED` for the user-id-keyed ones |

> **Correction to a previously committed statement.** `docs/security/PUBLIC-ROUTE-INVENTORY.md` (commit
> `e82dcbaf`) §6.1 and finding H-7 assert that `checkRateLimit` "returns `true` — i.e. UNLIMITED — for an
> unregistered action" and therefore "fails open on an unknown action". **That is wrong, and inverted.** The code
> at this SHA fails closed in all three functions. The error was inherited from a stale source comment rather than
> read from the limiter — see EDGE-04. H-7's *substance* (the three public media routes share the Copilot demo's
> buckets) stands; its stated *rationale* does not. `PUBLIC-ROUTE-INVENTORY.md` requires a correction commit.

**Finding EDGE-04 — stale security comments in production files.**
`src/app/api/media/public/videos/route.ts:58-60` states *"`checkRateLimit` returns `true` — i.e. UNLIMITED — for
an action it does not know, so inventing a `media-public-get` key here would silently produce no limit at all"*,
and `src/app/api/media/public/videos/[slug]/route.ts:38-39` repeats it. Both describe a fail-**open** behaviour
that the limiter does not have. The comments misstate a safety property **in the dangerous direction** — they make
a fail-closed control sound fail-open — and they are the documented justification for the bucket sharing in H-7.
A reader who trusts them reaches a false conclusion, as this audit initially did.

### 11.2 `src/lib/api/rate-limit.ts` — the tenant/API quota limiter

| Property | Finding |
|---|---|
| Backend | Redis pipeline (`INCR` + `EXPIREAT`), with a `DEV_STORE` `Map` fallback and a throttled degraded signal (`isRateLimiterDegraded()`) |
| Key | `` `rl:${orgId}:m:${minute}` `` and `` `rl:${orgId}:d:${day}` `` — keyed on **`orgId`, not on IP** |
| Labels | `PARTIALLY_DISTRIBUTED`, `ACTION_ISOLATED` (per-tenant, per-window), `KEYING_TRUSTED` (the org id is server-derived) |
| Relevance to B-03 | outside the client-IP question; included for completeness |

### 11.3 `src/app/api/sales/leads/route.ts:8-23` — a route-local limiter

| Property | Finding |
|---|---|
| Backend | a module-local `Map`, 5 requests / 10 minutes, with the in-file admission *"Not suitable for multi-instance; acceptable for early sales traffic"* |
| Key | the **truncated ipHash**, which is itself derived from the collapsed `X-Real-IP` |
| Labels | `IN_MEMORY_ONLY`, `KEYING_COLLAPSED`, `SHARED_BUCKET` (per PoP), `ACTION_ISOLATED` (its own map) |
| Bypass | the counter resets on every restart, recreate or redeploy, and each replica enforces an independent cap — so the effective ceiling is 5 × replicas, refreshed by any restart |

This is finding **H-3** from S0-B-01, restated here with its IP-keying consequence.

`src/app/api/operations/alerts/route.ts:94` and `.../intelligence/route.ts:80` were examined and contain
**unrelated** histogram `Map`s, not limiters. Recorded so the count is not inflated.

### 11.4 Per-consumer impact of a wrong client IP

| Consumer category | Routes / sites | Effect of IP-01 (collapsed) | Effect of IP-03 (`"unknown"`) |
|---|---|---|---|
| Authentication protection | `api/auth/route.ts` login throttle | visitors behind one PoP share the login budget — **false positives**, a denial-of-service risk against legitimate users; never a bypass | all header-less requests share one bucket |
| Account recovery | `forgot-password`, `reset-password`, `verify-email` | same aggregation | same |
| Invitation / registration | `accept-invite`, `candidate-register` | same aggregation | same |
| Public writes | `access-request`, `careers-apply`, `vendor-apply`, `copilot-demo-*`, `industrial-brain-analyze`, `cookie-consent` | same aggregation | same |
| `sales/leads` | §11.3 | aggregation **plus** restart/replica bypass | same |
| Derived-graph reads | the 10 `eng-graph` / `operations` endpoints, shared `derived-graph` bucket | aggregation only; reads, no disclosure | same |
| Logging / audit | `correlationId` paths, `AuditLog` | **attribution defect** — an incident timeline records a Cloudflare PoP, not an actor | records `"unknown"` |
| Privacy / IP hashing | `ArticleView.ipHash`, `SalesLead.ipHash`, `MediaViewEvent.ipHash` | the stored pseudonym identifies a **PoP**, not a person — it is neither useful for abuse attribution nor the personal datum it is governed as | `sha256("unknown" + salt)`, a constant |
| Media view counting | `media/public/videos/[slug]/view` | per-PoP de-duplication rather than per-visitor | `hashClientIp` returns `null` for `"unknown"` — correctly |
| OT machine auth | `ot-edge/http/machine-auth.ts` | same aggregation, via the duplicated extractor (IP-04) | same |

---

## 12. IP hashing and privacy effects

Three models carry an `ipHash` column: **`ArticleView`** (`prisma/schema.prisma:7245`), **`SalesLead`** (`:7383`)
and **`MediaViewEvent`** (`:8409`). The schema comment at `:8402` states the intent: *"`ipHash` and NEVER a raw
IP address"*.

Three derivations exist, and they do not agree:

| Site | Construction | Guard when the salt is missing | Length |
|---|---|---|---|
| `api/auth/access-request/route.ts:36` | `sha256(ip + process.env.JWT_ACCESS_SECRET)` | **none** | truncated to 16 hex |
| `api/sales/leads/route.ts:58` | identical | **none** | truncated to 16 hex |
| `api/media/public/videos/[slug]/view/route.ts:107-122` | `sha256(`${ip}:${secret}`)` via `hashClientIp` | **present** — returns `null`, and the column is nullable precisely for this | full 64 hex, enforced by `/^[0-9a-f]{64}$/` in `recordMediaViewEvent` |

**Finding IP-05 — H-1 is an un-propagated fix, not an oversight.** The media route's comment
(`:104-110`) explicitly names the other two sites and their line numbers, describes them as *"same secret, same
algorithm"*, and then implements the guard **only in its own file**, documenting exactly why it matters: *"an
unsalted hash of a 32-bit address space is reversible by brute force in seconds, so storing one would be storing
the IP."* The knowledge existed in the repository, in writing, pointing at the two lines that still lack the
guard. Production evidence (`JWT_ACCESS_SECRET=SET`) makes this latent rather than active, exactly as L-5.

**Finding IP-06 — `ArticleView.ipHash` has no writer.** `git grep ipHash -- src/lib/articles src/app/api/articles`
returns nothing. The column the media route calls "the repository's existing `ArticleView.ipHash` derivation" is
not written by any code in `src/`. Either the feature is unreachable or the write happens outside this repository;
the comment's framing is misleading either way.

**Finding IP-07 — a wrong IP corrupts the pseudonym's purpose.** Combined with IP-01, all three columns store a
pseudonym of a Cloudflare PoP. The privacy control still functions as a non-reversible store, but the datum is no
longer the personal identifier it is governed as, and it is useless for the abuse attribution it exists to serve.
Correct remediation must fix the *input* before strengthening the *hash*.

---

## 13. Runtime evidence — requested, and received

All five host-side facts requested by the first revision have been supplied by the owner through read-only
commands. None printed a secret, read an env file, restarted anything, reloaded nginx or changed a firewall rule.

| # | Question | Answer |
|---|---|---|
| 1 | the host's actual public address, and whether `185.80.196.163` is it | `51.195.255.7`; the stale address is on **no** interface |
| 2 | what is bound on 80/443, and on which interfaces | nginx on **`0.0.0.0` and `::`** for both ports |
| 3 | whether inbound 80/443 is restricted to Cloudflare's ranges | **no** — UFW `ALLOW IN Anywhere`, IPv4 and IPv6 |
| 4 | whether `DOCKER-USER` carries any restriction | **no** — no allowlist, no restricting rule; public DNAT |
| 5 | whether the live nginx matches the repository | **yes** — `real_ip_header`, `real_ip_recursive` and `set_real_ip_from` all absent at runtime too |

The bundle that produced this evidence is retained in §14 for reproduction.

**Superseded 2026-10-11.** Revision 1 closed this section with *"One question remains and it is not host-side: see
§18."* That question — reachability from an independent vantage — has since been answered by the evidence in §6.7.
No host-side question is open.

---

## 14. Read-only production command bundle

Every command is read-only. None prints a secret, reads an env file, restarts or recreates a container, reloads
nginx, or changes a firewall rule. The nginx service name is **derived from `docker compose ps`**, never guessed.

```bash
# 0. Pin the compose project explicitly.
cd /opt/hermes-os-nexuz
COMPOSE="docker compose -f /opt/hermes-os-nexuz/docker-compose.prod.yml"

# 1. Service identity and the compose file Docker believes it is using.
$COMPOSE ps --format '{{.Service}}\t{{.Name}}\t{{.State}}\t{{.Ports}}'
docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' hermes-web

# 2. Published port bindings, and the interface each is bound to.
docker ps --format '{{.Names}}\t{{.Ports}}' | grep -Ei 'nginx|hermes-web'
ss -ltnp 2>/dev/null | grep -E ':(80|443)\s' || sudo -n ss -ltnp | grep -E ':(80|443)\s'

# 3. Live nginx real-IP configuration — service name resolved, not assumed.
NGX=$($COMPOSE ps --services | grep -i nginx | head -1)
$COMPOSE exec -T "$NGX" nginx -T 2>/dev/null \
  | grep -nE '^\s*(listen|server_name|real_ip_header|real_ip_recursive|set_real_ip_from|proxy_set_header)\b'

# 4. UFW status for 80/443 only.
sudo -n ufw status verbose 2>/dev/null | grep -E '^(Status|Default)|(^|\s)(80|443)(/|\s)' || echo "ufw: unavailable or inactive"

# 5. Docker's own chain — the one that can bypass UFW for published ports.
sudo -n iptables -S DOCKER-USER 2>/dev/null || echo "DOCKER-USER: not readable"
sudo -n iptables -t nat -S DOCKER 2>/dev/null | grep -E 'dport (80|443)' || echo "nat/DOCKER: no 80/443 rule readable"

# 6. Does the host itself believe 185.80.196.163 is one of its addresses?
ip -4 -o addr show 2>/dev/null | awk '{print $2, $4}'
```

Expected reading: if step 6 does **not** list `185.80.196.163`, then §6.2's result was not the origin and
`EDGE-02` resolves to a different address. If steps 4–5 show no source restriction on 80/443, the origin is
reachable from any source regardless of what Cloudflare does in front of it.

---

## 15. Direct-origin HEAD results

### 15.1 Test 1 — INVALID, against the stale address

```
curl --ipv4 --silent --show-error --head --connect-timeout 10 --max-time 15 \
     --resolve hermesnovin.com:443:185.80.196.163 https://hermesnovin.com/fa
```

Returned `HTTP/1.1 200 OK` with `Server: cloudflare`, `CF-RAY: a48647488ffbf8ba-LHR`, `cf-cache-status: DYNAMIC`,
`Report-To` → `a.nel.cloudflare.com`, `Speculation-Rules`, and no `strict-transport-security`. **`remote_ip` was
not captured.**

**This test is invalid for the current origin and yields no conclusion about it.** `185.80.196.163` is on no
interface of the production host (§6.2). See §6.3 for the withdrawn claim.

### 15.2 Test 2 — the authorised final test against the real origin

Executed **once**, exactly as authorised. No retry was needed; no technical error occurred.

```
curl --ipv4 --noproxy '*' --silent --show-error --head \
     --connect-timeout 10 --max-time 15 \
     --resolve hermesnovin.com:443:51.195.255.7 \
     --write-out '\nREMOTE_IP=%{remote_ip}\nHTTP_CODE=%{http_code}\nSSL_VERIFY_RESULT=%{ssl_verify_result}\n' \
     https://hermesnovin.com/fa
```

| Field | Value |
|---|---|
| **`REMOTE_IP`** | **`51.195.255.7`** — the peer is the production host, confirmed from the socket |
| **`HTTP_CODE`** | **`200`** |
| **`SSL_VERIFY_RESULT`** | **`0`** — chain validated for `hermesnovin.com` |
| `Server` | **`cloudflare`** |
| `CF-RAY` | **present** — `a4868054fa7bec0d-LHR` |
| `cf-cache-status` | **present** — `DYNAMIC` |
| `strict-transport-security` | **ABSENT** — independently reconfirms the existing HSTS finding, now on the real origin address |
| Other Cloudflare markers | `Speculation-Rules: "/cdn-cgi/speculation"`, `alt-svc: h3=":443"; ma=86400` |
| Application markers | `x-powered-by: Next.js`, `Set-Cookie: NEXT_LOCALE=fa`, `vary: rsc, next-router-state-tree, …`, and the app's own `next.config.ts` headers |
| TLS | recorded separately per the rules; **not** evidence of network access control |

No cookie, no credential, no custom header, no redirect follow, no retry, no second path, no port other than 443,
no spoofed `X-Real-IP` / `X-Forwarded-For` / `CF-Connecting-IP`, and no change to production.

Interpretation in §6.4 and §6.5. **This test is invalid for origin attribution**: the origin self-check proves
the real origin answers `Server: nginx/1.31.2` with no Cloudflare headers, so the audit environment's path was
intercepted. `remote_ip` does not contradict that — it reports the dialled address, not the answering host.

### 15.3 Two incidental observations from the origin response

Both are from the genuine origin response and are recorded without hurried rating.

| Observation | Note |
|---|---|
| **`x-powered-by: Next.js`** | Framework disclosure on every response. An information-disclosure **hardening opportunity** — it narrows an attacker's guesswork about the stack — **not** a critical vulnerability. Removable via `poweredByHeader: false` in `next.config.ts`. Recorded as **EDGE-07**. |
| **`Set-Cookie: NEXT_LOCALE=fa; Max-Age=31536000`** on a `HEAD` | A `HEAD` request, which is nominally side-effect-free, causes a one-year locale cookie to be set. This is next-intl's documented locale-negotiation behaviour rather than an application decision, and it carries no identity. Recorded as **EDGE-08** and **deliberately not rated**; S1 owns whether a HEAD should set state and whether the cookie needs a consent classification. |

---

## 16. Findings

| ID | Finding | Evidence |
|---|---|---|
| **EDGE-01** | **No host-level restriction exists on inbound 80/443.** Confirmed by runtime evidence: nginx bound on `0.0.0.0` and `::` for both ports, UFW `ALLOW IN Anywhere` on both address families, `DOCKER-USER` empty of restrictions, public Docker DNAT. The repository contains no firewall-as-code at all, and Docker's chains precede `INPUT`, so a UFW rule alone would not have sufficed anyway. | §7.1, §7.2 |
| **EDGE-02** | **Withdrawn and superseded.** The original finding concerned the unresolved identity of `185.80.196.163`. That address is on no interface of the production host, so the question is moot: the first test was simply aimed at the wrong place. Replaced by EDGE-05 (the drift that caused it) and EDGE-06 (the anomaly on the real address). | §6.2, §6.3 |
| **EDGE-05** | **Configuration drift.** `deploy/nginx/default.conf` lists `185.80.196.163` in `server_name` (lines 4, 30) while the host's address is `51.195.255.7`. Harmless as a matching token, but a false statement about the deployment embedded in configuration — and the direct cause of one invalid audit test. Not changed; S0 is audit-only. | §6.2 |
| **EDGE-06** | **`RECLASSIFIED_AS_TEST_ENVIRONMENT_INTERFERENCE` (2026-10-10).** Originally raised as "a Cloudflare-fronted response arrives on the origin's own address", with BYOIP / Magic Transit as the leading hypothesis. The origin self-check refuted the premise: the real origin answers `Server: nginx/1.31.2` with no Cloudflare headers, so the anomaly was in the audit environment's network path. `BYOIP_EVIDENCE: NONE`, `MAGIC_TRANSIT_EVIDENCE: NONE`, `SPECTRUM_EVIDENCE: NONE`; interference type `UNKNOWN`. **Identifier retired — not reused.** | §6.5, §6.6 |
| **EDGE-09** | **The origin is reachable directly from the public internet.** A request from a vantage independent of both the production host and the audit environment reached the Hermes origin stack on `51.195.255.7:443` and was answered with the origin's own signature — `Server: nginx/1.31.2`, no `CF-RAY`, no `cf-cache-status`, `x-powered-by: Next.js`, `NEXT_LOCALE` set on a `HEAD` — mutually exclusive with the Cloudflare edge signature. Together with EDGE-01 (no host-level restriction) this means the Cloudflare edge can be bypassed from outside. Existential proof: one arriving request suffices. Provider configuration remains unknown and is not required for this verdict. | §6.7 |
| **EDGE-10** | **Routing to the origin address was unstable between two observations 23 seconds apart.** The same device, same command and same destination received a Cloudflare-fronted response at 15:38:11 UTC and a direct origin response at 15:38:34 UTC on 2026-10-11. Both observations are recorded as genuine. **The mechanism is not established and none is asserted** — no evidence for BYOIP, Magic Transit, Spectrum, carrier interception, anycast or DNS variance. Deliberately not rated. | §6.7 |
| **EDGE-07** | **`x-powered-by: Next.js` is present on the origin response.** Framework disclosure; an information-disclosure **hardening opportunity**, not a critical vulnerability. | §15.2, §15.3 |
| **EDGE-08** | **A `HEAD` request returns `Set-Cookie: NEXT_LOCALE=fa`** (`Max-Age=31536000`). Recorded as an observation about a side effect on a nominally side-effect-free method; **deliberately not rated** pending S1. | §15.2, §15.3 |
| **EDGE-03** | `ngx_http_realip_module` is entirely unconfigured — `real_ip_header`, `real_ip_recursive` and `set_real_ip_from` are all **0** in both nginx config files. | §8 |
| **EDGE-04** | Two production files carry stale comments asserting the rate limiter fails **open** on an unknown action, when it fails **closed**. They misstate a safety property in the dangerous direction and are the documented justification for H-7. One already caused an error in a committed security document. | §11.1 |
| **IP-01** | The one trusted header carries nginx's peer address, which is Cloudflare's edge. `resolveClientIp`'s premise ("no Cloudflare") is false, and the mitigation its own comment prescribes (`set_real_ip_from`) was never applied. | §10, §8 |
| **IP-02** | `CF-Connecting-IP` arrives on every request, is neither stripped nor rewritten, and is read by no code. The correct value is available and discarded. | §9, §10 |
| **IP-03** | No normalisation in either extractor: IPv6, IPv4-mapped, bracketed and port-bearing forms key differently, and a missing header collapses every caller into the single `"unknown"` bucket. | §10 |
| **IP-04** | Two independent IP extractors with no shared code — `request-guards.ts:32` and `ot-edge/http/machine-auth.ts:57`. A fix to one does not reach the other. | §10 |
| **IP-05** | H-1 is an **un-propagated fix**: the media route names the other two sites and their line numbers, calls them "same secret, same algorithm", and adds the guard only to itself. | §12 |
| **IP-06** | `ArticleView.ipHash` has no writer in `src/`. | §12 |
| **IP-07** | A wrong input IP makes all three `ipHash` columns pseudonyms of a PoP — still non-reversible, but no longer the personal datum they are governed as, and useless for attribution. | §12 |
| **RL-01** | `sales/leads` uses a route-local in-memory limiter keyed on a collapsed IP: resets on restart, multiplies per replica. (= H-3, with its IP consequence.) | §11.3 |
| **RL-02** | The auth limiter is correctly fail-closed, action-isolated and audited on an undeclared bucket — recorded as a **positive** control, and as the correction to the H-7 rationale. | §11.1 |

Severity is deliberately not assigned: S1 owns the risk register. Direct-origin reachability is not by itself a
critical vulnerability; header spoofability was examined and found **absent**; a collapsed IP degrades
availability and attribution, not authentication.

---

## 17. Verdicts

### 17.1 Current verdicts — revision 2, 2026-10-11

```
ORIGIN_CONTROL_VERDICT:                        PUBLICLY_REACHABLE
HOST_LEVEL_ORIGIN_CONTROL:                     ABSENT_CONFIRMED
EFFECTIVE_EXTERNAL_ORIGIN_RESTRICTION:         NOT_ENFORCED_FOR_OBSERVED_VANTAGE
PROVIDER_CONFIGURATION:                        UNKNOWN_NOT_REQUIRED_FOR_REACHABILITY_VERDICT
REAL_CLIENT_IP_VERDICT:                        COLLAPSED_TO_CLOUDFLARE_POP
HSTS_ORIGIN:                                   ABSENT_CONFIRMED
PATH_INSTABILITY_CAUSE:                        UNKNOWN
```

`PUBLICLY_REACHABLE` rests on §6.7 run 2 and on the response signature, not on `remote_ip`. It is an existential
claim about the observed vantage and does not assert that every source on the internet can reach the origin.

### 17.2 Superseded verdicts — revision 1, 2026-10-10, retained for traceability

```
ORIGIN_CONTROL_VERDICT:         UNPROVEN          ← SUPERSEDED 2026-10-11 by §6.7
PROVIDER_LEVEL_ORIGIN_CONTROL:  UNPROVEN          ← SUPERSEDED: restated as PROVIDER_CONFIGURATION:
                                                    UNKNOWN_NOT_REQUIRED_FOR_REACHABILITY_VERDICT
HOST_LEVEL_ORIGIN_CONTROL:      ABSENT_CONFIRMED  ← unchanged
REAL_CLIENT_IP_VERDICT:         COLLAPSED_TO_CLOUDFLARE_POP  ← unchanged
```

Why `PROVIDER_LEVEL_ORIGIN_CONTROL: UNPROVEN` was not simply flipped: it asked about **configuration**, which is
still unknown and was never measured. What has been measured is **effect**. Whatever provider-level control may
exist, it did not prevent direct access from the observed vantage, and a reachability verdict needs the effect,
not the configuration. The two are kept as separate statements so neither is overstated.

### 17.3 Supporting reasoning — what still stands, and what is superseded inline

Revision 1's reasoning is kept in place below. Each claim that revision 2 changes is marked where it sits, so a
reader sees the original wording and its supersession together rather than one without the other.

**`HOST_LEVEL_ORIGIN_CONTROL: ABSENT_CONFIRMED`** — proven by runtime evidence, and this is the unfavourable
answer. nginx listens on `0.0.0.0:80`, `0.0.0.0:443`, `[::]:80` and `[::]:443`; UFW is `ALLOW IN Anywhere` on both
address families; `DOCKER-USER` holds no allowlist or restriction; Docker DNATs both ports publicly; there is no
host-level Cloudflare allowlist (§7.2). The origin self-check additionally proves the Hermes nginx itself answers
on the public interface (§6.5). Nothing *on the host* would stop an arbitrary source.

**`PROVIDER_LEVEL_ORIGIN_CONTROL: UNPROVEN`** — nothing establishes whether an OVH or upstream network filter
sits in front. It may exist; it is not assumed in either direction. **This remains true of the configuration and
is unchanged.**

**`ORIGIN_CONTROL_VERDICT: UNPROVEN` — SUPERSEDED 2026-10-11.** Revision 1 wrote: *"`PUBLICLY_REACHABLE` is not
claimed. The only external test available came from the audit environment, and §6.5 proves that path was
intercepted, so it cannot adjudicate reachability from the public internet."* That was a correct statement of what
was then available, and it is retained verbatim above rather than deleted. Its premise — that no external request
from an independent vantage existed — no longer holds: §6.7 records one, and it reached the origin directly.
`CLOUDFLARE_ONLY` remains unclaimable, now for a stronger reason: a direct arrival has been observed.

Also unproven in revision 1 and now resolved in part: whether `51.195.255.7:443` is reachable from the public
internet without Cloudflare in path — **it is** (§6.7), and the run was made with `PROXY_ENV=NONE` outside any
VPN, WARP or proxy. **IPv6 exposure remains untested from every vantage.**

`REAL_CLIENT_IP_VERDICT: COLLAPSED_TO_CLOUDFLARE_POP` — this one **is** proven from source plus the confirmed
edge: nginx sets `X-Real-IP` from `$remote_addr`, no `set_real_ip_from` exists, production is behind Cloudflare,
and the single consumed header therefore carries a PoP address. Note explicitly that `HEADER_SPOOFABLE` does
**not** apply: the trusted header is overwritten at the proxy and every client-settable alternative is ignored.

### 17.4 Per-limiter verdicts — unchanged by revision 2

These are source-derived and the new evidence does not touch them. They are listed separately so they are not
read as part of the superseded origin reasoning above.

| Limiter | Labels |
|---|---|
| `src/lib/auth/rate-limiter.ts` (34 actions) | `PARTIALLY_DISTRIBUTED` · `ACTION_ISOLATED` · `FAIL_CLOSED` · `KEYING_COLLAPSED` (IP-keyed actions) · `KEYING_TRUSTED` (user-id-keyed actions) |
| `src/lib/api/rate-limit.ts` (tenant quota) | `PARTIALLY_DISTRIBUTED` · `ACTION_ISOLATED` · `KEYING_TRUSTED` |
| `src/app/api/sales/leads/route.ts` | `IN_MEMORY_ONLY` · `KEYING_COLLAPSED` · `SHARED_BUCKET` · `ACTION_ISOLATED` |

Deliberately **not** issued as one global verdict: the three limiters differ in backend, keying and failure mode,
and within the auth limiter the IP-keyed and user-id-keyed actions differ too.

---

## 18. Unknowns and limitations

**Closed 2026-10-11.** Revision 1 stated here that *"the one piece of evidence that would close the origin
verdict is a single `HEAD` from a vantage that is genuinely outside both the production server and the audit
environment"*. That evidence was supplied and is recorded in §6.7. Nothing in this section is now waiting on the
owner.

Also unknown:

- **how** the provider is configured — whether an OVH or other provider-level network filter fronts
  `51.195.255.7`. Its *effect* is measured (`NOT_ENFORCED_FOR_OBSERVED_VANTAGE`); its configuration is not;
- why the path to `51.195.255.7` differed between two runs 23 seconds apart (EDGE-10) — no mechanism is
  evidenced, and none is asserted;
- whether the origin is reachable from source addresses other than the one observed;
- the real IPv6 exposure from the public internet — nginx listens on `[::]:80` and `[::]:443` and UFW allows
  Anywhere on IPv6, but no IPv6 request has been made from any vantage;
- whether Cloudflare "Authenticated Origin Pulls" or an origin certificate pin is configured;
- the `hermes-web` replica count, which bounds how far RL-01 can be exploited;
- the strength, independence, rotation and replica-consistency of `AUTH_SECRET` (L-5) and of the IP-hash salt
  (IP-05) — presence was confirmed, nothing more.

Resolved since the first revision: the host firewall and `DOCKER-USER` state (§7.2); that the running nginx
matches the repository (it does — the real-IP module is unconfigured in both); that `51.195.255.7` is the origin's
public address and the Hermes nginx answers on it directly (§6.5); and that the audit environment's external test
was intercepted, which retired EDGE-06 (§6.6).

Resolved in revision 2 (2026-10-11): that the origin answers a request from an independent external vantage
directly, with its own signature and no Cloudflare headers (§6.7, EDGE-09); that connections from outside any
VPN, WARP or proxy behave the same way; and that HSTS is absent on the direct origin response as seen from
outside the host as well.

No runtime behaviour was observed inside the application: no request was authenticated, no limiter was exercised,
no header was spoofed, no `ipHash` value was read, no token or cookie was created.

---

## 19. The independent-vantage command

Run **once**, from a machine that is **neither** the production server **nor** the audit environment — an
unrelated VPS, or a phone's mobile data tether. Mobile data is the easiest way to guarantee no corporate or
device-level interception.

**Step 1 — prove the vantage is clean.** Non-confidential; prints only variable names and values of proxy
settings, nothing else:

```bash
env | grep -Ei '^(http|https|all|no)_proxy=' || true
```

Expected: **no output**. Any line here invalidates the test. Also confirm Cloudflare WARP is disconnected and no
VPN is active on that machine.

**Step 2 — the single request.**

```bash
curl \
  --ipv4 \
  --noproxy '*' \
  --silent \
  --show-error \
  --head \
  --connect-timeout 10 \
  --max-time 15 \
  --resolve hermesnovin.com:443:51.195.255.7 \
  --write-out '\nREMOTE_IP=%{remote_ip}\nHTTP_CODE=%{http_code}\nSSL_VERIFY_RESULT=%{ssl_verify_result}\n' \
  https://hermesnovin.com/fa
```

On Windows use **`curl.exe`**, never the PowerShell alias, and double quotes:

```
curl.exe --ipv4 --noproxy "*" --silent --show-error --head --connect-timeout 10 --max-time 15 --resolve hermesnovin.com:443:51.195.255.7 --write-out "\nREMOTE_IP=%{remote_ip}\nHTTP_CODE=%{http_code}\nSSL_VERIFY_RESULT=%{ssl_verify_result}\n" https://hermesnovin.com/fa
```

One request only: HEAD, no auth, no cookie, no custom security header, no redirect follow, no retry, no other
port, no other path, no scan.

**Adjudication — decided in advance so the result cannot be argued after the fact:**

| Observation | Verdict |
|---|---|
| `REMOTE_IP=51.195.255.7` **and** `Server: nginx/1.31.2` **and** no `CF-RAY` | `ORIGIN_CONTROL_VERDICT = PUBLICLY_REACHABLE`, `GATE_A_B03 = CLOSED_WITH_FINDINGS` |
| timeout or connection refused | `UNPROVEN` — a refusal alone does not prove a Cloudflare-only restriction; it needs independent provider-level evidence |
| `Server: cloudflare` or any `CF-RAY` | the vantage is **not** independent, or another interception is in path. **Do not repeat the request.** Find a different vantage. |

Closing the gate this way would mean the ambiguity has been **measured**, not that the posture is safe — the
host-level answer is already known to be unfavourable.

**Executed 2026-10-11. Result in §6.7.** The command was run twice from Termux on a phone on an independent
network, 23 seconds apart, with `PROXY_ENV=NONE` verified by step 1 on both. Run 2 matched the first row of the
table above — `REMOTE_IP=51.195.255.7`, `Server: nginx/1.31.2`, no `CF-RAY` — so the pre-registered verdict is
`ORIGIN_CONTROL_VERDICT = PUBLICLY_REACHABLE`, `GATE_A_B03 = CLOSED_WITH_FINDINGS`. Run 1 matched the third row,
and §6.7 records both the deviation from "do not repeat" and why the conclusion survives it. **No further request
was made; the gate is closed on this evidence and the command is not to be run again.**

---

## 19. Future remediation architecture — design only, not executed

1. **Origin allowlist.** Accept inbound 80/443 only from Cloudflare's published ranges, enforced in `DOCKER-USER`
   (not UFW alone, since Docker's chains precede `INPUT`), plus a documented, automated procedure for refreshing
   those ranges.
2. **Trusted proxies in nginx.** `set_real_ip_from` for each Cloudflare range, `real_ip_header CF-Connecting-IP`,
   and `real_ip_recursive` set to match the real hop count — not copied from an example.
3. **Reject forged inbound headers.** Clear any client-supplied `CF-Connecting-IP`, `X-Real-IP`, `Forwarded` and
   `True-Client-IP` at the edge of the trust boundary rather than relying on later overwrite ordering.
4. **One IP utility.** A single server-side resolver, used by both current extractors, that returns a typed result
   rather than the string `"unknown"`, with deterministic IPv4/IPv6 canonicalisation (IPv4-mapped forms collapsed,
   ports stripped, IPv6 normalised).
5. **Never trust an arbitrary client header** — keep the current posture, which is already correct.
6. **Distributed limiting** for every security-relevant action; retire the route-local map in `sales/leads`.
7. **Independent namespaces per action**, so no feature can consume another's budget (closes H-7 properly).
8. **Fail-closed** for authentication, recovery and privileged operations; a bounded, documented fallback is
   acceptable only for non-sensitive telemetry.
9. **A dedicated HMAC key for IP pseudonymisation**, independent of any signing key, with a key version, a
   rotation and migration policy, a retention policy, and **fail-closed when absent in production** — the posture
   the media beacon already takes.
10. **Tests** for the proxy chain and for multi-replica limiter behaviour, so a future edge change cannot silently
    re-break IP-01.
11. **Correct the stale comments** (EDGE-04) and the dependent claim in `PUBLIC-ROUTE-INVENTORY.md`.

---

## 20. Gate A decision

`S0-B-03` is **closed with findings** as of 2026-10-11.

| Question | Status |
|---|---|
| Real client IP | **CLOSED** — `COLLAPSED_TO_CLOUDFLARE_POP`, proven from source plus the confirmed edge |
| Host-level origin control | **CLOSED** — `ABSENT_CONFIRMED` (EDGE-01, runtime-confirmed) |
| Which host owns `51.195.255.7` | **CLOSED** — the Hermes origin stack, answering directly (§6.5) |
| External reachability of the origin | **CLOSED** — `PUBLICLY_REACHABLE`; direct origin response from an independent vantage (§6.7, EDGE-09) |
| Effective external restriction | **CLOSED** — `NOT_ENFORCED_FOR_OBSERVED_VANTAGE` |
| Provider **configuration** | **UNKNOWN, and not required** — a reachability verdict needs the measured effect, not the configuration (§17.2) |
| Cause of the 23-second path difference | **UNKNOWN, deliberately unexplained** — EDGE-10; no mechanism evidenced |
| IPv6 exposure | **NOT TESTED** from any vantage — carried to S1 as an untested surface, not as a finding |

Closing a question here means its ambiguity has been **measured and classified**, not that the state is safe. Both
origin answers are in fact the unfavourable ones: nothing restricts inbound 80/443, and the edge is bypassable
from outside.

**Superseded (2026-10-10):** revision 1 recorded *"Gate A therefore remains **NOT PASSED**. `S0-B-03` is
`S0_WAITING_FOR_PRODUCTION_EVIDENCE` on one point; `S0-B-04` and `S0-B-05` are untouched."* Both conditions have
since been met: the production evidence arrived (§6.7), and `S0-B-04` and `S0-B-05` were completed and committed
separately (`S0-B-05` as `40466fe1` and its corrective commit `03585c16`).

```
S0_B03_STATUS:  CLOSED_WITH_FINDINGS
GATE_A_B01:     CLOSED
GATE_A_B02:     CLOSED
GATE_A_B03:     CLOSED_WITH_FINDINGS
GATE_A_B04:     CLOSED
GATE_A_B05:     CLOSED
GATE_A_OVERALL: PASSED_WITH_FINDINGS
S0_VERDICT:     S0_COMPLETE_WITH_FINDINGS
```

`PASSED_WITH_FINDINGS` is a statement about the audit, not about the posture: every question Gate A asked has been
measured and recorded, and several answers are unfavourable. **No severity is assigned anywhere in this document;
S1 owns the risk register and has not been started.**

---

## 21. Reproduction manifest

```
# Source lock
git -C E:/hermes-security-dragon rev-parse HEAD        # ca89fad7…
git -C E:/hermes-security-dragon status --short --untracked-files=all

# Nginx real-IP
grep -rc 'real_ip_header\|real_ip_recursive\|set_real_ip_from' deploy/nginx/   # all 0
grep -nE 'proxy_set_header' deploy/nginx/default.conf

# Headers
git grep -in 'cf-connecting-ip|true-client-ip' -- src        # comments only
git grep -l resolveClientIp -- src | grep -v __tests__ | wc -l   # 33
git grep -n 'x-real-ip' -- src/lib/ot-edge/http/machine-auth.ts

# Limiters
sed -n '/export async function checkRateLimit/,/^}/p' src/lib/auth/rate-limiter.ts
sed -n '/function redisKey/,/^}/p'                    src/lib/auth/rate-limiter.ts
grep -nE '`rl:' src/lib/api/rate-limit.ts

# IP hashing
git grep -n ipHash -- src prisma/schema.prisma | grep -v __tests__

# Ports
grep -nE 'ports:|^      - "[0-9]' docker-compose.prod.yml

# Cloudflare range check (public reference document)
curl -sS https://www.cloudflare.com/ips-v4

# Direct-origin test 1 — INVALID (stale address, no remote_ip captured). Retained for the record only.
curl --ipv4 --silent --show-error --head --connect-timeout 10 --max-time 15 \
     --resolve hermesnovin.com:443:185.80.196.163 https://hermesnovin.com/fa

# Direct-origin test 2 — the authorised final test against the real origin.
curl --ipv4 --noproxy '*' --silent --show-error --head \
     --connect-timeout 10 --max-time 15 \
     --resolve hermesnovin.com:443:51.195.255.7 \
     --write-out '\nREMOTE_IP=%{remote_ip}\nHTTP_CODE=%{http_code}\nSSL_VERIFY_RESULT=%{ssl_verify_result}\n' \
     https://hermesnovin.com/fa
# → REMOTE_IP=51.195.255.7  HTTP_CODE=200  SSL_VERIFY_RESULT=0  Server: cloudflare  no HSTS

# Independent-vantage test — owner-supplied, Termux on a phone on an independent network, 2026-10-11.
# Step 1, on that device, must print nothing:
env | grep -Ei '^(http|https|all|no)_proxy=' || true          # → no output (PROXY_ENV=NONE), both runs
# Step 2, the same single command, run twice 23 s apart:
curl --ipv4 --noproxy '*' --silent --show-error --head \
     --connect-timeout 10 --max-time 15 \
     --resolve hermesnovin.com:443:51.195.255.7 \
     --write-out '\nREMOTE_IP=%{remote_ip}\nHTTP_CODE=%{http_code}\nSSL_VERIFY_RESULT=%{ssl_verify_result}\n' \
     https://hermesnovin.com/fa
# → run 1, 15:38:11 UTC: REMOTE_IP=51.195.255.7 HTTP_CODE=200 SSL_VERIFY_RESULT=0
#                        HTTP/2 103 then 200, Server: cloudflare, CF-RAY a48ef34bfa24eff0-ARN,
#                        cf-cache-status DYNAMIC, no HSTS                     → EDGE_ROUTED_OR_INTERCEPTED
# → run 2, 15:38:34 UTC: REMOTE_IP=51.195.255.7 HTTP_CODE=200
#                        Server: nginx/1.31.2, no CF-RAY, no Cloudflare headers, no HSTS,
#                        x-powered-by: Next.js, Set-Cookie NEXT_LOCALE on a HEAD,
#                        no --insecure and no TLS error; numeric ssl_verify_result not in the
#                        delivered text and therefore not recorded       → DIRECT_ORIGIN_REACHED
# NOT TO BE RE-RUN. The gate is closed on this evidence (§6.7, §19).
```

```
# Revision 2 source lock
git -C E:/hermes-security-dragon rev-parse HEAD        # 03585c16…
git -C E:/hermes-security-dragon status --short --untracked-files=all
```
