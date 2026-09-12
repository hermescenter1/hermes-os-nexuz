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
 *   - It sends no site, user or role, and reads no storage.
 *
 * PHASE 110-A1.0b R3 (R3-2) — one thing it now DOES send: the organization the
 * page was RENDERED for, as a precondition header. That amends the bullet above,
 * which used to say "no organization" too, and the amendment is deliberate.
 * Without it a second tab still displaying organization A submits a mutation
 * the server performs in B — the selection cookie is shared by every tab and
 * nothing in the request said which tenant the reader meant. The value grants
 * nothing; see `tenantPrecondition` below.
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
import {
  TENANT_PRECONDITION_HEADER,
  TENANT_RENDERED_ORGANIZATION_ATTRIBUTE,
} from "@/lib/tenant-selection/contract";

export type ResourceFailureCode =
  | "UNAUTHENTICATED"
  // PHASE 107 STAGE 6-A — the reader IS signed in; what is missing is a
  // selection. Kept apart from UNAUTHENTICATED because offering them a sign-in
  // link sends them in a circle.
  | "ORGANIZATION_CONTEXT_REQUIRED"
  // PHASE 110-A1.0b — signed in, a member of SEVERAL organizations, none
  // chosen. Separate from the line above because the remedy is a choice the
  // reader can make right now, not a request to an administrator.
  | "ORGANIZATION_SELECTION_REQUIRED"
  // PHASE 110-A1.0b R3 (R3-2) — this page asked for an organization that is no
  // longer the one in effect, because another tab switched. Its own code
  // because its remedy is unique: reload and look again. It is NOT retryable —
  // repeating the identical request would send the identical stale
  // precondition and reach the identical conflict.
  | "ORGANIZATION_CONTEXT_CONFLICT"
  /*
   * PHASE 110-A1.0b R6.1 — 428. This request stated NO organization at all, and
   * since R6 a write that states none is refused before any side effect.
   *
   * It had no code here, so it fell through `classifyFailure` to `FAILED` — a
   * generic failure, which `isRetryable` says to RETRY. The retry sends the
   * identical request with the identical missing header and reaches the
   * identical 428. It is kept apart from the CONFLICT above for the same reason
   * the server keeps 428 apart from 409: one page showed a stale organization,
   * the other showed none at all, and only the first is a stale-tab story.
   */
  | "ORGANIZATION_PRECONDITION_REQUIRED"
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
    /*
     * PHASE 110-A1.0b — a DIFFERENT state, deliberately not folded into the
     * line above. Both are 409 and both mean "no organization is in effect",
     * but the reader's next move is opposite: one asks an administrator for
     * access, the other picks from a list they already have. Rendering the
     * second as the first shows a multi-organization owner a message telling
     * them to request membership they already hold.
     */
    case "ORGANIZATION_SELECTION_REQUIRED":
      return "ORGANIZATION_SELECTION_REQUIRED";
    /*
     * PHASE 110-A1.0b R3 (R3-2) — a stale tenant precondition. Also 409, and
     * deliberately not folded into either line above: nothing is missing, and
     * the reader is authorized. What changed is which organization is in
     * effect, and only a reload can reconcile the page with it.
     */
    case "ORGANIZATION_CONTEXT_CONFLICT":
      return "ORGANIZATION_CONTEXT_CONFLICT";
    /*
     * PHASE 110-A1.0b R6.1 — the write asserted nothing. Its own code, and NOT
     * retryable: the same request would carry the same absent header.
     */
    case "ORGANIZATION_PRECONDITION_REQUIRED":
      return "ORGANIZATION_PRECONDITION_REQUIRED";
    /*
     * The membership store could not answer. This is the transient class, so it
     * reaches the retry-capable UNAVAILABLE rather than the account-shaped
     * organization refusals — a reader must not be told they have no
     * organization because a database was briefly unreachable.
     */
    case "ORGANIZATION_CONTEXT_UNAVAILABLE":
      return "UNAVAILABLE";
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
  /*
   * PHASE 110-A1.0b R6.1 — 428 has exactly one meaning in this application, and
   * unlike a bare 409 it is not shared with any domain conflict: RFC 6585
   * defines it for an origin server requiring the request to be conditional,
   * and the tenant precondition is the only condition this application
   * requires. Safe to classify from the status alone.
   */
  if (status === 428) return "ORGANIZATION_PRECONDITION_REQUIRED";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "UNAVAILABLE";
  return "FAILED";
}

/**
 * PHASE 110-A1.0b R3 (R3-2) — the organization this PAGE is showing.
 *
 * Read from the markup the server rendered, not from client state. The question
 * is "which tenant is the reader looking at?", and only the render can answer
 * it; a value kept in a store could be refreshed while the visible page still
 * shows the previous organization, which is the failure this closes rather than
 * one to reproduce.
 *
 * `null` when the page has no shell, when the reader has no resolved
 * organization, or outside a browser.
 *
 * PHASE 110-A1.0b R6.1 — WHAT `null` COSTS NOW. This paragraph used to end "and
 * behaves exactly as it did before", which was true in R3 and stopped being
 * true in R6: a WRITE that asserts nothing is refused with 428. So a mutation
 * on a page that renders no stamp is not an unprotected request — it is a
 * BROKEN one, and `MUTATION-CHAINS.txt` in the R6.1 pack traces every mutating
 * call site to the layout that stamps its page rather than assuming one does.
 * Reads are unaffected and still assert nothing.
 *
 * Exported for one reason, stated so it is not mistaken for future-proofing:
 * the browser-half test asserts the DOM read on its own, separately from the
 * header it produces. Folding the two together would leave "an empty stamp
 * asserts nothing" provable only through a fetch.
 */
export function tenantPrecondition(): string | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(`[${TENANT_RENDERED_ORGANIZATION_ATTRIBUTE}]`);
  const value = el?.getAttribute(TENANT_RENDERED_ORGANIZATION_ATTRIBUTE);
  return value && value.length > 0 ? value : null;
}

/**
 * Attach the precondition to a request, if this page has one to assert.
 *
 * Exported because not every call goes through `requestJson`: a mutation that
 * needs the raw `Response` — to read a refusal code the UI branches on — still
 * has to carry the same header, and re-deriving it at each call site is how the
 * two would drift.
 *
 * A caller's own explicit header WINS. Nothing here overwrites an intent the
 * caller stated deliberately.
 */
export function withTenantPrecondition(init?: RequestInit): RequestInit {
  const organizationId = tenantPrecondition();
  if (!organizationId) return init ?? {};

  const headers = new Headers(init?.headers);
  if (!headers.has(TENANT_PRECONDITION_HEADER)) {
    headers.set(TENANT_PRECONDITION_HEADER, organizationId);
  }
  return { credentials: "same-origin", ...init, headers };
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
    response = await fetch(url, withTenantPrecondition({ credentials: "same-origin", ...init }));
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
