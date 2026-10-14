/**
 * S0-B-05 scanner selftest. Runs on `node:test` with no dependency, because the
 * security worktree has no `node_modules`.
 *
 * NAMED `.selftest.mjs`, NOT `.test.mjs`, ON PURPOSE. `vitest.config.ts` sets no
 * explicit `include`, so vitest uses its default glob
 * `**\/*.{test,spec}.?(c|m)[jt]s?(x)`. A file named `*.test.mjs` would therefore
 * be collected by `npm run test` in CI and executed by vitest, which does not
 * run `node:test` suites — a green local run would become a broken CI run. The
 * name keeps this suite out of that glob.
 *
 *   node --test scripts/security/s0/__tests__/getprisma-inventory.selftest.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RULESET_VERSION,
  EXCLUDED_PATH_PREFIXES,
  isExcludedPath,
  sourceFiles,
  blankCommentsAndStrings,
  countTextualOccurrences,
  findCallSites,
  classify,
  classifyNullPath,
  secondaryTags,
  fingerprint,
  isTestPath,
  bindingNameBefore,
  hasSilentCatchFallback,
  mutatesInProcessStore,
  isSwallowingCatch,
  catchBlocks,
  enumerateIfs,
  findGuard,
  derivedBindingFrom,
  accessorReturnShape,
  overrideStatus,
  matchBrace,
  lineColOf,
  buildInventory,
  render,
  reconcile,
  consumerEdges,
  enclosingFunction,
  isFunctionBodyBrace,
  allEdges,
  gateCounters,
  primaryPartition,
  outcomeSets,
  residualScreening,
  OUTCOME_CLASSES,
  REACHABILITY_VERDICTS,
  CLASSIFICATIONS,
  RULES,
} from "../getprisma-callsite-inventory.mjs";

/**
 * The real inventory, built ONCE and shared. The consumer-edge model made a full
 * build cost about twenty-five seconds on this filesystem, so six independent
 * builds turned a six second suite into a three minute one. The determinism test
 * below still builds twice on purpose — that is the one place a second build is
 * the point.
 */
let _inventory = null;
const INVENTORY_LAZY = () => (_inventory ??= buildInventory());

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE = join(HERE, "..", "fixtures", "scenarios.fixture.txt");
const src = readFileSync(FIXTURE, "utf8");
const REL = "scripts/security/s0/fixtures/scenarios.fixture.txt";

/** Classify the fixture once, keyed by the name of the function it sits in. */
function fixtureSites() {
  const sites = findCallSites(REL, src);
  return sites.map((s) => {
    const before = src.slice(0, s.offset);
    const fn = [...before.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)].pop();
    return { name: fn ? fn[1] : "(top-level)", site: s, result: classify(s, src) };
  });
}

const byName = (() => {
  const m = new Map();
  for (const s of fixtureSites()) {
    if (!m.has(s.name)) m.set(s.name, []);
    m.get(s.name).push(s);
  }
  return m;
})();
const first = (n) => {
  const got = byName.get(n);
  assert.ok(got, `fixture has no function named ${n}`);
  return got[0].result;
};
const site = (n) => byName.get(n)[0].site;

// ───────────────────────────── tokenizer and geometry ──────────────────────────

test("ruleset version is pinned and non-empty", () => {
  assert.match(RULESET_VERSION, /^s0-b05\.\d+$/);
});

test("comments and strings are blanked, and offsets are preserved", () => {
  const out = blankCommentsAndStrings(src);
  assert.equal(out.length, src.length, "length must be preserved so line/col stay exact");
  assert.equal((out.match(/\n/g) ?? []).length, (src.match(/\n/g) ?? []).length);
  assert.ok(!/inside a string literal/.test(out), "string contents must be blanked");
  assert.ok(!/must not be counted`/.test(out), "template contents must be blanked");
  assert.ok(!/A comment mentioning/.test(out), "comment contents must be blanked");
});

test("brace matching and line/column maths are exact", () => {
  assert.equal(matchBrace("{a{b}c}", 0), 6);
  assert.equal(matchBrace("{unbalanced", 0), -1);
  assert.equal(matchBrace("(a(b)c)", 0, "(", ")"), 6);
  assert.deepEqual(lineColOf("ab\ncd", 3), { line: 2, column: 1 });
});

test("bindingNameBefore reads plain, cast and nullish-coalesced declarations", () => {
  assert.equal(bindingNameBefore("const db = await getPrisma()", 17), "db");
  assert.equal(bindingNameBefore("const db = (await getPrisma()) as T", 18), "db");
  assert.equal(bindingNameBefore("const client = opts?.client ?? (await getPrisma())", 38), "client");
  assert.equal(bindingNameBefore("return getPrisma()", 7), null);
});

// ───────────────────────────── discovery ───────────────────────────────────────

test("textual occurrences exceed real call expressions", () => {
  const textual = countTextualOccurrences(src);
  const real = findCallSites(REL, src).length;
  assert.ok(textual > real, `a naive grep over-counts: textual=${textual} real=${real}`);
});

test("the import binding and the comment/string mentions are not call sites", () => {
  const lines = findCallSites(REL, src).map((s) => s.line);
  const importLine = src.split("\n").findIndex((l) => l.includes("import { getPrisma }")) + 1;
  assert.ok(!lines.includes(importLine), "the import must not be a call site");
});

test("an identifier that merely resembles getPrisma is not a call site", () => {
  assert.ok(!byName.has("similarButUnrelatedIdentifier"),
    "`getPrismaLikeThing()` must not register as a getPrisma call site");
  assert.ok(/getPrismaLikeThing/.test(src), "the fixture must still contain the decoy");
});

test("two calls in one file are both found and classified independently", () => {
  const pair = byName.get("twoCallsOneFile");
  assert.equal(pair.length, 2);
  assert.equal(pair[0].result.classification, "DB_REQUIRED_FAIL_CLOSED");
  assert.equal(pair[1].result.classification, "EMPTY_SUCCESS_FALLBACK");
});

// ───────────────────────────── v2 shapes, still exact ──────────────────────────

test("v2 shapes keep their documented classification", () => {
  assert.equal(first("throwsWhenAbsent").classification, "DB_REQUIRED_FAIL_CLOSED");
  assert.equal(first("throwsWhenAbsent").ruleId, "R03-guard-throw");
  assert.equal(first("returns503").classification, "DB_UNAVAILABLE_RETURNS_503");
  assert.equal(first("deniesActor").classification, "AUTH_OR_SESSION_FAIL_CLOSED");
  assert.equal(first("emptyArray").classification, "EMPTY_SUCCESS_FALLBACK");
  assert.equal(first("emptyArray").confidence, "EXACT");
  assert.equal(first("returnsNull").classification, "EMPTY_SUCCESS_FALLBACK");
  assert.equal(first("returnsNull").confidence, "HIGH");
  assert.equal(first("returnsFalse").classification, "EMPTY_SUCCESS_FALLBACK");
  assert.equal(first("sessionFallback").classification, "IN_MEMORY_READ_FALLBACK");
  assert.equal(first("multilineCall").classification, "DB_REQUIRED_FAIL_CLOSED");
  assert.equal(first("noGuardAtAll").classification, "UNRESOLVED_REQUIRES_MANUAL_REVIEW");
  assert.equal(first("noGuardAtAll").ruleId, "R10-no-guard");
});

test("a throw that names a 503 is classified by the status, not by the throw", () => {
  // The ordering defect v3.0 had, pinned so it cannot come back.
  const v = classifyNullPath('{ throw new ErpError(503, "SERVICE_UNAVAILABLE"); }');
  assert.equal(v.ruleId, "R04-guard-503");
  const bare = classifyNullPath('{ throw new Error("database required"); }');
  assert.equal(bare.ruleId, "R03-guard-throw");
});

// ───────────────────────────── v3 guard discovery ──────────────────────────────

test("enumerateIfs resolves conditions, consequents and else branches", () => {
  const code = blankCommentsAndStrings(src);
  const s = site("positiveGuardWithElse");
  const ifs = enumerateIfs(code, s.offset);
  assert.ok(ifs.length > 0);
  assert.equal(ifs[0].cond, "db");
  assert.ok(ifs[0].elseSpan, "the else branch must be located");
  assert.ok(src.slice(ifs[0].elseSpan.from, ifs[0].elseSpan.to).includes("503"));
});

test("a positive guard WITH an else is classified by the else branch", () => {
  const r = first("positiveGuardWithElse");
  assert.equal(r.classification, "DB_UNAVAILABLE_RETURNS_503");
  assert.equal(r.guardShape, "POSITIVE_CLIENT_WITH_ELSE");
});

test("a positive guard with NO else stays manual and says why", () => {
  const r = first("positiveGuardNoElse");
  assert.equal(r.classification, "UNRESOLVED_REQUIRES_MANUAL_REVIEW");
  assert.equal(r.ruleId, "R16-positive-guard-no-else");
  assert.equal(r.guardShape, "POSITIVE_NO_ELSE");
  assert.match(r.reason, /fall-through/);
});

test("a negative DELEGATE guard is found and names the delegate", () => {
  const r = first("negativeDelegateGuard");
  assert.equal(r.classification, "EMPTY_SUCCESS_FALLBACK");
  assert.equal(r.guardShape, "NEGATIVE_DELEGATE");
  assert.match(r.reason, /delegate `engineeringCase`/);
});

test("a positive DELEGATE guard with an else is classified by the else branch", () => {
  const r = first("positiveDelegateGuardWithElse");
  assert.equal(r.classification, "EMPTY_SUCCESS_FALLBACK");
  assert.equal(r.guardShape, "POSITIVE_DELEGATE_WITH_ELSE");
});

test("optional chaining with no guard at all is not treated as a guard", () => {
  const r = first("optionalChainNoGuard");
  assert.equal(r.classification, "UNRESOLVED_REQUIRES_MANUAL_REVIEW");
  assert.equal(r.ruleId, "R10-no-guard");
});

test("one derivation hop is followed; the shape records that it was derived", () => {
  const code = blankCommentsAndStrings(src);
  assert.equal(derivedBindingFrom(code, site("derivedBindingGuard").offset, "db"), "repo");
  const r = first("derivedBindingGuard");
  assert.equal(r.classification, "DB_REQUIRED_FAIL_CLOSED");
  assert.equal(r.guardShape, "DERIVED_ONE_HOP:NEGATIVE_CLIENT");
  assert.match(r.reason, /via the derived binding `repo`/);
});

test("a ternary delegate narrowing is followed to its guard", () => {
  const r = first("derivedTernaryGuard");
  assert.equal(r.classification, "IN_MEMORY_READ_FALLBACK");
  assert.equal(r.guardShape, "DERIVED_ONE_HOP:NEGATIVE_CLIENT");
});

test("a nullish-coalesced client is BOUND, even when its null path stays manual", () => {
  // `const client = opts?.client ?? (await getPrisma())` could not be bound at all
  // in v2, so the site was never guard-searched. v3 binds it and FINDS the guard;
  // the null path here returns `{ claimed: 0, delivered: 0 }`, a shaped object
  // whose emptiness is not readable from the span, so it correctly stays manual.
  // The point of this scenario is the binding, not the verdict.
  const r = first("nullishCoalescedClient");
  assert.equal(r.guardShape, "NEGATIVE_CLIENT", "the guard on the coalesced binding must be found");
  assert.equal(r.ruleId, "R19-named-or-shaped-return");
  assert.equal(r.classification, "UNRESOLVED_REQUIRES_MANUAL_REVIEW");
});

test("a guard inside a nested function declaration is still found", () => {
  const r = first("inner");
  assert.equal(r.classification, "EMPTY_SUCCESS_FALLBACK");
});

// ───────────────────────────── exception paths ─────────────────────────────────

test("an unlogged catch that swallows outright is SILENT_EXCEPTION_FALLBACK", () => {
  const r = first("emptyCatchSwallow");
  assert.equal(r.classification, "SILENT_EXCEPTION_FALLBACK");
  assert.equal(r.ruleId, "R21-silent-exception");
  assert.equal(r.guardShape, "SWALLOWING_CATCH");
});

test("isSwallowingCatch separates a swallow from a logged or returning catch", () => {
  const code = blankCommentsAndStrings(src);
  const swallow = catchBlocks(code, site("emptyCatchSwallow").offset).find((s) => isSwallowingCatch(src, s));
  assert.ok(swallow, "the empty catch must be detected");
  const logged = catchBlocks(code, site("catchWithLog").offset);
  assert.ok(logged.every((s) => !isSwallowingCatch(src, s)), "a logged catch is not a swallow");
  const returning = catchBlocks(code, site("catchWithReadFallback").offset);
  assert.ok(returning.every((s) => !isSwallowingCatch(src, s)),
    "a catch that RETURNS a fallback is classified by that fallback, not as a swallow");
});

test("a catch with a read fallback classifies as an in-memory READ", () => {
  assert.equal(first("catchWithReadFallback").classification, "IN_MEMORY_READ_FALLBACK");
});

test("a catch with a WRITE fallback classifies as an in-memory WRITE", () => {
  const r = first("writeFallbackInSilentCatch");
  assert.equal(r.classification, "IN_MEMORY_WRITE_FALLBACK");
  assert.equal(r.ruleId, "R20-in-memory-write");
});

test("mutatesInProcessStore recognises a store mutation and rejects a store read", () => {
  assert.equal(mutatesInProcessStore("return fallback.create(input);"), true);
  assert.equal(mutatesInProcessStore("return sessionStore.update(id, patch);"), true);
  assert.equal(mutatesInProcessStore("globalThis.__hermesCaseDrafts.push(row);"), true);
  assert.equal(mutatesInProcessStore("return fallback.list();"), false);
  assert.equal(mutatesInProcessStore("return sessionStore;"), false);
});

test("a nested try/catch does not confuse the catch scanner", () => {
  const code = blankCommentsAndStrings(src);
  const spans = catchBlocks(code, site("nestedTryCatch").offset);
  assert.ok(spans.length >= 2, "both catch blocks must be found");
  for (const s of spans) assert.ok(s.to > s.from && s.to <= code.length);
  assert.equal(first("nestedTryCatch").classification, "EMPTY_SUCCESS_FALLBACK");
});

test("hasSilentCatchFallback still distinguishes silent from logged", () => {
  const code = blankCommentsAndStrings(src);
  assert.equal(hasSilentCatchFallback(code, site("writeFallbackInSilentCatch").offset), true);
  assert.equal(hasSilentCatchFallback(code, site("catchWithLog").offset), false);
});

// ───────────────────────────── result objects stay manual ──────────────────────

test("every result-object refusal stays manual, whatever its caller does", () => {
  // The scanner cannot trace callers, so it must NOT distinguish these three —
  // and must not declare any of them fail-closed on shape alone.
  for (const fn of ["resultObjectMappedTo503", "resultObjectMappedTo200", "resultObjectWithNoProvableCaller"]) {
    const r = first(fn);
    assert.equal(r.classification, "UNRESOLVED_REQUIRES_MANUAL_REVIEW", `${fn} must stay manual`);
    assert.equal(r.ruleId, "R18-result-object-refusal", `${fn} must be narrowed to R18`);
    assert.equal(r.confidence, "MANUAL");
    assert.match(r.reason, /depends on the caller/);
  }
});

test("a transaction callback whose refusal is a result object stays manual", () => {
  const r = first("transactionCallback");
  assert.equal(r.ruleId, "R18-result-object-refusal");
  assert.ok(secondaryTags(site("transactionCallback"), src, r.classification).includes("TRANSACTIONAL"));
});

test("a result object is never auto-classified as safe by any rule", () => {
  for (const shape of [
    '{ return { ok: false, error: "db-unavailable" }; }',
    '{ return { success: false, error: "x" }; }',
    '{ return { applied: false, reason: "NO_DB" }; }',
    '{ return { affected: 0 }; }',
    '{ return { consumed: false }; }',
  ]) {
    const v = classifyNullPath(shape);
    const rule = RULES.find((r) => r.id === v.ruleId);
    assert.equal(rule.classification, "UNRESOLVED_REQUIRES_MANUAL_REVIEW", `${shape} must not resolve`);
  }
});

// ───────────────────────────── literals never become control flow ──────────────

test("a string literal full of refusal tokens does not change the verdict", () => {
  const r = first("literalContainingRefusalCode");
  assert.equal(r.classification, "EMPTY_SUCCESS_FALLBACK",
    "the `return []` guard decides; the literal below it must be inert");
  assert.equal(r.ruleId, "R07-guard-empty-array");
});

test("a guard written inside a comment is not read as a guard", () => {
  const r = first("commentContainingFakeGuard");
  assert.equal(r.classification, "UNRESOLVED_REQUIRES_MANUAL_REVIEW");
  assert.equal(r.ruleId, "R10-no-guard");
});

// ───────────────────────────── accessor shapes ─────────────────────────────────

test("a direct accessor return is recognised as carrying no decision", () => {
  const code = blankCommentsAndStrings(src);
  const shape = accessorReturnShape(code, site("unboundCall").offset);
  assert.ok(shape, "`return getPrisma();` must be recognised");
  const r = first("unboundCall");
  assert.equal(r.classification, "WRAPPER_OR_FACTORY");
  assert.equal(r.ruleId, "R15-accessor-return");
});

test("findGuard returns null when the binding is never tested", () => {
  const code = blankCommentsAndStrings(src);
  assert.equal(findGuard(code, site("noGuardAtAll").offset, "db"), null);
  assert.equal(findGuard(code, 0, null), null);
});

// ───────────────────────────── invariants ──────────────────────────────────────

test("an unresolved call site is never coerced to a safe classification", () => {
  for (const s of fixtureSites()) {
    if (/^R(10|11|16|18|19|23)/.test(s.result.ruleId)) {
      assert.equal(s.result.classification, "UNRESOLVED_REQUIRES_MANUAL_REVIEW");
      assert.equal(s.result.confidence, "MANUAL");
    }
  }
});

test("every rule that can decide maps to a declared classification", () => {
  for (const r of RULES) {
    if (r.classification === null) continue; // derived at classification time
    assert.ok(CLASSIFICATIONS.includes(r.classification), `${r.id} -> ${r.classification}`);
    assert.ok(["EXACT", "HIGH", "MANUAL"].includes(r.confidence));
  }
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length, "rule ids must be unique");
});

test("every classification emitted for the fixture is in the declared closed set", () => {
  for (const s of fixtureSites()) assert.ok(CLASSIFICATIONS.includes(s.result.classification));
});

test("read, write and tenant tags are derived from the surrounding calls", () => {
  const w = byName.get("writeFallbackInSilentCatch")[0];
  assert.ok(secondaryTags(w.site, src, w.result.classification).includes("WRITE"));
  const r = byName.get("emptyArray")[0];
  const tags = secondaryTags(r.site, src, r.result.classification);
  assert.ok(tags.includes("READ"));
  assert.ok(tags.includes("TENANT_SCOPED"), "organizationId in the window implies TENANT_SCOPED");
  const sc = byName.get("emptyCatchSwallow")[0];
  assert.ok(secondaryTags(sc.site, src, sc.result.classification).includes("SILENT_CATCH"));
});

test("identifiers are stable and fingerprints change only with the source", () => {
  const a = findCallSites(REL, src)[0];
  const b = findCallSites(REL, src)[0];
  assert.equal(a.line, b.line);
  assert.equal(a.column, b.column);
  assert.equal(fingerprint(src, a.offset), fingerprint(src, b.offset));
  const moved = src.replace('if (!db) throw new Error("database required");',
                            'if (!db) throw new Error("CHANGED");');
  assert.notEqual(fingerprint(moved, a.offset), fingerprint(src, a.offset),
    "editing the guard must invalidate the fingerprint");
});

test("an adjudication pinned to an old fingerprint is reported STALE, not applied", () => {
  const fp = fingerprint(src, findCallSites(REL, src)[0].offset);
  assert.equal(overrideStatus({ sourceFingerprint: fp }, fp), "APPLY");
  assert.equal(overrideStatus({ sourceFingerprint: "0000000000000000" }, fp), "STALE");
});

test("test paths are recognised by every repository convention in use", () => {
  assert.equal(isTestPath("src/lib/x/__tests__/y.test.ts"), true);
  assert.equal(isTestPath("scripts/__tests__/a.test.ts"), true);
  assert.equal(isTestPath("src/lib/ot-edge/testing/harness.ts"), true);
  assert.equal(isTestPath("src/lib/db/prisma.ts"), false);
});

// ───────────────────────────── whole-inventory contract ────────────────────────

test("generate is deterministic: two builds render byte-identical output", () => {
  const one = render(buildInventory());
  const two = render(buildInventory());
  assert.equal(one, two, "a second render must be byte-identical");
});

test("the rendered inventory contains no timestamp, absolute path or drive letter", () => {
  const out = render(INVENTORY_LAZY());
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(out), "no ISO timestamp");
  // A drive letter followed by a separator AND a path character. The narrower
  // form matters: the inventory legitimately contains JSON-escaped prose such as
  // `outcome:\"IGNORED\"`, in which `e:\"` would match a looser pattern.
  assert.ok(!/[A-Za-z]:[\\/][A-Za-z0-9_.$-]/.test(out), "no drive letter or absolute path");
  assert.ok(!/\\\\/.test(out), "no escaped backslash path separators");
  assert.ok(!/Users[\\/]/.test(out), "no user directory");
  assert.ok(!out.includes("hermes-security-dragon"), "no worktree name leaked into the evidence");
});

test("records are sorted lexicographically by id", () => {
  const { records } = INVENTORY_LAZY();
  const ids = records.map((r) => r.id);
  assert.deepEqual(ids, [...ids].sort(), "records must be lexicographically ordered");
});

test("every record carries the fields the contract promises", () => {
  const { records } = INVENTORY_LAZY();
  assert.ok(records.length > 0);
  for (const r of records.slice(0, 60)) {
    for (const k of ["id", "file", "line", "column", "fingerprint", "ruleId", "guardShape", "autoConfidence",
                     "classification", "confidence", "reason", "evidence",
                     "controlFlow", "secondaryTags", "testOnly", "accessorConsumers"]) {
      assert.ok(Object.hasOwn(r, k), `record ${r.id} is missing ${k}`);
    }
    assert.ok(["EXACT", "HIGH", "MANUAL"].includes(r.confidence));
  }
});

test("no adjudication is stale or orphaned", () => {
  const inv = INVENTORY_LAZY();
  assert.deepEqual(inv.staleOverrides, [], "a stale adjudication invalidates the inventory");
  assert.deepEqual(inv.orphanOverrides, [], "an orphan adjudication has no subject");
});

test("every manual adjudication carries line evidence, a caller path and a terminal behaviour", () => {
  const { records } = INVENTORY_LAZY();
  const adjudicated = records.filter((r) => r.adjudication);
  assert.ok(adjudicated.length > 0);
  for (const r of adjudicated) {
    assert.ok(r.adjudication.reason && r.adjudication.reason.length > 40, `${r.id} reason too thin`);
    assert.match(r.adjudication.evidence, /:\d+|\bnone\b|no other reference/, `${r.id} evidence has no line reference`);
    assert.ok(typeof r.adjudication.callerPath === "string" && r.adjudication.callerPath.length > 0,
      `${r.id} has no caller path`);
    assert.ok(typeof r.adjudication.terminalBehavior === "string" && r.adjudication.terminalBehavior.length > 0,
      `${r.id} has no terminal behaviour`);
    assert.equal(r.adjudication.reviewer, "S0 manual adjudication");
  }
});

test("coverage is complete: no call site is left unresolved", () => {
  const { records } = INVENTORY_LAZY();
  const open = records.filter((r) => r.classification === "UNRESOLVED_REQUIRES_MANUAL_REVIEW");
  assert.deepEqual(open.map((r) => r.id), [], "every call site must be adjudicated");
});

test("the DB-F1 and DB-F2 reconciliation is generated, not asserted", () => {
  const { dbF1, dbF2 } = reconcile();
  assert.equal(typeof dbF1.fallbackPoints, "number");
  assert.ok(dbF1.fallbackPoints > 0 && dbF1.bareCatches > 0);
  assert.equal(Object.keys(dbF1.perFile).length, 6, "six storage repository files");
  assert.ok(dbF2.total > 0 && Object.keys(dbF2.perFile).length > 0);
  // The per-file numbers must sum to the reported totals, so a total can never
  // drift from the evidence behind it.
  const sum = Object.values(dbF1.perFile).reduce((a, b) => a + b.fallbackPoints, 0)
    + Object.values(dbF1.independent).reduce((a, b) => a + b.databaseModeFailurePath, 0);
  assert.equal(sum, dbF1.fallbackPoints);
  assert.equal(Object.values(dbF2.perFile).reduce((a, b) => a + b, 0), dbF2.total);
});

// ───────────────────── consumer-edge model (v3.1) ─────────────────────────────

/** The two same-named accessors in the fixture, with their declaration offsets. */
function fixtureAccessors() {
  const code = blankCommentsAndStrings(src);
  const out = [];
  for (const s of findCallSites(REL, src)) {
    const fn = enclosingFunction(code, s.offset);
    if (!fn || fn.name !== "model" || fn.exported) continue;
    const id = `${REL}#L${s.line}C${s.column}`;
    out.push({ id, fn, edges: consumerEdges(code, src, REL, id, fn.name, fn.at) });
  }
  return out;
}

test("isFunctionBodyBrace accepts a TypeScript return type and rejects a control block", () => {
  const cases = [
    ["function f(a: X): Promise<Y> {", true],
    ["async function model(): Promise<M | null> {", true],
    ["function g(owner: Owner | null): Repository<A, B> {", true],
    ["async list() {", true],
    ["const f = async () => {", true],
    ["if (!db) {", false],
    ["for (const x of y) {", false],
    ["while (go) {", false],
    ["catch (e) {", false],
    ["switch (k) {", false],
    ["try {", false],
  ];
  for (const [line, expected] of cases) {
    assert.equal(isFunctionBodyBrace(line, line.lastIndexOf("{")), expected, JSON.stringify(line));
  }
});

test("two same-named accessors in one file do not share consumers", () => {
  const acc = fixtureAccessors();
  assert.ok(acc.length >= 2, "the fixture must declare two local `model()` accessors");
  const mixed = acc.find((a) => a.edges.some((e) => e.consumerFunction === "list"));
  const other = acc.find((a) => a.edges.some((e) => e.consumerFunction === "count"));
  assert.ok(mixed && other, "each accessor must own its own consumers");
  assert.notEqual(mixed.id, other.id);
  assert.ok(!mixed.edges.some((e) => e.consumerFunction === "count"),
    "the mixed factory must NOT be handed the other factory's consumer");
  assert.ok(!other.edges.some((e) => e.consumerFunction === "list"),
    "the other factory must NOT be handed the mixed factory's consumers");
});

test("a wrapper publishes a read fallback, a write fallback and a fail-closed consumer separately", () => {
  const mixed = fixtureAccessors().find((a) => a.edges.some((e) => e.consumerFunction === "list"));
  const by = (fn, path) => mixed.edges.find((e) => e.consumerFunction === fn && e.edgePath === path);

  // read fallback
  assert.equal(by("list", "NULL_GUARD").classification, "IN_MEMORY_READ_FALLBACK");
  assert.equal(by("list", "EXCEPTION_SILENT").classification, "IN_MEMORY_READ_FALLBACK");
  assert.equal(by("list", "NULL_GUARD").operation, "READ");

  // write fallback — same wrapper, different consumer
  assert.equal(by("create", "NULL_GUARD").classification, "IN_MEMORY_WRITE_FALLBACK");
  assert.equal(by("create", "EXCEPTION_SILENT").classification, "IN_MEMORY_WRITE_FALLBACK");
  assert.equal(by("create", "NULL_GUARD").operation, "WRITE");

  // fail-closed consumer — same wrapper again
  assert.equal(by("publish", "NULL_GUARD").classification, "DB_REQUIRED_FAIL_CLOSED");
});

test("an unreadable consumer stays unresolved and is never inferred from its siblings", () => {
  const mixed = fixtureAccessors().find((a) => a.edges.some((e) => e.consumerFunction === "list"));
  const e = mixed.edges.find((x) => x.consumerFunction === "reconcile" && x.edgePath === "NULL_GUARD");
  assert.ok(e, "the result-object consumer must produce an edge");
  assert.equal(e.classification, "UNRESOLVED_REQUIRES_MANUAL_REVIEW");
  assert.equal(e.ruleId, "R18-result-object-refusal");
  assert.equal(e.manuallyTraced, false);
  assert.equal(e.terminalBoundary, null,
    "an untraced edge must carry no terminal boundary — the gate depends on that");
});

test("an unconditional delegation is a distinct edge path, not an outage fallback", () => {
  const mixed = fixtureAccessors().find((a) => a.edges.some((e) => e.consumerFunction === "list"));
  const e = mixed.edges.find((x) => x.edgePath === "UNCONDITIONAL_DELEGATION");
  assert.ok(e, "`return fallback.delete(id)` with no guard and no try must be its own path");
  assert.ok(e.secondaryTags.includes("NOT_AN_OUTAGE_PATH"));
});

test("multiple consumer behaviours are NOT collapsed into one classification", () => {
  const mixed = fixtureAccessors().find((a) => a.edges.some((e) => e.consumerFunction === "list"));
  const distinct = new Set(mixed.edges.map((e) => e.classification));
  assert.ok(distinct.size >= 4,
    `the wrapper's consumers must keep their own verdicts, got ${[...distinct].join(", ")}`);
  assert.ok(distinct.has("IN_MEMORY_READ_FALLBACK"));
  assert.ok(distinct.has("IN_MEMORY_WRITE_FALLBACK"));
  assert.ok(distinct.has("DB_REQUIRED_FAIL_CLOSED"));
  assert.ok(distinct.has("UNRESOLVED_REQUIRES_MANUAL_REVIEW"));
});

test("the call site itself stays WRAPPER_OR_FACTORY and only RANKS its consumers", () => {
  const code = blankCommentsAndStrings(src);
  const s = findCallSites(REL, src).find((x) => {
    const fn = enclosingFunction(code, x.offset);
    return fn && fn.name === "model" && !fn.exported;
  });
  const r = classify(s, src);
  assert.equal(r.classification, "WRAPPER_OR_FACTORY",
    "a wrapper must not be published as its worst consumer");
  assert.ok(Array.isArray(r.consumerEdges) && r.consumerEdges.length >= 4);
  assert.ok(r.accessorConsumers.highestConsumerRisk,
    "highestConsumerRisk is a ranking convenience and must still be present");
  assert.equal(r.accessorConsumers.total, r.consumerEdges.length);
});

test("consumerEdges generation is deterministic and ordered", () => {
  const code = blankCommentsAndStrings(src);
  const s = findCallSites(REL, src).find((x) => {
    const fn = enclosingFunction(code, x.offset);
    return fn && fn.name === "model" && !fn.exported;
  });
  const fn = enclosingFunction(code, s.offset);
  const id = `${REL}#L${s.line}C${s.column}`;
  const a = consumerEdges(code, src, REL, id, fn.name, fn.at);
  const b = consumerEdges(code, src, REL, id, fn.name, fn.at);
  assert.deepEqual(a, b, "two extractions must be identical");
  assert.deepEqual(a.map((e) => e.consumerEdgeId), [...a.map((e) => e.consumerEdgeId)].sort(),
    "edges must be lexicographically ordered by id");
  assert.equal(new Set(a.map((e) => e.consumerEdgeId)).size, a.length, "edge ids must be unique");
});

test("a consumer-edge trace pinned to an old fingerprint is STALE, not applied", () => {
  const code = blankCommentsAndStrings(src);
  const s = findCallSites(REL, src).find((x) => {
    const fn = enclosingFunction(code, x.offset);
    return fn && fn.name === "model" && !fn.exported;
  });
  const fn = enclosingFunction(code, s.offset);
  const edge = consumerEdges(code, src, REL, `${REL}#L${s.line}C${s.column}`, fn.name, fn.at)[0];
  assert.equal(overrideStatus({ sourceFingerprint: edge.sourceFingerprint }, edge.sourceFingerprint), "APPLY");
  assert.equal(overrideStatus({ sourceFingerprint: "0000000000000000" }, edge.sourceFingerprint), "STALE");
  // and the fingerprint must actually move when the edge's own code changes
  const moved = src.replace("      if (!m) return fallback.create(input);",
                            "      if (!m) return fallback.create({ ...input, changed: true });");
  const movedEdges = consumerEdges(blankCommentsAndStrings(moved), moved, REL,
    `${REL}#L${s.line}C${s.column}`, fn.name, fn.at);
  const before = edge.consumerEdgeId;
  const after = movedEdges.find((e) => e.consumerEdgeId === before);
  if (after) assert.notEqual(after.sourceFingerprint, edge.sourceFingerprint,
    "editing an edge must invalidate its fingerprint");
});

test("every edge in the real inventory carries the contracted fields", () => {
  const edges = allEdges(INVENTORY_LAZY().records);
  assert.ok(edges.length > 0);
  for (const e of edges) {
    for (const k of ["consumerEdgeId", "consumerPath", "consumerFunction", "edgePath", "operation",
                     "line", "classification", "secondaryTags", "evidence", "sourceFingerprint",
                     "terminalBoundary", "manuallyTraced"]) {
      assert.ok(Object.hasOwn(e, k), `${e.consumerEdgeId} is missing ${k}`);
    }
    assert.ok(["NULL_GUARD", "EXCEPTION_SILENT", "EXCEPTION_LOGGED", "UNCONDITIONAL_DELEGATION"].includes(e.edgePath));
  }
});

test("every traced edge records a terminal boundary, a caller path and a durability outcome", () => {
  for (const e of allEdges(INVENTORY_LAZY().records).filter((x) => x.manuallyTraced)) {
    assert.ok(e.terminalBoundary && e.terminalBoundary.length > 3, `${e.consumerEdgeId} has no terminal boundary`);
    assert.ok(e.callerPath && e.callerPath.length > 0, `${e.consumerEdgeId} has no caller path`);
    assert.ok(e.durability && e.durability.length > 0, `${e.consumerEdgeId} has no durability outcome`);
    assert.ok(e.retryBehavior && e.retryBehavior.length > 0, `${e.consumerEdgeId} has no retry outcome`);
    assert.match(e.evidence, /:\d+/, `${e.consumerEdgeId} evidence has no line reference`);
    assert.equal(e.reviewer, "S0 manual adjudication");
  }
});

test("the coverage gate is zero on every counter it enforces", () => {
  const g = gateCounters(INVENTORY_LAZY().records);
  assert.equal(g.highImpactHighUntraced, 0, "a high-impact HIGH site must be traced, not merely classified");
  assert.equal(g.highImpactUnresolved, 0);
  assert.equal(g.consumerEdgesUntraced, 0);
  assert.deepEqual(INVENTORY_LAZY().staleOverrides, []);
  assert.deepEqual(INVENTORY_LAZY().orphanOverrides, []);
  assert.deepEqual(INVENTORY_LAZY().staleEdges, []);
  assert.deepEqual(INVENTORY_LAZY().orphanEdges, []);
});

test("a HIGH-confidence verdict on an impact path cannot satisfy the gate by itself", () => {
  // The invariant the reopened review turned on: syntactic classification is not
  // a semantic trace. Strip the adjudications and the gate must reopen.
  const stripped = INVENTORY_LAZY().records.map((r) => ({ ...r, adjudication: null }));
  const g = gateCounters(stripped);
  assert.ok(g.highImpactHighUntraced > 0,
    "without its traces the inventory must report open high-impact sites");
});

test("DB-F1 is reproduced from consumer edges, with its composition visible", () => {
  const { dbF1 } = reconcile();
  const files = Object.keys(dbF1.perFile);
  assert.equal(files.length, 6);
  const edges = allEdges(INVENTORY_LAZY().records).filter((e) => files.includes(e.consumerPath));
  const uncond = edges.filter((e) => e.edgePath === "UNCONDITIONAL_DELEGATION").length;
  const grepTotal = Object.values(dbF1.perFile).reduce((a, b) => a + b.fallbackPoints, 0);
  assert.equal(edges.length, grepTotal,
    `edge count ${edges.length} must equal the ${grepTotal} \`return fallback.\` statements in the same six files`);
  assert.ok(uncond > 0, "the unconditional delegations must be visible, not folded into the outage count");
});

test("DB-F2 keeps the legacy single-line count AND reports the semantic extent", () => {
  const { dbF2, dbF2Semantic } = reconcile();
  assert.equal(dbF2Semantic.legacyTotal, dbF2.total, "the legacy number must stay comparable");
  assert.ok(dbF2Semantic.total > dbF2.total,
    "the semantic count must be strictly larger, or the split is pointless");
  assert.ok(Object.keys(dbF2Semantic.additional).length > 0);
});

// ─────────────── accounting invariants (v3.2 / s0-b05.5) ─────────────────────

test("the primary classification is an exact partition of the call sites", () => {
  const pp = primaryPartition(INVENTORY_LAZY().records);
  assert.equal(pp.sum, pp.total, `sum ${pp.sum} must equal the ${pp.total} call sites`);
  assert.equal(pp.delta, 0);
  assert.deepEqual(pp.missingPrimaryIds, []);
  assert.deepEqual(pp.duplicatePrimaryIds, []);
  assert.deepEqual(pp.classificationsOutsideClosedSet, []);
  // and the per-class counts must themselves sum to the total, so a table
  // transcribed from this report can be checked against it
  assert.equal(Object.values(pp.counts).reduce((a, b) => a + b, 0), pp.total);
});

test("a call site with no primary classification fails the partition", () => {
  const records = [{ id: "a#L1C1", classification: "TEST_ONLY", secondaryTags: [] },
                   { id: "b#L1C1", classification: null, secondaryTags: [] }];
  const pp = primaryPartition(records);
  assert.deepEqual(pp.missingPrimaryIds, ["b#L1C1"]);
  assert.equal(pp.delta, 1, "the missing record must open a delta");
});

test("a call site counted twice fails the partition", () => {
  const records = [{ id: "a#L1C1", classification: "TEST_ONLY", secondaryTags: [] },
                   { id: "a#L1C1", classification: "TEST_ONLY", secondaryTags: [] }];
  const pp = primaryPartition(records);
  assert.deepEqual(pp.duplicatePrimaryIds, ["a#L1C1"]);
});

test("a classification outside the declared closed set fails the partition", () => {
  const pp = primaryPartition([{ id: "a#L1C1", classification: "INVENTED_CLASS", secondaryTags: [] }]);
  assert.equal(pp.classificationsOutsideClosedSet.length, 1);
  assert.equal(pp.delta, 1);
});

test("every outcome set is a set of unique structured ids", () => {
  const oc = outcomeSets(INVENTORY_LAZY().records);
  for (const c of OUTCOME_CLASSES) {
    const ids = oc.sets[c];
    assert.equal(new Set(ids).size, ids.length, `${c} contains a repeat`);
    for (const id of ids) assert.match(id, /^(?:callsite|edge):/, `${id} is not a structured id`);
    assert.equal(oc.totals[c], ids.length);
  }
  assert.deepEqual(oc.duplicateIds, []);
  assert.deepEqual(oc.orphanIds, []);
  assert.deepEqual(oc.staleIds, []);
});

test("one id may belong to several outcome sets but never twice to one", () => {
  const oc = outcomeSets(INVENTORY_LAZY().records);
  const seenIn = new Map();
  for (const c of OUTCOME_CLASSES) for (const id of oc.sets[c]) {
    seenIn.set(id, (seenIn.get(id) ?? 0) + 1);
  }
  const multi = [...seenIn.values()].filter((n) => n > 1).length;
  assert.ok(multi > 0, "cross-outcome membership is expected and permitted");
  // the prohibition is only within a set, already asserted above
});

test("a wrapper call site can never enter an outcome set", () => {
  // The dedup rule: a wrapper's outcome is carried by its consumer edges, so
  // counting the wrapper too would count one behaviour twice.
  const records = INVENTORY_LAZY().records.map((r) =>
    r.classification === "WRAPPER_OR_FACTORY" && r.consumerEdges?.length
      ? { ...r, adjudication: { ...(r.adjudication ?? {}), outcomeFlags: ["AUDIT_LOSS"] } }
      : r);
  const oc = outcomeSets(records);
  assert.ok(oc.duplicateIds.some((x) => x.startsWith("WRAPPER_WOULD_DOUBLE_COUNT:")),
    "a flagged wrapper must be rejected, not counted");
});

test("an outcome id naming a call site that does not exist is an orphan", () => {
  const records = [{
    id: "a#L1C1", classification: "EMPTY_SUCCESS_FALLBACK", secondaryTags: [], consumerEdges: null,
    adjudication: { outcomeFlags: ["AUDIT_LOSS"], fingerprintMatched: true },
  }];
  const ok = outcomeSets(records);
  assert.deepEqual(ok.orphanIds, [], "a flag on a real record is not an orphan");
  const bad = outcomeSets([{ ...records[0], id: "a#L1C1" }]);
  assert.equal(bad.totals.AUDIT_LOSS, 1);
  // an unknown outcome name is reported rather than silently dropped
  const unknown = outcomeSets([{ ...records[0], adjudication: { outcomeFlags: ["NOT_AN_OUTCOME"], fingerprintMatched: true } }]);
  assert.equal(unknown.orphanIds.length, 1);
});

test("the residual set is fully screened and the reachability vocabulary is closed", () => {
  const rs = residualScreening(INVENTORY_LAZY().records);
  assert.deepEqual(rs.unscreenedIds, [], "an unscreened residual keeps B-05 open");
  assert.equal(rs.byVerdict.UNKNOWN_REACHABILITY, 0);
  assert.equal(Object.values(rs.byVerdict).reduce((a, b) => a + b, 0), rs.total);
  assert.equal(rs.requiredFullTraceMinusCompleted, 0);
  assert.deepEqual(rs.missingFullTraceIds, []);
  for (const r of INVENTORY_LAZY().records) {
    if (!r.reachability) continue;
    assert.ok(REACHABILITY_VERDICTS.includes(r.reachability.verdict), `${r.id} -> ${r.reachability.verdict}`);
    assert.ok(r.reachability.caller && r.reachability.caller.length > 0, `${r.id} has no caller`);
    assert.ok(r.reachability.terminalSurface && r.reachability.terminalSurface.length > 0, `${r.id} has no terminal surface`);
    assert.ok(r.reachability.reason && r.reachability.reason.length > 40, `${r.id} reason too thin`);
    assert.match(r.reachability.evidence, /:\d+|\bnone\b|no other reference|no consumer/, `${r.id} evidence has no line reference`);
    assert.equal(r.reachability.screenedBy, "S0 residual reachability screening");
  }
});

test("a residual verdict that demands a full trace is not satisfied without one", () => {
  const base = { id: "a#L1C1", autoConfidence: "HIGH", confidence: "HIGH", secondaryTags: ["READ"], adjudication: null };
  for (const v of ["AUTHENTICATED_USER_VISIBLE", "PUBLICLY_REACHABLE", "SECURITY_CONTROL_DEPENDENCY"]) {
    const open = residualScreening([{ ...base, reachability: { verdict: v, fullTrace: false } }]);
    assert.equal(open.requiredFullTraceMinusCompleted, 1, `${v} must demand a trace`);
    const done = residualScreening([{ ...base, reachability: { verdict: v, fullTrace: true } }]);
    assert.equal(done.requiredFullTraceMinusCompleted, 0);
  }
  // an internal pure read may stay a disclosed residual with no full trace
  const internal = residualScreening([{ ...base, reachability: { verdict: "INTERNAL_ONLY_PURE_READ", fullTrace: false } }]);
  assert.equal(internal.requiredFullTrace, 0);
  // an unscreened residual is UNKNOWN and keeps the gate open
  const unscreened = residualScreening([{ ...base, reachability: null }]);
  assert.equal(unscreened.byVerdict.UNKNOWN_REACHABILITY, 1);
  assert.deepEqual(unscreened.unscreenedIds, ["a#L1C1"]);
});

test("the residual screening found and corrected real misclassifications", () => {
  // The screening is not a formality: it reclassified twelve security-control
  // dependencies the rule set had filed as empty successes, which is why
  // AUTH_OR_SESSION_FAIL_CLOSED is no longer zero.
  const { records } = INVENTORY_LAZY();
  const auth = records.filter((r) => r.classification === "AUTH_OR_SESSION_FAIL_CLOSED");
  assert.ok(auth.length >= 4, "the session, org, site and academy scope denials must be classified as denials");
  const sess = records.find((r) => r.id === "src/lib/auth/session-store.ts#L105C20");
  assert.ok(sess, "isSessionActive must be in the inventory");
  assert.equal(sess.classification, "AUTH_OR_SESSION_FAIL_CLOSED");
  assert.equal(sess.autoConfidence, "HIGH", "the rule's own verdict must still be visible");
  assert.notEqual(sess.ruleId, undefined);
  assert.ok(sess.adjudication, "and it must carry the manual trace that corrected it");
});

// ──────── the tool must not scan itself (s0-b05.5 corrective fix) ───────────
//
// The first commit of this tool made its own files TRACKED, so `git ls-files`
// started offering them to the scanner and the scanner read this very selftest:
// 392 call sites became 394 and 835 textual occurrences became 877. Both extra
// sites were false positives — one `//` comment and one string literal, the
// documented regex-literal limitation of the tokenizer. The remedy is to never
// offer the tool's own subtree to the scanner at all.

test("isExcludedPath covers the tool's own subtree and nothing that merely resembles it", () => {
  assert.deepEqual([...EXCLUDED_PATH_PREFIXES], ["scripts/security/s0/"]);
  for (const p of [
    "scripts/security/s0/getprisma-callsite-inventory.mjs",
    "scripts/security/s0/__tests__/getprisma-inventory.selftest.mjs",
    "scripts/security/s0/fixtures/scenarios.fixture.txt",
    "scripts/security/s0/getprisma-manual-adjudications.json",
    "scripts/security/s0",
  ]) {
    assert.equal(isExcludedPath(p), true, `${p} must be excluded`);
  }

  // It is a PATH prefix, not a directory NAME. Adding a bare "s0" to SKIP_DIR
  // would silently have dropped every one of these the day one was created.
  for (const p of [
    "scripts/security/check-env-example.mjs",
    "scripts/security/phase99/route-inventory.mjs",
    "scripts/security/phase100/closure-evaluation.mjs",
    "scripts/security/s0extra/thing.mjs",
    "scripts/s0/thing.mjs",
    "src/lib/s0/thing.ts",
    "src/lib/db/prisma.ts",
  ]) {
    assert.equal(isExcludedPath(p), false, `${p} must stay in scope`);
  }
});

test("sourceFiles drops every path under scripts/security/s0/", () => {
  const files = sourceFiles();
  const inside = files.filter((f) => f.startsWith("scripts/security/s0/"));
  assert.deepEqual(
    inside,
    [],
    `the tool must not offer its own files; got ${inside.slice(0, 5).join(", ")}`,
  );
  // and the exclusion must be the reason, not an accident of the current tree
  for (const f of files) {
    assert.equal(isExcludedPath(f), false, `${f} slipped past the exclusion`);
  }
});

test("sourceFiles still lists scripts/ files OUTSIDE the excluded subtree", () => {
  const files = sourceFiles();
  const scripts = files.filter((f) => f.startsWith("scripts/"));
  assert.ok(scripts.length > 100, `the rest of scripts/ must stay scannable, got ${scripts.length}`);
  // a named negative control that lives under scripts/security/ but outside s0/
  assert.ok(
    files.includes("scripts/security/check-env-example.mjs"),
    "scripts/security/check-env-example.mjs must still be scanned",
  );
  assert.ok(
    scripts.some((f) => f.startsWith("scripts/security/phase100/")),
    "scripts/security/phase100/* must still be scanned",
  );
  assert.ok(files.some((f) => f.startsWith("src/lib/")), "src/ must still be scanned");
});

test("the exclusion is output-neutral: no audited record comes from the tool", () => {
  // The exclusion changes which FILES are offered, never how a call site is
  // classified, so the rule-set version deliberately does not move and the
  // rendered inventory keeps the hash it had before the tool became tracked.
  assert.equal(RULESET_VERSION, "s0-b05.5");
  const { records } = INVENTORY_LAZY();
  assert.equal(records.length, 392, "the audited call-site count must not move");
  assert.equal(
    records.filter((r) => r.file.startsWith("scripts/security/s0/")).length,
    0,
    "the tool must contribute no call site of its own",
  );
});
