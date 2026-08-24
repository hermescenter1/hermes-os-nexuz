/**
 * Phase 107 Stage 6-A.3 — audit every `requestJson` selector, in STATEMENT ORDER.
 *
 * `requestJson` treats a selector returning `undefined` as a broken contract and
 * raises FAILED. That guarantee is only as good as the selectors: any that turns
 * a MISSING field into a valid-looking value — `?? []`, `?? null`, `?? DEFAULT_*`,
 * or a bare `return null` — hands back success the server never expressed.
 *
 * WHY THIS WAS REWRITTEN. The first version asked a textual question:
 *
 *     does `"k" in d` appear ANYWHERE in this selector?
 *
 * and answered "SAFE" if it did. That is precisely the wrong question, and it
 * certified the defect that shipped:
 *
 *     if (d.noAccount) return null;          // <- returns BEFORE any guard
 *     if (!("preference" in d)) return undefined;
 *     return d.preference ?? DEFAULT_PREFERENCE;
 *
 * The presence check existed, so the audit passed it — while `200 {"noAccount":
 * true}` still short-circuited to `null` and rendered "No Account Found". A
 * guard that runs after the return it was meant to protect guards nothing.
 *
 * The question is now ORDINAL and asked of the AST: at each `return` that
 * produces a value, has a presence check already executed on this path? An early
 * value-return that no guard dominates is reported, whatever the rest of the
 * function contains.
 *
 * Usage: node docs/design/stage6a/selector-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import tsModule from "typescript";
import { pathToFileURL } from "node:url";

const ts = tsModule.default ?? tsModule;
const ROOTS = ["src/components", "src/app"];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/__tests__/.test(p)) out.push(p.split(path.sep).join("/"));
  }
  return out;
}

const parse = (file, src) => ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true,
  /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** `undefined`, the one return value that means "broken contract". */
const isUndefined = (e) => !e || (ts.isIdentifier(e) && e.text === "undefined");

/** `!("k" in d)` — a presence check, in the position that makes it a guard. */
function presenceKeys(expr) {
  const keys = [];
  const visit = (n) => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.InKeyword
      && ts.isStringLiteral(n.left)) keys.push(n.left.text);
    // `d.k === undefined` reads presence too, and CustomerAccountClient uses it.
    if (ts.isBinaryExpression(n)
      && (n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
        || n.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)
      && ts.isPropertyAccessExpression(n.left) && isUndefined(n.right)) keys.push(n.left.name.text);
    ts.forEachChild(n, visit);
  };
  visit(expr);
  return keys;
}

/*
 * Property names that are never the payload: methods and well-known helpers a
 * selector may call on its way to the value. Counting `map` or `length` as an
 * unproven field would bury the real findings in noise.
 */
const INERT_KEYS = new Set([
  "map", "filter", "slice", "length", "toString", "trim", "split", "join",
  "find", "some", "every", "reduce", "concat", "includes", "flat", "at",
]);

/*
 * A fallback is a `??` or `||` in a RETURNED VALUE — not anywhere in the body.
 *
 * Scanning the whole function text called the settings SAVE selector unsafe
 * because its GUARD reads `!d.preference || typeof d.preference !== "object"`.
 * That `||` narrows a check; it cannot manufacture data. Only an expression
 * whose value is handed back to the caller can turn an absent field into one.
 */
const FALLBACK = /\?\?|\|\|/;
const returnsFallback = (expr) => !!expr && FALLBACK.test(expr.getText());

/**
 * The property names a returned expression actually CONSUMES.
 *
 * PHASE 107 FINAL — proving *a* key is not proving *the* key.
 *
 * The audit previously asked only whether the set of proven keys was non-empty.
 * That accepts the one shape this check exists to reject:
 *
 *     if (d.envelope === undefined) return undefined;   // proves `envelope`
 *     return d.preference ?? fallback;                  // consumes `preference`
 *
 * The guard is real, the fallback is real, and they are about different fields —
 * so an absent `preference` still becomes a value. Every property read on the
 * way to the returned value must itself be proven, which is what this collects.
 *
 * Optional chaining is included deliberately: `d?.preference ?? x` consumes
 * `preference` exactly as the plain form does.
 */
function consumedKeys(expr) {
  const keys = new Set();
  if (!expr) return keys;
  const visit = (n) => {
    if (ts.isPropertyAccessExpression(n)) keys.add(n.name.text);
    else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression)) {
      keys.add(n.argumentExpression.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(expr);
  return keys;
}

/**
 * Walk the selector body in order, tracking what has been proven present.
 *
 * Only straight-line statements are interpreted; anything more involved is
 * reported as NOT ANALYSED rather than assumed safe, because a selector this
 * audit cannot read is exactly the one that needs a human.
 */
function analyse(body) {
  const proven = new Set();
  let sawFallbackReturn = false;
  const findings = [];
  let analysed = true;

  const statements = ts.isBlock(body) ? body.statements : null;
  if (!statements) {
    // A concise arrow body: one expression, no early returns to order.
    return {
      analysed: true,
      earlyValueReturns: [],
      provenKeys: presenceKeys(body),
      hasFallback: returnsFallback(body),
      guardedFallback: presenceKeys(body).length > 0,
    };
  }

  for (const st of statements) {
    if (ts.isIfStatement(st)) {
      const keys = presenceKeys(st.expression);
      const then = st.thenStatement;
      const ret = ts.isReturnStatement(then) ? then
        : ts.isBlock(then) && then.statements.length === 1 && ts.isReturnStatement(then.statements[0])
          ? then.statements[0] : null;

      if (ret && isUndefined(ret.expression)) {
        // `if (<presence fails>) return undefined;` — from here on, proven.
        for (const k of keys) proven.add(k);
        continue;
      }
      if (ret && !isUndefined(ret.expression)) {
        // A VALUE returned from a guard. Safe only if something is already proven.
        if (proven.size === 0) {
          findings.push({ kind: "early value return", text: st.getText().split("\n")[0].trim(), at: ret.getStart() });
        }
        continue;
      }
      // A non-return `if` may still establish presence for the code below it.
      for (const k of keys) proven.add(k);
      continue;
    }

    if (ts.isReturnStatement(st)) {
      if (isUndefined(st.expression)) continue;
      if (returnsFallback(st.expression)) {
        sawFallbackReturn = true;
        // Every field the returned value reads must itself have been proven —
        // proving a DIFFERENT field is what let `d.preference ?? x` through.
        const consumed = [...consumedKeys(st.expression)].filter((k) => !INERT_KEYS.has(k));
        const unproven = consumed.filter((k) => !proven.has(k));
        if (proven.size === 0) {
          findings.push({
            kind: "fallback with nothing proven",
            text: st.getText().split("\n")[0].trim(), at: st.getStart(),
          });
        } else if (unproven.length) {
          findings.push({
            kind: `fallback on unproven field(s): ${unproven.join(", ")} — proven: ${[...proven].join(", ") || "none"}`,
            text: st.getText().split("\n")[0].trim(), at: st.getStart(),
          });
        }
      }
      continue;
    }

    if (ts.isVariableStatement(st) || ts.isExpressionStatement(st)) continue;
    analysed = false;      // loops, try/catch, switch — not interpreted here
  }

  return {
    analysed,
    earlyValueReturns: findings,
    provenKeys: [...proven],
    hasFallback: sawFallbackReturn,
    guardedFallback: proven.size > 0,
  };
}

/** The selector is `requestJson`'s SECOND argument. */
function selectorsIn(file, src) {
  const root = parse(file, src);
  const out = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)
      && ((ts.isIdentifier(node.expression) && node.expression.text === "requestJson")
        || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "requestJson"))) {
      const url = node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])
        ? node.arguments[0].text : "(dynamic)";
      const sel = node.arguments[1];
      if (sel && (ts.isArrowFunction(sel) || ts.isFunctionExpression(sel))) {
        out.push({
          url,
          line: root.getLineAndCharacterOfPosition(node.getStart(root)).line + 1,
          ...analyse(sel.body),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return out;
}

/**
 * Classify every selector in one source string.
 *
 * Exported so the adversarial controls can drive the REAL analysis against
 * synthetic selectors with known verdicts, without touching any file in the
 * repository. A detector that has been wrong twice is not believed on its own
 * output a third time.
 */
export function analyseSource(file, src) {
  const out = [];
  for (const s of selectorsIn(file, src)) {
    const problems = s.earlyValueReturns;
    out.push({
      file, ...s,
      classification: !s.analysed ? "NOT ANALYSED — needs review"
        : problems.length ? `REQUIRED FIX — ${problems[0].kind}`
        : s.hasFallback && !s.guardedFallback ? "REQUIRED FIX — fallback with nothing proven present"
        : s.hasFallback ? "SAFE — presence proven before the fallback"
        : "SAFE — absence reaches undefined",
    });
  }
  return out;
}

/*
 * Everything below runs ONLY when this file is executed directly.
 *
 * `selector-controls.mjs` imports `analyseSource`, and without this guard the
 * import ran the whole audit and called `process.exit`, so the controls never
 * executed and printed nothing — a proof that silently did not run.
 */
/*
 * Compared as URLs, not as strings.
 *
 * A first attempt matched the basename out of `process.argv[1]` with a regex
 * that only split on `/`. On Windows Node hands back an absolute BACKSLASH
 * path, so the split returned the whole path, the comparison was false, and the
 * audit silently produced no output while still exiting 0 — a gate that had
 * stopped running and looked fine. `pathToFileURL` removes the guesswork.
 */
const RUN_AS_SCRIPT = !!process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (RUN_AS_SCRIPT) {
const rows = [];
for (const file of ROOTS.flatMap((r) => walk(r))) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("requestJson")) continue;
  rows.push(...analyseSource(file, src));
}

const bad = rows.filter((r) => r.classification.startsWith("REQUIRED"));
const unread = rows.filter((r) => r.classification.startsWith("NOT ANALYSED"));
const withFallback = rows.filter((r) => r.hasFallback);

console.log(`requestJson selectors: ${rows.length}`);
console.log(`  with a fallback : ${withFallback.length}`);
console.log(`  needing a fix   : ${bad.length}`);
console.log(`  not analysed    : ${unread.length}`);
console.log("");
for (const r of withFallback.concat(bad, unread).filter((v, i, a) => a.indexOf(v) === i)) {
  console.log(`  ${r.file}:${r.line}`);
  console.log(`     ${r.url}`);
  console.log(`     proven before use: [${r.provenKeys.join(", ")}]  ->  ${r.classification}`);
  for (const p of r.earlyValueReturns) console.log(`       ! ${p.kind}: ${p.text}`);
}
console.log("");
console.log(`SELECTOR_SITES=${rows.length}`);
console.log(`SELECTORS_WITH_FALLBACK=${withFallback.length}`);
console.log(`SELECTORS_NOT_ANALYSED=${unread.length}`);
console.log(`SELECTORS_REQUIRING_FIX=${bad.length}`);

/*
 * PHASE 107 FINAL R4 - a validation OUTPUT must not land inside the tree the
 * validation is measuring.
 *
 * Writing this artifact into docs/design/stage6a/ changed the worktree DURING
 * the validation epoch. The old tree hash (git status + git diff) never noticed,
 * because for an UNTRACKED file it bound only the NAME. The content-bound
 * fingerprint saw it immediately and refused the run: PRE_POST_TREE_SHA_MATCH=NO.
 *
 * The closure passes --artifact-dir pointing at its log directory, outside the
 * repository. The in-repo default survives only for a standalone invocation, and
 * it is not a loophole: if the closure ever stops passing the flag, the PRE/POST
 * binding fails closed exactly as it did here.
 */
const ARTIFACT_DIR = (() => {
  const i = process.argv.indexOf("--artifact-dir");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "docs/design/stage6a";
})();
fs.writeFileSync(path.join(ARTIFACT_DIR, "selector-audit.json"), JSON.stringify(rows, null, 2));
process.exit(bad.length || unread.length ? 1 : 0);
}
