/**
 * PHASE 99 — static security invariants over the real source tree.
 *
 * Each function answers ONE security question against the code as committed, and
 * each is fail-closed: an unrecognised sink is a failure, not a pass. The point
 * is not to re-implement a linter but to make a specific, reviewable claim —
 * "there is no user-controlled raw SQL", "there is no user-controlled outbound
 * URL" — that a human reviewer can check and CI can keep true.
 *
 * Every allowlist entry carries a justification string. An entry without one is
 * rejected by the allowlist's own validator, so "just add it to the list" is not
 * a silent escape hatch.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { stripComments } from "./route-inventory.mjs";

const SRC_EXT = /\.(ts|tsx)$/;

// PHASE 99.7 — deterministic scan cost.
//
// Every exported reviewer below independently walked the tree and re-read (and
// re-stripped) every file. With ~1850 source files and a suite that calls a
// dozen reviewers, the same bytes were read and parsed roughly a dozen times,
// making each assertion's WALL-CLOCK cost depend on machine load rather than on
// the repository. Under contention those suites intermittently blew vitest's
// 5s default and failed as timeouts — a red result that said nothing about the
// invariant being asserted.
//
// These caches are process-lifetime and keyed by absolute path. They are sound
// because this module is a READ-ONLY static reviewer: nothing it is pointed at
// is mutated while it runs, and no caller writes source files between calls.
// A long-lived process that needed to observe edits would call resetScanCaches().
const dirCache = new Map();
const textCache = new Map();
const strippedCache = new Map();

/** Drop every cached traversal/read. Only needed if the tree changes in-process. */
export function resetScanCaches() {
  dirCache.clear();
  textCache.clear();
  strippedCache.clear();
}

/** Read a source file once per process. */
export function readSource(file) {
  let text = textCache.get(file);
  if (text === undefined) {
    text = readFileSync(file, "utf8");
    textCache.set(file, text);
  }
  return text;
}

/** Read a source file with comments removed, stripping at most once per process. */
export function readSourceCode(file) {
  let text = strippedCache.get(file);
  if (text === undefined) {
    text = stripComments(readSource(file));
    strippedCache.set(file, text);
  }
  return text;
}

/**
 * Walk a directory, skipping tests, build output and vendor trees.
 *
 * Results are memoised per directory, and entries are typed via `withFileTypes`
 * so the walk costs one readdir per directory instead of an extra `statSync`
 * syscall per entry (which dominates on Windows).
 *
 * The returned array is a defensive copy, so a caller that sorts or splices it
 * cannot corrupt the cache for the next caller.
 */
export function walkSource(dir, out = []) {
  const cached = dirCache.get(dir);
  if (cached) {
    out.push(...cached);
    return out;
  }
  const collected = [];
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const name = entry.name;
      if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
      const full = join(dir, name);
      if (entry.isDirectory()) walkSource(full, collected);
      else if (SRC_EXT.test(name) && !/\.test\.tsx?$/.test(name)) collected.push(full);
    }
  }
  dirCache.set(dir, collected);
  out.push(...collected);
  return out;
}

const relPath = (root, f) => relative(root, f).split(sep).join("/");
const isClientModule = (text) => /^\s*["']use client["']/m.test(text.slice(0, 400));

// ─── SQL injection ────────────────────────────────────────────────────────────

/**
 * Raw-SQL inventory.
 *
 * Prisma's tagged-template forms (`$queryRaw\`…\``) parameterise interpolations,
 * so they are safe by construction. The `…Unsafe` forms take a plain string and
 * are only safe when that string is a LITERAL with no interpolation — anything
 * else means a value reached the SQL text, which is the injection condition.
 */
export function rawSqlInventory(repoRoot, allowlist = RAW_SQL_ALLOWLIST) {
  validateSqlAllowlist(allowlist);
  const items = [];
  for (const file of walkSource(join(repoRoot, "src"))) {
    const text = readSourceCode(file);
    const rel = relPath(repoRoot, file);
    const re = /\$(queryRaw|executeRaw)(Unsafe)?\s*(\(|`)/g;
    let m;
    while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split("\n").length;
      const unsafeApi = m[2] === "Unsafe";
      const opener = m[3];
      let form = "TAGGED_TEMPLATE";
      let argument = null;
      let safe = true;
      let interpolations = [];

      if (opener === "(") {
        const argsText = balancedFrom(text, m.index + m[0].length - 1, "(", ")");
        // ONLY the first argument is the SQL text; the rest are bound values,
        // which is exactly the safe shape and must not be mistaken for dynamism.
        const sqlArg = (splitTopLevel(argsText.slice(1, -1))[0] ?? "").trim();
        argument = sqlArg;
        if (!unsafeApi && /^Prisma\.sql`/.test(sqlArg)) {
          form = "PRISMA_SQL";
        } else if (/^(["'])(?:(?!\1)[^\\]|\\.)*\1$/.test(sqlArg)) {
          form = "LITERAL_STRING";
        } else if (/^`[\s\S]*`$/.test(sqlArg)) {
          interpolations = [...sqlArg.matchAll(/\$\{([^}]*)\}/g)].map((x) => x[1].trim());
          if (interpolations.length === 0) {
            form = "LITERAL_TEMPLATE";
          } else if (interpolations.every((expr) => isConstantIdentifier(expr, text))) {
            // A dynamic IDENTIFIER (table/column name) cannot be parameterised by
            // the driver, so it is only safe when it resolves to a module-level
            // string literal — never to a request value.
            form = "TEMPLATE_CONSTANT_IDENTIFIER";
          } else {
            form = "TEMPLATE_DYNAMIC_INTERPOLATION";
            safe = false;
          }
        } else {
          form = "DYNAMIC_ARGUMENT";
          safe = false;
        }
      }

      const reviewKey = `${rel}#${interpolations.join("|")}`;
      const reviewed = allowlist.find((a) => `${a.file}#${a.interpolations.join("|")}` === reviewKey) ?? null;
      items.push({
        file: rel,
        line,
        api: `$${m[1]}${unsafeApi ? "Unsafe" : ""}`,
        form,
        safe,
        reviewed: reviewed !== null,
        interpolations,
        argument: argument ? argument.slice(0, 80) : null,
      });
    }
  }
  // A site is acceptable when the classifier proves it safe, OR when a human
  // review recorded WHY the interpolation cannot carry request data. Everything
  // else is a finding.
  const unsafe = items.filter((i) => !i.safe && !i.reviewed);
  const staleReviews = allowlist.filter(
    (a) => !items.some((i) => i.file === a.file && i.interpolations.join("|") === a.interpolations.join("|")),
  );
  return {
    ok: unsafe.length === 0 && staleReviews.length === 0,
    items,
    unsafe,
    staleReviews,
    counters: { UNSAFE_USER_CONTROLLED_RAW_SQL: unsafe.length, STALE_RAW_SQL_REVIEWS: staleReviews.length },
  };
}

/**
 * Raw SQL sites whose interpolation is resolved by reading the surrounding code
 * rather than by pattern. Keyed by file plus the exact interpolated expressions,
 * so moving the statement is fine but CHANGING what it interpolates invalidates
 * the review and fails the gate.
 */
export const RAW_SQL_ALLOWLIST = [
  {
    file: "src/lib/documents/chunk-vector-store.ts",
    interpolations: ["where", "params.length"],
    justification:
      "`where` is assembled in this function from two string literals only; the sole conditional branch appends a fixed clause ending in the positional placeholder $N, and the documentId VALUE is pushed onto params and bound by the driver. `params.length` is a number. No caller value reaches the SQL text.",
  },
  {
    file: "src/lib/rag/vector-store-pgvector.ts",
    interpolations: ["TABLE", "where", "params.length"],
    justification:
      "`TABLE` is a module-level string literal. `where` is joined from clauses of the form `metadata ->> '<key>' = $N`, where every VALUE is bound as a parameter and every KEY is now validated against a strict SQL-identifier pattern that fails the search closed (finding P99-INT-007). `params.length` is a number.",
  },
];

function validateSqlAllowlist(list) {
  if (!Array.isArray(list)) throw new Error("RAW_SQL_ALLOWLIST must be an array");
  for (const e of list) {
    if (!e || typeof e.file !== "string" || !Array.isArray(e.interpolations) || typeof e.justification !== "string" || e.justification.trim().length < 40) {
      throw new Error("RAW_SQL_ALLOWLIST: every entry needs file, interpolations and a substantive justification");
    }
  }
  return true;
}

/**
 * True when an interpolated expression resolves to a module-level string
 * literal — the only interpolation a raw SQL identifier may safely carry.
 */
function isConstantIdentifier(expr, moduleText) {
  if (!/^[A-Za-z_$][\w$]*$/.test(expr)) return false;
  const def = new RegExp(`\\bconst\\s+${expr}\\s*(?::[^=]*)?=\\s*(["'\`])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1`).exec(moduleText);
  return def !== null;
}

// ─── SSRF ─────────────────────────────────────────────────────────────────────

/**
 * Server-side outbound URL sinks, classified by what determines the destination.
 *
 * `CONSTANT`  — a literal URL in the source.
 * `MODULE_CONSTANT` — an UPPER_SNAKE identifier defined in the module.
 * `ENVIRONMENT` — derived from `process.env` / a config getter (operator-controlled).
 * `RELATIVE` — a same-origin path, not an outbound destination at all.
 * `UNRESOLVED` — anything else. Fail-closed: it must be triaged, not assumed.
 */
export function outboundSinkInventory(repoRoot, allowlist = SSRF_SINK_ALLOWLIST) {
  validateAllowlist(allowlist, "SSRF_SINK_ALLOWLIST");
  const items = [];
  const roots = [join(repoRoot, "src", "lib"), join(repoRoot, "src", "app")];
  for (const root of roots) {
    for (const file of walkSource(root)) {
      const raw = readSource(file);
      if (isClientModule(raw)) continue;
      const text = stripComments(raw);
      const rel = relPath(repoRoot, file);
      const re = /\bfetch\s*\(/g;
      let m;
      while ((m = re.exec(text))) {
        // Skip `something.fetch(` and identifiers ending in fetch.
        const before = text[m.index - 1];
        if (before === "." || /[A-Za-z0-9_$]/.test(before ?? "")) continue;
        const args = balancedFrom(text, m.index + m[0].length - 1, "(", ")");
        const first = splitTopLevel(args.slice(1, -1))[0]?.trim() ?? "";
        const line = text.slice(0, m.index).split("\n").length;
        items.push({ file: rel, line, expression: first.slice(0, 120), kind: classifyUrlExpression(first, text) });
      }
    }
  }
  // A sink whose destination is a helper PARAMETER is not resolvable from the
  // call site alone; it is resolved by reviewing every caller. That review is
  // recorded in the allowlist, keyed by file + expression so an unrelated edit
  // that shifts line numbers cannot silently invalidate it.
  const allowed = new Set(allowlist.map((a) => `${a.file}#${a.expression}`));
  const needsReview = items.filter(
    (i) => (i.kind === "UNRESOLVED" || i.kind === "PARAMETER") && !allowed.has(`${i.file}#${i.expression}`),
  );
  const stale = allowlist.filter((a) => !items.some((i) => i.file === a.file && i.expression === a.expression));
  return {
    ok: needsReview.length === 0 && stale.length === 0,
    items,
    needsReview,
    stale,
    counters: {
      SSRF_UNREVIEWED_SINKS: needsReview.length,
      SSRF_STALE_ALLOWLIST_ENTRIES: stale.length,
    },
  };
}

function classifyUrlExpression(expr, moduleText) {
  const e = expr.trim();
  if (!e) return "UNRESOLVED";
  if (/^["'`]\//.test(e)) return "RELATIVE";
  if (/^["'`]https?:\/\//.test(e) && !e.includes("${")) return "CONSTANT";

  if (e.startsWith("`")) {
    const literalPrefix = e.slice(1).split("${")[0];
    // A template whose literal prefix already pins scheme + host cannot be
    // steered to another host, whatever the interpolation contains.
    if (/^https?:\/\/[A-Za-z0-9.-]+(?::)?$/.test(literalPrefix)) {
      return /^https?:\/\/(?:localhost|127\.0\.0\.1)/.test(literalPrefix) ? "LOOPBACK_CONSTANT" : "CONSTANT_HOST_DYNAMIC_PATH";
    }
    if (/^https?:\/\/[^/]+\//.test(literalPrefix)) return "CONSTANT_HOST_DYNAMIC_PATH";
    // `${SOMETHING}/rest` — the host comes from the first interpolation.
    const firstInterp = /^\$\{([^}]*)\}/.exec(e.slice(1))?.[1]?.trim();
    if (firstInterp) return classifyUrlExpression(firstInterp, moduleText);
  }

  if (/process\.env\./.test(e)) return "ENVIRONMENT";

  const idMatch = /^([A-Za-z_$][\w$]*)\b/.exec(e);
  if (idMatch) {
    const id = idMatch[1];
    if (/^[A-Z][A-Z0-9_]*$/.test(id)) return "MODULE_CONSTANT";
    const def = new RegExp(`(?:const|let)\\s+${id}\\s*(?::[^=]*)?=\\s*([^;\\n]+)`).exec(moduleText);
    if (def) {
      const rhs = def[1].trim();
      if (/process\.env\./.test(rhs)) return "ENVIRONMENT";
      if (/^get[A-Z]\w*(Url|Endpoint)\s*\(/.test(rhs)) return "ENVIRONMENT";
      if (/^["'`]https?:\/\//.test(rhs)) return "CONSTANT";
      if (/^["'`]\//.test(rhs)) return "RELATIVE";
    }
    // A bare parameter of the enclosing helper: the destination is decided by
    // the caller, so this sink is resolved by reviewing call sites, not here.
    if (new RegExp(`[(,]\\s*${id}\\s*:`).test(moduleText)) return "PARAMETER";
  }
  return "UNRESOLVED";
}

/**
 * The question SSRF actually turns on: can a REQUEST decide an outbound
 * destination? Scans API route handlers for a `fetch` whose URL expression is
 * derived from request-scoped data (body, query, params, headers).
 */
export function userControlledSinkScan(repoRoot) {
  const hits = [];
  const apiRoot = join(repoRoot, "src", "app", "api");
  const REQUEST_TOKENS = /\b(?:req|request)\b|searchParams|params|body|payload|await\s+req\.json/;
  for (const file of walkSource(apiRoot)) {
    if (!/route\.tsx?$/.test(file)) continue;
    const text = readSourceCode(file);
    const re = /\bfetch\s*\(/g;
    let m;
    while ((m = re.exec(text))) {
      const before = text[m.index - 1];
      if (before === "." || /[A-Za-z0-9_$]/.test(before ?? "")) continue;
      const args = balancedFrom(text, m.index + m[0].length - 1, "(", ")");
      const first = (splitTopLevel(args.slice(1, -1))[0] ?? "").trim();
      if (REQUEST_TOKENS.test(first)) {
        hits.push({ file: relPath(repoRoot, file), line: text.slice(0, m.index).split("\n").length, expression: first.slice(0, 120) });
      }
    }
  }
  return { ok: hits.length === 0, hits, counters: { SSRF_USER_CONTROLLED_SINKS: hits.length } };
}

/**
 * Outbound sinks that are resolved by inspection rather than by pattern.
 * Each entry names the file, the line and WHY the destination cannot be steered
 * by a request. Reviewed at Phase 99; re-review when the line moves.
 */
export const SSRF_SINK_ALLOWLIST = [
  {
    file: "src/lib/observability/alerts.ts",
    expression: "url",
    line: 127,
    justification:
      "Alert transport parameter. Every caller passes config().webhookUrl, which is read only from ALERT_WEBHOOK_URL and validated by validWebhookUrl(); no request value reaches it. The call already sets redirect:'error' and a 5s AbortSignal, so a 3xx cannot bounce the POST to another host.",
  },
  {
    file: "src/lib/ot-operations/api.ts",
    expression: "path",
    line: 89,
    justification:
      "Browser-side OT read wrapper. Callers pass same-origin '/api/...' path constants built in this module; the value is a path, never an absolute URL, so it cannot select a host. Runs in the browser, so it is not a server-side request forgery sink at all.",
  },
  {
    file: "src/lib/ot-operations/enrollment.ts",
    expression: "path",
    line: 87,
    justification:
      "Browser-side OT enrollment wrapper. Same contract as ot-operations/api.ts: same-origin relative path constants assembled in-module, executed in the browser, never a server-side outbound destination.",
  },
  {
    file: "src/lib/ot-operations/mutations.ts",
    expression: "path",
    line: 107,
    justification:
      "Browser-side OT mutation wrapper (covers both mutation helpers in this module). Callers pass same-origin '/api/ot/...' path constants; the value is relative, so no host can be selected, and execution is client-side.",
  },
];

// ─── HTML / XSS ───────────────────────────────────────────────────────────────

/**
 * Raw-HTML sinks. `dangerouslySetInnerHTML` is permitted only where the value is
 * produced by `JSON.stringify` (structured-data blobs), because that escapes the
 * one character sequence that could close the script element.
 */
export function htmlSinkInventory(repoRoot) {
  const items = [];
  for (const file of walkSource(join(repoRoot, "src"))) {
    const text = readSourceCode(file);
    const rel = relPath(repoRoot, file);
    for (const [token, kind] of [["dangerouslySetInnerHTML", "REACT_RAW_HTML"], [".innerHTML", "DOM_RAW_HTML"], [".outerHTML", "DOM_RAW_HTML"], ["document.write", "DOM_WRITE"]]) {
      let idx = text.indexOf(token);
      while (idx !== -1) {
        const line = text.slice(0, idx).split("\n").length;
        items.push({ file: rel, line, kind, token, valueForm: kind === "REACT_RAW_HTML" ? classifyRawHtmlValue(text, idx) : "NOT_ANALYSED" });
        idx = text.indexOf(token, idx + token.length);
      }
    }
  }
  const SAFE_FORMS = new Set(["JSON_SERIALISED", "JSON_SERIALISED_ESCAPED", "STATIC_LITERAL"]);
  const unsanitised = items.filter((i) => !(i.kind === "REACT_RAW_HTML" && SAFE_FORMS.has(i.valueForm)));
  return {
    ok: unsanitised.length === 0,
    items,
    unsanitised,
    counters: { UNSANITIZED_RAW_HTML_SINK: unsanitised.length },
  };
}

/**
 * Classify what actually reaches `__html`.
 *
 * A literal with no interpolation is safe because nothing external reaches it.
 *
 * `JSON.stringify` is accepted as `JSON_SERIALISED` for continuity, but note
 * the limit of that guarantee: it escapes quotes and backslashes, so the JSON
 * cannot be broken out of — but it does NOT escape `<`. A value containing
 * `</script>` therefore survives verbatim and closes the surrounding element.
 * Bare `JSON.stringify` is only genuinely safe where every value is
 * application-controlled.
 *
 * `JSON_SERIALISED_ESCAPED` is the stronger form: a dedicated serialiser that
 * additionally escapes `<` (and the U+2028/U+2029 line terminators). It is
 * recognised structurally, not by name — the helper's definition must be
 * present in the same file AND must be shown to perform the `<` escape — so
 * this cannot be used to wave through an arbitrary function that merely has a
 * reassuring identifier.
 */
function classifyRawHtmlValue(text, tokenIdx) {
  const containerStart = text.indexOf("{", tokenIdx);
  if (containerStart === -1) return "UNRESOLVED";
  const container = balancedFrom(text, containerStart, "{", "}");
  const objStart = container.indexOf("{", 1);
  const obj = objStart === -1 ? container : balancedFrom(container, objStart, "{", "}");
  const keyIdx = obj.indexOf("__html");
  if (keyIdx === -1) return "UNRESOLVED";
  const colon = obj.indexOf(":", keyIdx);
  if (colon === -1) return "UNRESOLVED";
  const value = (splitTopLevel(obj.slice(colon + 1, obj.length - 1))[0] ?? "").trim();
  if (/JSON\.stringify\s*\(/.test(value)) return "JSON_SERIALISED";
  // A local serialiser call, verified against its own definition in this file:
  // it must wrap JSON.stringify AND escape "<" to the u003c JSON escape.
  const call = value.match(/^([A-Za-z_$][\w$]*)\s*\(/);
  if (call && definesEscapingSerialiser(text, call[1])) return "JSON_SERIALISED_ESCAPED";
  if (/^`[\s\S]*`$/.test(value) && !value.includes("${")) return "STATIC_LITERAL";
  if (/^(["'])(?:(?!\1)[^\\]|\\.)*\1$/.test(value)) return "STATIC_LITERAL";
  return "DYNAMIC";
}

/**
 * True when `name` is defined in this same source as a serialiser that wraps
 * `JSON.stringify` and escapes `<` into the `u003c` JSON escape.
 *
 * Both spellings of the escape are accepted because the replacement string may
 * legitimately be assembled from a `String.fromCharCode(92)` backslash rather
 * than written as a literal escape sequence.
 */
function definesEscapingSerialiser(text, name) {
  const defIdx = text.search(
    new RegExp(`function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=`),
  );
  if (defIdx === -1) return false;
  const bodyStart = text.indexOf("{", defIdx);
  if (bodyStart === -1) return false;
  const body = balancedFrom(text, bodyStart, "{", "}");
  if (!/JSON\.stringify\s*\(/.test(body)) return false;
  const escapesLt = /u003c/i.test(body) && /\.replace\s*\(/.test(body);
  return escapesLt;
}

// ─── File upload ──────────────────────────────────────────────────────────────

/** Routes that read multipart bodies, with the controls each one proves. */
export function uploadSurfaceInventory(repoRoot) {
  const items = [];
  const apiRoot = join(repoRoot, "src", "app", "api");
  for (const file of walkSource(apiRoot)) {
    if (!/route\.tsx?$/.test(file)) continue;
    const text = readSourceCode(file);
    if (!/\.formData\s*\(/.test(text)) continue;
    items.push({
      file: relPath(repoRoot, file),
      sizeLimited: /MAX_BYTES|maxBytes|validateFileSize|\.size\s*>/.test(text),
      typeChecked: /validateFileType|ALLOWED_MIME|allowedTypes|\.type\s*(?:===|!==|\.startsWith)|instanceof File/.test(text),
      // `mintCoverFilename` is the Journal's canonical cover-name minter. It is
      // registered here for the same reason `requireVoiceCopilotActor` is
      // registered in route-inventory.mjs GUARD_TOKENS: this invariant is
      // file-local and cannot follow an import, so a route that delegates the
      // control to a shared helper would otherwise read as having no control at
      // all. The helper builds the stored name from `randomBytes(16)` plus an
      // extension derived from the SNIFFED content type and never touches the
      // uploader's filename — src/lib/articles/__tests__/cover-media.test.ts
      // locks both halves of that claim: the mint format, and that a filename
      // carrying parent-directory segments reaches storage carrying none.
      filenameControlled: /randomBytes|randomUUID|sanitizeKey|validateFilename|basename\s*\(|mintCoverFilename/.test(text),
      authGated: /requireAdmin|getCurrentUser|requireOrgActor|requirePermission|requirePlatformAuth|requireAuthoring|getAuthRole/.test(text),
      absolutePathRejected: !/path\.join\([^)]*\breq\b/.test(text),
    });
  }
  const failures = [];
  for (const i of items) {
    if (!i.sizeLimited) failures.push(`${i.file}: UPLOAD_UNBOUNDED_SIZE`);
    if (!i.typeChecked) failures.push(`${i.file}: upload accepts any content type`);
    if (!i.filenameControlled) failures.push(`${i.file}: UPLOAD_PATH_TRAVERSAL risk — client filename not normalised`);
    if (!i.authGated) failures.push(`${i.file}: UPLOAD_AUTHZ_BYPASS — no authorization evidence`);
  }
  return { ok: failures.length === 0, items, failures };
}

// ─── Cookies / CSRF ───────────────────────────────────────────────────────────

/**
 * Cookie security review.
 *
 * The repository's CSRF contract is SameSite-primary: authentication cookies are
 * `SameSite=Lax` or stricter, so a cross-site POST never carries them, and a
 * same-origin check is applied additionally on the anonymous Brain write. That
 * contract holds only while no GET handler mutates state — which the route
 * inventory proves separately.
 */
export function cookieSecurityReview(repoRoot) {
  const findings = [];
  const cookieFiles = [
    "src/app/api/auth/route.ts",
    "src/app/api/auth/refresh/route.ts",
    "src/lib/auth/token-session.ts",
  ];
  const seen = [];
  for (const rel of cookieFiles) {
    const abs = join(repoRoot, ...rel.split("/"));
    if (!existsSync(abs)) { findings.push(`${rel}: expected cookie-setting module is missing`); continue; }
    const text = stripComments(readFileSync(abs, "utf8"));
    const blocks = text.split(/\.set\s*\(/).slice(1);
    for (const block of blocks) {
      const chunk = block.slice(0, 400);
      if (!/sameSite/.test(chunk)) continue;
      const sameSite = /sameSite\s*:\s*["'](\w+)["']/.exec(chunk)?.[1] ?? null;
      const httpOnly = /httpOnly\s*:\s*true/.test(chunk);
      const secure = /secure\s*:\s*(?:true|isProduction|process\.env\.NODE_ENV\s*===\s*["']production["'])/.test(chunk);
      seen.push({ file: rel, sameSite, httpOnly, secure });
      if (sameSite === "none") findings.push(`${rel}: SameSite=None on an authentication cookie`);
      if (!httpOnly) findings.push(`${rel}: authentication cookie without httpOnly`);
      if (!secure) findings.push(`${rel}: authentication cookie not Secure in production`);
    }
  }
  if (seen.length === 0) findings.push("no authentication cookie configuration found — the review could not be performed");
  return { ok: findings.length === 0, cookies: seen, findings, counters: { AUTH_COOKIE_SECURITY: findings.length === 0 ? "PASS" : "FAIL" } };
}

// ─── Error hygiene ────────────────────────────────────────────────────────────

/**
 * Does any route hand an internal error to the client?
 *
 * A stack trace, a raw `Error` object or a database error message in a response
 * body tells an attacker the file layout, the ORM, the schema and often the
 * query. The repository's convention is a stable code plus a generic message,
 * with the detail going to the log — this checks that the convention holds.
 */
export function errorHygieneReview(repoRoot) {
  const violations = [];
  const apiRoot = join(repoRoot, "src", "app", "api");
  // Patterns that put error INTERNALS into a response payload.
  const LEAKS = [
    { re: /NextResponse\.json\s*\([^)]*\berr(?:or)?\.stack\b/, id: "STACK_TRACE_TO_CLIENT" },
    { re: /NextResponse\.json\s*\(\s*\{[^}]*:\s*String\s*\(\s*err(?:or)?\s*\)/, id: "RAW_ERROR_TO_CLIENT" },
    { re: /NextResponse\.json\s*\(\s*\{[^}]*:\s*err(?:or)?\s*[,}]/, id: "RAW_ERROR_OBJECT_TO_CLIENT" },
    { re: /NextResponse\.json\s*\([^)]*\berr(?:or)?\.message\b/, id: "ERROR_MESSAGE_TO_CLIENT" },
  ];
  for (const file of walkSource(apiRoot)) {
    if (!/route\.tsx?$/.test(file)) continue;
    const text = readSourceCode(file);
    for (const leak of LEAKS) {
      if (leak.re.test(text)) {
        const line = text.slice(0, leak.re.exec(text).index).split("\n").length;
        violations.push({ file: relPath(repoRoot, file), line, rule: leak.id });
      }
    }
  }
  return {
    ok: violations.length === 0,
    violations,
    counters: {
      RAW_STACK_TRACE_TO_CLIENT: violations.filter((v) => v.rule === "STACK_TRACE_TO_CLIENT").length,
      RAW_DATABASE_ERROR_TO_CLIENT: violations.filter((v) => v.rule !== "STACK_TRACE_TO_CLIENT").length,
    },
  };
}

// ─── Infrastructure ───────────────────────────────────────────────────────────

/** Static infrastructure review over the committed Docker/Compose/Next config. */
export function infrastructureReview(repoRoot) {
  const findings = [];
  const counters = {
    ROOT_APP_CONTAINER: 0,
    DEBUG_MODE_IN_PRODUCTION: 0,
    UNNECESSARY_PUBLIC_PORT: 0,
    CORS_WILDCARD_WITH_CREDENTIALS: 0,
    MISSING_CRITICAL_SECURITY_HEADERS: 0,
    SECRET_IN_IMAGE_LAYER: 0,
  };
  const read = (p) => { const abs = join(repoRoot, ...p.split("/")); return existsSync(abs) ? readFileSync(abs, "utf8") : null; };

  // Container must not run as root.
  const dockerfile = read("Dockerfile");
  if (!dockerfile) { findings.push("Dockerfile missing"); counters.ROOT_APP_CONTAINER = 1; }
  else {
    const users = [...dockerfile.matchAll(/^\s*USER\s+(\S+)/gm)].map((m) => m[1]);
    const last = users[users.length - 1];
    if (!last || last === "root" || last === "0") { findings.push("Dockerfile: application stage does not drop to a non-root USER"); counters.ROOT_APP_CONTAINER = 1; }
    // A secret baked into a layer survives the image.
    if (/^\s*(ENV|ARG)\s+\w*(PASSWORD|SECRET|TOKEN|PRIVATE_KEY)\w*\s*=\s*["']?(?!\s*$)[^\s"']{8,}/mi.test(dockerfile)) {
      const lines = dockerfile.split("\n").filter((l) => /(ENV|ARG)\s+\w*(PASSWORD|SECRET|TOKEN|PRIVATE_KEY)/i.test(l));
      const real = lines.filter((l) => !/placeholder|dummy|build-time|changeme|example/i.test(l));
      if (real.length > 0) { findings.push("Dockerfile: a credential-looking value is baked into an image layer"); counters.SECRET_IN_IMAGE_LAYER = real.length; }
    }
  }

  // Data services must not publish host ports.
  const compose = read("docker-compose.prod.yml");
  if (!compose) findings.push("docker-compose.prod.yml missing");
  else {
    for (const svc of ["postgres", "redis"]) {
      const block = serviceBlock(compose, svc);
      if (block && /^\s{4,}ports:/m.test(block)) {
        findings.push(`docker-compose.prod.yml: service '${svc}' publishes a host port`);
        counters.UNNECESSARY_PUBLIC_PORT += 1;
      }
    }
  }

  // Baseline response headers.
  const nextConfig = read("next.config.ts") ?? read("next.config.js") ?? "";
  for (const header of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"]) {
    if (!nextConfig.includes(header)) { findings.push(`next.config: missing ${header}`); counters.MISSING_CRITICAL_SECURITY_HEADERS += 1; }
  }
  const middleware = read("src/middleware.ts") ?? read("middleware.ts") ?? "";
  if (!/Content-Security-Policy/i.test(middleware)) { findings.push("middleware: no Content-Security-Policy"); counters.MISSING_CRITICAL_SECURITY_HEADERS += 1; }
  if (/script-src[^;]*'unsafe-inline'/.test(middleware)) {
    // Only a production-unconditional unsafe-inline is a finding.
    const scriptSrc = /script-src[^;]*/.exec(middleware)?.[0] ?? "";
    if (!/NODE_ENV|isDev|development/.test(middleware.slice(Math.max(0, middleware.indexOf(scriptSrc) - 300), middleware.indexOf(scriptSrc) + scriptSrc.length))) {
      findings.push("middleware: script-src allows 'unsafe-inline' unconditionally");
      counters.MISSING_CRITICAL_SECURITY_HEADERS += 1;
    }
  }

  // CORS: a wildcard origin must never be paired with credentials.
  for (const file of walkSource(join(repoRoot, "src"))) {
    const text = readSourceCode(file);
    if (/Access-Control-Allow-Origin["']?\s*[,:]\s*["']\*/.test(text) && /Access-Control-Allow-Credentials["']?\s*[,:]\s*["']true/.test(text)) {
      findings.push(`${relPath(repoRoot, file)}: CORS wildcard origin with credentials`);
      counters.CORS_WILDCARD_WITH_CREDENTIALS += 1;
    }
  }

  // Production debug switches.
  if (/productionBrowserSourceMaps\s*:\s*true/.test(nextConfig)) { findings.push("next.config: production browser source maps enabled"); counters.DEBUG_MODE_IN_PRODUCTION += 1; }

  return { ok: findings.length === 0, findings, counters };
}

function serviceBlock(compose, name) {
  const re = new RegExp(`^\\s{2}${name}:\\s*$`, "m");
  const m = re.exec(compose);
  if (!m) return null;
  const rest = compose.slice(m.index + m[0].length);
  const next = /^\s{2}\S/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

// ─── shared helpers ───────────────────────────────────────────────────────────

function balancedFrom(text, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) { depth -= 1; if (depth === 0) return text.slice(openIdx, i + 1); }
  }
  return text.slice(openIdx);
}

/** Split an argument list on top-level commas only. */
function splitTopLevel(text) {
  const out = [];
  let depth = 0, cur = "", inTick = false;
  for (const ch of text) {
    // A backtick both opens AND closes, so it must toggle rather than count —
    // treating it as a bracket cancels itself out and hides the whole template.
    if (ch === "`") inTick = !inTick;
    else if (!inTick && "([{".includes(ch)) depth += 1;
    else if (!inTick && ")]}".includes(ch)) depth -= 1;
    if (ch === "," && depth === 0 && !inTick) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Every allowlist entry must carry file, line and a written justification. */
export function validateAllowlist(list, label) {
  if (!Array.isArray(list)) throw new Error(`${label} must be an array`);
  for (const e of list) {
    if (!e || typeof e.file !== "string" || !Number.isInteger(e.line) || typeof e.justification !== "string" || e.justification.trim().length < 20) {
      throw new Error(`${label}: every entry needs file, line and a substantive justification`);
    }
  }
  return true;
}
