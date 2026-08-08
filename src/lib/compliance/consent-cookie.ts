/**
 * PHASE 99.5 (forward-ported from Phase 99, P99-INT-001 / P99-INT-002) — the
 * cookie-consent subject identifier.
 *
 * WHY THIS MODULE EXISTS
 * The cookie-consent endpoint used to key consent rows on `hermes_session` —
 * which is not a consent identifier at all but `SESSION_COOKIE`, the signed
 * authentication session that `getCurrentUser()` treats as the sole auth gate on
 * most of the API. Two things followed from that conflation, and both were real:
 *
 *   1. The endpoint wrote `hermes_session` from a value supplied in the request
 *      body. An unauthenticated caller could therefore plant a session of their
 *      choosing in someone else's browser — classic session fixation.
 *   2. Consent rows stored a live session token in the database next to the
 *      user id and IP, and the anonymous fallback (`anon_<millis>`) was
 *      enumerable, so the read side leaked those tuples.
 *
 * Consent needs its OWN identifier: opaque, unguessable, carrying no authority,
 * and never accepted from the request body. That is all this module provides.
 *
 * The database column is still named `sessionId` (no migration): the change is
 * what goes IN it, not where it lives.
 */

import { randomUUID } from "node:crypto";

/** Dedicated consent cookie. Deliberately NOT the authentication cookie. */
export const CONSENT_ID_COOKIE = "hermes_consent_id";

/** One year, matching the consent record's own retention expectation. */
export const CONSENT_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const CONSENT_ID_PATTERN = /^c_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Mint a fresh, unguessable consent identifier. */
export function newConsentId(): string {
  return `c_${randomUUID()}`;
}

/**
 * Accept a consent identifier only if it has the exact shape this module mints.
 * Anything else — a session token, a timestamp, an attacker's string — is
 * rejected, so a stale or forged cookie can never select another subject's row.
 */
export function isConsentId(value: string | null | undefined): value is string {
  return typeof value === "string" && CONSENT_ID_PATTERN.test(value);
}

/** Cookie attributes for the consent identifier. */
export function consentCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: CONSENT_ID_MAX_AGE_SECONDS,
  };
}
