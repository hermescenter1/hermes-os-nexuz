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
 * Do the captured pixels match the viewport the cell planned?
 *
 * BOTH axes, deliberately. Comparing width alone accepts an image of the right
 * width and the wrong height — a full-page capture where a viewport one was
 * planned, say — which changes what the reviewer is actually looking at.
 *
 * This lives here, and `verify.mjs` calls it, so the rule has exactly one
 * implementation. A test that re-derived the comparison locally would pass
 * happily while the verifier did something else entirely.
 *
 * @param {{width: number, height: number}} cell     planned viewport
 * @param {{width: number, height: number}|null} dim actual IHDR dimensions
 * @returns {{ok: boolean, reason: string}}
 */
export function checkDimensions(cell, dim) {
  if (!dim) return { ok: false, reason: "WRONG_DIMENSIONS: image dimensions unreadable (not a PNG?)" };
  if (dim.width === cell.width && dim.height === cell.height) {
    return { ok: true, reason: `EXACT_DIMENSIONS: ${dim.width}x${dim.height}` };
  }
  return {
    ok: false,
    reason: `WRONG_DIMENSIONS: actual ${dim.width}x${dim.height} != planned ${cell.width}x${cell.height}`,
  };
}

/**
 * The sweep's own exit code, given how many cells failed.
 *
 * Extracted so it can be asserted directly. Proving this through the binary
 * alone is unreliable: a run with an unlaunchable browser exits during startup
 * and never reaches the capture loop, so such a test demonstrates startup
 * failure while appearing to demonstrate capture failure.
 */
export function captureExitCode(failed) {
  return failed > 0 ? EXIT.CAPTURE_INCOMPLETE : EXIT.OK;
}

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

/* ────────────────── anti-contamination (Phase 107 Stage 6-A) ────────────────── */

/**
 * APIs an audit tool must never reach for.
 *
 * WHY THIS EXISTS
 * The Stage 5 driver registered this on every document:
 *
 *   Page.addScriptToEvaluateOnNewDocument({ source:
 *     "const hide=()=>{...s.textContent='nextjs-portal{display:none !important}';
 *      (document.head||document.documentElement).appendChild(s)};
 *      document.addEventListener('DOMContentLoaded',hide);hide();" })
 *
 * Two separate harms, both fatal to evidence:
 *
 *   1. It HID the Next.js dev error overlay. An audit whose job is to find
 *      broken pages was suppressing the browser's own report of broken pages.
 *   2. At the earliest evaluation moment neither `document.head` nor
 *      `document.documentElement` exists yet, so `hide()` threw
 *      `TypeError: Cannot read properties of null (reading 'appendChild')`.
 *      That exception landed in `consoleErrors` for 35 of 36 cells, and the
 *      Stage 5 anomaly rule — "a console error exists and no error text is on
 *      screen" — then reported the tool's own crash as a product defect.
 *
 * The rule that follows is therefore absolute: the harness reads. It may
 * measure geometry and state, and it may photograph. It may not change a single
 * node, style, class or animation, because the moment it does, the picture stops
 * being the thing the user would have seen.
 */
/* @audit-vocabulary-start — the names below ARE the ban list, not a use of it. */

/**
 * APIs that can only ever change the page. Reading them is not a thing.
 */
export const FORBIDDEN_MUTATION_APIS = [
  // Node-level mutation
  "appendChild", "insertBefore", "replaceChild", "replaceWith", "removeChild",
  "insertAdjacentHTML", "createElement",
  // Presentation mutation
  "classList.add", "classList.remove", "classList.toggle",
  "setAttribute", "removeAttribute", "insertRule",
  // Animation control — freezing a spinner is still editing the picture
  ".pause()", ".cancel()", ".finish()",
  // Whole-document script injection
  "addScriptToEvaluateOnNewDocument", "addBinding",
];

/**
 * Properties that are perfectly good to READ and forbidden to WRITE.
 *
 * This distinction is the difference between measuring a page and editing one:
 * `document.documentElement.outerHTML` is how the fixture proves the DOM did not
 * change, while `el.outerHTML = …` is how you would change it. An earlier
 * version of this list banned the identifier outright and flagged its own
 * evidence-gathering reads, which would have pushed the next author toward
 * deleting the check rather than fixing it.
 */
export const FORBIDDEN_WHEN_ASSIGNED = [
  "innerHTML", "outerHTML", "textContent", "cssText", "currentTime",
];

/** CDP domains that change the page rather than observe it. */
export const FORBIDDEN_CDP_METHODS = [
  "DOM.setOuterHTML",
  "DOM.setAttributeValue",
  "DOM.removeNode",
  "CSS.setStyleTexts",
  "CSS.createStyleSheet",
  "Animation.setCurrentTime",
  "Page.addScriptToEvaluateOnNewDocument",
];
/* @audit-vocabulary-end */

/**
 * Scan harness source for forbidden mutation.
 *
 * `text` is the source of one harness file. Comments are stripped first: this
 * very file documents the banned `hide()` script verbatim so the next reader
 * understands what went wrong, and prose explaining a prohibition must not read
 * as a violation of it.
 *
 * Returns the offending lines, so a failure names the line rather than merely
 * asserting that one exists.
 */
export function findForbiddenMutation(text, file = "<source>") {
  const raw = text.split(/\r?\n/);
  const hits = [];

  // Comments are blanked IN PLACE rather than deleted, for two reasons: the
  // reported line number stays the real one, and the region sentinels — which
  // live in comments — survive to be read.
  let inBlockComment = false;
  // The ban list has to name the banned APIs, so the region that declares it is
  // skipped. Everything outside that region is still scanned: this file cannot
  // exempt itself from its own rule.
  let inVocabulary = false;

  raw.forEach((original, i) => {
    if (/@audit-vocabulary-start/.test(original)) { inVocabulary = true; return; }
    if (/@audit-vocabulary-end/.test(original)) { inVocabulary = false; return; }
    if (inVocabulary) return;

    let line = original;
    if (inBlockComment) {
      const end = line.indexOf("*/");
      if (end === -1) return;
      inBlockComment = false;
      line = line.slice(end + 2);
    }
    // Strip any complete block comments, then an opening one, then a line comment.
    line = line.replace(/\/\*.*?\*\//g, " ");
    const open = line.indexOf("/*");
    if (open !== -1) { inBlockComment = true; line = line.slice(0, open); }
    const lineComment = line.indexOf("//");
    if (lineComment !== -1) line = line.slice(0, lineComment);
    if (!line.trim()) return;

    for (const api of [...FORBIDDEN_MUTATION_APIS, ...FORBIDDEN_CDP_METHODS]) {
      if (line.includes(api)) hits.push({ file, line: i + 1, api, text: line.trim().slice(0, 120) });
    }
    // Assignment only: `x.innerHTML = …`, `a.currentTime = …`. A read of the same
    // property is how this harness measures, and must stay legal.
    for (const prop of FORBIDDEN_WHEN_ASSIGNED) {
      if (new RegExp(`\\.${prop}\\s*(=[^=]|\\+=)`).test(line)) {
        hits.push({ file, line: i + 1, api: `${prop}=`, text: line.trim().slice(0, 120) });
      }
    }
  });
  return hits;
}

/**
 * True when a console message came from the audit tool rather than the product.
 *
 * A harness-authored error must never be counted as a page defect, and must
 * never be silently dropped either: `AUDIT_HARNESS_CONSOLE_ERRORS` is required
 * to be zero, so the correct response to one is to fix the harness.
 *
 * Injected scripts have no source URL, so their frames read `<anonymous>` or
 * carry the CDP evaluation marker.
 */
export function attributeConsoleError(message) {
  const m = String(message || "");
  if (/<anonymous>|__s5\b|Runtime\.evaluate/.test(m)) return "AUDIT_HARNESS";
  if (/net::ERR_|ERR_CONNECTION|ERR_NETWORK_CHANGED|ChunkLoadError/.test(m)) return "BROWSER_INFRASTRUCTURE";
  if (/Failed to load resource: the server responded with a status of \d+/.test(m)) return "NETWORK";
  return "PRODUCT";
}
