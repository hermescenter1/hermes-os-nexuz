/**
 * PHASE 99 — where the dependency review is written and read.
 *
 * `docs/security/phase99-dependency-review.json` is a COMMITTED, historical
 * Phase 99 record: the P99-DEP-* findings cite it, and the sha-pinned retest
 * `scripts/__tests__/phase99-dependency-remediation.test.ts` asserts against it.
 * A live regeneration (scripts/ci/phase99-dependency-review.mjs) must therefore
 * never overwrite it in CI. The Phase 99 workflow names a separate output path in
 * PHASE99_DEPENDENCY_REVIEW_PATH; the generator writes there and the readiness
 * evaluator reads exactly that file.
 *
 *   unset                -> the committed record (behaviour of every other caller
 *                           — Phase 100 closure, Phase 102, local runs — unchanged)
 *   set to a valid path  -> exactly that repository-relative path
 *   set to anything else -> refused. There is no silent fallback: an invalid or
 *                           empty value is a configuration error, and reading the
 *                           committed record instead would evaluate stale data
 *                           while appearing to evaluate the live audit.
 *
 * Pure: no filesystem access, so the rules are unit-testable.
 */

export const COMMITTED_DEPENDENCY_REVIEW = "docs/security/phase99-dependency-review.json";
export const DEPENDENCY_REVIEW_PATH_ENV = "PHASE99_DEPENDENCY_REVIEW_PATH";

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ ok: true, path: string, live: boolean } | { ok: false, error: string }}
 */
export function resolveDependencyReviewPath(env = process.env) {
  const raw = env[DEPENDENCY_REVIEW_PATH_ENV];
  if (raw === undefined) return { ok: true, path: COMMITTED_DEPENDENCY_REVIEW, live: false };

  const refuse = (why) => ({ ok: false, error: `${DEPENDENCY_REVIEW_PATH_ENV} ${why}` });
  if (typeof raw !== "string" || raw === "") return refuse("is set but empty");
  if (raw.trim() !== raw) return refuse("has surrounding whitespace");
  // One spelling only: forward slashes, relative to the repository root.
  if (raw.includes("\\")) return refuse("must use forward slashes");
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) return refuse("must be relative to the repository root");
  if (raw.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) {
    return refuse("must not contain empty, '.' or '..' segments");
  }
  if (!raw.endsWith(".json")) return refuse("must name a .json file");
  // Case-insensitive so a different spelling cannot reach the record on Windows.
  if (raw.toLowerCase() === COMMITTED_DEPENDENCY_REVIEW.toLowerCase()) {
    return refuse("must not name the committed historical record");
  }
  return { ok: true, path: raw, live: true };
}
