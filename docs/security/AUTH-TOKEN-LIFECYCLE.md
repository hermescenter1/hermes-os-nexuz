# Hermes OS — Legacy Session Token Lifecycle (S0-B-02)

**Program:** Hermes Security Dragon
**Closes:** `S0-B-02` — is the legacy `hermes_session` cookie without a `sid` reachable?
**Source state:** `bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2`
**Produced:** 2026-10-10

## Verdict

```
LEGACY_TOKEN_MINT_REACHABLE_PROTECTED
```

The mint site is a live production route and every successful login passes through it — so it is **reachable**.
It is **protected**: in database mode it always embeds the `sid`, and it fails closed (503, **no cookies set**)
rather than ever issuing a sid-less credential.

`LEGACY_TOKEN_MINT_UNREACHABLE` would be wrong — the code runs on every login.
`LEGACY_TOKEN_MINT_REACHABLE_REVOCATION_BYPASS` would also be wrong — it would require a reachable production
path that *produces* a sid-less token, and none exists while the deployment runs database mode (owner-verified:
`HERMES_STORAGE_MODE=database`).

---

## 1. The call graph, end to end

```
POST /api/auth/route.ts            the ONE mint site
  └─ issueTokens(user, rememberMe, { deviceInfo, expectedVersion })
       ├─ getStorageMode() === "database"
       │    ├─ getPrisma() === null      → throw SessionPersistenceError("db_unavailable")
       │    ├─ persistSessionRow(...)    → throw SessionPersistenceError("tx_failed") on any failure
       │    └─ sid = res.sid             "guaranteed non-null"
       └─ else (session mode)            sid stays null  — "intentionally sid-less"
  │
  ├─ catch SessionPersistenceError → sessionPersistenceUnavailable()
  │                                   503, and the function "Sets NO cookies"
  │
  └─ signSession({ userId, email, role, name, iat, sid: sid ?? undefined })
       └─ res.cookies.set(SESSION_COOKIE, …)   httpOnly, sameSite=lax, secure in production,
                                               maxAge 8 h, or 30 d with rememberMe
```

| Stage | Site | Finding |
|---|---|---|
| Definition | `src/lib/auth/config.ts:26` | `export const SESSION_COOKIE = "hermes_session"` |
| Signing primitive | `src/lib/auth/crypto.ts:51` | `signSession(payload)` — HMAC |
| **Mint / set-cookie** | `src/app/api/auth/route.ts:261-277` | **The only one.** `git grep -n signSession -- src/lib src/app scripts` (tests excluded) returns the import, this call, and the definition — nothing else. |
| `sid` source | `src/lib/auth/token-session.ts:145-172` | In-file contract: "throws SessionPersistenceError on any failure (**never returns a sid-less database-mode credential**). SESSION mode: intentionally sid-less." |
| Fail-closed response | `src/app/api/auth/route.ts:20` | `sessionPersistenceUnavailable()` — "Uniform fail-closed response for database-mode session persistence failures. **Sets NO cookies.**" |
| Refresh | `src/app/api/auth/refresh/route.ts` | Does **not** re-mint the legacy cookie — no `SESSION_COOKIE`, no `signSession`. It rotates the refresh token inside one transaction and carries a successor `sid`. |
| Logout | `src/app/api/auth/route.ts:120-148` | Reads the legacy cookie, resolves its identity, calls `revokeSession(identity.id, identity.sid)`, then clears all three cookies with `maxAge: 0`. Cookies are cleared even if the revoke throws. |
| Verification | `src/lib/auth/crypto.ts:68-92` `verifySession` | Signature **and freshness**. Phase 90 added an absolute ceiling: `SESSION_MAX_AGE_SECONDS = 30 days` compared against the payload's `iat`, and a malformed, missing, zero or future-dated `iat` returns `null`. It does not consult the session store — revocation is `isPayloadSessionActive`'s job — but a token is **not** eternal. |
| Signing key | `src/lib/auth/crypto.ts:31-33` | `process.env.AUTH_SECRET \|\| "hermes-dev-insecure-secret-not-for-production"`. **`AUTH_SECRET` only**, and **no production guard** — see L-5. |
| **Revocation gate** | `src/lib/auth/session-store.ts:136-139` | See §2. |
| Seed / demo / impersonation mint | — | **None found.** No script, seed or fixture in production code sets this cookie. |

---

## 2. The bypass, exactly as written

`src/lib/auth/session-store.ts:136-139`:

```ts
export async function isPayloadSessionActive(payload: { sid?: string }): Promise<boolean> {
  if (!payload.sid) return true;
  return isSessionActive(payload.sid);
}
```

A payload carrying no `sid` is treated as **active, unconditionally, with no database hit**. There is no mode
guard on that branch.

This is deliberate and documented in three places: `session.ts:31` ("Legacy cookies without a sid are allowed
unchanged — no DB hit"), `rbac-server.ts:20` ("Legacy credentials without a sid behave exactly as before"), and
`current-user.ts:36` ("Such a cookie is honoured by design").

### 2.1 Why that one line is the pivot of the whole revocation model

`isPayloadSessionActive` is the repository's canonical revocation check — `src/lib/org/context.ts:37` says so in
those words. It is called from roughly twenty modules, covering both authentication surfaces and most of the
privileged ones:

| Caller | What it gates |
|---|---|
| `src/lib/auth/session.ts:32` | `getCurrentUser` — the sole auth gate on ~130 API routes |
| `src/lib/auth/rbac-server.ts:26,33` | `getAuthRole` — the **middleware page gate**, for both the access token and the legacy cookie |
| `src/lib/api/auth.ts:397` | the shared API actor resolver |
| `src/lib/auth/request-session.ts:27` | request-scoped session resolution |
| `src/lib/auth/token-session.ts:252` | token refresh/verify path |
| `src/lib/org/context.ts:53,131` | `requireOrgActor` — organization membership |
| `src/lib/erp/active-organization.ts:64` | the ERP active-organization resolver |
| `src/lib/compliance/authz.ts:55,113` | compliance authorization |
| `src/app/api/compliance/exports/[id]/download/route.ts:29` | signed export download |
| `src/app/api/compliance/legal-documents/entries/[id]/accept/route.ts:30` | legal acceptance |

So a sid-less token, if one existed, would be accepted by the page gate, by ~130 API routes, by
`requireOrgActor`, by the ERP tenant resolver and by the compliance download path — and would stay valid until its
cookie expiry, immune to logout, admin suspension and password reset.

---

## 3. Residual risks — the verdict is PROTECTED, not SAFE

| # | Risk | Why it survives the verdict |
|---|---|---|
| **L-1** | **The bypass has no mode guard and no defence in depth on the read side.** The protection lives entirely on the mint side. A sid-less token is accepted until the signed `iat` passes the 30-day `SESSION_MAX_AGE_SECONDS` ceiling — so it is **not** eternal, but within that window it is immune to the canonical revocation check, to logout, to admin suspension and to password reset. One future code path that signs a session payload without a `sid` would silently reopen the full bypass and no test on the read side would fail. The cheap fix: `if (!payload.sid) return getStorageMode() !== "database";` — session-mode behaviour unchanged, the permanent hole closed. |
| **L-2** | **A storage-mode change is a deferred authentication downgrade.** If `HERMES_STORAGE_MODE` were set to `session` (or `DATABASE_URL` removed) in the host env file, the **running container would not change** — Node reads `process.env` once at start. The risk materialises on the **next `docker compose up --force-recreate`, redeploy or restart**, after which logins begin issuing sid-less, unrevocable cookies valid up to 30 days. Startup check **W7** does notice `HERMES_STORAGE_MODE=session` in production, but only as a **WARNING**, not a FATAL, so the process still boots. Same root as DB-F1 / S0-A-04B: a storage-engine change is also an enforcement change. |
| **L-3** | **Pre-Phase-91 cookies closed by time, not by revocation.** Every legacy cookie minted before Phase 91 shipped carries no `sid` and stayed valid up to the same 30-day ceiling. Phase 91 has long been deployed, so that window has closed in practice; recorded because it closed through the passage of time rather than through any revocation, and the shape recurs on any future credential-format change. |
| **L-4** | `verifySession` enforces signature **and** absolute age, but never consults the session store. All revocation force therefore comes from `isPayloadSessionActive`, so the single line in §2 carries the entire weight within the 30-day window. |
| **L-5** | **The legacy session HMAC key has no production guard — a potential authentication bypass.** See §3.1. |

### 3.1 L-5 in full

```
src/lib/auth/crypto.ts:31-33
  function secret(): string {
    return process.env.AUTH_SECRET || "hermes-dev-insecure-secret-not-for-production";
  }
```

Four facts, each verified on this commit:

1. `signSession` and `verifySession` key off **`AUTH_SECRET` alone**, and fall back to a constant **published in this
   repository**. There is **no `NODE_ENV` guard** on that fallback — unlike `jwtSecret()`
   (`src/lib/auth/config.ts:50`), which throws in production.
2. The **FATAL** startup checks `F1_JWT_INSECURE_DEFAULT` and `F2_JWT_TOO_SHORT`
   (`src/lib/startup/validate.ts:26-39`) are evaluated against **`jwtSecret()`**, which accepts any of
   `JWT_SECRET`, `JWT_ACCESS_SECRET`, `AUTH_SECRET` or `NEXTAUTH_SECRET`. A deployment setting only `JWT_SECRET`
   passes both.
3. The one check that mentions this constant, **`W5_KNOWN_WEAK_CREDENTIAL`**
   (`src/lib/startup/validate.ts:124-130`), is a **WARNING**, and it fires only when `AUTH_SECRET` is *explicitly
   set to* that string. When `AUTH_SECRET` is simply **absent** — the case in which `crypto.ts` substitutes the
   constant internally — **W5 does not fire**. There is no FATAL check on `AUTH_SECRET` anywhere.
4. Combined with §2: a forged payload may **omit `sid`**, and `isPayloadSessionActive` returns `true` for it
   without a database hit.

So **if `AUTH_SECRET` is unset in production**, a `hermes_session` cookie can be forged with any `userId`, `email`
and `role` and a self-chosen `iat`, and accepted by `getCurrentUser` (the sole gate on ~130 API routes) and by
`getAuthRole` (the middleware page gate) for up to 30 days. That is authentication bypass with role selection.

**Precondition status: UNVERIFIED.** `AUTH_SECRET` is listed in `.env.production.example`, and
`scripts/dr/config-inventory.mjs:54` registers it as `required: "conditional"` with `sourceClass:
SECRET_EXTERNAL`. The owner has verified `JWT_ACCESS_SECRET=SET`; `AUTH_SECRET` is a **different variable** and
has not been checked. No token was forged and no request was made to test this — the chain is established by
reading the four sites above.

The structural defect stands regardless of how any one deployment is configured: **the boot-time guard the
platform relies on does not cover the key this primitive actually uses.** That is true even when `AUTH_SECRET` is
set, because nothing prevents a future deploy from omitting it.

None of these is remediated: S0 is audit-only and `S1_AUTHORIZED: NO`.

---

## 3.2 The distinctions this document is required to keep separate

| Question | Answer on `bcf3be9a` |
|---|---|
| Is the mint path reachable? | **Yes** — every successful login executes `api/auth/route.ts:261-277`. |
| What is production's current mode? | `HERMES_STORAGE_MODE=database` (owner-verified, read-only). |
| Database-mode behaviour | `sid` guaranteed non-null, or `SessionPersistenceError` → 503 with **no cookies set**. A sid-less cookie cannot be minted. |
| Session-mode behaviour | `sid` intentionally null → every login mints a sid-less, unrevocable cookie. |
| Strength of the mint-side defence | **Strong** — fails closed, documented, and the contract is asserted in-file. |
| Defence in depth on the reader side | **Absent** — `if (!payload.sid) return true` has no mode guard (L-1). |
| JWT / token expiry | Enforced: 30-day absolute ceiling on `iat` in `verifySession`; cookie `maxAge` is 8 h, or 30 d with rememberMe. A sid-less token is bounded, not eternal. |
| Logout and revocation | Logout resolves the legacy cookie's identity, calls `revokeSession`, and clears all three cookies even if the revoke throws. Revocation reaches sid-bearing tokens only. |
| Risk on the next deployment | A mode change takes effect on **recreate/redeploy/restart**, not on the running container (L-2). W7 warns but does not block. |
| Signing-key exposure risk | L-5 — no production guard on `AUTH_SECRET`, and the FATAL guard covers a different resolution order. |

---

## 4. What this closure does and does not establish

**Establishes**, from the code:

- exactly one mint site for the legacy cookie, in a reachable production route;
- that in database mode the mint cannot produce a sid-less credential — it throws and the caller answers 503 with
  no cookies set;
- that the refresh route does not re-mint it, and logout revokes the server-side session and clears all three
  cookies;
- that no seed, demo, script or impersonation path mints it;
- that the sid-less bypass is real, intentional, documented, and sits under roughly twenty privileged call sites.

**Does not establish:**

- whether any sid-less cookie is currently live in the field. That would require inspecting real cookies, which
  this phase does not do. The code bounds the answer: none can have been minted since Phase 91 deployed, in
  database mode, and any older one has passed the 30-day ceiling.
- **whether `AUTH_SECRET` is set in production** — the single precondition of L-5. One read-only presence check
  settles it: `docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' hermes-web | grep -cE '^AUTH_SECRET=.+'`
  (count only; prints no value). `1` → L-5 is a latent structural defect. `0` → L-5 is **active** and this
  document's verdict must be reopened.
- the strength of `AUTH_SECRET` even when set, its independence from the JWT signing key, and its rotation
  policy.
- any runtime behaviour. **No token was created, no login was exercised, no cookie was forged, and production was
  not touched for this closure.**
