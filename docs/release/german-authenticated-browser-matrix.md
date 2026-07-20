# German Authenticated Browser Matrix — Execution Record (PHASE 87L.6I)

**Branch:** `phase-87l6-german-localization`
**Baseline:** `735bccd` (PHASE 87L.6H.1 + 87L.6H.1A)
**Executed:** local development environment, 2026-07-19.

> **OUTCOME: BLOCKED for the authenticated dimension.** The environment is
> provably non-production, but the repository has **no supported mechanism to
> create genuine Engineer or Superadmin sessions** without direct database
> tampering (forbidden by the brief). Every dimension that does **not** require
> a privileged session was genuinely executed in a real browser / over real
> HTTP and is recorded below. Every Engineer / Admin / Superadmin **authenticated**
> row remains `NOT EXECUTED`.

---

## 1. Environment proof (§2)

| Field | Value |
|---|---|
| Environment | Local development |
| Dev database host | `localhost:5432` (Docker container `hermes-connect-postgres-1`, `postgres:17-alpine`, bound to `127.0.0.1` loopback only) |
| Dev database name | `hermes_db` |
| Production database host | `postgres:5432` (docker-internal hostname, only resolvable on the VPS) — **unreachable from here** |
| Not production? | ✅ Confirmed. The production `DATABASE_URL` targets the docker-internal `postgres` host, which does not resolve in this environment. The local target is a loopback-only container. |
| Loaded env | `.env.local` (Next.js dev precedence) → `localhost:5432` |
| Outbound internet | **None** — `example.com` control also returns HTTP 000 (relevant to the Enamad image-load result below). |

## 2. Account-generation mechanism (§2/§3) — THE BLOCKER

| Mechanism | Result |
|---|---|
| `prisma/seed.ts` (`npm run db:seed`) | Creates 14 engineering cases, knowledge articles and billing plans. **Creates no users.** |
| `POST /api/auth/register` | Returns **403 unconditionally** — "no active User is ever created from a public POST" (Phase 81A: public registration disabled by design). |
| Invite / access-request flow (`src/lib/auth/access-invite.ts`) | Creates a user only on a valid invite token, which an existing **admin** must issue — chicken-and-egg with no seeded admin. |
| Env admin-seed (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, `src/lib/auth/service.ts`) | Seeds exactly **one** in-process user with `role: "admin"`. **Never engineer, never superadmin.** |

**Conclusion:** genuine **Engineer** and **Superadmin** sessions cannot be
produced by any repository-supported, non-tampering mechanism. The
security-critical half of this matrix is the **Engineer denials** — which
require a genuine Engineer session. Creating one would require either a direct
DB insert of a privileged `User` row (forbidden: "no role granted through direct
database tampering outside an existing supported test workflow") or extending
the seed/bootstrap (forbidden: "Do not create a new production bootstrap
system"). Per §10, "safe real sessions cannot be created ... account roles
cannot be established safely" ⇒ **BLOCKED**.

---

## 3. GENUINELY EXECUTED — anonymous route matrix (§4/§6)

Real HTTP against the dev server, no mocks. All 14 representative routes × 3
locales. Engineer-allowed and Engineer-denied routes alike are protected against
**anonymous** access and redirect to the **same-locale** login carrying `from`.

| Route (per locale) | Anonymous result | Locale-preserving redirect |
|---|---|---|
| `/{loc}/dashboard` | 307 | `/{loc}/auth/login?from=…` ✅ |
| `/{loc}/dashboard/copilot` | 307 | ✅ |
| `/{loc}/dashboard/predictive` | 307 | ✅ |
| `/{loc}/assets` | 307 | ✅ |
| `/{loc}/cmms` | 307 | ✅ |
| `/{loc}/automation` | 307 | ✅ |
| `/{loc}/documents` | 307 | ✅ |
| `/{loc}/crm` | 307 | ✅ |
| `/{loc}/erp` | 307 | ✅ |
| `/{loc}/dashboard/billing` | 307 | ✅ |
| `/{loc}/dashboard/organization` | 307 | ✅ |
| `/{loc}/dashboard/api` | 307 | ✅ |
| `/{loc}/admin` | 307 | ✅ |
| `/{loc}/industrial-brain` | **200** | Intentional PUBLIC overview page (not in `PROTECTED_PATHS`; public marketing title + PublicHeader + request-demo CTA). The sensitive Brain compute is API-gated (`/api/brain` → `requireAuthoring`). Not a leak. |

Verified for `fa`, `en`, `de` (42 route×locale checks). ✅

## 4. GENUINELY EXECUTED — `from` bypass resistance (§6)

| Check | Result |
|---|---|
| `GET /de/auth/login?from=%2Fde%2Fdashboard%2Fbilling` | 200 — renders login only, grants nothing ✅ |
| `GET /de/dashboard/billing` (after) | still 307 ✅ |
| `GET /de/dashboard/billing?from=http%3A%2F%2Fevil.com` | still 307 — crafted external `from` grants nothing ✅ |

## 5. GENUINELY EXECUTED — anonymous platform API dimension (§5)

Real HTTP, no session. Every platform API rejects the anonymous caller with
**401 before any data**:

| Endpoint | Anonymous |
|---|---|
| `GET /api/platform/usage` | 401 ✅ |
| `GET /api/platform/rate-limits` | 401 ✅ |
| `GET /api/platform/keys` | 401 ✅ |
| `POST /api/platform/keys` | 401 ✅ |
| `DELETE /api/platform/keys/{id}` | 401 ✅ |

## 6. GENUINELY EXECUTED — Enamad validation (§8)

**Source / DOM** (all three locales, live browser DOM on `/en`, source on `/fa` `/en` `/de`):

| Attribute | Result |
|---|---|
| Metadata `<meta name="enamad" content="43315120">` | exactly 1 per locale ✅ |
| Footer trust seal | exactly 1 per locale, inside `<footer>` ✅ |
| Verification href | `https://trustseal.enamad.ir/?id=760552&Code=fFXWnHMAtT4PoKJXaqMZlLz7hmrvLP2t` ✅ |
| Image src | `https://trustseal.enamad.ir/logo.aspx?id=760552&Code=fFXWnHMAtT4PoKJXaqMZlLz7hmrvLP2t` ✅ |
| `target="_blank"` | ✅ |
| `rel="noopener external"` | ✅ (no `noreferrer`) ✅ |
| `referrerPolicy="origin"` (anchor + image) | ✅ both |
| Accessible name | `eNAMAD Electronic Trust Seal — Hermes Novin` ✅ |
| CSP `img-src` | `'self' data: https://trustseal.enamad.ir` — exact host, no wildcard ✅ |

**Actual browser image-load result:** ❌ **NOT CONFIRMED in this environment.**
`img.complete=false, naturalWidth=0`; the browser recorded no successful request.
Cause is environmental, **not a code defect**: this environment has no outbound
internet (the `example.com` control also returns HTTP 000, and
`trustseal.enamad.ir` times out at 12s). The 88×88 box is reserved regardless,
so there is no layout shift. **Production image-load must be validated on a
networked host** — recorded here separately per §8, and it remains an open
manual step.

## 7. GENUINELY EXECUTED — responsive (§7, public / denial-landing dimension)

German login (the localized denial landing) and public homepage:

| Width | Overflow | Notes |
|---|---|---|
| 320px | none ✅ | German H1 "Bei Hermes OS anmelden", submit visible |
| 375px | none ✅ | (covered by 320/768 bracket) |
| 768px | none ✅ | |
| desktop (1280) | none ✅ | |

Direction: `/fa` `dir=rtl` ✅, `/de` `dir=ltr` ✅, `/en` `dir=ltr` ✅.
Console errors: **0**. Hydration errors: **0**.

---

## 8. NOT EXECUTED — authenticated route matrix (§4)

Every cell below requires a genuine session for the named role. **No such
session could be created** (see §2). None of these were run; none may be marked
passed.

| Role | Dashboard | Brain | Copilot | Predictive | Assets | CMMS | Automation | Documents | CRM | ERP | Billing | Org | API Platform | Admin |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Engineer** (fa/en/de) | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED |
| **Admin** (fa/en/de) | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED |
| **Superadmin** (fa/en/de) | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED |

## 9. NOT EXECUTED — authenticated API permission matrix (§5)

| Role | API usage | Rate limits | Key inventory | Key create | Key rotate | Key revoke |
|---|---|---|---|---|---|---|
| **Engineer** | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED |
| **Admin** | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED |
| **Superadmin** | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED | NOT EXECUTED |

> The **automated** equivalents of §8/§9 are green and mutation-tested
> (`api-platform-permissions.test.ts`, `platform-actor-fail-closed.test.ts`,
> `admin-api-authorization.test.ts`, `admin-surface-access.test.ts`). They
> invoke the real handlers with mocked auth seams and are strong evidence of the
> authorization *contract* — but they are **not** a substitute for a genuine
> browser session, which the brief requires. They do not turn a NOT EXECUTED
> row into a passed row.

---

## 10. Unblock path (what a human must provide)

To turn §8/§9 from NOT EXECUTED into a real pass, provide, in a disposable
local/CI environment only, one of:

1. A **dev-only user seed** (guarded to refuse to run when `NODE_ENV=production`)
   creating three users — `role: "engineer"`, `"admin"`, `"superadmin"` — with
   passwords supplied via env vars and never committed; **or**
2. An approved test-account bootstrap / fixture that the repository blesses as a
   supported test workflow.

Then log in as each role in a real browser and walk §8/§9 across `fa`/`en`/`de`,
recording actual status, final URL, nav visibility, console/hydration errors,
unauthorized API responses and overflow. Revoke any API key created during
validation before finishing; never store secrets, cookies or tokens here.

## 11. Sign-off

- Anonymous / public / Enamad-source / responsive dimensions: **EXECUTED, PASS.**
- Enamad browser image-load: **NOT CONFIRMED** (no outbound network here) — production check outstanding.
- Authenticated Engineer / Admin / Superadmin matrix: **NOT EXECUTED** — no supported session mechanism.
- Overall: **BLOCKED** until the account mechanism above is provided and the authenticated rows are genuinely run.
