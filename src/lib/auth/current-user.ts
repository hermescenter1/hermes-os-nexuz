/**
 * AUTH-U1 — the canonical server-side identity reader for Hermes OS.
 *
 * ONE import path for "who is making this request", so callers no longer have
 * to know whether an identity arrived on the Phase-91 JWT access token or on
 * the legacy HMAC compatibility cookie.
 *
 * ── Authority order (unchanged from the existing implementation) ─────────────
 *
 *   1. hermes_at (JWT access token)
 *        → verifyAccessToken() — signature + expiry
 *        → isPayloadSessionActive(payload) — sid-bound server-side session state
 *        → TokenUser
 *
 *   2. only when NO valid JWT identity exists:
 *      hermes_session (legacy HMAC cookie)
 *        → verifySession() — HMAC
 *        → isPayloadSessionActive(payload) — same revocation gate
 *        → CurrentUser
 *
 *   3. otherwise null.
 *
 * ── Why the fall-through is not a revocation bypass ─────────────────────────
 *
 * A JWT whose sid has been revoked yields `null` from step 1 and then FALLS
 * THROUGH to step 2. That is pre-existing behaviour, and it is safe for every
 * session the current login path issues, because those two credentials share
 * one sid: `app/api/auth/route.ts` signs the legacy cookie with
 * `sid: sid ?? undefined` taken from the SAME `issueTokens()` result that
 * produced the access token ("embedded in BOTH the access token and the legacy
 * session cookie"). session.ts then applies `isPayloadSessionActive` to that
 * cookie too, so revoking the session fails BOTH readers and the facade
 * returns null. CASE 2 pins exactly this.
 *
 * The one residual case is a legacy cookie carrying NO sid (issued before
 * Phase 91). Such a cookie is honoured by design — `isPayloadSessionActive`
 * returns true when `sid` is absent — so it is not individually revocable and
 * can outlive a revoked JWT until its own 30-day ceiling. That is the
 * documented sid-less compatibility window, NOT something AUTH-U1 introduces
 * or may alter; retiring it is a later phase. CASE 5 pins it so the behaviour
 * is visible and deliberate rather than incidental.
 *
 * ── Why this module exists rather than living in session.ts ──────────────────
 *
 * The dependency graph today is:
 *
 *     token-session.ts ──▶ session.ts ──▶ session-store.ts
 *
 * Putting a JWT-first reader inside session.ts would require session.ts to
 * import token-session.ts, closing that arrow into a cycle
 * (session → token-session → session). This module is a LEAF: it imports the
 * implementation and nothing in src/lib/auth imports it back, so the canonical
 * reader gets a stable public path without perturbing the graph.
 *
 * ── Scope of AUTH-U1 ─────────────────────────────────────────────────────────
 *
 * This phase adds NO authentication logic. It re-exports the existing, tested
 * `getCurrentUserUnified()` so there is exactly one implementation. Legacy auth
 * is deliberately NOT removed: `hermes_session` is still issued, still read,
 * and sid-less JWTs are still honoured. Retiring either belongs to a later
 * phase behind an explicit compatibility window.
 */

import { getCurrentUserUnified } from "./token-session";
import type { TokenUser } from "./token-session";

/**
 * The identity shape returned by the canonical reader.
 *
 * `TokenUser` and session.ts's `CurrentUser` are structurally identical
 * (`{ id, email, name, role }`), so both authority paths already satisfy this
 * contract and callers need no per-path narrowing.
 */
export type AuthIdentity = TokenUser;

/**
 * Resolve the current request's authenticated identity: JWT first, legacy HMAC
 * session second, `null` when neither yields a valid, non-revoked identity.
 *
 * Prefer this over importing `getCurrentUser` from `./session` directly — that
 * reader sees ONLY the legacy cookie and will miss a JWT-authenticated caller.
 */
export { getCurrentUserUnified };

/**
 * Explicit canonical alias. `getCurrentUserUnified` is kept as the primary
 * name (it is the established, already-tested export), and this alias reads
 * more naturally at call sites that simply want "the current user".
 */
export const getAuthenticatedUser = getCurrentUserUnified;
