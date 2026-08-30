/**
 * A closed set of outcomes for a dashboard read, so a failed request can never
 * be rendered as data.
 *
 * WHY THIS EXISTS
 * ---------------
 * Five dashboard routes collapsed into the global error boundary because they
 * all did the same thing:
 *
 *     fetch(url)
 *       .then(r => { if (r.status === 404) return null; return r.json() as Promise<T>; })
 *       .then(d => setData(d))
 *       .catch(() => setError(...))
 *
 * A `401 {"error":"Authentication required"}` is valid JSON, so `r.json()`
 * resolved and `.catch()` never fired. The error envelope was stored AS the
 * payload, and the first render that read a nested field off it — `data.patterns
 * .length`, `data?.sites.filter(...)` — threw. Note the `?.` in that last one: it
 * guarded `data` but not `sites`, which is why the optional chaining that was
 * already there did not help.
 *
 * `/dashboard/multi-site` had already been fixed for exactly this defect, and its
 * approach is the one generalised here: classify every outcome the network and
 * the API can produce BEFORE anything is rendered, and let only a body that
 * passes a shape guard reach the success branch.
 *
 * Optional chaining is deliberately NOT the remedy. Silencing a broken contract
 * one property at a time renders a dashboard of blanks for what is actually an
 * auth failure, which is worse than an honest message: it looks like real data
 * that happens to be empty.
 */

/** Every state a dashboard read can be in. */
export type LoadState<T> =
  | { kind: "loading" }
  | { kind: "success"; data: T }
  | { kind: "empty" }
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "notFound" }
  | { kind: "requestError" }
  | { kind: "invalidResponse" };

/** Distinguishes "the body was not JSON" from "the body was JSON but wrong". */
const PARSE_FAILED = Symbol("parse-failed");

/**
 * True only for a same-origin absolute path.
 *
 * A leading `//` (or `/`, which browsers normalise to `//`) is NOT relative:
 * it is protocol-relative and resolves to a DIFFERENT host. Rejecting it here
 * means the destination of the fetch below is fixed by this module, not by the
 * caller, so no argument can steer the request off-origin.
 */
function isSameOriginPath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\");
}
/**
 * Perform one read and classify its outcome. Never throws except for
 * `AbortError`, which signals that a newer attempt — or unmount — owns the state.
 *
 * @param url      endpoint to read
 * @param isValid  shape guard; a 200 is not a promise about shape
 * @param signal   abort signal from the caller's effect
 */
export async function loadJson<T>(
  url: string,
  isValid: (value: unknown) => value is T,
  signal?: AbortSignal,
): Promise<LoadState<T>> {
  // Enforced, not merely reviewed: the caller supplies a path, never a host.
  if (!isSameOriginPath(url)) return { kind: "requestError" };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      // Authentication rides on the session cookie. Stated explicitly so a future
      // change to the fetch default cannot silently make this anonymous.
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      // Keeps a back/forward navigation from re-showing data the caller may no
      // longer be authorized to see.
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { kind: "requestError" };
  }

  // Status is inspected BEFORE the body is given any meaning. This is the line
  // whose absence caused the original defect.
  if (!response.ok) {
    if (response.status === 401) return { kind: "unauthorized" };
    if (response.status === 403) return { kind: "forbidden" };
    if (response.status === 404) return { kind: "notFound" };
    return { kind: "requestError" };
  }

  const body: unknown = await response.json().catch(() => PARSE_FAILED);
  if (body === PARSE_FAILED) return { kind: "invalidResponse" };

  // An error page from a proxy, a truncated body, or a future API change all
  // land here rather than in render.
  if (!isValid(body)) return { kind: "invalidResponse" };

  return { kind: "success", data: body };
}

/**
 * The message key for a non-success state, within a namespace that already
 * carries this vocabulary. Returning a KEY rather than a string keeps the copy
 * in the catalogue, where it is translated, instead of in the component.
 */
export function stateMessageKey(kind: Exclude<LoadState<unknown>["kind"], "success" | "loading">): string {
  switch (kind) {
    case "empty": return "stateEmpty";
    case "unauthorized": return "stateUnauthorized";
    case "forbidden": return "stateForbidden";
    case "notFound": return "stateNotFound";
    case "invalidResponse": return "stateInvalidResponse";
    case "requestError":
    default: return "stateRequestError";
  }
}
