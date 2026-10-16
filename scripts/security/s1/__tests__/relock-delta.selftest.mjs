/**
 * Selftest for the S1 delta relock checker (unit level).
 *
 *   node --test scripts/security/s1/__tests__/relock-delta.selftest.mjs
 *
 * Dependency-free. Every negative test mutates an in-memory COPY of the committed
 * provenance (or a temporary copy of the register or an S0 file) and asserts that
 * the checker names the matching violation, so a gate that stopped gating fails
 * here rather than passing quietly. Each assertion carries a message that names
 * the code it expected; the mutation campaign uses that message as its fingerprint.
 *
 * `S1_RELOCK_ROOT` points the checker at the repository when the test file itself
 * runs from a mutated copy elsewhere (the campaign sets it); otherwise the
 * repository is the one this file lives in.
 */

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as R from "../relock-delta-check.mjs";

const ROOT = process.env.S1_RELOCK_ROOT ? resolve(process.env.S1_RELOCK_ROOT) : R.REPO_ROOT;
const PATHS = R.defaultPaths(ROOT);
const lf = (s) => s.replace(/\r\n/g, "\n");
const DATA = JSON.parse(readFileSync(PATHS.data, "utf8"));
const MD = lf(readFileSync(PATHS.report, "utf8"));
const RECORD = JSON.parse(readFileSync(PATHS.record, "utf8"));
const REGISTER = JSON.parse(readFileSync(PATHS.register, "utf8"));
const ADJ = JSON.parse(readFileSync(PATHS.adjudications, "utf8"));

const SCRATCH = mkdtempSync(join(tmpdir(), "relock-selftest-"));
after(() => rmSync(SCRATCH, { recursive: true, force: true }));
let seq = 0;
const tmpJson = (value) => {
  const p = join(SCRATCH, `f${(seq += 1)}.json`);
  writeFileSync(p, JSON.stringify(value));
  return p;
};

const clone = (x) => structuredClone(x);

/** Run the checker on a mutated copy and return the violations. */
function run({ data = DATA, md = MD, record = RECORD, register, adjudications } = {}) {
  const paths = { ...PATHS };
  if (register) paths.register = tmpJson(register);
  if (adjudications) paths.adjudications = tmpJson(adjudications);
  return R.checkRelock(data, md, paths, record);
}

/** Assert that a mutation produces a violation with this code. */
function expectCode(code, options, klass) {
  const found = run(options);
  const codes = found.map((x) => x.code);
  assert.ok(codes.includes(code), `expected ${code}, got ${codes.join(",") || "no violation"}`);
  if (klass) assert.ok(found.some((x) => x.code === code && x.klass === klass), `expected ${code} in class ${klass}`);
}

function mutated(fn) {
  const d = clone(DATA);
  fn(d);
  return { data: d };
}
function mutatedRegister(fn) {
  const r = clone(REGISTER);
  fn(r);
  return { register: r };
}

const finding = (d, id) => d.findings.find((f) => f.findingId === id);

test("clean: the committed provenance has no violation", () => {
  const found = run();
  assert.deepEqual(found, [], `expected no violation, got ${found.map((x) => `${x.klass}/${x.code}`).join(",")}`);
});

test("canonical: the committed document is in canonical form", () => {
  assert.equal(R.serialize(R.canonicalize(clone(DATA), PATHS)), readFileSync(PATHS.data, "utf8"), "expected the committed document to be canonical");
});

test("schema: an unknown top-level key is refused", () => {
  expectCode("UNKNOWN_KEY", mutated((d) => (d.severityOverride = "LOW")), "SCHEMA");
});

test("schema: an unknown key inside a finding is refused", () => {
  expectCode("UNKNOWN_KEY", mutated((d) => (finding(d, "RL-001").severity = "LOW")), "SCHEMA");
});

test("schema: a missing required key is refused", () => {
  expectCode("MISSING_KEY", mutated((d) => delete finding(d, "RL-002").disposition), "SCHEMA");
});

test("schema: a wrong schema version is refused", () => {
  expectCode("SCHEMA_VERSION", mutated((d) => (d.schemaVersion = 1)), "SCHEMA");
});

test("sources: a malformed commit id is refused", () => {
  expectCode("SCHEMA", mutated((d) => (d.sources.securityHeadSha = "391fa2f2")), "SCHEMA");
});

test("sources: a target that is not the merge's first parent is refused", () => {
  expectCode("MERGE_PARENTS", mutated((d) => (d.sources.targetMainSha = d.sources.frozenSourceSha)), "SOURCES");
});

test("sources: swapped merge parents are refused", () => {
  expectCode(
    "MERGE_PARENTS",
    mutated((d) => {
      const { targetMainSha, securityHeadSha } = d.sources;
      d.sources.targetMainSha = securityHeadSha;
      d.sources.securityHeadSha = targetMainSha;
    }),
    "SOURCES",
  );
});

test("sources: a commit that is not in the repository is refused", () => {
  expectCode("GIT_OBJECTS", mutated((d) => (d.sources.integrationMergeSha = "0".repeat(40))), "SOURCES");
});

test("sources: a frozen source that is not the merge base is refused", () => {
  expectCode("MERGE_BASE", mutated((d) => (d.sources.frozenSourceSha = d.sources.securityHeadSha)), "SOURCES");
});

test("derived: a delta count the tree does not produce is refused", () => {
  expectCode("DERIVED_DRIFT", mutated((d) => (d.delta.paths.total += 1)), "DERIVED_DRIFT");
});

test("derived: a strict product path count the rule does not produce is refused", () => {
  expectCode("DERIVED_DRIFT", mutated((d) => (d.delta.strictProductPaths.total += 1)), "DERIVED_DRIFT");
});

test("derived: a getPrisma count the inventory does not produce is refused", () => {
  expectCode("DERIVED_DRIFT", mutated((d) => (d.getPrisma.after.realCallExpressions += 1)), "DERIVED_DRIFT");
});

test("derived: a decision count that is typed by hand is refused", () => {
  expectCode("DERIVED_DRIFT", mutated((d) => (d.getPrisma.decisions.manualAdjudications += 1)), "DERIVED_DRIFT");
});

test("derived: an added call site that is dropped from the list is refused", () => {
  expectCode("DERIVED_DRIFT", mutated((d) => d.getPrisma.added.pop()), "DERIVED_DRIFT");
});

test("derived: a call site with no reachability review is refused", () => {
  expectCode("CALLSITE_NOT_REVIEWED", mutated((d) => d.reviewedCallsites.pop()), "DERIVED_DRIFT");
});

test("derived: a review of a call site the delta did not add is refused", () => {
  expectCode("REVIEW_OF_UNKNOWN_CALLSITE", mutated((d) => d.reviewedCallsites.push({ id: "src/app/api/auth/route.ts#L48C20", reachability: "PUBLICLY_REACHABLE", note: "A call site that existed before the delta." })), "DERIVED_DRIFT");
});

test("derived: a call site position that holds no getPrisma token is refused", () => {
  const adj = clone(ADJ);
  // move a pinned call site's recorded position by editing the inventory copy
  const inv = JSON.parse(readFileSync(PATHS.inventory, "utf8"));
  const site = inv.callSites.find((c) => c.id === "src/lib/executive/report/worker.ts#L191C24");
  site.column += 3;
  const paths = { ...PATHS, inventory: tmpJson(inv) };
  const found = R.checkRelock(DATA, MD, paths, RECORD);
  assert.ok(found.some((x) => x.code === "CALLSITE_POSITION"), `expected CALLSITE_POSITION, got ${found.map((x) => x.code).join(",")}`);
  void adj;
});

test("derived: a stale inventory is refused", () => {
  const inv = JSON.parse(readFileSync(PATHS.inventory, "utf8"));
  inv.summary.textualOccurrences += 1;
  const found = R.checkRelock(DATA, MD, { ...PATHS, inventory: tmpJson(inv) }, RECORD);
  assert.ok(found.some((x) => x.code === "STALE_INVENTORY"), `expected STALE_INVENTORY, got ${found.map((x) => x.code).join(",")}`);
});

test("derived: an unresolved call site is refused", () => {
  const inv = JSON.parse(readFileSync(PATHS.inventory, "utf8"));
  inv.callSites.find((c) => c.id === "src/lib/executive/report/read.ts#L96C36").classification = "UNRESOLVED_REQUIRES_MANUAL_REVIEW";
  const found = R.checkRelock(DATA, MD, { ...PATHS, inventory: tmpJson(inv) }, RECORD);
  assert.ok(found.some((x) => x.code === "GETPRISMA_UNRESOLVED"), `expected GETPRISMA_UNRESOLVED, got ${found.map((x) => x.code).join(",")}`);
});

test("derived: an orphan adjudication is refused", () => {
  const adj = clone(ADJ);
  adj.adjudications.push({ ...adj.adjudications[0], callsiteId: "src/lib/nothing/here.ts#L1C1" });
  expectCode("ORPHAN_ADJUDICATION", { adjudications: adj }, "DERIVED_DRIFT");
});

test("derived: an adjudication pinned to a stale fingerprint is refused", () => {
  const adj = clone(ADJ);
  adj.adjudications.find((a) => a.callsiteId === "src/lib/executive/report/worker.ts#L191C24").sourceFingerprint = "0000000000000000";
  expectCode("ORPHAN_ADJUDICATION", { adjudications: adj }, "DERIVED_DRIFT");
});

test("derived: a tampered frozen hash is refused", () => {
  expectCode("DERIVED_DRIFT", mutated((d) => (d.historicalFiles[0].frozenSha256 = "0".repeat(64))), "DERIVED_DRIFT");
});

test("derived: a projection that disagrees with the register is refused", () => {
  expectCode("DERIVED_DRIFT", mutated((d) => (d.canonicalProjection[0].severity = "LOW")), "DERIVED_DRIFT");
});

test("derived: a register whose severity moved makes the projection stale", () => {
  expectCode(
    "DERIVED_DRIFT",
    mutatedRegister((r) => {
      r.risks.find((x) => x.riskId === "R-65").severity = "LOW";
    }),
    "DERIVED_DRIFT",
  );
});

test("findings: a delta finding missing from the register is refused", () => {
  expectCode("FINDING_NOT_IN_REGISTER", mutatedRegister((r) => (r.findings = r.findings.filter((f) => f.findingId !== "DELTA-RL-003"))), "FINDINGS");
});

test("findings: a register delta finding missing from the delta document is refused", () => {
  expectCode("REGISTER_FINDING_MISSING_FROM_DELTA", mutated((d) => (d.findings = d.findings.filter((f) => f.findingId !== "RR-004"))), "FINDINGS");
});

test("findings: a duplicate delta finding is refused", () => {
  expectCode("DUPLICATE_FINDING", mutated((d) => d.findings.push(clone(finding(d, "RL-001")))), "FINDINGS");
});

test("findings: a malformed delta finding id is refused", () => {
  expectCode("FINDING_ID", mutated((d) => (finding(d, "RL-001").findingId = "FINDING-1")), "FINDINGS");
});

test("findings: a wrong register id is refused", () => {
  expectCode("REGISTER_ID", mutated((d) => (finding(d, "RL-001").registerFindingId = "DELTA-RL-999")), "FINDINGS");
});

test("findings: an owner that the register does not record is refused", () => {
  expectCode("OWNER_DISAGREES", mutated((d) => (finding(d, "RL-001").canonicalRiskId = "R-66")), "FINDINGS");
});

test("findings: a disposition that the register does not record is refused", () => {
  expectCode("DISPOSITION_DISAGREES", mutated((d) => (finding(d, "RR-002").disposition = "UNPROVEN")), "FINDINGS");
});

test("findings: a register status that the disposition does not map to is refused", () => {
  expectCode("STATUS_DISAGREES", mutatedRegister((r) => (r.findings.find((f) => f.findingId === "DELTA-RR-007").status = "MAPPED_TO_RISK")), "FINDINGS");
});

test("findings: a finding owned by two risks is refused", () => {
  expectCode("DUPLICATE_OWNERSHIP", mutatedRegister((r) => r.risks.find((x) => x.riskId === "R-66").sourceFindingIds.push("DELTA-RL-001")), "FINDINGS");
});

test("findings: a finding no risk lists is refused", () => {
  expectCode("NO_OWNER", mutatedRegister((r) => (r.risks.find((x) => x.riskId === "R-65").sourceFindingIds = [])), "FINDINGS");
});

test("findings: a new-risk disposition on a historical owner is refused", () => {
  expectCode("NEW_RISK_EXPECTED", mutated((d) => (finding(d, "RL-004").disposition = "OWNED_BY_NEW_RISK")), "FINDINGS");
});

test("findings: an existing-risk disposition on a delta owner is refused", () => {
  expectCode("EXISTING_RISK_EXPECTED", mutated((d) => (finding(d, "RL-001").disposition = "OWNED_BY_EXISTING_RISK")), "FINDINGS");
});

test("findings: a call-site-backed finding with no linked call site is refused", () => {
  expectCode("CALLSITE_BACKED_WITHOUT_LINK", mutated((d) => (finding(d, "RL-007").relatedCallsiteIds = [])), "FINDINGS");
});

test("findings: linked call sites on a finding that is not call-site-backed are refused", () => {
  expectCode("LINK_WITHOUT_CALLSITE_BACKED", mutated((d) => (finding(d, "RL-002").relatedCallsiteIds = ["src/lib/customers/service.ts#L157C25"])), "FINDINGS");
});

test("findings: a link with no stated relation is refused", () => {
  expectCode("LINK_WITHOUT_RELATION", mutated((d) => delete finding(d, "RL-007").callsiteRelation), "FINDINGS");
});

test("findings: a link to a call site the delta did not add is refused", () => {
  expectCode("CALLSITE_LINK", mutated((d) => (finding(d, "RL-007").relatedCallsiteIds = ["src/app/api/auth/route.ts#L48C20"])), "FINDINGS");
});

test("findings: a link no evidence anchors is refused", () => {
  expectCode("CALLSITE_LINK_NOT_ANCHORED", mutated((d) => (finding(d, "RL-007").relatedCallsiteIds = ["src/lib/customers/service.ts#L157C25"])), "FINDINGS");
});

test("findings: an evidence anchor that no longer exists is refused", () => {
  expectCode("EVIDENCE_ANCHOR", mutated((d) => (finding(d, "RL-001").evidence[0].anchor = "this text is nowhere in that file")), "FINDINGS");
});

test("findings: an evidence absence that no longer holds is refused", () => {
  expectCode("EVIDENCE_ABSENCE", mutated((d) => (finding(d, "RR-010").evidence.find((e) => e.absent).absent = "getPrisma")), "FINDINGS");
});

test("findings: an evidence path that does not exist is refused", () => {
  expectCode("EVIDENCE_PATH", mutated((d) => (finding(d, "RL-001").evidence[0].path = "src/does/not/exist.ts")), "FINDINGS");
});

test("findings: evidence with neither an anchor nor an absence is refused", () => {
  expectCode("EVIDENCE_NEEDS_ANCHOR_OR_ABSENT", mutated((d) => delete finding(d, "RL-001").evidence[0].anchor), "FINDINGS");
});

test("findings: a finding with no delta-scope evidence is refused", () => {
  expectCode("NO_DELTA_EVIDENCE", mutated((d) => finding(d, "RL-002").evidence.forEach((e) => (e.scope = "CONTEXT"))), "FINDINGS");
});

test("paths: delta evidence on a file the delta did not change is refused", () => {
  expectCode(
    "PATH_OUTSIDE_DELTA",
    mutated((d) => {
      const e = finding(d, "RL-002").evidence.find((x) => x.scope === "CONTEXT");
      e.scope = "DELTA";
    }),
    "PATH_OUTSIDE_DELTA",
  );
});

test("report: a stale generated block is refused", () => {
  expectCode("BLOCK_DRIFT", { md: MD.replace("| Frozen source |", "| Frozen  source |") }, "REPORT");
});

test("report: an absent generated block is refused", () => {
  expectCode("BLOCK_ABSENT", { md: MD.replace("<!-- RELOCK-BLOCK:delta -->", "") }, "REPORT");
});

test("report: a digit-led count in the narrative is refused", () => {
  expectCode("UNMARKED_NARRATIVE_NUMBER", { md: `${MD}\nThere are 12 call sites to review.\n` }, "REPORT");
});

test("report: a delta finding missing from the report is refused", () => {
  expectCode("FINDING_NOT_IN_REPORT", { md: MD.replaceAll("DELTA-RR-004", "DELTA-RR-00x") }, "REPORT");
});

test("report: a claim of an independent pass is refused", () => {
  expectCode("REPORT_CLAIM", { md: `${MD}\nVerdict: INDEPENDENT_PASS\n` }, "REPORT");
});

test("report: a missing report is refused", () => {
  expectCode("REPORT_MISSING", { md: null }, "REPORT");
});

test("record: a missing record is refused", () => {
  expectCode("RECORD_MISSING", { record: null }, "RECORD");
});

test("record: a surviving mutant is refused", () => {
  const rec = clone(RECORD);
  rec.mutants[0].status = "SURVIVED";
  expectCode("RECORD_COUNT", { record: rec }, "RECORD");
});

test("record: a recorded survivor with consistent totals is still refused", () => {
  const rec = clone(RECORD);
  rec.mutants[0].status = "SURVIVED";
  rec.totals.targetedKill -= 1;
  rec.totals.survived += 1;
  rec.totals.deviations += 1;
  expectCode("RECORD_NOT_ALL_KILLED", { record: rec }, "RECORD");
});

test("record: a placebo that is not green is refused", () => {
  const rec = clone(RECORD);
  rec.mutants[0].placebo = "RED";
  rec.totals.placebosGreen -= 1;
  rec.totals.deviations += 1;
  expectCode("RECORD_PLACEBO", { record: rec }, "RECORD");
});

test("record: a cleanup that did not remove the copies is refused", () => {
  const rec = clone(RECORD);
  rec.cleanup = "LEFT_BEHIND";
  expectCode("RECORD_CLEANUP", { record: rec }, "RECORD");
});

test("record: a control that did not behave as expected is refused", () => {
  const rec = clone(RECORD);
  rec.controls[0].observed = "SOMETHING_ELSE";
  rec.totals.deviations += 1;
  expectCode("RECORD_COUNT", { record: rec }, "RECORD");
});

test("content: a secret-shaped string is refused", () => {
  // built at run time so this file holds no secret-shaped literal
  const shape = "gh" + "p_" + "A".repeat(36);
  expectCode("SECRET_SHAPE", mutated((d) => (finding(d, "RL-001").summary += ` ${shape}`)), "CONTENT");
});

test("content: an absolute local path is refused", () => {
  const drive = String.fromCharCode(69) + ":" + String.fromCharCode(92);
  expectCode("ABSOLUTE_PATH", mutated((d) => (finding(d, "RL-001").summary += ` see ${drive}somewhere`)), "CONTENT");
});

test("content: a clock time is refused", () => {
  expectCode("TIMESTAMP", mutated((d) => (finding(d, "RL-001").summary += " observed at 14:35 local")), "CONTENT");
});

test("exit: the lowest-order failing class sets the code", () => {
  const v = [
    { klass: "REPORT", code: "x", detail: "" },
    { klass: "SCHEMA", code: "y", detail: "" },
    { klass: "CONTENT", code: "z", detail: "" },
  ];
  assert.equal(R.exitCodeFor(v), R.EXIT.SCHEMA, `expected exit ${R.EXIT.SCHEMA} for the lowest-order class`);
  assert.equal(R.exitCodeFor([]), R.EXIT.OK, "expected exit 0 for no violation");
});

test("exit: the validation codes are distinct from usage and from a crash", () => {
  const codes = Object.values(R.EXIT);
  assert.equal(new Set(codes).size, codes.length, "expected every exit code to be distinct");
  assert.ok(R.EXIT.INTERNAL_ERROR > Math.max(...Object.values(R.EXIT).filter((c) => c !== R.EXIT.INTERNAL_ERROR)), "expected a crash code above every validation code");
});

test("rule: the strict product-path rule excludes docs, workflows, scripts, tests and the attributes file", () => {
  assert.equal(R.isStrictProductPath("docs/security/x.md"), false, "RULE_STRICT: docs are not product");
  assert.equal(R.isStrictProductPath(".github/workflows/deploy.yml"), false, "RULE_STRICT: workflows are not strict product");
  assert.equal(R.isStrictProductPath("scripts/executive/daily-report-worker.mjs"), false, "RULE_STRICT: scripts are not strict product");
  assert.equal(R.isStrictProductPath("src/lib/executive/__tests__/a.test.ts"), false, "RULE_STRICT: tests are not product");
  assert.equal(R.isStrictProductPath(".gitattributes"), false, "RULE_STRICT: the attributes file is not product");
  assert.equal(R.isStrictProductPath("src/lib/executive/scope.ts"), true, "RULE_STRICT: source is product");
  assert.equal(R.isStrictProductPath("Dockerfile"), true, "RULE_STRICT: the Dockerfile is product");
});

test("rule: the broad runtime-affecting rule keeps workflows and scripts and drops docs, tests and the attributes file", () => {
  assert.equal(R.isBroadRuntimePath(".github/workflows/deploy.yml"), true, "RULE_BROAD: workflows can change what runs");
  assert.equal(R.isBroadRuntimePath("scripts/executive/daily-report-worker.mjs"), true, "RULE_BROAD: scripts can change what runs");
  assert.equal(R.isBroadRuntimePath("docs/security/x.md"), false, "RULE_BROAD: docs are not runtime");
  assert.equal(R.isBroadRuntimePath("src/lib/executive/a.test.ts"), false, "RULE_BROAD: tests are not runtime");
  assert.equal(R.isBroadRuntimePath(".gitattributes"), false, "RULE_BROAD: the attributes file is not runtime");
});

test("rule: the two product-path counts are both derived and the strict set is a subset of the broad set", () => {
  assert.ok(DATA.delta.strictProductPaths.total <= DATA.delta.broadRuntimeAffectingPaths.total, "expected strict <= broad");
  assert.equal(DATA.delta.strictProductPaths.total, DATA.delta.strictProductPaths.list.length, "expected the strict total to equal its list");
});

test("scope: the historical snapshot and the reconciled summary are not the same numbers", () => {
  const snap = REGISTER.reconciliation.historicalSnapshot;
  assert.notEqual(snap.risks, REGISTER.risks.length, "expected the reconciled risk count to differ from the historical snapshot");
  assert.equal(REGISTER.risks.length - snap.risks, REGISTER.risks.filter((r) => r.originScope === "DELTA_RELOCK").length, "expected the difference to be exactly the delta risks");
});

test("scope: no delta finding id collides with a historical identifier", () => {
  const delta = REGISTER.findings.filter((f) => f.family === "DELTA").map((f) => f.findingId);
  const historical = new Set(REGISTER.findings.filter((f) => f.family !== "DELTA").map((f) => f.findingId));
  assert.ok(delta.every((id) => !historical.has(id)), "expected no collision between delta and historical finding ids");
});

test("sources: a security head that is not the merge's second parent is refused", () => {
  expectCode("MERGE_PARENTS", mutated((d) => (d.sources.securityHeadSha = "a3c0e375d1bd1759ebbd27a13ad2977cb178c410")), "SOURCES");
});

test("sources: a frozen source that is not an ancestor of the target is refused", () => {
  expectCode("FROZEN_NOT_ANCESTOR_OF_TARGET", mutated((d) => (d.sources.frozenSourceSha = d.sources.securityHeadSha)), "SOURCES");
});

test("schema: a missing derived section is refused", () => {
  expectCode("MISSING_KEY", mutated((d) => delete d.delta), "SCHEMA");
});

test("derived: an unresolved consumer edge is refused", () => {
  const inv = JSON.parse(readFileSync(PATHS.inventory, "utf8"));
  inv.summary.consumerEdgesUnresolved = 1;
  const found = R.checkRelock(DATA, MD, { ...PATHS, inventory: tmpJson(inv) }, RECORD);
  assert.ok(found.some((x) => x.code === "GETPRISMA_UNRESOLVED_EDGES"), `expected GETPRISMA_UNRESOLVED_EDGES, got ${found.map((x) => x.code).join(",")}`);
});

test("derived: a primary partition that does not cover every call site is refused", () => {
  const inv = JSON.parse(readFileSync(PATHS.inventory, "utf8"));
  inv.summary.primaryPartition.missingPrimaryIds = ["src/lib/nothing.ts#L1C1"];
  const found = R.checkRelock(DATA, MD, { ...PATHS, inventory: tmpJson(inv) }, RECORD);
  assert.ok(found.some((x) => x.code === "PRIMARY_PARTITION"), `expected PRIMARY_PARTITION, got ${found.map((x) => x.code).join(",")}`);
});

const EDGE_ROW = { path: "docs/security/EDGE-ORIGIN-AND-CLIENT-IP.md", role: "S0_EVIDENCE", frozenSha256: "a".repeat(64), preservedByMerge: true };
const REGISTER_ROW = { path: "docs/security/s1-risk-register.json", role: "S1_ARTIFACT", frozenSha256: "b".repeat(64), preservedByMerge: true };

test("derived: historical S0 evidence not preserved by the merge is refused", () => {
  const found = R.historicalViolations([{ ...EDGE_ROW, preservedByMerge: false }], EDGE_ROW.frozenSha256, null);
  assert.ok(found.some((x) => x.code === "HISTORICAL_EVIDENCE_MODIFIED"), `expected HISTORICAL_EVIDENCE_MODIFIED, got ${found.map((x) => x.code).join(",") || "no violation"}`);
});

test("derived: S0 evidence edited after the merge is refused", () => {
  const found = R.historicalViolations([EDGE_ROW], "c".repeat(64), null);
  assert.ok(found.some((x) => x.code === "HISTORICAL_EVIDENCE_EDITED_AFTER_MERGE"), `expected HISTORICAL_EVIDENCE_EDITED_AFTER_MERGE, got ${found.map((x) => x.code).join(",") || "no violation"}`);
});

test("derived: a frozen register hash that differs from the pin is refused", () => {
  const found = R.historicalViolations([REGISTER_ROW], null, "d".repeat(64));
  assert.ok(found.some((x) => x.code === "FROZEN_REGISTER_HASH"), `expected FROZEN_REGISTER_HASH, got ${found.map((x) => x.code).join(",") || "no violation"}`);
});

test("derived: untouched historical rows, and S1 artifacts that were modified on purpose, produce no violation", () => {
  const found = R.historicalViolations([EDGE_ROW, { ...REGISTER_ROW, preservedByMerge: false }], EDGE_ROW.frozenSha256, REGISTER_ROW.frozenSha256);
  assert.deepEqual(found, [], "expected no violation for untouched evidence and a deliberately modified S1 artifact");
});

test("findings: a projection entry that is missing is refused", () => {
  expectCode("PROJECTION_MISSING", mutated((d) => d.canonicalProjection.pop()), "FINDINGS");
});

const synthetic = (files) => ({ files: Object.keys(files), fileSet: new Set(Object.keys(files)), text: (f) => files[f] ?? "" });

test("trace: only a file that imports the defining module is a static importer", () => {
  const ctx = synthetic({
    "src/lib/a.ts": "export async function exported() {\n  return helper();\n}\nasync function helper() {\n  const c = await getPrisma();\n}\n",
    "src/lib/b.ts": 'import { exported } from "@/lib/a";\nexported();\n',
    "src/lib/c.ts": 'import { other } from "@/lib/zzz";\n// mentions exported but imports a different module\nconst exported = other;\n',
  });
  const t = R.traceConsumers({ file: "src/lib/a.ts", line: 5 }, ctx);
  assert.deepEqual(t.staticImporters, ["src/lib/b.ts"], `expected IMPORTERS, got ${JSON.stringify(t.staticImporters)}`);
});

test("trace: the enclosing function of a call site is the nearest definition above it", () => {
  const ctx = synthetic({
    "src/lib/a.ts": "export async function first() {\n  return 1;\n}\nexport async function second() {\n  const c = await getPrisma();\n}\n",
  });
  const t = R.traceConsumers({ file: "src/lib/a.ts", line: 5 }, ctx);
  assert.equal(t.enclosingFunction, "second", `expected ENCLOSING, got ${t.enclosingFunction}`);
});

test("trace: a local helper is followed to the exported function that calls it", () => {
  const ctx = synthetic({
    "src/lib/a.ts": "export async function exported() {\n  return helper();\n}\nasync function helper() {\n  const c = await getPrisma();\n}\n",
  });
  const t = R.traceConsumers({ file: "src/lib/a.ts", line: 5 }, ctx);
  assert.deepEqual(t.exportedRoots, ["exported"], `expected HELPER_WALK, got ${JSON.stringify(t.exportedRoots)}`);
});

test("trace: a route handler is its own consumer", () => {
  const ctx = synthetic({
    "src/app/api/x/route.ts": "export async function POST() {\n  const c = await getPrisma();\n}\n",
  });
  const t = R.traceConsumers({ file: "src/app/api/x/route.ts", line: 2 }, ctx);
  assert.deepEqual(t.staticImporters, ["src/app/api/x/route.ts"], `expected HANDLER, got ${JSON.stringify(t.staticImporters)}`);
});

test("derived: top priorities that the register does not hold are refused", () => {
  expectCode("DERIVED_DRIFT", mutated((d) => (d.topPriorities[0].riskId = "R-99")), "DERIVED_DRIFT");
});

test("priorities: the report lists the register's first ten risks in the register's order", () => {
  const want = [...REGISTER.risks].sort((a, b) => a.remediationPriority - b.remediationPriority).slice(0, 10).map((r) => r.riskId);
  assert.deepEqual(R.projectPriorities(REGISTER).map((t) => t.riskId), want, "PRIORITIES: expected the first ten risks by remediation priority");
  assert.equal(DATA.topPriorities.length, 10, "PRIORITIES: expected ten rows");
});

// ───────── identity: a finding is what it says, not only what it is called ─────────

const copyContent = (to, from) => {
  to.title = from.title;
  to.summary = from.summary;
  to.evidence = structuredClone(from.evidence);
};

test("identity: the authoritative findings carry their pinned content", () => {
  assert.deepEqual(R.identityViolations(DATA, REGISTER, DATA.derivedFacts), [], "IDENTITY_CLEAN: expected no identity violation in the committed provenance");
  assert.deepEqual(R.duplicateContentViolations(DATA.findings), [], "IDENTITY_CLEAN: expected no duplicated finding content");
});

test("identity: RR-001 carrying the audit-snapshot topic is refused", () => {
  expectCode("IDENTITY_TITLE", mutated((d) => copyContent(finding(d, "RR-001"), finding(d, "RR-010"))), "FINDINGS");
});

test("identity: RR-002 carrying the privacy-retention topic is refused", () => {
  expectCode("IDENTITY_TITLE", mutated((d) => copyContent(finding(d, "RR-002"), finding(d, "RR-011"))), "FINDINGS");
});

test("identity: swapping the contents of RR-001 and RR-002 is refused", () => {
  const found = run(
    mutated((d) => {
      const a = finding(d, "RR-001");
      const b = finding(d, "RR-002");
      const keep = { title: a.title, summary: a.summary, evidence: a.evidence };
      copyContent(a, b);
      Object.assign(b, keep);
    }),
  );
  const titles = found.filter((x) => x.code === "IDENTITY_TITLE").length;
  assert.equal(titles, 2, `expected IDENTITY_TITLE for both swapped findings, got ${titles}`);
});

test("identity: dropping the main source reference of RR-001 is refused", () => {
  expectCode("IDENTITY_SOURCE_REFERENCE", mutated((d) => (finding(d, "RR-001").evidence = finding(d, "RR-001").evidence.filter((e) => !(e.anchor ?? "").startsWith("async function siteIdsOf")))), "FINDINGS");
});

test("identity: dropping the main source reference of RR-002 is refused", () => {
  expectCode("IDENTITY_SOURCE_REFERENCE", mutated((d) => (finding(d, "RR-002").evidence = finding(d, "RR-002").evidence.filter((e) => e.anchor !== "data: { partyId: next },"))), "FINDINGS");
});

test("identity: moving the delta owner of RR-001 is refused", () => {
  expectCode("IDENTITY_OWNER", mutated((d) => (finding(d, "RR-001").canonicalRiskId = "R-69")), "FINDINGS");
});

test("identity: moving the register owner of RR-002 is refused", () => {
  expectCode(
    "IDENTITY_OWNER",
    mutatedRegister((r) => {
      r.findings.find((f) => f.findingId === "DELTA-RR-002").ownerRiskId = "R-66";
    }),
    "FINDINGS",
  );
});

test("identity: a fixed title over a different mechanism is refused", () => {
  expectCode("IDENTITY_MECHANISM", mutated((d) => (finding(d, "RR-001").summary = "A different mechanism is described here, long enough to be a summary but unrelated to the pinned one.")), "FINDINGS");
});

test("identity: a register summary that no longer states the mechanism is refused", () => {
  expectCode(
    "IDENTITY_MECHANISM",
    mutatedRegister((r) => {
      r.findings.find((f) => f.findingId === "DELTA-RR-002").summary = "Something else entirely is recorded under this identifier in the register.";
    }),
    "FINDINGS",
  );
});

test("identity: an owner risk that drops an affected asset is refused", () => {
  expectCode("IDENTITY_ASSETS", mutatedRegister((r) => (r.risks.find((x) => x.riskId === "R-73").affectedAssets = ["FACTORY_AND_ERP_DATA"])), "FINDINGS");
});

test("identity: an owner risk with another verification method is refused", () => {
  expectCode("IDENTITY_VERIFICATION", mutatedRegister((r) => (r.risks.find((x) => x.riskId === "R-68").verificationMethod = "SOURCE_REVIEW")), "FINDINGS");
});

test("identity: an owner risk without the pinned acceptance criterion is refused", () => {
  expectCode("IDENTITY_ACCEPTANCE", mutatedRegister((r) => (r.risks.find((x) => x.riskId === "R-73").acceptanceCriteria = ["The owner records the intended policy for tenant owners."])), "FINDINGS");
});

test("identity: an authoritative finding that is not declared is refused", () => {
  expectCode("IDENTITY_MISSING", mutated((d) => {
    d.findings = d.findings.filter((f) => f.findingId !== "RR-002");
    d.canonicalProjection = d.canonicalProjection.filter((x) => x.findingId !== "RR-002");
  }), "FINDINGS");
});

test("identity: the platform-capability gate is read from the tree, and its pin must still hold", () => {
  const gate = DATA.derivedFacts.platformCapabilityGate;
  assert.equal(gate.erpRoutes.files, gate.erpRoutes.withGate, "GATE_FACT: expected every ERP route file to carry the gate");
  assert.equal(gate.customerRoutes.withGate, 0, "GATE_FACT: expected no customer route file to carry the gate");
  const moved = structuredClone(DATA.derivedFacts);
  moved.platformCapabilityGate.customerRoutes.withGate = 1;
  assert.ok(R.identityViolations(DATA, REGISTER, moved).some((x) => x.code === "IDENTITY_GATE_FACT"), "expected IDENTITY_GATE_FACT, got none");
});

test("identity: a new finding that duplicates an existing finding's title is refused", () => {
  const found = R.duplicateContentViolations(
    mutated((d) => (finding(d, "RR-011").title = finding(d, "RR-007").title)).data.findings,
  );
  assert.ok(found.some((x) => x.code === "DUPLICATE_FINDING_CONTENT"), "expected DUPLICATE_FINDING_CONTENT, got none");
});

test("identity: a new finding that cites exactly an existing finding's evidence is refused", () => {
  const found = R.duplicateContentViolations(
    mutated((d) => (finding(d, "RR-010").evidence = structuredClone(finding(d, "RR-001").evidence))).data.findings,
  );
  assert.ok(found.some((x) => x.code === "DUPLICATE_FINDING_CONTENT"), "expected DUPLICATE_FINDING_CONTENT, got none");
});

test("identity: a declared duplicate is allowed to repeat its original", () => {
  const found = R.duplicateContentViolations(
    mutated((d) => {
      copyContent(finding(d, "RR-011"), finding(d, "RR-007"));
      finding(d, "RR-011").disposition = "DUPLICATE";
    }).data.findings,
  );
  assert.deepEqual(found, [], "expected no violation for a finding declared as a duplicate");
});

test("identity: the ERP gate facts are derived from the target tree, never typed", () => {
  const fresh = R.gatherDerivedFacts(DATA.sources, ROOT);
  assert.deepEqual(fresh.platformCapabilityGate, DATA.derivedFacts.platformCapabilityGate, "GATE_FACT: expected the committed gate facts to equal the recomputed ones");
});

// ═══════════════ remediation of the first fresh review (FR-02, FR-03, FR-05, FR-06, FR-07) ═══════════════

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const FIX_GIT = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.com", "-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** A throw-away repository with one commit holding `files`; returns its directory and commit id. */
function fixtureRepo(files) {
  const dir = mkdtempSync(join(SCRATCH, "repo-"));
  FIX_GIT(dir, "init", "-q");
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  FIX_GIT(dir, "add", "-A");
  FIX_GIT(dir, "commit", "-q", "-m", "fixture");
  return { dir, sha: FIX_GIT(dir, "rev-parse", "HEAD").trim() };
}

const identityCodes = (data, register = REGISTER, derived = DATA.derivedFacts) => R.identityViolations(data, register, derived).map((x) => `${x.code}: ${x.detail}`);

function dropFact(findingId, fact) {
  const d = clone(DATA);
  const f = finding(d, findingId);
  const before = f.evidence.length;
  f.evidence = f.evidence.filter((e) => e.fact !== fact);
  assert.equal(f.evidence.length, before - 1, `the fixture must remove exactly the item that carries ${fact}`);
  const got = identityCodes(d);
  assert.ok(got.some((x) => x.startsWith("IDENTITY_FACT_MISSING") && x.includes(fact)), `expected IDENTITY_FACT_MISSING for ${fact}, got ${got.join(" | ") || "no violation"}`);
}

// ───────────── FR-05: facts come from the committed blob; the working tree is only the subject inside the allowlist ─────────────

test("evidence: a PRESENT fact is read from the committed blob, not from the working tree", () => {
  const { dir, sha } = fixtureRepo({ "src/a.ts": "export const anchor = 1;\n// the committed anchor line\n" });
  writeFileSync(join(dir, "src/a.ts"), "export const nothing = 0;\n");
  const e = { scope: "DELTA", path: "src/a.ts", anchor: "// the committed anchor line", note: "n" };
  assert.equal(R.evaluateEvidence(e, { root: dir, sha }), null, "BLOB_READ: the committed anchor holds although the working tree no longer has it");
  const onlyInTree = { ...e, anchor: "export const nothing = 0;" };
  const got = R.evaluateEvidence(onlyInTree, { root: dir, sha });
  assert.equal(got?.code, "EVIDENCE_ANCHOR", "BLOB_READ: an anchor that exists only in the working tree is not evidence");
});

test("evidence: an ABSENT fact is read from the committed blob, not from the working tree", () => {
  const { dir, sha } = fixtureRepo({ "src/a.ts": "export const clean = 1;\n" });
  writeFileSync(join(dir, "src/a.ts"), "export const clean = 1;\nconst getCurrentUser = 1;\n");
  const e = { scope: "DELTA", path: "src/a.ts", absent: "getCurrentUser", note: "n" };
  assert.equal(R.evaluateEvidence(e, { root: dir, sha }), null, "BLOB_READ: an edit in the working tree cannot add or remove an absence");
});

test("evidence: every rule holds and fails on a fixture tree", () => {
  const { dir, sha } = fixtureRepo({
    "src/a.ts": "export async function readSites(x) {\n  try {\n    return await x.find();\n  } catch {\n    return [];\n  }\n}\nexport const note = 'audit';\n",
    "src/b.ts": "import { readSites } from './a';\nreadSites(1);\n",
    "scripts/c.mjs": "readSites(2, { correction: true });\n",
    "src/__tests__/skip.test.ts": "readSites(3, { correction: true });\n",
    "prisma/schema.prisma": "model Party {\n  email String?\n  phone String?\n}\n\nmodel PartyInteraction {\n  summary String\n}\n",
  });
  // the working tree no longer resembles the commit: every rule below must still read the COMMITTED blob
  for (const rel of ["src/a.ts", "src/b.ts", "scripts/c.mjs", "prisma/schema.prisma"]) writeFileSync(join(dir, rel), "// BLOB_READ: the working tree differs from the commit\n");
  const ctx = { root: dir, sha };
  const ok = (e) => assert.equal(R.evaluateEvidence({ scope: "DELTA", note: "n", ...e }, ctx), null, `expected to hold: ${JSON.stringify(e)}`);
  const bad = (e, code) => assert.equal(R.evaluateEvidence({ scope: "DELTA", note: "n", ...e }, ctx)?.code, code, `expected ${code}: ${JSON.stringify(e)}`);
  ok({ path: "src/a.ts", rule: "REGEX", pattern: "export const note" });
  bad({ path: "src/a.ts", rule: "REGEX", pattern: "export const missing" }, "EVIDENCE_PATTERN");
  ok({ path: "src/a.ts", rule: "ABSENT_REGEX", pattern: "getCurrentUser" });
  bad({ path: "src/a.ts", rule: "ABSENT_REGEX", pattern: "[Aa]udit" }, "EVIDENCE_ABSENT_PATTERN");
  ok({ path: "src/a.ts", rule: "FN_BODY_REGEX", symbol: "readSites", pattern: "catch\\s*\\{\\s*return \\[\\];\\s*\\}" });
  bad({ path: "src/a.ts", rule: "FN_BODY_REGEX", symbol: "readSites", pattern: "catch\\s*\\{\\s*throw" }, "EVIDENCE_PATTERN");
  bad({ path: "src/a.ts", rule: "FN_BODY_REGEX", symbol: "absentFn", pattern: "x" }, "EVIDENCE_SYMBOL");
  ok({ path: "prisma/schema.prisma", rule: "BLOCK_REGEX", symbol: "model Party", pattern: "email\\s+String\\?" });
  bad({ path: "prisma/schema.prisma", rule: "BLOCK_REGEX", symbol: "model Party", pattern: "summary" }, "EVIDENCE_PATTERN");
  ok({ path: "prisma/schema.prisma", rule: "BLOCK_REGEX", symbol: "model PartyInteraction", pattern: "summary\\s+String" });
  ok({ path: "src/", rule: "TREE_ABSENT_REGEX", pattern: "getCurrentUser" });
  bad({ path: "src/", rule: "TREE_ABSENT_REGEX", pattern: "readSites" }, "EVIDENCE_TREE");
  ok({ path: "src/a.ts", rule: "CALLERS_LACK", pattern: "readSites\\(", lacks: "\\bnever\\b" });
  bad({ path: "src/a.ts", rule: "CALLERS_LACK", pattern: "readSites\\(", lacks: "correction" }, "EVIDENCE_CALLERS");
  bad({ path: "src/a.ts", rule: "CALLERS_LACK", pattern: "noSuchCallee\\(", lacks: "x" }, "EVIDENCE_CALLERS");
  bad({ path: "src/missing.ts", anchor: "export const anchor", note: "n" }, "EVIDENCE_PATH");
  bad({ path: "src/a.ts", rule: "NOT_A_RULE", pattern: "x" }, "EVIDENCE_RULE");
});

test("worktree: a modified product file is refused (WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST)", () => {
  const got = R.worktreeViolations(" M src/lib/executive/report/worker.ts\0");
  assert.deepEqual(got.map((x) => x.code), ["WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST"]);
  assert.equal(got[0].klass, "SOURCES");
});

test("worktree: an untracked product file is refused (WORKTREE_UNTRACKED_OUTSIDE_ALLOWLIST)", () => {
  const got = R.worktreeViolations("?? src/lib/new-file.ts\0?? package.json\0");
  assert.deepEqual(got.map((x) => x.code), ["WORKTREE_UNTRACKED_OUTSIDE_ALLOWLIST", "WORKTREE_UNTRACKED_OUTSIDE_ALLOWLIST"]);
});

test("worktree: a change inside the allowlist is the subject of the review and is not refused on its own", () => {
  const status = [" M .gitattributes", " M docs/security/s1-risk-register.json", "?? docs/security/s1-relock-delta.json", " M scripts/security/s0/getprisma-callsite-inventory.mjs", "?? scripts/security/s1/relock-delta-check.mjs"].join("\0");
  assert.deepEqual(R.worktreeViolations(`${status}\0`), []);
  assert.deepEqual(R.worktreeViolations(`${status}\0 M docs/product/readme.md\0`).map((x) => x.detail), ["docs/product/readme.md"], "a doc outside docs/security is outside the allowlist");
});

test("worktree: the live status of a real repository is read the same way", () => {
  const { dir } = fixtureRepo({ "src/a.ts": "export const a = 1;\n", "docs/security/note.md": "n\n" });
  assert.deepEqual(R.worktreeViolations(R.worktreeStatus(dir)), [], "a clean repository has no violation");
  writeFileSync(join(dir, "docs/security/note.md"), "changed\n");
  assert.deepEqual(R.worktreeViolations(R.worktreeStatus(dir)), [], "an allowlisted edit alone does not fail");
  writeFileSync(join(dir, "src/a.ts"), "export const a = 2;\n");
  writeFileSync(join(dir, "src/b.ts"), "export const b = 1;\n");
  const codes = R.worktreeViolations(R.worktreeStatus(dir)).map((x) => `${x.code}:${x.detail}`).sort();
  assert.deepEqual(codes, ["WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST:src/a.ts", "WORKTREE_UNTRACKED_OUTSIDE_ALLOWLIST:src/b.ts"]);
});

test("head: a descendant that changed only the allowlist is accepted, one that changed a product file is refused", () => {
  const { dir, sha } = fixtureRepo({ "src/a.ts": "export const a = 1;\n", "docs/security/note.md": "n\n" });
  const sources = { integrationMergeSha: sha };
  assert.deepEqual(R.headViolations(sources, dir), [], "HEAD is the integration merge");
  writeFileSync(join(dir, "docs/security/note.md"), "changed\n");
  FIX_GIT(dir, "commit", "-q", "-a", "-m", "docs only");
  assert.deepEqual(R.headViolations(sources, dir), [], "HEAD moved inside the allowlist");
  writeFileSync(join(dir, "src/a.ts"), "export const a = 2;\n");
  FIX_GIT(dir, "commit", "-q", "-a", "-m", "product");
  assert.deepEqual(R.headViolations(sources, dir).map((x) => x.code), ["HEAD_MOVED_OUTSIDE_ALLOWLIST"]);
});

// ───────────── FR-03: the mechanism is a canonical sentence, not a list of keywords ─────────────

const editSummary = (id, from, to) => {
  const d = clone(DATA);
  const f = finding(d, id);
  assert.ok(f.summary.includes(from), `fixture: "${from}" must occur in the summary of ${id}`);
  f.summary = f.summary.replace(from, to);
  return d;
};
const hashRefused = (d, id) => {
  const got = identityCodes(d);
  assert.ok(got.some((x) => x.startsWith("IDENTITY_MECHANISM_HASH") && x.includes(id)), `expected IDENTITY_MECHANISM_HASH for ${id}, got ${got.join(" | ") || "no violation"}`);
};

test("mechanism: a negation flip that keeps every keyword is refused", () => {
  hashRefused(editSummary("RR-001", "returns an empty list when that query throws", "returns an empty list unless that query throws"), "RR-001");
});

test("mechanism: a subject and object swap that keeps every keyword is refused", () => {
  hashRefused(editSummary("RR-001", "The empty list becomes the allowed-site list of the synthetic scope.", "The allowed-site list of the synthetic scope becomes the empty list."), "RR-001");
});

test("mechanism: a success and failure inversion that keeps every keyword is refused", () => {
  hashRefused(editSummary("RR-001", "returns an empty list when that query throws", "returns a populated list when that query throws"), "RR-001");
});

test("mechanism: an owner swap inside the sentence is refused", () => {
  hashRefused(editSummary("RR-002", "An OWNER or ADMIN of an organization whose account is not a platform admin", "A platform admin of an organization whose account is not an OWNER or ADMIN"), "RR-002");
});

test("mechanism: a semantic inversion that keeps every pinned source reference is refused", () => {
  const d = editSummary("RR-010", "Nothing issues a correction, so no report-related audit event is ever written.", "Everything issues a correction, so every report-related audit event is written.");
  hashRefused(d, "RR-010");
  const kept = finding(d, "RR-010").evidence.length;
  assert.equal(kept, finding(DATA, "RR-010").evidence.length, "the evidence and its source references are untouched");
});

test("mechanism: a changed sentence of RR-002, RR-010 or RR-011 in the register is refused as well", () => {
  for (const id of ["RR-001", "RR-002", "RR-010", "RR-011"]) {
    const reg = clone(REGISTER);
    const rf = reg.findings.find((x) => x.findingId === finding(DATA, id).registerFindingId);
    rf.summary = `${rf.summary} It does not.`;
    const got = identityCodes(DATA, reg);
    assert.ok(got.some((x) => x.startsWith("IDENTITY_MECHANISM_HASH") && x.includes("register summary") && x.includes(id)), `expected IDENTITY_MECHANISM_HASH on the register summary of ${id}`);
  }
});

// ───────────── FR-02 / FR-07: facts, domains, derived sets ─────────────

test("identity fact: an edited fact item is refused as not the pinned one", () => {
  const d = clone(DATA);
  const item = finding(d, "RR-001").evidence.find((e) => e.fact === "RR-001.CATCH_EMPTY");
  item.pattern = "catch\\s*(?:\\([^)]*\\))?\\s*\\{\\s*return \\[\\];\\s*\\}|true";
  assert.ok(identityCodes(d).some((x) => x.startsWith("IDENTITY_FACT_CHANGED") && x.includes("RR-001.CATCH_EMPTY")), "IDENTITY_FACT_CHANGED");
});

test("identity fact: a fact name that no pin carries is refused", () => {
  const d = clone(DATA);
  finding(d, "RR-001").evidence[0].fact = "RR-001.INVENTED";
  assert.ok(identityCodes(d).some((x) => x.startsWith("IDENTITY_FACT_UNKNOWN")), "IDENTITY_FACT_UNKNOWN");
});

test("identity fact: a fact carried twice is refused", () => {
  const d = clone(DATA);
  const f = finding(d, "RR-001");
  const twin = clone(f.evidence.find((e) => e.fact === "RR-001.SITE_IDS_FN"));
  f.evidence.push(twin);
  assert.ok(identityCodes(d).some((x) => x.startsWith("IDENTITY_FACT_REPEATED")), "IDENTITY_FACT_REPEATED");
});

test("identity fact: a fact that the committed tree no longer shows fails its evaluation", () => {
  const d = clone(DATA);
  const item = finding(d, "RR-011").evidence.find((e) => e.fact === "RR-011.ERASURE_REGISTRY_LACKS_PARTY");
  assert.equal(R.evaluateEvidence(item, { root: ROOT, sha: DATA.sources.integrationMergeSha }), null, "the committed fact holds");
  const wrong = { ...item, pattern: "\\bPerson\\b|erasure" };
  assert.equal(R.evaluateEvidence(wrong, { root: ROOT, sha: DATA.sources.integrationMergeSha })?.code, "EVIDENCE_ABSENT_PATTERN", "a registry that does name the term fails the absence");
});

test("domain: RR-011 evidence under the report module, and RR-007 evidence under the customer library, are refused", () => {
  const a = clone(DATA);
  finding(a, "RR-011").evidence.push({ scope: "DELTA", path: "src/lib/executive/report/generate.ts", anchor: "export async function generateDailyReport(", note: "wrong domain" });
  assert.ok(identityCodes(a).some((x) => x.startsWith("IDENTITY_DOMAIN_MIXED") && x.includes("RR-011")), "RR-011 must stay on the customer records");
  const b = clone(DATA);
  finding(b, "RR-007").evidence.push({ scope: "DELTA", path: "src/lib/customers/service.ts", anchor: "export async function createCustomer(", note: "wrong domain" });
  assert.ok(identityCodes(b).some((x) => x.startsWith("IDENTITY_DOMAIN_MIXED") && x.includes("RR-007")), "RR-007 must stay on the frozen report snapshots");
});

test("gate sets: the derived route sets, counts and the partyId writer are pinned", () => {
  const gate = DATA.derivedFacts.platformCapabilityGate;
  assert.equal(gate.erpRoutes.list.length, gate.erpRoutes.files, "the ERP route set is listed");
  assert.equal(gate.erpRoutes.withGetCurrentUser, gate.erpRoutes.files, "every ERP route reads the platform identity");
  assert.equal(gate.customerRoutes.withGetCurrentUser, 0, "no customer route reads the platform identity");
  assert.equal(gate.customerRoutes.withEquivalentGate, 0, "no customer route carries an equivalent gate");
  assert.deepEqual(gate.partyIdWriters, ["src/lib/customers/service.ts"]);
  for (const [label, mutate] of [
    ["ERP getCurrentUser count", (g) => (g.erpRoutes.withGetCurrentUser -= 1)],
    ["ERP list", (g) => g.erpRoutes.list.pop()],
    ["customer getCurrentUser count", (g) => (g.customerRoutes.withGetCurrentUser = 1)],
    ["customer equivalent gate", (g) => (g.customerRoutes.withEquivalentGate = 1)],
    ["customer list emptied", (g) => (g.customerRoutes.list = [])],
    ["partyId writer", (g) => (g.partyIdWriters = [])],
  ]) {
    const derived = clone(DATA.derivedFacts);
    mutate(derived.platformCapabilityGate);
    assert.ok(identityCodes(DATA, REGISTER, derived).some((x) => x.startsWith("IDENTITY_GATE_SETS")), `IDENTITY_GATE_SETS: ${label}`);
  }
});

test("correction callers: the derived callers of generateDailyReport must exist and must not pass a correction", () => {
  const c = DATA.derivedFacts.reportCorrectionCallers;
  assert.deepEqual(c.callers, ["src/lib/executive/report/worker.ts"]);
  assert.deepEqual(c.withCorrection, []);
  const none = clone(DATA.derivedFacts);
  none.reportCorrectionCallers.callers = [];
  assert.ok(identityCodes(DATA, REGISTER, none).some((x) => x.startsWith("IDENTITY_CORRECTION_CALLERS")), "no callers");
  const used = clone(DATA.derivedFacts);
  used.reportCorrectionCallers.withCorrection = ["src/lib/executive/report/worker.ts"];
  assert.ok(identityCodes(DATA, REGISTER, used).some((x) => x.startsWith("IDENTITY_CORRECTION_CALLERS")), "a caller passes a correction");
});

// ───────────── FR-06: the policy of R-73 and R-72 is two-sided and undecided ─────────────

test("policy: R-73 must keep both branches and the remediation must not choose one", () => {
  const one = clone(REGISTER);
  const r = one.risks.find((x) => x.riskId === "R-73");
  r.policy.branches.pop();
  r.acceptanceCriteria.pop();
  const got = identityCodes(DATA, one);
  assert.ok(got.some((x) => x.startsWith("IDENTITY_POLICY") && x.includes("2 branches")), "IDENTITY_POLICY: one branch");
  assert.ok(got.some((x) => x.startsWith("IDENTITY_ACCEPTANCE") && x.includes("tenant OWNER and ADMIN")), "IDENTITY_ACCEPTANCE: the second branch");
  const decided = clone(REGISTER);
  decided.risks.find((x) => x.riskId === "R-73").policy.status = "DECIDED";
  assert.ok(identityCodes(DATA, decided).some((x) => x.startsWith("IDENTITY_POLICY") && x.includes("decided")), "IDENTITY_POLICY: a decided policy");
  // a decision that carries the owner's evidence is the owner's, not the remediation's
  const ownerRoot = mkdtempSync(join(SCRATCH, "owner-"));
  try {
    mkdirSync(join(ownerRoot, "docs", "owner"), { recursive: true });
    const anchor = "Owner decision for R-73: PLATFORM_ADMIN_REQUIRED applies to the customer surface.";
    writeFileSync(join(ownerRoot, "docs", "owner", "decision.md"), `# Decisions\n\n${anchor}\n`);
    const owned = clone(REGISTER);
    const o = owned.risks.find((x) => x.riskId === "R-73");
    o.policy.status = "DECIDED";
    o.policy.ownerDecisionEvidence = { source: "docs/owner/decision.md", anchor, decidedBranchId: "PLATFORM_ADMIN_REQUIRED", decidedByRole: o.policy.ownerRole };
    o.revision = { scope: "OWNER_POLICY_DECISION", supersedes: { policyStatus: "OPEN" }, reason: "The owner decision for R-73 chose PLATFORM_ADMIN_REQUIRED." };
    const viaRoot = (reg, root) => R.identityViolations(DATA, reg, DATA.derivedFacts, root).map((x) => `${x.code}: ${x.detail}`);
    assert.deepEqual(viaRoot(owned, ownerRoot).filter((x) => x.startsWith("IDENTITY_POLICY")), [], "IDENTITY_POLICY_OWNED: a decision with the owner's evidence is not the remediation's choice");
    o.policy.ownerDecisionEvidence.source = "docs/security/s1-risk-register.json";
    assert.ok(viaRoot(owned, ownerRoot).some((x) => x.startsWith("IDENTITY_POLICY") && x.includes("POLICY_EVIDENCE_SELF_REFERENCE")), "IDENTITY_POLICY_SELF: evidence that is a deliverable is the remediation's own choice");
  } finally {
    rmSync(ownerRoot, { recursive: true, force: true });
  }
});

test("policy: the acceptance of R-73 and R-72 names both outcomes and a test for each", () => {
  const r73 = REGISTER.risks.find((x) => x.riskId === "R-73");
  const r72 = REGISTER.risks.find((x) => x.riskId === "R-72");
  const text73 = r73.acceptanceCriteria.join("\n");
  assert.match(text73, /If the owner decides that the platform-administrator capability is required/);
  assert.match(text73, /If the owner decides that tenant OWNER and ADMIN may use the customer surface/);
  assert.match(text73, /every role without view_erp/);
  const text72 = r72.acceptanceCriteria.join("\n");
  assert.match(text72, /erasure-targets, export-sources and processing-inventory/);
  assert.match(text72, /erasure-governance and export-governance/);
  assert.match(text72, /exempt with that basis/);
  assert.ok(!r73.acceptanceCriteria.some((c) => /^The owner records the intended policy/.test(c)), "the bare decision request is gone");
});

test("register text: no pointer to a finished reconciliation survives in R-69", () => {
  const r69 = REGISTER.risks.find((x) => x.riskId === "R-69");
  const text = JSON.stringify(r69);
  assert.ok(!/must be reconciled with the reviewer/.test(text), "the process note is gone");
  assert.ok(!/OPEN-3/.test(text), "no pointer to OPEN-3");
  assert.ok(r69.preconditions.length >= 2);
});

// ───────────── FR-02: one test per pinned fact — dropping the evidence of a fact is refused ─────────────

test("identity fact: dropping RR-001.SITE_IDS_FN is refused", () => {
  dropFact("RR-001", "RR-001.SITE_IDS_FN");
});

test("identity fact: dropping RR-001.MISSING_DELEGATE_EMPTY is refused", () => {
  dropFact("RR-001", "RR-001.MISSING_DELEGATE_EMPTY");
});

test("identity fact: dropping RR-001.CATCH_EMPTY is refused", () => {
  dropFact("RR-001", "RR-001.CATCH_EMPTY");
});

test("identity fact: dropping RR-001.SCOPE_CONSUMES is refused", () => {
  dropFact("RR-001", "RR-001.SCOPE_CONSUMES");
});

test("identity fact: dropping RR-001.EMPTY_TO_FORBIDDEN is refused", () => {
  dropFact("RR-001", "RR-001.EMPTY_TO_FORBIDDEN");
});

test("identity fact: dropping RR-001.CORRECTION_OPTION is refused", () => {
  dropFact("RR-001", "RR-001.CORRECTION_OPTION");
});

test("identity fact: dropping RR-001.ALREADY_REPORTED_GUARD is refused", () => {
  dropFact("RR-001", "RR-001.ALREADY_REPORTED_GUARD");
});

test("identity fact: dropping RR-001.WORKER_NEVER_PASSES is refused", () => {
  dropFact("RR-001", "RR-001.WORKER_NEVER_PASSES");
});

test("identity fact: dropping RR-001.NO_CORRECTION_CALLER is refused", () => {
  dropFact("RR-001", "RR-001.NO_CORRECTION_CALLER");
});

test("identity fact: dropping RR-002.PROJECTS_PERMISSION_ONLY is refused", () => {
  dropFact("RR-002", "RR-002.PROJECTS_PERMISSION_ONLY");
});

test("identity fact: dropping RR-002.ERP_REFERENCE_GATE is refused", () => {
  dropFact("RR-002", "RR-002.ERP_REFERENCE_GATE");
});

test("identity fact: dropping RR-002.PARTY_WRITE is refused", () => {
  dropFact("RR-002", "RR-002.PARTY_WRITE");
});

test("identity fact: dropping RR-002.NO_GETCURRENTUSER_PROJECTS is refused", () => {
  dropFact("RR-002", "RR-002.NO_GETCURRENTUSER_PROJECTS");
});

test("identity fact: dropping RR-002.NO_ADMIN_GATE_PROJECTS is refused", () => {
  dropFact("RR-002", "RR-002.NO_ADMIN_GATE_PROJECTS");
});

test("identity fact: dropping RR-002.NO_GETCURRENTUSER_LIST is refused", () => {
  dropFact("RR-002", "RR-002.NO_GETCURRENTUSER_LIST");
});

test("identity fact: dropping RR-002.CUSTOMER_TREE_NO_GATE is refused", () => {
  dropFact("RR-002", "RR-002.CUSTOMER_TREE_NO_GATE");
});

test("identity fact: dropping RR-002.PAGE_SCOPE_NO_GATE is refused", () => {
  dropFact("RR-002", "RR-002.PAGE_SCOPE_NO_GATE");
});

test("identity fact: dropping RR-002.PAGES_ORG_PERMISSION_ONLY is refused", () => {
  dropFact("RR-002", "RR-002.PAGES_ORG_PERMISSION_ONLY");
});

test("identity fact: dropping RR-010.AUDIT_ONLY_ON_CORRECTION is refused", () => {
  dropFact("RR-010", "RR-010.AUDIT_ONLY_ON_CORRECTION");
});

test("identity fact: dropping RR-010.SINGLE_AUDIT_CALL is refused", () => {
  dropFact("RR-010", "RR-010.SINGLE_AUDIT_CALL");
});

test("identity fact: dropping RR-010.CREATE_NOT_AUDITED is refused", () => {
  dropFact("RR-010", "RR-010.CREATE_NOT_AUDITED");
});

test("identity fact: dropping RR-010.NO_WORKER_AUDIT is refused", () => {
  dropFact("RR-010", "RR-010.NO_WORKER_AUDIT");
});

test("identity fact: dropping RR-010.NO_READ_AUDIT is refused", () => {
  dropFact("RR-010", "RR-010.NO_READ_AUDIT");
});

test("identity fact: dropping RR-010.NO_LIST_PAGE_AUDIT is refused", () => {
  dropFact("RR-010", "RR-010.NO_LIST_PAGE_AUDIT");
});

test("identity fact: dropping RR-010.NO_DETAIL_PAGE_AUDIT is refused", () => {
  dropFact("RR-010", "RR-010.NO_DETAIL_PAGE_AUDIT");
});

test("identity fact: dropping RR-010.NO_RUN_ROUTE_AUDIT is refused", () => {
  dropFact("RR-010", "RR-010.NO_RUN_ROUTE_AUDIT");
});

test("identity fact: dropping RR-010.NO_DB_TRIGGER_MIGRATION is refused", () => {
  dropFact("RR-010", "RR-010.NO_DB_TRIGGER_MIGRATION");
});

test("identity fact: dropping RR-010.NO_DB_TRIGGER_ANYWHERE is refused", () => {
  dropFact("RR-010", "RR-010.NO_DB_TRIGGER_ANYWHERE");
});

test("identity fact: dropping RR-011.PARTY_PERSONAL_FIELDS is refused", () => {
  dropFact("RR-011", "RR-011.PARTY_PERSONAL_FIELDS");
});

test("identity fact: dropping RR-011.INTERACTION_FREE_TEXT is refused", () => {
  dropFact("RR-011", "RR-011.INTERACTION_FREE_TEXT");
});

test("identity fact: dropping RR-011.ERASURE_REGISTRY_LACKS_PARTY is refused", () => {
  dropFact("RR-011", "RR-011.ERASURE_REGISTRY_LACKS_PARTY");
});

test("identity fact: dropping RR-011.EXPORT_REGISTRY_LACKS_PARTY is refused", () => {
  dropFact("RR-011", "RR-011.EXPORT_REGISTRY_LACKS_PARTY");
});

test("identity fact: dropping RR-011.INVENTORY_LACKS_PARTY is refused", () => {
  dropFact("RR-011", "RR-011.INVENTORY_LACKS_PARTY");
});

test("identity fact: dropping RR-011.NO_DELETE_IN_LIB is refused", () => {
  dropFact("RR-011", "RR-011.NO_DELETE_IN_LIB");
});

test("identity fact: dropping RR-011.NO_DELETE_IN_ROUTES is refused", () => {
  dropFact("RR-011", "RR-011.NO_DELETE_IN_ROUTES");
});

test("identity fact: dropping RR-011.NO_ANONYMISE_OR_EXPORT is refused", () => {
  dropFact("RR-011", "RR-011.NO_ANONYMISE_OR_EXPORT");
});

test("identity fact: dropping RR-011.ONLY_ORG_CASCADE is refused", () => {
  dropFact("RR-011", "RR-011.ONLY_ORG_CASCADE");
});

test("identity fact: dropping RR-011.NOTHING_DELETED_NOTE is refused", () => {
  dropFact("RR-011", "RR-011.NOTHING_DELETED_NOTE");
});


// ───────────── wiring: the gates above are the ones checkRelock actually runs ─────────────

const CHECKER_SOURCE = readFileSync(new URL("../relock-delta-check.mjs", import.meta.url), "utf8");
const checkRelockBody = () => {
  const start = CHECKER_SOURCE.indexOf("export function checkRelock(");
  const end = CHECKER_SOURCE.indexOf("export const AUTHORITATIVE_IDENTITIES", start);
  assert.ok(start > 0 && end > start, "the checkRelock function must be locatable");
  return CHECKER_SOURCE.slice(start, end);
};

test("wiring: checkRelock applies the head gate", () => {
  assert.match(checkRelockBody(), /out\.push\(\.\.\.headViolations\(s, root\)\)/, "WIRING_HEAD: checkRelock must push headViolations");
});

test("wiring: checkRelock applies the worktree gate", () => {
  assert.match(checkRelockBody(), /out\.push\(\.\.\.worktreeViolations\(worktreeStatus\(root\)\)\)/, "WIRING_WORKTREE: checkRelock must push worktreeViolations");
});

test("wiring: checkRelock evaluates every evidence item against the committed integration merge", () => {
  assert.match(checkRelockBody(), /const evidenceCtx = \{ root, sha: s\.integrationMergeSha \}/, "WIRING_EVIDENCE_SHA: the evidence context names the integration merge");
  assert.match(checkRelockBody(), /checkEvidence\(f\.evidence, w, evidenceCtx, deltaPaths, add\)/, "WIRING_EVIDENCE_CTX: findings use the committed context");
});

// ═══════════════ remediation of the post-remediation review (POSTREV-F1, F4, F5) ═══════════════

// ───────────── POSTREV-F4: index flags that hide a change ─────────────

test("index flags: the ls-files tags are parsed as assume-unchanged (lowercase), skip-worktree (S) and plain", () => {
  const got = R.indexFlagViolations("H src/a.ts\0h src/b.ts\0S src/c.ts\0s src/d.ts\0C src/e.ts\0");
  assert.deepEqual(got.map((x) => `${x.code}:${x.detail}`), ["INDEX_ASSUME_UNCHANGED:src/b.ts", "INDEX_SKIP_WORKTREE:src/c.ts", "INDEX_ASSUME_UNCHANGED:src/d.ts"], "INDEX_PARSE: lowercase is assume-unchanged, S is skip-worktree");
  assert.ok(got.every((x) => x.klass === "SOURCES"), "INDEX_CLASS: the source lock class");
  assert.deepEqual(R.indexFlagViolations("H src/a.ts\0H docs/security/n.md\0"), [], "INDEX_PLAIN: an ordinary index passes");
});

test("index flags: assume-unchanged and skip-worktree hide a product edit from status and are refused, modified or not", () => {
  const { dir } = fixtureRepo({ "src/a.ts": "export const a = 1;\n", "src/b.ts": "export const b = 1;\n", "docs/security/note.md": "n\n" });
  const flagged = () => R.indexFlagViolations(R.indexFlags(dir)).map((x) => `${x.code}:${x.detail}`).sort();
  assert.deepEqual(flagged(), [], "INDEX_PLAIN: a plain index passes");
  writeFileSync(join(dir, "src/a.ts"), "export const a = 2;\n");
  assert.equal(R.worktreeViolations(R.worktreeStatus(dir)).length, 1, "the edit is visible before it is hidden");
  FIX_GIT(dir, "update-index", "--assume-unchanged", "src/a.ts");
  assert.deepEqual(R.worktreeViolations(R.worktreeStatus(dir)), [], "INDEX_HIDDEN: status no longer shows the edit");
  assert.deepEqual(flagged(), ["INDEX_ASSUME_UNCHANGED:src/a.ts"], "INDEX_ASSUME_UNCHANGED: a modified product file under assume-unchanged is refused");
  FIX_GIT(dir, "update-index", "--no-assume-unchanged", "src/a.ts");
  FIX_GIT(dir, "update-index", "--skip-worktree", "src/a.ts");
  assert.deepEqual(R.worktreeViolations(R.worktreeStatus(dir)), [], "INDEX_HIDDEN: skip-worktree hides it too");
  assert.deepEqual(flagged(), ["INDEX_SKIP_WORKTREE:src/a.ts"], "INDEX_SKIP_WORKTREE: a modified product file under skip-worktree is refused");
  FIX_GIT(dir, "update-index", "--no-skip-worktree", "src/a.ts");
  assert.deepEqual(flagged(), [], "INDEX_CLEARED: clearing the flag restores the lock");
  assert.equal(R.worktreeViolations(R.worktreeStatus(dir)).length, 1, "INDEX_CLEARED: the edit is visible again");
  FIX_GIT(dir, "update-index", "--assume-unchanged", "src/b.ts");
  assert.deepEqual(flagged(), ["INDEX_ASSUME_UNCHANGED:src/b.ts"], "INDEX_UNMODIFIED: a flag on an unmodified file is refused as well");
  FIX_GIT(dir, "update-index", "--assume-unchanged", "docs/security/note.md");
  assert.deepEqual(flagged(), ["INDEX_ASSUME_UNCHANGED:docs/security/note.md", "INDEX_ASSUME_UNCHANGED:src/b.ts"], "INDEX_ALLOWLIST: a flag on an allowlisted path is refused too");
});

test("wiring: checkRelock applies the index-flag gate", () => {
  assert.match(checkRelockBody(), /out\.push\(\.\.\.indexFlagViolations\(indexFlags\(root\)\)\)/, "WIRING_INDEX: checkRelock must push indexFlagViolations");
});

// ───────────── POSTREV-F5-A: a lone CR is a line ending ─────────────

test("eol: the blob reader turns LF, CRLF and CR-only into the same text", () => {
  const body = "line one\nline two\nline three\n";
  const { dir, sha } = fixtureRepo({ "src/lf.ts": body, "src/crlf.ts": body.replace(/\n/g, "\r\n"), "src/cr.ts": body.replace(/\n/g, "\r") });
  const texts = ["src/lf.ts", "src/crlf.ts", "src/cr.ts"].map((p) => R.blobText(dir, sha, p));
  assert.deepEqual(texts, [body, body, body], "EOL_BLOB: all three conventions read identically");
});

// ───────────── POSTREV-F5-B: the partyId writer is a Prisma write, not a lookalike ─────────────

test("partyId writer: a partyId property of the data of a project write is found, in any property order and layout", () => {
  const W = (arg) => `export async function f(tx, id, next, x) {\n  await tx.erpProject.updateMany(${arg});\n}\n`;
  const one = (label, arg, line = 2) => assert.deepEqual(R.partyIdWriteSites(W(arg)), [line], `PARTY_POSITIVE: ${label}`);
  one("the first property", "{ where: { id }, data: { partyId: next } }");
  one("a shorthand property", "{ where: { id }, data: { partyId } }");
  one("after another property", "{ where: { id }, data: { name, partyId: next } }");
  one("after a plain property", "{ where: { id }, data: { name: 1, partyId: next } }");
  one("after a spread", "{ where: { id }, data: { ...x, partyId: next } }");
  one("between a spread and a property", "{ where: { id }, data: { ...x, partyId: next, name: 1 } }");
  one("data written before where", "{ data: { name: 1, partyId: next }, where: { id } }");
  one("a quoted key", "{ where: { id }, data: { 'partyId': next } }");
  one("a quoted key, double quotes", '{ where: { id }, data: { "partyId": next } }');
  one("a shorthand property that is last", "{ where: { id }, data: { name: 1, partyId } }");
  one("a regular-expression literal with a quote on the same line", "{ where: { id }, data: { name: /'/.test(x), partyId: next } }");
  assert.deepEqual(R.partyIdWriteSites(W("{\n  where: { id },\n  data: {\n    name: 'a',\n    // the customer\n    partyId:\n      next,\n  },\n}")), [7], "PARTY_POSITIVE: a many-line object reports the line of the property");
  assert.equal(R.partyIdWriteSites("await tx.erpProject.create({ data: { name, partyId: next } });").length, 1, "PARTY_POSITIVE: create");
  assert.equal(R.partyIdWriteSites("await tx.erpProject.create<Row>({ data: { a: 1, partyId } });").length, 1, "PARTY_POSITIVE: a generic call");
  assert.equal(R.partyIdWriteSites("await tx?.erpProject?.update({ where: { id }, data: { a: 1, partyId } });").length, 1, "PARTY_POSITIVE: optional chaining");
  assert.deepEqual(R.partyIdWriteSites("await tx.erpProject.createMany({ data: [ { a: 1 }, { a: 2, partyId: p } ] });"), [1], "PARTY_POSITIVE: an element of a createMany array");
  assert.deepEqual(R.partyIdWriteSites("await db.erpProject.upsert({ where: { id }, create: { a: 1, partyId: p }, update: { name: 2 } });"), [1], "PARTY_POSITIVE: the create payload of an upsert");
  assert.deepEqual(R.partyIdWriteSites("await db.erpProject.upsert({ where: { id }, create: { a: 1 }, update: { b: 2, partyId: p } });"), [1], "PARTY_POSITIVE: the update payload of an upsert");
  const write = "await tx.erpProject.updateMany({\n  where: { id },\n  data: { partyId: next },\n});\n";
  assert.deepEqual(R.partyIdWriteSites(write), [3], "PARTY_POSITIVE: updateMany data");
});

test("partyId writer: a lookalike key, another place, a comment, a string or another model is not a write", () => {
  const W = (arg) => `export async function f(tx, id, next, x) {\n  await tx.erpProject.updateMany(${arg});\n}\n`;
  const none = (label, text) => assert.deepEqual(R.partyIdWriteSites(text), [], `PARTY_NEGATIVE: ${label}`);
  none("metadata", W("{ where: { id }, metadata: { partyId: next } }"));
  none("auditData", W("{ where: { id }, auditData: { partyId: next } }"));
  none("someData", W("{ where: { id }, someData: { partyId: next } }"));
  none("my_data", W("{ where: { id }, my_data: { partyId: next } }"));
  none("where", W("{ where: { partyId: next }, data: { name: 1 } }"));
  none("select", W("{ where: { id }, select: { partyId: true }, data: { name: 1 } }"));
  none("a nested object of the data", W("{ where: { id }, data: { meta: { partyId: next } } }"));
  none("a relation write", W("{ where: { id }, data: { party: { connect: { id: next } } } }"));
  none("a spread of a value that is called partyId", W("{ where: { id }, data: { ...partyId } }"));
  none("a block comment with a comma", W("{ where: { id }, data: { name: 1, /* a, partyId: next */ other: 2 } }"));
  none("a block comment after a value", W("{ where: { id }, data: { name: 1 /* a, partyId: next */, other: 2 } }"));
  none("a line comment with a comma", W("{ where: { id }, data: { name: 1,\n // a, partyId: next\n other: 2 } }"));
  none("a string with a comma", W("{ where: { id }, data: { note: 'a, partyId: next', other: 2 } }"));
  none("a template with a comma", W("{ where: { id }, data: { note: `a, partyId: ${next}`, other: 2 } }"));
  none("an object outside any call", "const x = { data: { partyId: next } };\n");
  none("a read call", "await tx.erpProject.findMany({ where: { id }, data: { partyId: next } });\n");
  none("a comment before any call", "// data: { partyId: next } in a comment, no write call before it\n");
  none("a call on another receiver", "await tx.somethingElse.update({ where: { id }, data: { partyId: next } });\n");
  none("a write on another model: the interaction's own partyId", "await tx.partyInteraction.create({ data: { organizationId: o, partyId, kind: k } });\n");
  none("a payload that is not an object literal", W("{ where: { id }, data: payload }"));
  none("an unbalanced call is not read", "await tx.erpProject.update({ where: { id }, data: { partyId: next ");
});

test("partyId writer: the committed tree has exactly one project write of the customer, found through the structural reader", () => {
  assert.deepEqual(DATA.derivedFacts.platformCapabilityGate.partyIdWriters, ["src/lib/customers/service.ts"], "PARTY_TREE: only the customer service writes a project's customer");
  const fresh = R.gatherDerivedFacts(DATA.sources, ROOT);
  assert.deepEqual(fresh.platformCapabilityGate.partyIdWriters, ["src/lib/customers/service.ts"], "PARTY_TREE: the writer set the checker derives from the target tree is the same");
  const sites = R.partyIdWriteSites(R.blobText(ROOT, DATA.sources.targetMainSha, "src/lib/customers/service.ts"));
  assert.deepEqual(sites, [630], "PARTY_TREE_LINE: the customer service writes the project's partyId once, at the unlink-and-link write");
});

test("partyId writer: only a file with a real project write is a writer, a file that merely names the column is not", () => {
  const { dir, sha } = fixtureRepo({
    "src/real.ts": "export async function f(tx, id, next) {\n  await tx.erpProject.updateMany({ where: { id }, data: { name: 1, partyId: next } });\n}\n",
    "src/real-spread.ts": "export async function g(tx, id, x, next) {\n  await tx.erpProject.update({ where: { id }, data: { ...x, partyId: next } });\n}\n",
    "src/lookalike.ts": "export const a = { metadata: { partyId: 1 } };\n",
    "src/reader.ts": "export const b = (p) => p.partyId;\n",
    "src/loose.ts": "const x = { data: { partyId: 2 } };\n",
    "src/interaction.ts": "export async function h(tx, o, partyId) {\n  await tx.partyInteraction.create({ data: { organizationId: o, partyId } });\n}\n",
  });
  assert.deepEqual(R.partyIdWriterFiles({ targetMainSha: sha }, dir), ["src/real-spread.ts", "src/real.ts"], "PARTY_FILES: the writer set is the structural one, not every file that names the column");
});

// ───────────── POSTREV-F5-C: stale process wording ─────────────

test("stale text: the wording is refused in any spelling in the delta document and in the report, and the third open item states a fact", () => {
  expectCode("STALE_PROCESS_TEXT", mutated((d) => (finding(d, "RR-003").summary += " It follows the reviewer\u2019s text.")), "CONTENT");
  expectCode("STALE_PROCESS_TEXT", mutated((d) => (finding(d, "RR-003").summary += " It must  be reconciled with the brief.")), "CONTENT");
  expectCode("STALE_PROCESS_TEXT", { md: `${MD}\nA closing remark: the reviewer's\ntext is pending.\n` }, "CONTENT");
  expectCode("STALE_PROCESS_TEXT", { md: `${MD}\nA closing remark: it must\tbe reconciled.\n` }, "CONTENT");
  const open3 = DATA.openItems.find((x) => x.id === "OPEN-3");
  assert.ok(open3 && !/reviewer|reconcil|pending/i.test(open3.statement), "OPEN3_FACTUAL: the open item states what the findings are, not a step of a process");
});

test("stale text: process wording in the delta document or the report is refused, a defining open-item id is not, a quotation marker exempts", () => {
  expectCode("STALE_PROCESS_TEXT", mutated((d) => (finding(d, "RR-003").summary += " It must be reconciled with the reviewer's text.")), "CONTENT");
  expectCode("STALE_PROCESS_TEXT", mutated((d) => (finding(d, "RR-003").summary += " See OPEN-3 for what is left.")), "CONTENT");
  expectCode("STALE_PROCESS_TEXT", { md: `${MD}\nA closing remark: this is pending reviewer evidence.\n` }, "CONTENT");
  const quoted = run(mutated((d) => (finding(d, "RR-003").summary += " An earlier draft said \"pending reviewer evidence\" [SUPERSEDED-QUOTE].")));
  assert.ok(!quoted.some((x) => x.code === "STALE_PROCESS_TEXT"), "STALE_QUOTED: the explicit marker exempts a quotation");
  const clean = run();
  assert.ok(!clean.some((x) => x.code === "STALE_PROCESS_TEXT"), "STALE_CLEAN: the open items may be named by their own ids");
});
