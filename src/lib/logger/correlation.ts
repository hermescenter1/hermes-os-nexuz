/**
 * PHASE 90 — request correlation IDs.
 *
 * The structured logger has always accepted a `reqId`, but nothing produced
 * one, so the parameter was dead and no two log lines from the same request
 * could be tied together during an incident. This module is the missing piece:
 * a tiny, dependency-free resolver that prefers the caller's `X-Request-ID`
 * (so a correlation started at nginx or an upstream service is preserved) and
 * otherwise mints one.
 *
 * Deliberately NOT AsyncLocalStorage: the logger is imported by Edge-runtime
 * code paths too, and an explicit id threaded through the call is both
 * cheaper and easier to reason about than ambient context.
 */

import { randomUUID } from "node:crypto";

/** Header carrying a correlation id across service hops. */
export const REQUEST_ID_HEADER = "x-request-id";

/** Accept only a sane, log-safe id from an untrusted caller. */
const SAFE_ID = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * The correlation id for this request: the caller's `X-Request-ID` when it is
 * well-formed, otherwise a fresh one.
 *
 * A client-supplied value is echoed only after validation — an unbounded or
 * punctuated header would otherwise be injected verbatim into every log line
 * for that request (log forging / oversized entries).
 */
export function resolveRequestId(req: { headers: { get(name: string): string | null } }): string {
  const supplied = req.headers.get(REQUEST_ID_HEADER);
  if (supplied && SAFE_ID.test(supplied)) return supplied;
  return newRequestId();
}

/** A fresh correlation id. */
export function newRequestId(): string {
  try {
    return randomUUID();
  } catch {
    // Edge/exotic runtimes without node:crypto — still unique enough to
    // correlate lines within one request, which is all this is used for.
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
