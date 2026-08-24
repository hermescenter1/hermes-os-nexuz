/**
 * PHASE 107 STAGE 6-A — what an async surface says about itself, in one word.
 *
 * WHY THIS EXISTS
 * An auditor looking at a rendered page could previously only infer its state
 * from the words on it, which means inferring it in three languages. The Stage 5
 * detector did exactly that — it looked for `/error|failed|خطا|fehler/` — and so
 * read the OT module's perfectly correct "Sign-in required" as an unhandled
 * failure, and reported 27 healthy cells as defects.
 *
 * `data-async-state` replaces that guess with a statement. It is part of the
 * product, not a test hook: the same attribute is there in production, it is
 * what makes a page self-describing to any tool, and it is the only thing an
 * audit needs in order to stop reading tea leaves.
 *
 * WHAT IT MUST NEVER CARRY
 * No locale, no route, no tenant, no organization, no user, no identifier, no
 * message. Only which of a closed set of states the surface is in. It also has
 * no visual effect: every consumer applies it to a wrapper with
 * `display: contents`, or to an element it already renders.
 */

/**
 * The closed set. Each value answers a different question for the reader, which
 * is the whole reason they are not allowed to collapse into one another:
 *
 *   loading         a request is in flight
 *   ready           data arrived and there is something to show
 *   empty           data arrived and there is genuinely nothing — a fact, not a failure
 *   auth-required   the session is gone; signing in again fixes it
 *   forbidden       the session is fine and the answer is still no; an administrator fixes it
 *   not-found       the thing asked for does not exist
 *   server-error    the server failed to answer properly; retrying may help
 *   network-error   the request never reached the server at all
 */
export type AsyncState =
  | "loading"
  | "ready"
  | "empty"
  | "auth-required"
  // PHASE 107 STAGE 6-A — distinct from `auth-required` on purpose. The reader
  // IS signed in; what is missing is a selection only they can make. Offering
  // them a sign-in link sends them in a circle.
  | "org-context-required"
  | "site-context-required"
  | "forbidden"
  | "not-found"
  | "server-error"
  | "network-error";

/**
 * Failure codes across the product, mapped to the shared vocabulary.
 *
 * Two modules independently arrived at almost the same failure codes —
 * `ResourceFailureCode` for CRM, billing, the portal and the organization
 * surfaces, and `OtFailureCode` for the OT estate. Both map here so a single
 * detector reads both, and so the mapping cannot drift into two versions.
 */
const BY_CODE: Record<string, AsyncState> = {
  UNAUTHENTICATED: "auth-required",
  ORGANIZATION_CONTEXT_REQUIRED: "org-context-required",
  SITE_CONTEXT_REQUIRED: "site-context-required",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not-found",
  OFFLINE: "network-error",
  // The OT client calls the same thing CONNECTION_FAILED: in an industrial
  // console "offline" is a claim about equipment, not about a fetch.
  CONNECTION_FAILED: "network-error",
  // A rejected query, an exhausted rate limit and an unavailable service are all
  // "the server did not give us the data"; they differ in wording and in whether
  // a retry is offered, not in what kind of state the surface is in.
  INVALID: "server-error",
  INVALID_QUERY: "server-error",
  RATE_LIMITED: "server-error",
  UNAVAILABLE: "server-error",
  FAILED: "server-error",
};

/**
 * Map a failure code to its state.
 *
 * Deliberately total: an unrecognised code becomes `server-error` rather than
 * disappearing, because a surface with no state at all is precisely the defect
 * this whole stage exists to close.
 */
export function asyncStateForFailure(code: string): AsyncState {
  return BY_CODE[code] ?? "server-error";
}
