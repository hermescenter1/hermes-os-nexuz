/**
 * Phase 107 Stage 6-A.2 — refusal-site analysis on a real AST.
 *
 * The previous analyser was a regex over stripped source. It was rewritten once
 * already, from file-level to per-site, after it both false-alarmed on
 * positional forwarding and proved structurally incapable of seeing a single
 * hard-coded site in an otherwise-correct file. Regexes kept being *nearly*
 * right, which is the worst property a detector can have.
 *
 * This parses with the TypeScript compiler that already ships in this
 * repository — no new dependency — and asks structural questions instead of
 * textual ones. Every shape below is recognised because it is the same AST
 * regardless of spelling:
 *
 *     deny(401, "authentication_required")
 *     json(body, 401)
 *     NextResponse.json(body, { status: 401 })
 *     json({ error, code: "AUTHENTICATION_REQUIRED" }, auth.status)
 *     refuse("...", "AUTHENTICATION_REQUIRED", auth.status)
 *
 * THE TWO DISCRIMINATIONS THAT MATTER, and why they are structural:
 *
 *   1. A literal is only "hard-coded" when the site does NOT derive that field
 *      from the refusal. The voice guard computes
 *      `auth.code === "..." ? "ORGANIZATION_SCOPE_REQUIRED" : ...` — it contains
 *      vocabulary literals, but it READS `auth.code`, so the answer is derived
 *      and exhaustive. A rule that flagged any vocabulary literal would condemn
 *      the very mapping this stage added.
 *
 *   2. A deliberate anti-enumeration `404` is not a forwarding defect.
 *      CLAUDE.md requires 404 where revealing an inaccessible resource would
 *      leak its existence, and those sites drop the refusal ON PURPOSE. The
 *      exemption is narrow: status 404 AND the refusal's own message is not
 *      carried through. A hard-coded 401 dressed the same way is still caught.
 *
 * Usage: node docs/design/stage6a/refusal-sites.mjs [file...]
 */
import fs from "node:fs";
import path from "node:path";
import tsModule from "typescript";

const ts = tsModule.default ?? tsModule;

/** Refusal codes this product emits, in either casing. */
/**
 * The refusal vocabulary, PARSED from the product's canonical list.
 *
 * This file used to keep its own copy, and the copies had drifted:
 * `INTERNAL_FAILURE` was here and missing from the browser client, so a refusal
 * the OT routes genuinely emit could not be decoded on the other side. Reading
 * the real list means a code added once is known to the detector, the client and
 * the probe together, and a drift test can prove no second list exists.
 */
export const VOCABULARY = new Set(
  (() => {
    const src = fs.readFileSync("src/lib/auth/refusal-vocabulary.ts", "utf8");
    const body = src.slice(src.indexOf("MACHINE_REFUSAL_CODES = ["), src.indexOf("] as const;"));
    const codes = [...body.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
    if (codes.length < 10) throw new Error("refusal vocabulary looks wrong: " + codes.length);
    return codes;
  })(),
);

const REFUSAL_STATUSES = new Set([400, 401, 403, 404, 409, 415, 422, 429, 500, 503]);

const isCode = (s) => typeof s === "string" && VOCABULARY.has(s.toUpperCase());

export function parse(file, source) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** Every `if ("error" in NAME)` guard, with the statement it guards. */
function findGuards(root) {
  const guards = [];
  const visit = (node) => {
    if (ts.isIfStatement(node)) {
      const e = node.expression;
      if (ts.isBinaryExpression(e)
        && e.operatorToken.kind === ts.SyntaxKind.InKeyword
        && ts.isStringLiteral(e.left) && e.left.text === "error"
        && ts.isIdentifier(e.right)) {
        guards.push({ name: e.right.text, body: node.thenStatement, node });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return guards;
}

/** Local zero-argument function declarations, for one level of delegation. */
function localZeroArgFns(root) {
  const map = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.parameters.length === 0 && node.body) {
      map.set(node.name.text, node.body);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return map;
}

/**
 * Collect the facts a refusal site exposes.
 *
 * `derivedStatus` / `derivedCode` mean the site reads `NAME.status` / `NAME.code`
 * somewhere — that is what makes any literal alongside them a mapping rather
 * than a substitution.
 */
/** Does this expression read `NAME.<prop>` anywhere inside it? */
function reads(node, name, prop) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)
      && n.expression.text === name && n.name.text === prop) { found = true; return; }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/**
 * Local `const`/`let` bindings in the site, and whether each derives from the
 * refusal. Needed because a site may compute the code into a variable first.
 */
function bindings(body, name) {
  const map = new Map();
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      map.set(n.name.text, {
        derivesCode: reads(n.initializer, name, "code"),
        derivesStatus: reads(n.initializer, name, "status"),
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(body);
  return map;
}

/**
 * Judge each RESPONSE-CONSTRUCTING call, not the site as a whole.
 *
 * The site-wide rule ("does this block mention NAME.code anywhere?") had a real
 * false negative, and the self-check found it: reverting the voice guard's
 * `refuse(message, code, auth.status)` to a hard-coded label left the now-DEAD
 * `const code = auth.code === ... ` sitting above the return. The block still
 * mentioned `auth.code`, so the site read as derived while the response being
 * built carried a literal.
 *
 * A response call is one that carries a status — `NAME.status` or a status
 * literal — and the code is judged at THAT call, from what is actually passed.
 */
function responseCalls(body, name, fns, depth = 0) {
  const binds = bindings(body, name);
  const calls = [];

  /*
   * PHASE 107 STAGE 6-A.3 — ROLE-SPECIFIC ATTRIBUTION.
   *
   * The previous version asked "does `auth.status` appear anywhere in any
   * argument?" and, if so, called the status derived. That is a false negative
   * generator, because a DIAGNOSTIC read sanitises a hard-coded field:
   *
   *     json({ diagnostic: auth.code, code: "AUTHENTICATION_REQUIRED" }, auth.status)
   *     json({ diagnosticStatus: auth.status, code: auth.code }, 401)
   *
   * In the first the code IS hard-coded; in the second the status IS. Both read
   * the refusal somewhere, and both were reported clean.
   *
   * Each role is now resolved to the ONE expression that occupies it, and only
   * that expression is judged:
   *
   *   status  ->  the `status:` property of an options object, else the single
   *               positional argument that is itself `NAME.status` or an HTTP
   *               status literal;
   *   code    ->  the `code:` property of the body object, else the single
   *               positional argument that is itself a vocabulary string,
   *               `NAME.code`, or a local bound to one.
   *
   * Reads of the refusal ELSEWHERE in the arguments are ignored entirely — they
   * are diagnostics, and a diagnostic cannot make a literal correct. A read
   * INSIDE the role expression still counts, which is what keeps an exhaustive
   * computed mapping (`auth.code === "X" ? "A" : "B"`) classified as derived.
   */
  const roleExpressions = (args) => {
    let statusExpr = null, codeExpr = null, carriesError = false;

    for (const arg of args) {
      if (reads(arg, name, "error")) carriesError = true;
      if (!ts.isObjectLiteralExpression(arg)) continue;
      for (const prop of arg.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
        if (prop.name.text === "status") statusExpr = prop.initializer;
        if (prop.name.text === "code") codeExpr = prop.initializer;
      }
    }

    // Positional roles, taken only from arguments that ARE the value — never
    // from something nested inside an object being passed as the body.
    const isStatusArg = (a) =>
      (ts.isNumericLiteral(a) && REFUSAL_STATUSES.has(Number(a.text)))
      || (ts.isPropertyAccessExpression(a) && ts.isIdentifier(a.expression)
        && a.expression.text === name && a.name.text === "status");
    const isCodeArg = (a) =>
      (ts.isStringLiteral(a) && isCode(a.text))
      || (ts.isPropertyAccessExpression(a) && ts.isIdentifier(a.expression)
        && a.expression.text === name && a.name.text === "code")
      || (ts.isIdentifier(a) && binds.has(a.text));

    if (!statusExpr) statusExpr = args.find(isStatusArg) ?? null;
    if (!codeExpr) codeExpr = args.find(isCodeArg) ?? null;
    return { statusExpr, codeExpr, carriesError };
  };

  const argFacts = (args) => {
    const { statusExpr, codeExpr, carriesError } = roleExpressions(args);

    // Derived when the ROLE EXPRESSION ITSELF reads the refusal — directly, or
    // through a local bound to it, or inside a conditional over it.
    const derivedStatus = !!statusExpr && reads(statusExpr, name, "status");
    const derivedCode = !!codeExpr && (
      reads(codeExpr, name, "code")
      || (ts.isIdentifier(codeExpr) && !!binds.get(codeExpr.text)?.derivesCode)
    );

    const statusLiterals = [];
    if (statusExpr && !derivedStatus && ts.isNumericLiteral(statusExpr)
      && REFUSAL_STATUSES.has(Number(statusExpr.text))) statusLiterals.push(Number(statusExpr.text));

    const codeLiterals = [];
    if (codeExpr && !derivedCode && ts.isStringLiteral(codeExpr) && isCode(codeExpr.text)) {
      codeLiterals.push(codeExpr.text);
    }

    return { derivedStatus, derivedCode, derivedError: carriesError, statusLiterals, codeLiterals };
  };

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      // One level of local, zero-argument delegation: `return denyAfterLookup();`
      if (depth === 0 && ts.isIdentifier(node.expression) && node.arguments.length === 0) {
        const callee = fns.get(node.expression.text);
        if (callee) calls.push(...responseCalls(callee, name, fns, depth + 1));
      }
      const f = argFacts(node.arguments);
      if (f.derivedStatus || f.statusLiterals.length) calls.push(f);
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return calls;
}

function inspect(body, name, fns) {
  const calls = responseCalls(body, name, fns);
  if (calls.length === 0) {
    return { derivedStatus: false, derivedCode: false, derivedError: false, statusLiterals: [], codeLiterals: [] };
  }
  // The worst response the site can produce is the site's verdict.
  return {
    derivedStatus: calls.every((c) => c.derivedStatus),
    derivedCode: calls.every((c) => c.derivedCode || c.codeLiterals.length === 0),
    derivedError: calls.some((c) => c.derivedError),
    statusLiterals: calls.flatMap((c) => c.statusLiterals),
    codeLiterals: calls.flatMap((c) => (c.derivedCode ? [] : c.codeLiterals)),
  };
}

export function classify(facts) {
  const literals = facts.statusLiterals;
  const only404 = literals.length > 0 && literals.every((n) => n === 404);
  // Narrow, and stated: a deliberate 404 drops the refusal on purpose and never
  // carries its message. Any other literal status, or a 404 wearing the real
  // refusal's text, remains a substitution.
  const deliberate404 = !facts.derivedStatus && only404 && !facts.derivedError;

  const statusHardCoded = !facts.derivedStatus && literals.length > 0 && !deliberate404;
  /*
   * A literal alongside a read of NAME.code is a MAPPING, not a hard-code.
   *
   * And a deliberate 404 carries its own literal by design — `deny(404,
   * "not_found")` is the whole point of the substitution, so counting that
   * string as a hard-coded refusal code condemned the exemption one line after
   * granting it. The status decision already covers this site.
   */
  const codeHardCoded = !facts.derivedCode && !deliberate404 && facts.codeLiterals.length > 0;

  return {
    statusSource: facts.derivedStatus ? "forwarded"
      : deliberate404 ? "deliberate-404"
      : statusHardCoded ? "hard-coded" : "none",
    codeSource: facts.derivedCode ? (facts.codeLiterals.length ? "mapped" : "forwarded")
      : codeHardCoded ? "literal" : "absent",
    exception: statusHardCoded || codeHardCoded,
    statusLiterals: literals,
    codeLiterals: facts.codeLiterals,
  };
}

/** Every refusal site in one file. */
export function sitesIn(file, source) {
  const root = parse(file, source);
  const fns = localZeroArgFns(root);
  return findGuards(root).map(({ name, body, node }) => ({
    guard: name,
    line: root.getLineAndCharacterOfPosition(node.getStart(root)).line + 1,
    ...classify(inspect(body, name, fns)),
  }));
}

if (import.meta.url === `file:///${process.argv[1].split(path.sep).join("/")}`) {
  for (const f of process.argv.slice(2)) {
    for (const s of sitesIn(f, fs.readFileSync(f, "utf8"))) {
      console.log(`${f}:${s.line}  guard=${s.guard} status=${s.statusSource} code=${s.codeSource}${s.exception ? "  EXCEPTION" : ""}`);
    }
  }
}
