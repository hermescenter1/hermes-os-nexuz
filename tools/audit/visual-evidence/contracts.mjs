/**
 * Phase 107 visual-evidence harness — record and manifest contracts.
 *
 * A screenshot carries no HTTP status, no final URL and no DOM. On its own it
 * cannot answer "was this the right page, served successfully, to a signed-in
 * user?" — which is the only question an audit actually asks. So every image is
 * paired with a record written in the SAME page load, and this module defines
 * what that pairing must contain for the pair to count.
 *
 * The rules here are deliberately the single source of truth for both the sweep
 * (which decides what to re-capture on resume) and the verifier (which decides
 * what to accept). When those two disagreed, the result was 764 screenshots
 * backed by 146 measurements that still looked like a complete evidence pack.
 */

/** Exit codes the sweep uses, so a supervisor can tell failure modes apart. */
export const EXIT = {
  OK: 0,
  USAGE: 2,
  /** Another writer holds the lock. Fail closed — never proceed. */
  LOCKED: 3,
  /** Refused to write inside the source tree. */
  UNSAFE_OUTPUT: 4,
  /** Credentials absent from the environment. */
  NO_CREDENTIALS: 5,
  /** Login did not produce a session. */
  LOGIN_FAILED: 6,
  /**
   * At least one cell failed to capture. The run produced real output, so this
   * is not a hard error — but it is NOT success either, and a supervisor that
   * treats it as success will report a partial pack as complete.
   */
  CAPTURE_INCOMPLETE: 7,
};

/**
 * Did the browser end up on the page this cell is supposed to photograph?
 *
 * This is the single contract the sweep enforces before it photographs anything
 * and the verifier re-applies afterwards. It exists because the earlier check
 * only asked whether `location` was non-empty — so ANY wrong-but-non-empty
 * page satisfied it, which is precisely the failure that once produced four
 * screenshots of the wrong route.
 *
 * The comparison is exact by default. A redirect is legitimate ONLY when the
 * cell declares it: `allowedFinalUrls: ["/en/auth/login"]`. There is deliberately
 * no heuristic — no "same prefix", no "close enough", no automatic trailing
 * slash forgiveness — because every heuristic here is a way for a wrong page to
 * pass. `/login → /auth/login` is a real shim, and it is allowed by writing it
 * down in the cell, not by pattern-matching.
 *
 * @param {{url: string, allowedFinalUrls?: string[]}} cell
 * @param {string} landed  pathname + search actually reached
 * @returns {{ok: boolean, reason: string}}
 */
export function checkFinalLocation(cell, landed) {
  const planned = cell?.url;
  if (typeof landed !== "string" || landed === "" || landed === "about:blank") {
    return { ok: false, reason: `NAVIGATION_DID_NOT_SETTLE: landed on ${JSON.stringify(landed)}` };
  }
  if (typeof planned !== "string" || planned === "") {
    return { ok: false, reason: "CELL_HAS_NO_PLANNED_URL" };
  }
  if (landed === planned) return { ok: true, reason: "EXACT_MATCH" };

  const allowed = Array.isArray(cell.allowedFinalUrls) ? cell.allowedFinalUrls : [];
  if (allowed.includes(landed)) {
    return { ok: true, reason: `DECLARED_REDIRECT: ${planned} -> ${landed}` };
  }
  return {
    ok: false,
    reason: `WRONG_FINAL_LOCATION: planned ${planned}, landed ${landed}` +
      (allowed.length ? ` (declared redirects: ${allowed.join(", ")})` : " (no redirect declared for this cell)"),
  };
}

/** Access states a captured cell can legitimately be in. */
export const ACCESS = {
  AUTHENTICATED: "AUTHENTICATED",
  DENIED_BY_CAPABILITY: "DENIED_BY_CAPABILITY",
  BLOCKED_SETUP: "BLOCKED_SETUP",
  SESSION_LOST: "SESSION_LOST",
  NOT_FOUND: "NOT_FOUND",
};

/** Fields a COMPLETE per-cell record must carry. */
export const REQUIRED_RECORD_FIELDS = [
  "runId", "cellId", "route", "locale", "viewport",
  "requestedUrl", "finalUrl", "httpState", "accessState",
  "screenshotFile", "screenshotSha256", "capturedAt", "status",
];

/**
 * Is this record COMPLETE *as a record*? Structural check only — it does not
 * look at the filesystem, so it can be unit-tested without fixtures.
 */
export function isStructurallyComplete(rec) {
  if (!rec || typeof rec !== "object") return false;
  if (rec.status !== "COMPLETE") return false;
  return REQUIRED_RECORD_FIELDS.every((f) => rec[f] !== undefined && rec[f] !== null && rec[f] !== "");
}

/**
 * Why two byte-identical screenshots are allowed to exist.
 *
 * Identical pixels are legitimate only when the browser genuinely rendered the
 * same document for both cells. Everything else — especially identical images
 * ACROSS locales — is a finding, because it means the surface is not localized.
 * Returning a machine-readable reason (rather than a boolean) keeps the
 * justification in the manifest instead of in someone's head.
 *
 * @returns {{explained: boolean, reason: string}}
 */
export function explainDuplicateGroup(members) {
  const locales = new Set(members.map((m) => m.locale));
  const finals = new Set(members.map((m) => m.finalUrl));
  const states = new Set(members.map((m) => m.accessState));

  if (locales.size > 1) {
    return {
      explained: false,
      reason: `CROSS_LOCALE_IDENTICAL: identical bytes across locales [${[...locales].sort().join(",")}] — the surface is not localized`,
    };
  }
  if (finals.size === 1 && [...finals][0]) {
    return { explained: true, reason: `SAME_DOCUMENT: every member resolved to ${[...finals][0]}` };
  }
  if (members.every((m) => m.httpState === 404)) {
    return { explained: true, reason: `SHARED_NOT_FOUND_BOUNDARY: ${members.length} routes rendering the one localized 404 page` };
  }
  if ([...states].every((s) => s === ACCESS.DENIED_BY_CAPABILITY)) {
    return { explained: true, reason: "SHARED_DENIED_STATE: every member rendered the same capability-denied page" };
  }
  return {
    explained: false,
    reason: `UNEXPLAINED: ${members.length} cells share bytes but resolved to ${finals.size} different documents`,
  };
}

/**
 * Classify what the server actually gave us, keeping the four outcomes apart.
 * Conflating them is how "the page 404s" and "the user may not see this" end up
 * looking identical in a report.
 */
export function classifyAccess({ finalUrl, httpState, domText }) {
  const text = domText || "";
  if (/\/auth\/login/.test(finalUrl || "")) return ACCESS.SESSION_LOST;
  if (/Authentication not configured|احراز هویت پیکربندی نشده|Authentifizierung nicht konfiguriert/.test(text)) {
    return ACCESS.BLOCKED_SETUP;
  }
  if (/Access restricted|دسترسی محدود|Zugriff eingeschränkt/.test(text)) return ACCESS.DENIED_BY_CAPABILITY;
  if (httpState === 404) return ACCESS.NOT_FOUND;
  return ACCESS.AUTHENTICATED;
}
