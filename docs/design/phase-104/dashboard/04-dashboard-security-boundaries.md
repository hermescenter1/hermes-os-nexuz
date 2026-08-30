# Phase 104-I.D0 — Security boundaries

**Nothing in this phase changes an authentication, authorization, tenancy or
audit behaviour.** This document records the boundaries as they exist, and the
evidence that Gate A preserved them.

## Where protection is decided

`src/middleware.ts` → `isProtectedPath()` → `isAuthorizedForPath()`, both in
`src/lib/auth/rbac.ts`. Patterns are built by `localePathPattern()`, which
matches complete path segments under a two-letter locale prefix.

The audit does **not** re-implement these regexes. It compiles the shipped
module and executes it, so the inventory cannot disagree with what middleware
enforces.

## Derived protection surface

| Measure | Value |
| --- | --- |
| Routes discovered | 279 |
| Internal (protected) | 208 |
| Public | 71 |
| Locale parity breaks (`/en` vs `/fa`) | **0** |

Locale parity of 0 means no route is protected in one locale and open in
another.

## Capability model (unchanged)

`/dashboard` is gated by the `dashboard` capability in `ROLE_CAPS`:
superadmin, admin, engineer, customer, vendor hold it; viewer and candidate do
not. The three administration subtrees (`/dashboard/billing`,
`/dashboard/organization`, `/dashboard/api`) are tested **before** the broad
`DASHBOARD` branch, so the narrower rule wins and engineer does not inherit
administration access.

Both Gate A routes resolve to the same allowed set:
`superadmin, admin, engineer, customer, vendor`.

## An asymmetry worth recording

The Alarm Center **page** is protected by middleware. The endpoint it reads,
`GET /api/operations/alerts`, is **anonymous** — `guardDerivedGraphRequest`
applies a rate limit but no authentication.

This is a pre-existing, deliberate architecture: the derived-graph endpoints
serve published records only, and Phase 99 pushed that predicate into the query
so drafts never leave the database. **It is recorded here, not changed** — the
brief forbids altering API contracts, and the surface displays nothing the
endpoint would not already serve anonymously.

## How Gate A preserved the boundary

Verified against a live local server, through the real login flow:

| Check | Result |
| --- | --- |
| Anonymous `GET /en/dashboard` | **307** → `/en/auth/login?from=%2Fen%2Fdashboard` |
| Real login `POST /api/auth` | 200, role `admin`, genuine `hermes_at` / `hermes_rt` / `hermes_session` cookies |
| Authenticated `GET /en/dashboard` | 200, 468,954 bytes, **zero password fields**, `<h1>Factory Dashboard` |

No cookie was forged, no guard disabled, no middleware bypassed. Capture used
the repository's own **session-mode** auth path: `isAuthConfigured()` seeds an
in-process admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
(`src/lib/auth/service.ts`), which needs no database. The credentials are
throwaway values generated for a loopback dev server and are recorded in the
evidence package; **no `.env` file was read at any point.**

### Negative control

`NC-05` deletes `DASHBOARD` from `PROTECTED_PATHS`, recompiles the guard the
audit executes, and requires the internal-route count to fall below its
baseline of 208. A weakened guard is therefore provably detected, not assumed
to be detectable.

## Tenancy

Neither Gate A surface introduces a tenant or site selector, and neither infers
a site from the first available record. The Alarm Center consumes a
tenant-independent derived graph; the Workspace Home consumes a simulated
snapshot. No new cache key, client-side store or navigation state carrying
tenant identity was added.

## Information disclosure

The Alarm Center's failure state prints the request line and HTTP status
(`GET /api/operations/alerts - HTTP 500`). This is deliberate and safe: it is
the *caller's own* request, and it carries no record identity, count, or server
detail. Server error text is never surfaced — the route already collapses its
catch block to a fixed `alerts_unavailable` token, and the client never renders
a server-supplied message.
