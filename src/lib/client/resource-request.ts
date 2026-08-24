"use client";

/**
 * PHASE 107 STAGE 6-A — the browser's shared door to a JSON API.
 *
 * The directive above is load-bearing, not decoration. This module runs only in
 * the browser and fetches only same-origin relative paths; declaring that keeps
 * a server component from importing it, and lets the Phase 99 SSRF inventory
 * classify it correctly instead of treating a browser call as an unreviewed
 * server-side outbound sink.
 *
 * WHY THIS EXISTS
 * Ten client components across CRM and the customer portal had copied the same
 * four lines:
 *
 *     fetch(url)
 *       .then(r => r.json())
 *       .then(d => setRows(d.rows ?? []))
 *       .catch(() => {})
 *       .finally(() => setLoading(false));
 *
 * Every part of that is wrong in a way the user sees:
 *
 *   - `r.json()` without checking `r.ok` parses an ERROR body as if it were
 *     data, and `d.rows ?? []` then renders the failure as an empty list. A
 *     signed-out user was told they had no accounts.
 *   - `r.json()` also THROWS on an empty or non-JSON body (a 502 HTML page, a
 *     204), and the empty `.catch` discards that rejection, so the same screen
 *     appears for "nothing to show" and "the request failed".
 *   - No component could ever render an error, because none had an error state
 *     to set.
 *
 * This module makes the failure a STABLE CODE the UI branches on, exactly as
 * `src/lib/ot-operations/api.ts` already does for the OT estate — that module is
 * the proven pattern here and its behaviour is deliberately mirrored rather
 * than reinvented.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *   - No authorization. Every gate lives on the server; this only reports what
 *     the server decided.
 *   - It never surfaces a server-provided message to the user. Those strings are
 *     fixed English; the UI maps `code` to its own localized wording.
 *   - It sends no organization, site, user or role, and reads no storage.
 */

/**
 * The failure vocabulary the UI branches on.
 *
 * `UNAUTHENTICATED` and `FORBIDDEN` stay separate because they need different
 * words and different remedies — "sign in again" versus "ask for access" — and
 * both stay separate from `NOT_FOUND`, which must never be rendered as an empty
 * collection. `OFFLINE` is distinguished from `FAILED` because only one is worth
 * a retry button, and `UNAVAILABLE` (503) from both because it is transient.
 */
import { MACHINE_REFUSAL_CODE_SET } from "@/lib/auth/refusal-vocabulary";

export type ResourceFailureCode =
  | "UNAUTHENTICATED"
  // PHASE 107 STAGE 6-A — the reader IS signed in; what is missing is a
  // selection. Kept apart from UNAUTHENTICATED because offering them a sign-in
  // link sends them in a circle.
  | "ORGANIZATION_CONTEXT_REQUIRED"
  | "SITE_CONTEXT_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "OFFLINE"
  | "FAILED";

export class ResourceRequestError extends Error {
  readonly code: ResourceFailureCode;
  readonly status: number;

  constructor(code: ResourceFailureCode, status: number) {
    // For a developer reading a stack trace, never for a user.
    super(`resource request failed (${code}${status ? `, HTTP ${status}` : ""})`);
    this.name = "ResourceRequestError";
    this.code = code;
    this.status = status;
  }
}

/** True when a failure is plausibly transient, so the UI may offer a retry. */
export function isRetryable(code: ResourceFailureCode): boolean {
  return code === "OFFLINE" || code === "UNAVAILABLE" || code === "RATE_LIMITED" || code === "FAILED";
}

/*
 * PHASE 107 FINAL — the machine vocabulary, imported rather than re-listed.
 *
 * This file kept its own copy of the vocabulary and it had already drifted:
 * `INTERNAL_FAILURE`, which the OT route-kit genuinely emits, was missing, so
 * that refusal could not be decoded from the `error` field and reached the
 * reader as a generic failure. One list, imported everywhere.
 */
const MACHINE_CODES = MACHINE_REFUSAL_CODE_SET;

/**
 * PHASE 107 STAGE 6-A.2 — TWO refusal body shapes exist, and both are legitimate.
 *
 *     { error: "Organization context required", code: "ORGANIZATION_CONTEXT_REQUIRED" }
 *     { ok: false, error: "ORGANIZATION_CONTEXT_REQUIRED" }
 *
 * The second is `deny(status, code)` in the Media upload routes, which has
 * always put the machine-readable code in `error`. Reading only `code` meant a
 * 409 from those routes carried no recognised code at all, fell past every case
 * below, and — because a bare 409 is deliberately NOT assumed to be a context
 * refusal — surfaced as a generic FAILED. The reader was told "something went
 * wrong" instead of "you have no organization selected".
 *
 * `error` is consulted ONLY as a fallback and ONLY when its value is an exact
 * member of the known vocabulary. A human-readable message is never promoted to
 * a machine code, so a route that starts returning prose degrades to the
 * generic failure rather than being mis-classified into a specific one.
 */
function refusalCodeOf(body: unknown): unknown {
  if (!body || typeof body !== "object") return undefined;
  const { code, error } = body as { code?: unknown; error?: unknown };
  if (typeof code === "string" && code) return code;
  if (typeof error !== "string") return undefined;
  const upper = error.toUpperCase();
  return MACHINE_CODES.has(upper) ? upper : undefined;
}

/**
 * Map a response to the failure vocabulary.
 *
 * The server's own `code` wins when it supplies one: a route may answer 401
 * carrying `FORBIDDEN`, and branching on the status alone would tell an
 * authorised user their session had expired.
 */
export function classifyFailure(status: number, code?: unknown): ResourceFailureCode {
  switch (code) {
    case "UNAUTHENTICATED":
    case "UNAUTHORIZED":
    // The Media and voice surfaces spell the same pre-authentication refusal
    // these two ways; all three mean "no usable session".
    case "AUTHENTICATION_REQUIRED":
    case "SESSION_AUTH_REQUIRED":
      return "UNAUTHENTICATED";
    case "FORBIDDEN":
    case "CAPABILITY_NOT_ALLOWED":
    case "INSUFFICIENT_PERMISSION":
      return "FORBIDDEN";
    case "ORGANIZATION_CONTEXT_REQUIRED":
    // The voice surface's name for the same state, from its own closed union.
    case "ORGANIZATION_SCOPE_REQUIRED":
      return "ORGANIZATION_CONTEXT_REQUIRED";
    case "SITE_CONTEXT_REQUIRED":
      return "SITE_CONTEXT_REQUIRED";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "INVALID_QUERY_PARAMETER":
    case "VALIDATION_FAILED":
      return "INVALID";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "TRANSIENT_FAILURE":
      return "UNAVAILABLE";
    default:
      break;
  }
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 400 || status === 422) return "INVALID";
  // A bare 409 is NOT assumed to be a context refusal: /api/billing/subscription
  // answers 409 for a genuine edit conflict. Only an explicit code above means
  // "select an organization"; without one this stays a generic failure.
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "UNAVAILABLE";
  return "FAILED";
}

/**
 * Read a JSON body without letting a malformed one masquerade as anything else.
 *
 * `response.json()` throws on an empty body and on HTML, and both are ordinary
 * in production: a 204, or a proxy returning an error page. Returning
 * `undefined` here lets the caller decide, instead of the rejection escaping
 * into a `.catch` that discards it.
 */
async function readJson(response: Response): Promise<unknown | undefined> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Fetch JSON, or throw a `ResourceRequestError` carrying a stable code.
 *
 * The status is checked BEFORE the body is treated as data — the single
 * omission that turned every error on these screens into an empty list.
 *
 * @param select pulls the payload out of the response envelope. Returning
 *               `undefined` from it means "the server answered, but without the
 *               field this screen needs", which is a FAILED contract rather than
 *               an empty success.
 */
export async function requestJson<T>(
  url: string,
  select: (body: unknown) => T | undefined,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", ...init });
  } catch (error) {
    // An aborted request is the caller's own doing; let it propagate so the
    // hook can ignore it rather than paint an error over a screen the user has
    // already navigated away from.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ResourceRequestError("OFFLINE", 0);
  }

  if (!response.ok) {
    const body = await readJson(response);
    throw new ResourceRequestError(classifyFailure(response.status, refusalCodeOf(body)), response.status);
  }

  const body = await readJson(response);
  if (body === undefined) throw new ResourceRequestError("FAILED", response.status);

  const value = select(body);
  if (value === undefined) throw new ResourceRequestError("FAILED", response.status);
  return value;
}
