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
  inv.callSites.find((c) => c.id === "src/lib/executive/report/read.ts#L101C36").classification = "UNRESOLVED_REQUIRES_MANUAL_REVIEW";
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
  assert.equal(REGISTER.risks.length - snap.risks, REGISTER.risks.filter((r) => r.originScope === "DELTA_RELOCK" || r.originScope === "DELTA_RELOCK_2").length, "expected the difference to be exactly the delta risks");
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
  assert.deepEqual(R.headViolations(sources, dir).map((x) => x.code), ["HEAD_COMMIT_OUTSIDE_ALLOWLIST", "HEAD_MOVED_OUTSIDE_ALLOWLIST"]);
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
  // POSITION-INDEPENDENT: this reads the text of the checker, not the repository, so it answers the same at any HEAD.
  assert.match(checkRelockBody(), /out\.push\(\.\.\.headViolations\(s, root, headBase\)\)/, "WIRING_HEAD: checkRelock must push headViolations");
});

test("wiring: checkRelock applies the worktree gate", () => {
  // POSITION-INDEPENDENT: this reads the text of the checker, not the repository, so it answers the same at any HEAD.
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

// ───────────── the second layer: the supplementary relock of the delta between two targets ─────────────
//
// The second-layer document is checked by the SAME checker. These tests prove that the layers stay apart (their own
// identifiers, sources, pins and head base), that a sealed first layer cannot be moved by a later tree, and that the
// second layer is continuous with the first (its range base is the first target, its "before" the first layer's "after").

const PATHS2 = R.defaultPaths(ROOT, "SECOND");
const DATA2 = JSON.parse(readFileSync(PATHS2.data, "utf8"));
const MD2 = lf(readFileSync(PATHS2.report, "utf8"));

function run2({ data = DATA2, md = MD2, record = RECORD, register } = {}) {
  const paths = { ...PATHS2 };
  if (register) paths.register = tmpJson(register);
  return R.checkRelock(data, md, paths, record);
}
function expectCode2(code, options, klass) {
  const found = run2(options);
  const codes = found.map((x) => x.code);
  assert.ok(codes.includes(code), `expected ${code}, got ${codes.join(",") || "no violation"}`);
  if (klass) assert.ok(found.some((x) => x.code === code && x.klass === klass), `expected ${code} in class ${klass}`);
}
function mutated2(fn) {
  const d = clone(DATA2);
  fn(d);
  return { data: d };
}

test("layer 2: the committed second-layer provenance has no violation", () => {
  const found = run2();
  assert.deepEqual(found, [], `expected no violation, got ${found.map((x) => `${x.klass}/${x.code}`).join(",")}`);
});

test("layer 2: the committed second-layer document is in canonical form", () => {
  assert.equal(R.serialize(R.canonicalize(clone(DATA2), PATHS2)), readFileSync(PATHS2.data, "utf8"), "expected the committed second-layer document to be canonical");
});

test("layer 2: the layers are continuous — the range base, the security head and the original source line up", () => {
  assert.equal(DATA2.sources.frozenSourceSha, DATA.sources.targetMainSha, "LAYER_CONTINUITY: the second range starts at the first target");
  assert.equal(DATA2.sources.securityHeadSha, DATA.sources.reconciledTreeSha, "LAYER_CONTINUITY: the second security head is the first layer's sealed tree");
  assert.equal(DATA2.sources.originalFrozenSourceSha, DATA.sources.frozenSourceSha, "LAYER_CONTINUITY: both layers name the same original frozen source");
  assert.deepEqual(DATA2.getPrisma.before, DATA.getPrisma.after, "LAYER_CONTINUITY: what the second layer starts from is what the first layer ended with");
});

test("layer 2: a second-layer document without the original frozen source is refused", () => {
  expectCode2("ORIGINAL_FROZEN_SOURCE_ABSENT", mutated2((d) => delete d.sources.originalFrozenSourceSha), "SOURCES");
});

test("layer 2: an original frozen source that is not a proper ancestor of the range base is refused", () => {
  expectCode2("ORIGINAL_FROZEN_SOURCE_NOT_ANCESTOR", mutated2((d) => (d.sources.originalFrozenSourceSha = d.sources.frozenSourceSha)), "SOURCES");
  expectCode2("ORIGINAL_FROZEN_SOURCE_NOT_ANCESTOR", mutated2((d) => (d.sources.originalFrozenSourceSha = d.sources.targetMainSha)), "SOURCES");
});

test("layer 2: a first-layer document that names an original frozen source is refused", () => {
  expectCode("ORIGINAL_FROZEN_SOURCE_UNEXPECTED", mutated((d) => (d.sources.originalFrozenSourceSha = d.sources.frozenSourceSha)), "SOURCES");
});

test("layer 2: a reconciled tree commit that does not descend from the integration merge is refused", () => {
  expectCode("RECONCILED_TREE_NOT_DESCENDANT", mutated((d) => (d.sources.reconciledTreeSha = d.sources.securityHeadSha)), "SOURCES");
});

test("layer 2: a second-layer derived section the tree does not produce is refused", () => {
  expectCode2("DERIVED_DRIFT", mutated2((d) => (d.delta.paths.total += 1)), "DERIVED_DRIFT");
});

test("layer 2: a call site the second range added with no recorded review is refused", () => {
  expectCode2("CALLSITE_NOT_REVIEWED", mutated2((d) => d.reviewedCallsites.pop()), "DERIVED_DRIFT");
});

test("layer 2: a first-layer identifier in a second-layer document is refused", () => {
  expectCode2("FINDING_LAYER", mutated2((d) => (d.findings[0].findingId = "RL-001")), "FINDINGS");
});

test("layer 2: a second-layer identifier in a first-layer document is refused", () => {
  expectCode("FINDING_LAYER", mutated((d) => (finding(d, "RL-001").findingId = "RS-001")), "FINDINGS");
});

test("layer 2: an observation of the wrong layer is refused", () => {
  expectCode2("OBSERVATION_ID", mutated2((d) => (d.positiveControls[0].id = "RL-P09")), "FINDINGS");
});

test("layer 2: a second-layer finding that claims a new risk is refused", () => {
  expectCode2("SECOND_LAYER_NEW_RISK", mutated2((d) => (d.findings[0].disposition = "OWNED_BY_NEW_RISK")), "FINDINGS");
});

test("layer 2: a register finding of the second layer missing from its document is refused", () => {
  expectCode2("REGISTER_FINDING_MISSING_FROM_DELTA", mutated2((d) => d.findings.pop()), "FINDINGS");
});

test("layer 2: the first-layer document is not asked to declare the second layer's findings", () => {
  const found = run();
  assert.ok(!found.some((x) => x.code === "REGISTER_FINDING_MISSING_FROM_DELTA"), "LAYER_SOURCE_FILTER: expected no REGISTER_FINDING_MISSING_FROM_DELTA for the first-layer document");
});

test("layer 2: the content pins of the first layer are not applied to the second", () => {
  const found = run2();
  assert.ok(!found.some((x) => x.code.startsWith("IDENTITY_")), "LAYER_PIN_SCOPE: expected no IDENTITY_ violation for the second-layer document");
  assert.ok(R.identityViolations(DATA2, REGISTER, DATA2.derivedFacts, ROOT).some((x) => x.code === "IDENTITY_MISSING"), "LAYER_PIN_SCOPE: the pins themselves are first-layer content");
});

test("layer 2: the first layer is held to the later integration merge, the second to its own", () => {
  assert.equal(R.successorBase(PATHS, DATA.sources), DATA2.sources.integrationMergeSha, "HEAD_BASE: the first layer's head base is the second-layer merge");
  assert.equal(R.successorBase(PATHS2, DATA2.sources), DATA2.sources.integrationMergeSha, "HEAD_BASE: the second layer's head base is its own merge");
  assert.equal(R.successorBase({ ...PATHS, root: SCRATCH }, DATA.sources), DATA.sources.integrationMergeSha, "HEAD_BASE: without a readable successor the first layer keeps its own merge");
});

test("layer 2: a sealed layer reads its reconciled tree from git and an unsealed one reads the files", () => {
  assert.equal(R.sealedTree(DATA.sources, PATHS), true, "SEALED: the first layer is sealed by default");
  assert.equal(R.sealedTree(DATA.sources, { ...PATHS, inventory: tmpJson({}) }), false, "SEALED: a caller-supplied inventory is read as given");
  assert.equal(R.sealedTree(DATA2.sources, PATHS2), false, "SEALED: the second layer is not sealed");
});

test("layer 2: the sealed first layer's figures do not follow the current inventory", () => {
  const sealed = R.gatherGetPrisma(DATA, PATHS, ROOT);
  assert.equal(sealed.after.textualOccurrences, DATA.getPrisma.after.textualOccurrences, "SEALED_FIGURES: the sealed figures are the recorded ones");
  const inv = JSON.parse(readFileSync(PATHS.inventory, "utf8"));
  inv.summary.textualOccurrences = 999999;
  const asGiven = R.gatherGetPrisma(DATA, { ...PATHS, inventory: tmpJson(inv) }, ROOT);
  assert.equal(asGiven.after.textualOccurrences, 999999, "SEALED_FIGURES: a supplied inventory is read as given");
});

test("layer 2: the batch blob reader returns what git returns", () => {
  const files = ["package.json", "src/lib/executive/summary.ts"];
  const got = R.readBlobs(ROOT, DATA2.sources.targetMainSha, files);
  for (const f of files) {
    assert.equal(got.get(f), lf(execFileSync("git", ["show", `${DATA2.sources.targetMainSha}:${f}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 })), `BLOB_READER: ${f} differs from git show`);
  }
  assert.equal(R.readBlobs(ROOT, DATA2.sources.targetMainSha, ["no/such/file.ts"]).has("no/such/file.ts"), false, "BLOB_READER: a missing path is absent");
});

test("layer 2: a successor that does not descend from the first-layer merge is not accepted as the head base", () => {
  const ancestor = clone(DATA2);
  ancestor.sources.integrationMergeSha = DATA.sources.frozenSourceSha;
  assert.equal(R.successorBase(PATHS, DATA.sources, tmpJson(ancestor)), DATA.sources.integrationMergeSha, "HEAD_BASE_DESCENDANT: an ancestor of the first-layer merge is not a successor");
  const unknown = clone(DATA2);
  unknown.sources.integrationMergeSha = "0".repeat(40);
  assert.equal(R.successorBase(PATHS, DATA.sources, tmpJson(unknown)), DATA.sources.integrationMergeSha, "HEAD_BASE_DESCENDANT: a commit the repository does not hold is not a successor");
  assert.equal(R.successorBase(PATHS, DATA.sources, tmpJson(clone(DATA2))), DATA2.sources.integrationMergeSha, "HEAD_BASE_DESCENDANT: a real descendant is");
});

// ───────────────────── corrective round: position, command line, ledger, moved call sites ─────────────────────
//
// F-01. Where HEAD may be is a property of the repository's HISTORY, so these tests build their own throw-away
//       repositories and name the position they ask about. They answer the same whether the artifacts are
//       uncommitted (HEAD is the integration merge) or committed (HEAD is its child), which is what the mutation
//       campaign relies on.
// F-03. The command line has one strict parser.
// F-05. Every changed path has a ledger row; the aggregates are read from the ledger.
// F-02/semantic. Moved call sites carry a before-and-after ledger and three separate counts.

const HEAD_CODES = (list) => list.map((x) => x.code);
const expectHeadCodes = (label, got, want, notWant = []) => {
  const codes = HEAD_CODES(got);
  for (const c of want) assert.ok(codes.includes(c), `expected ${c}, got ${codes.join(",") || "no violation"} (${label})`);
  for (const c of notWant) assert.ok(!codes.includes(c), `expected no ${c}, got ${codes.join(",")} (${label})`);
};

/** A repository with an integration merge M and the commits asked for on top of it, each on its own branch from M. */
function positionRepo() {
  const { dir, sha: M } = fixtureRepo({ "src/a.ts": "export const a = 1;\n", "docs/security/note.md": "n\n", "package.json": "{}\n" });
  const on = (branch, from, edits, message) => {
    FIX_GIT(dir, "checkout", "-q", "-B", branch, from);
    for (const [rel, text] of Object.entries(edits)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), text);
    }
    FIX_GIT(dir, "add", "-A");
    FIX_GIT(dir, "commit", "-q", "-m", message);
    return FIX_GIT(dir, "rev-parse", "HEAD").trim();
  };
  return { dir, M, on, git: (...a) => FIX_GIT(dir, ...a).trim() };
}

test("head: HEAD may be the integration merge or a descendant whose every commit stayed inside the allowlist", () => {
  const { dir, M, on } = positionRepo();
  const S = { integrationMergeSha: M };
  assert.deepEqual(R.headViolations(S, dir, M, M), [], "expected no violation, got a violation at the merge itself");
  const docs = on("docs", M, { "docs/security/note.md": "changed\n", "scripts/security/s1/tool.mjs": "export {};\n", ".gitattributes": "* text=auto\n" }, "assurance only");
  assert.deepEqual(R.headViolations(S, dir, M, docs), [], "expected no violation, got a violation for a descendant that changed only the allowlist");
  const second = on("docs2", docs, { "scripts/security/s0/data.json": "{}\n" }, "assurance again");
  assert.deepEqual(R.headViolations(S, dir, M, second), [], "expected no violation, got a violation for a chain of allowlisted commits");
});

test("head: a descendant that changed a product, workflow, package, migration, deploy or config path is refused, commit by commit", () => {
  const { dir, M, on } = positionRepo();
  const S = { integrationMergeSha: M };
  for (const [label, edits] of Object.entries({
    product: { "src/a.ts": "export const a = 2;\n" },
    workflow: { ".github/workflows/deploy.yml": "name: x\n" },
    package: { "package.json": '{"name":"x"}\n' },
    migration: { "prisma/migrations/20990101000000_x/migration.sql": "SELECT 1;\n" },
    deploy: { "scripts/deploy/new.sh": "echo hi\n" },
    nginx: { "deploy/nginx/default.conf": "server {}\n" },
    container: { "Dockerfile": "FROM scratch\n" },
    compose: { "docker-compose.prod.yml": "services: {}\n" },
    environment: { ".env.production.example": "A=1\n" },
  })) {
    const head = on(`bad-${label}`, M, edits, `change ${label}`);
    expectHeadCodes(label, R.headViolations(S, dir, M, head), ["HEAD_COMMIT_OUTSIDE_ALLOWLIST", "HEAD_MOVED_OUTSIDE_ALLOWLIST"]);
  }
});

test("head: a product change that a later commit reverted still fails, because the history is the subject", () => {
  const { dir, M, on } = positionRepo();
  const S = { integrationMergeSha: M };
  const changed = on("revert", M, { "src/a.ts": "export const a = 2;\n" }, "product");
  const reverted = on("revert", changed, { "src/a.ts": "export const a = 1;\n" }, "put it back");
  expectHeadCodes("reverted", R.headViolations(S, dir, M, reverted), ["HEAD_COMMIT_OUTSIDE_ALLOWLIST"], ["HEAD_MOVED_OUTSIDE_ALLOWLIST"]);
});

test("head: a merge commit after the integration merge is refused even when it brings only allowlisted paths", () => {
  const { dir, M, on, git } = positionRepo();
  const S = { integrationMergeSha: M };
  const left = on("left", M, { "docs/security/a.md": "a\n" }, "left");
  on("right", M, { "docs/security/b.md": "b\n" }, "right");
  git("checkout", "-q", "left");
  git("merge", "-q", "--no-ff", "-m", "merge", "right");
  const merged = git("rev-parse", "HEAD");
  expectHeadCodes("merge", R.headViolations(S, dir, M, merged), ["HEAD_MERGE_AFTER_INTEGRATION"]);
  assert.notEqual(left, merged, "fixture: the merge is a new commit");
});

test("head: an unrelated commit, a rewritten history and a history that lost the merge are not descendants", () => {
  const { dir, M, git } = positionRepo();
  const S = { integrationMergeSha: M };
  git("checkout", "-q", "--orphan", "stranger");
  writeFileSync(join(dir, "docs/security/other.md"), "o\n");
  git("add", "-A");
  git("commit", "-q", "-m", "an unrelated root");
  const stranger = git("rev-parse", "HEAD");
  expectHeadCodes("unrelated", R.headViolations(S, dir, M, stranger), ["HEAD_NOT_DESCENDANT_OF_BASE"]);
  writeFileSync(join(dir, "docs/security/other.md"), "o2\n");
  git("commit", "-q", "-a", "-m", "a child of the stranger, inside the allowlist");
  const lost = git("rev-parse", "HEAD");
  expectHeadCodes("lost the merge", R.headViolations(S, dir, M, lost), ["HEAD_NOT_DESCENDANT_OF_BASE"]);
  expectHeadCodes("reversed", R.headViolations({ integrationMergeSha: lost }, dir, lost, M), ["HEAD_NOT_DESCENDANT_OF_BASE"]);
});

test("head: the whole check reports a product commit after the integration merge as a source violation", () => {
  const { dir, M, on } = positionRepo();
  const head = on("product", M, { "src/a.ts": "export const a = 2;\n" }, "product");
  const out = R.headViolations({ integrationMergeSha: M }, dir, M, head);
  assert.ok(out.every((x) => x.klass === "SOURCES"), "expected SOURCES, got another class for a head violation");
  assert.equal(R.exitCodeFor(out), R.EXIT.SOURCES, `expected exit ${R.EXIT.SOURCES}, got ${R.exitCodeFor(out)}`);
});

test("head: the committed layer is measured from the repository's real history, whatever position HEAD has", () => {
  // POSITION-INDEPENDENT: the assertion is that no HEAD violation exists, which holds with HEAD at the integration merge and at any
  // allowlisted descendant of it; the mutant it separates measures the first layer from a commit older than both positions, so it
  // fails at either of them. The end-to-end committed-state test proves the descendant case from a real commit.
  const found = R.checkRelock(DATA2, MD2, PATHS2, RECORD);
  const heads = found.filter((x) => x.code.startsWith("HEAD_"));
  assert.deepEqual(heads.map((x) => x.code), [], `HEAD_REAL_HISTORY: expected no HEAD violation, got ${heads.map((x) => x.code).join(",")}`);
  const first = R.checkRelock(DATA, MD, PATHS, RECORD).filter((x) => x.code.startsWith("HEAD_"));
  assert.deepEqual(first.map((x) => x.code), [], `HEAD_BASE_FIRST: the first layer is held to the later merge, so the second layer's own range is not charged to it; got ${first.map((x) => x.code).join(",")}`);
});

test("layer 2: HEAD is judged against the base it is given", () => {
  const { dir, M, on } = positionRepo();
  const first = M;
  const second = on("later", M, { "src/a.ts": "export const a = 2;\n", "docs/security/note.md": "later\n" }, "the second merge changed a product file");
  const S = { integrationMergeSha: second };
  expectHeadCodes("old base", R.headViolations(S, dir, first, second), ["HEAD_MOVED_OUTSIDE_ALLOWLIST"]);
  assert.deepEqual(R.headViolations(S, dir, second, second), [], "HEAD_BASE: HEAD at the base it is given has no violation");
});

test("layer 2: the diff is taken from the base it is given", () => {
  const { dir, M, on } = positionRepo();
  const second = on("later", M, { "src/a.ts": "export const a = 2;\n" }, "product");
  const third = on("later2", second, { "docs/security/note.md": "docs\n" }, "docs only");
  const S = { integrationMergeSha: third };
  expectHeadCodes("from the first", R.headViolations(S, dir, M, third), ["HEAD_MOVED_OUTSIDE_ALLOWLIST"]);
  assert.deepEqual(R.headViolations(S, dir, second, third), [], "HEAD_BASE: from the later base only the allowlisted change remains");
});

test("layer 2: a document without a layer is the first, and the layers are named by their document", () => {
  assert.equal(R.layerOf(DATA), "FIRST", "LAYER_DEFAULT: the sealed first-layer document names no layer and is the first");
  assert.equal(R.layerOf({}), "FIRST", "LAYER_DEFAULT: a document without sources is the first");
  assert.equal(R.layerOf({ sources: {} }), "FIRST", "LAYER_DEFAULT: a sources block without a layer is the first");
  assert.equal(R.layerOf(DATA2), "SECOND", "LAYER_DEFAULT: the second-layer document names its layer");
});

test("layer 2: the original register hash pin belongs to the first layer", () => {
  const found = run2();
  assert.ok(!found.some((x) => x.code === "FROZEN_REGISTER_HASH"), "FROZEN_REGISTER_PIN_SCOPE: the second layer is not held to the register hash the first layer pins");
  const first = run();
  assert.ok(!first.some((x) => x.code === "FROZEN_REGISTER_HASH"), "FROZEN_REGISTER_PIN_SCOPE: the first layer still matches the hash it pins");
});

// ── F-03: the command line ──

test("cli parser: the accepted forms are no layer, --layer=1 and --layer=2, once, with one mode", () => {
  for (const ok of [[], ["check"], ["check", "--layer=1"], ["--layer=2", "summary"], ["generate", "--layer=2"], ["check", "--root=/somewhere", "--layer=1"]]) {
    const p = R.parseArgs(ok);
    assert.deepEqual(p.errors, [], `LAYER_PARSER: expected ${JSON.stringify(ok)} to be accepted, got ${p.errors.join("; ")}`);
  }
  assert.equal(R.parseArgs(["check", "--layer=2"]).opts.layer, "2", "LAYER_PARSER: --layer=2 selects the second layer");
  assert.equal(R.parseArgs(["check"]).opts.layer, undefined, "LAYER_PARSER: no --layer is the documented first layer");
});

test("cli parser: every other spelling of the layer is refused and never read as the first layer", () => {
  const refused = [
    ["--layer=3"], ["--layer="], ["--layer"], ["--layer=02"], ["--layer=2 "], ["--layer= 2"], ["--layer=two"], ["--layer=II"], ["--layer=2x"], ["--layer=0"],
    ["--Layer=2"], ["--LAYER=2"], ["-layer=2"], ["-l=2"], ["--layer", "2"], ["--layer=1", "--layer=2"], ["--layer=2", "--layer=2"], ["--layer=1", "--layer=1"],
    ["--layer=\t2"], ["--layer=2\n"], ["--layer==2"],
  ];
  for (const argv of refused) {
    const p = R.parseArgs(argv);
    assert.ok(p.errors.length > 0, `LAYER_PARSER: expected ${JSON.stringify(argv)} to be refused, got no error`);
    assert.ok(!["1", "2"].includes(p.opts.layer) || argv.filter((a) => a.startsWith("--layer=")).length > 1, `LAYER_PARSER: ${JSON.stringify(argv)} must not be read as a valid single layer`);
  }
});

test("cli parser: unknown options, stray arguments, repeated options and empty values are usage errors", () => {
  for (const argv of [["--bogus=1"], ["check", "summary"], ["check", "extra"], ["--root="], ["--data=a", "--data=b"], ["--severity=LOW"], ["--layer=2", "--root"], [42]]) {
    assert.ok(R.parseArgs(argv).errors.length > 0, `LAYER_PARSER: expected ${JSON.stringify(argv)} to be a usage error, got none`);
  }
  assert.deepEqual(R.LAYER_VALUES, ["1", "2"], "LAYER_PARSER: the layers are exactly 1 and 2");
});

// ── F-05: the ledger of every changed path ──

let _fresh2 = null;
/** The second layer's derived sections recomputed from git, the inventory and the register; computed once and only when a test asks. */
const fresh2 = () => (_fresh2 ??= R.deriveAll(DATA2, PATHS2));

const LEDGER = DATA2.delta.pathLedger;
const authoredOf = (d, p) => d.pathDispositions.find((x) => x.path === p);
const ledgerRow = (p) => LEDGER.find((r) => r.path === p);

test("ledger: every path of the range has exactly one row, and the aggregates are read from the rows", () => {
  const rows = R.ledgerGitRows(DATA2.sources, ROOT);
  assert.equal(LEDGER.length, rows.length, "LEDGER_COMPLETE: expected one ledger row per changed path");
  assert.deepEqual(LEDGER.map((r) => r.path), rows.map((r) => r.path).sort(), "LEDGER_COMPLETE: the ledger holds the changed paths and nothing else");
  assert.equal(new Set(LEDGER.map((r) => r.path)).size, LEDGER.length, "LEDGER_COMPLETE: no path is listed twice");
  const s = DATA2.delta.pathLedgerSummary;
  assert.deepEqual([s.missing, s.extra, s.duplicate, s.stale], [0, 0, 0, 0], "LEDGER_COMPLETE: missing, extra, duplicate and stale are all zero");
  assert.equal(s.reviewed, LEDGER.length, "LEDGER_COMPLETE: every row is reviewed");
  assert.equal(DATA2.delta.paths.total, LEDGER.length, "LEDGER_AGGREGATES: the path total is the ledger's");
  assert.equal(DATA2.delta.strictProductPaths.total, LEDGER.filter((r) => r.strictProduct).length, "LEDGER_AGGREGATES: the strict total is counted from the rows");
  assert.equal(DATA2.delta.broadRuntimeAffectingPaths.total, LEDGER.filter((r) => r.broadProduct).length, "LEDGER_AGGREGATES: the broad total is counted from the rows");
  assert.equal(DATA2.delta.paths.added + DATA2.delta.paths.modified + DATA2.delta.paths.deleted + DATA2.delta.paths.renamed, LEDGER.length, "LEDGER_AGGREGATES: the change types add up to the total");
  assert.ok(LEDGER.every((r) => r.reviewed && r.reason && r.disposition && r.reviewerMethod), "LEDGER_COMPLETE: every row carries a disposition, a reason and a method");
  const f = fresh2();
  assert.deepEqual(f.delta.paths, DATA2.delta.paths, "LEDGER_AGGREGATES: the recomputed path counts are the committed ones");
  assert.deepEqual([f.delta.paths.added, f.delta.paths.modified, f.delta.paths.deleted, f.delta.paths.renamed], [46, 54, 0, 0], "LEDGER_AGGREGATES: added, modified, deleted and renamed are counted from the rows by type");
  assert.equal(f.delta.strictProductPaths.total, 47, "LEDGER_AGGREGATES: the strict total is counted from the rows");
  assert.equal(f.delta.broadRuntimeAffectingPaths.total, 53, "LEDGER_AGGREGATES: the broad total is counted from the rows");
  assert.deepEqual(f.delta.pathLedgerSummary, DATA2.delta.pathLedgerSummary, "LEDGER_AGGREGATES: the recomputed summary is the committed one");
});

test("ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused", () => {
  expectCode2("LEDGER_MISSING", mutated2((d) => d.pathDispositions.pop()), "FINDINGS");
  expectCode2("LEDGER_EXTRA", mutated2((d) => d.pathDispositions.push({ ...clone(d.pathDispositions[0]), path: "src/lib/never/changed.ts" })), "FINDINGS");
  expectCode2("LEDGER_DUPLICATE", mutated2((d) => d.pathDispositions.push(clone(d.pathDispositions[0]))), "FINDINGS");
  expectCode2("LEDGER_CHANGE_TYPE", mutated2((d) => (authoredOf(d, "src/lib/executive/cache.ts").changeType = "M")), "FINDINGS");
  expectCode2("LEDGER_STALE", mutated2((d) => (authoredOf(d, "src/lib/executive/cache.ts").reviewedBlob = "0".repeat(40))), "FINDINGS");
  expectCode2("MISSING_KEY", mutated2((d) => delete d.pathDispositions[0].disposition), "SCHEMA");
  expectCode2("UNKNOWN_KEY", mutated2((d) => (d.pathDispositions[0].severity = "LOW")), "SCHEMA");
});

test("ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round", () => {
  expectCode2("LEDGER_SECURITY_UNLINKED", mutated2((d) => {
    const a = authoredOf(d, "src/lib/executive/cache.ts");
    a.positiveControlIds = [];
  }), "FINDINGS");
  expectCode2("LEDGER_LINK_WITHOUT_SECURITY", mutated2((d) => (authoredOf(d, "src/lib/executive/cache.ts").securityRelevant = false)), "FINDINGS");
  expectCode2("LEDGER_FINDING_UNKNOWN", mutated2((d) => (authoredOf(d, "src/lib/executive/cache.ts").findingIds = ["RS-999"])), "FINDINGS");
  expectCode2("LEDGER_CONTROL_UNKNOWN", mutated2((d) => (authoredOf(d, "src/lib/executive/cache.ts").positiveControlIds = ["RS-P99"])), "FINDINGS");
  expectCode2("LEDGER_LINK_NOT_EVIDENCED", mutated2((d) => (authoredOf(d, "src/lib/executive/cache.ts").positiveControlIds = ["RS-P03"])), "FINDINGS");
  expectCode2("LEDGER_LINK_NOT_EVIDENCED", mutated2((d) => {
    const a = authoredOf(d, "src/lib/executive/cache.ts");
    Object.assign(a, { disposition: "FINDING_EVIDENCE", positiveControlIds: [], findingIds: ["RS-003"] });
  }), "FINDINGS");
  expectCode2("LEDGER_EVIDENCE_NOT_LINKED", mutated2((d) => {
    const a = authoredOf(d, "src/lib/executive/cache.ts");
    Object.assign(a, { securityRelevant: false, positiveControlIds: [], disposition: "REVIEWED_NO_SECURITY_EFFECT" });
  }), "FINDINGS");
  expectCode2("LEDGER_DISPOSITION_CATEGORY", mutated2((d) => (authoredOf(d, "src/lib/executive/status-label.ts").disposition = "TEST_ONLY")), "FINDINGS");
  expectCode2("LEDGER_DISPOSITION_LINKS", mutated2((d) => (authoredOf(d, "src/lib/executive/cache.ts").disposition = "REVIEWED_NO_SECURITY_EFFECT")), "FINDINGS");
});

test("ledger: a ledger key in a first-layer document is refused, and a second-layer document must carry both lists", () => {
  expectCode("LAYER_KEY", mutated((d) => (d.pathDispositions = [])), "SCHEMA");
  expectCode2("LEDGER_ABSENT", mutated2((d) => delete d.pathDispositions), "FINDINGS");
  expectCode2("SOURCE_BEHAVIOR_LIST_ABSENT", mutated2((d) => delete d.sourceBehaviorChanges), "FINDINGS");
});

test("ledger: the strict, broad and category rules classify known paths", () => {
  assert.equal(R.isStrictProductPath("src/lib/a.ts"), true, "LEDGER_RULES: a source file is a strict product path");
  assert.equal(R.isStrictProductPath("src/lib/__tests__/a.test.ts"), false, "LEDGER_RULES: a test is not");
  assert.equal(R.isStrictProductPath("scripts/deploy/x.sh"), false, "LEDGER_RULES: a script is broad but not strict");
  assert.equal(R.isBroadRuntimePath("scripts/deploy/x.sh"), true, "LEDGER_RULES: a script is a broad runtime path");
  assert.equal(R.isBroadRuntimePath("docs/security/x.md"), false, "LEDGER_RULES: documentation is neither");
  assert.equal(R.isBroadRuntimePath(".gitattributes"), false, "LEDGER_RULES: the attributes file is neither");
  assert.equal(R.isStrictProductPath(".github/workflows/deploy.yml"), false, "LEDGER_RULES: a workflow is broad but not strict");
  for (const [p, c] of [
    [".gitattributes", "ASSURANCE_CONFIG"],
    ["src/lib/__tests__/a.test.ts", "TEST"],
    ["docs/x.md", "DOCUMENTATION"],
    ["messages/en.json", "LOCALIZATION"],
    ["prisma/migrations/1_x/migration.sql", "MIGRATION"],
    ["prisma/schema.prisma", "SCHEMA"],
    ["src/app/api/x/route.ts", "API_ROUTE"],
    ["src/app/[locale]/x/page.tsx", "PAGE"],
    ["src/components/x.tsx", "UI_COMPONENT"],
    ["src/lib/x.ts", "LIBRARY"],
    ["Dockerfile", "DEPLOY_AND_RUNTIME_CONFIG"],
  ]) assert.equal(R.categoryOf(p), c, `LEDGER_RULES: ${p} is ${c}`);
});

test("ledger: added, modified, deleted and renamed paths are all shown, and a later edit makes the row stale", () => {
  const { dir, sha: A } = fixtureRepo({ "src/a.ts": "a\n", "src/b.ts": "b\n", "src/c/d.ts": "export const d = 1;\nexport const e = 2;\nexport const f = 3;\n", "docs/x.md": "x\n" });
  writeFileSync(join(dir, "src/a.ts"), "a2\n");
  rmSync(join(dir, "src/b.ts"));
  mkdirSync(join(dir, "src/c"), { recursive: true });
  FIX_GIT(dir, "mv", "src/c/d.ts", "src/c/g.ts");
  writeFileSync(join(dir, "src/n.ts"), "n\n");
  FIX_GIT(dir, "add", "-A");
  FIX_GIT(dir, "commit", "-q", "-m", "all four kinds of change");
  const B = FIX_GIT(dir, "rev-parse", "HEAD").trim();
  const sources = { frozenSourceSha: A, targetMainSha: B };
  const rows = R.ledgerGitRows(sources, dir);
  const by = Object.fromEntries(rows.map((r) => [r.path, r]));
  assert.equal(by["src/a.ts"].changeType, "M", "LEDGER_KINDS: a changed file is M");
  assert.equal(by["src/b.ts"].changeType, "D", "LEDGER_KINDS: a deleted file is D and is shown");
  assert.equal(by["src/b.ts"].targetBlob, null, "LEDGER_KINDS: a deleted file has no target blob");
  assert.equal(by["src/n.ts"].changeType, "A", "LEDGER_KINDS: a new file is A");
  assert.equal(by["src/n.ts"].baseBlob, null, "LEDGER_KINDS: a new file has no base blob");
  assert.equal(by["src/c/g.ts"].changeType, "R", "LEDGER_KINDS: a rename is R");
  assert.equal(by["src/c/g.ts"].previousPath, "src/c/d.ts", "LEDGER_KINDS: a rename names the path it came from");
  const authored = rows.map((r) => ({
    path: r.path, changeType: r.changeType, reviewedBlob: r.targetBlob ?? "ABSENT", securityRelevant: false, disposition: "REVIEWED_NO_SECURITY_EFFECT",
    reason: "A fixture row for the ledger test, long enough to be accepted.", findingIds: [], positiveControlIds: [], reviewerMethod: "DIFF_READ",
  }));
  const ledger = R.buildPathLedger(sources, dir, authored);
  assert.deepEqual(ledger.summary.byChangeType, { A: 1, M: 1, D: 1, R: 1 }, "LEDGER_KINDS: the change types are counted from the rows");
  assert.deepEqual([ledger.summary.missing, ledger.summary.extra, ledger.summary.duplicate, ledger.summary.stale], [0, 0, 0, 0], "LEDGER_STALE: a matching review is complete");
  writeFileSync(join(dir, "src/a.ts"), "a3\n");
  FIX_GIT(dir, "commit", "-q", "-a", "-m", "a later edit");
  const later = R.buildPathLedger({ frozenSourceSha: A, targetMainSha: FIX_GIT(dir, "rev-parse", "HEAD").trim() }, dir, authored);
  assert.equal(later.summary.stale, 1, "LEDGER_STALE: a later edit of a reviewed file makes its row stale");
  assert.equal(later.rows.find((r) => r.path === "src/a.ts").reviewed, false, "LEDGER_STALE: the stale row is not reviewed");
  assert.equal(R.buildPathLedger(sources, dir, authored.slice(1)).summary.missing, 1, "LEDGER_MISSING: a dropped row is counted missing");
});

// ── moved call sites and the three kinds of change ──

const MOVED_ROWS = DATA2.getPrisma.movedLedger;
const ADJ2 = JSON.parse(readFileSync(PATHS2.adjudications, "utf8"));
const INV2 = JSON.parse(readFileSync(PATHS2.inventory, "utf8"));

test("moved ledger: each moved pair is one to one, keeps both identifiers and leaves no old identifier behind", () => {
  assert.equal(MOVED_ROWS.length, DATA2.getPrisma.moved.length, "MOVED_LEDGER: one row per moved call site");
  assert.equal(new Set(MOVED_ROWS.map((r) => r.after.id)).size, MOVED_ROWS.length, "MOVED_LEDGER: no new identifier is claimed twice");
  assert.equal(new Set(MOVED_ROWS.map((r) => r.before.id)).size, MOVED_ROWS.length, "MOVED_LEDGER: no old identifier is claimed twice");
  assert.deepEqual(DATA2.getPrisma.movedPairProblems, { ambiguous: [], unpairedAdded: [], unpairedRemoved: [] }, "MOVED_LEDGER: nothing is ambiguous or unpaired");
  assert.ok(MOVED_ROWS.every((r) => r.oldIdResidue === 0), "MOVED_OLD_ID_RESIDUE: no old identifier occurs in the S0 artifacts");
  assert.ok(MOVED_ROWS.every((r) => r.evidenceProblems.length === 0), "MOVED_EVIDENCE_WINDOW: every adjudication cites the call site where it is now");
  assert.ok(MOVED_ROWS.every((r) => r.fingerprint && r.before.id !== r.after.id), "MOVED_LEDGER: the fingerprint is kept and the identifier changed");
});

test("moved ledger: the three kinds of change are counted apart, from the rows", () => {
  const m = DATA2.getPrisma.changeModel;
  assert.equal(m.classificationSemanticChanges, MOVED_ROWS.filter((r) => r.classificationSemanticChange).length, "CHANGE_MODEL: classificationSemanticChanges is counted from the rows");
  assert.equal(m.sourceBehaviorChanges, MOVED_ROWS.filter((r) => r.sourceBehavior.bodyChanged).length, "CHANGE_MODEL: sourceBehaviorChanges is counted from the rows");
  assert.equal(m.derivedTagChanges, MOVED_ROWS.filter((r) => r.derivedTagChanges.added.length + r.derivedTagChanges.removed.length > 0).length, "CHANGE_MODEL: derivedTagChanges is counted from the rows");
  assert.equal(m.classificationSemanticChanges, 0, "CHANGE_MODEL: no verdict changed");
  assert.ok(m.sourceBehaviorChanges > m.derivedTagChanges, "CHANGE_MODEL: the three counts are not one number");
  assert.equal(m.positionOnlyPairs + m.sourceBehaviorChanges + m.derivedTagChanges + m.classificationSemanticChanges >= m.movedPairs, true, "CHANGE_MODEL: every pair is accounted for");
  assert.equal(m.genuinelyAdded, 0, "CHANGE_MODEL: no call site was genuinely added");
  assert.equal(m.genuinelyRemoved, 0, "CHANGE_MODEL: no call site was genuinely removed");
  const f = fresh2().getPrisma;
  assert.deepEqual(f.changeModel, m, "CHANGE_MODEL_DERIVED: the recomputed change model is the committed one");
  assert.equal(f.changeModel.sourceBehaviorChanges, 6, "CHANGE_MODEL_DERIVED: six moved call sites sit in a function whose code changed");
  const media = f.movedLedger.find((r) => r.after.id === "src/app/api/media/assets/route.ts#L443C21");
  assert.deepEqual(media.derivedTagChanges, { added: ["READ"], removed: ["SILENT_CATCH"] }, "CHANGE_MODEL_DERIVED: the media route's tag moved with the window");
  assert.equal(media.sourceBehavior.bodyChanged, true, "CHANGE_MODEL_DERIVED: and its function really changed too");
  assert.equal(media.classificationSemanticChange, false, "CHANGE_MODEL_DERIVED: while its verdict did not");
  const plain = f.movedLedger.find((r) => r.after.id === "src/lib/customers/service.ts#L158C25");
  assert.equal(plain.sourceBehavior.bodyChanged, false, "CHANGE_MODEL_DERIVED: a function that only moved is not a behaviour change");
  assert.equal(f.movedLedger.find((r) => r.after.id === "src/lib/executive/priorities.ts#L327C24").sourceBehavior.bodyChanged, true, "CHANGE_MODEL_DERIVED: the accessor that now needs the party delegate changed");
  const pairs = new Set(f.movedLedger.map((r) => `${r.file}|${r.ordinalInFile}`));
  assert.equal(pairs.size, f.movedLedger.length, "CHANGE_MODEL_DERIVED: the pairing is one to one by file and ordinal");
  const generate = f.movedLedger.find((r) => r.after.id === "src/lib/executive/report/generate.ts#L196C24");
  assert.equal(generate.before.id, "src/lib/executive/report/generate.ts#L112C24", "CHANGE_MODEL_DERIVED: each pair keeps the identifier it replaced");
  assert.ok(f.movedLedger.every((r) => r.before.line < r.after.line), "CHANGE_MODEL_DERIVED: every pair moved down, as the added lines above it say");
  const second = f.movedLedger.filter((r) => r.file === "src/lib/executive/report/generate.ts").map((r) => r.after.id);
  assert.deepEqual(second, ["src/lib/executive/report/generate.ts#L196C24", "src/lib/executive/report/generate.ts#L360C24", "src/lib/executive/report/generate.ts#L393C24"], "CHANGE_MODEL_DERIVED: three call sites of one file are paired by their order");
  assert.equal(f.movedLedger.find((r) => r.after.id === "src/lib/executive/report/generate.ts#L360C24").before.id, "src/lib/executive/report/generate.ts#L248C24", "CHANGE_MODEL_DERIVED: the second one replaced the second one");
  assert.equal(f.movedLedger.find((r) => r.after.id === "src/lib/executive/report/generate.ts#L393C24").before.id, "src/lib/executive/report/generate.ts#L281C24", "CHANGE_MODEL_DERIVED: the third replaced the third");
});

test("moved ledger: a source behaviour change must be described, and only a real one may be", () => {
  expectCode2("SOURCE_BEHAVIOR_UNDECLARED", mutated2((d) => d.sourceBehaviorChanges.pop()), "FINDINGS");
  expectCode2("SOURCE_BEHAVIOR_SPURIOUS", mutated2((d) => d.sourceBehaviorChanges.push({ callsiteId: "src/lib/customers/service.ts#L158C25", summary: "This function did not change and the claim must be refused." })), "FINDINGS");
  expectCode2("SOURCE_BEHAVIOR_UNKNOWN_CALLSITE", mutated2((d) => d.sourceBehaviorChanges.push({ callsiteId: "src/lib/never/moved.ts#L1C1", summary: "This call site never moved and the entry must be refused." })), "FINDINGS");
  expectCode2("SOURCE_BEHAVIOR_DUPLICATE", mutated2((d) => d.sourceBehaviorChanges.push(clone(d.sourceBehaviorChanges[0]))), "FINDINGS");
  expectCode2("MISSING_KEY", mutated2((d) => delete d.sourceBehaviorChanges[0].summary), "SCHEMA");
});

test("moved ledger: an old identifier left in an artifact, or in the document, is refused", () => {
  const adj = clone(ADJ2);
  const row = adj.adjudications.find((a) => a.callsiteId === "src/lib/executive/report/generate.ts#L360C24");
  row.retryTrace.operationIdentity = "the operation behind src/lib/executive/report/generate.ts#L248C24";
  const found = R.checkRelock(DATA2, MD2, { ...PATHS2, adjudications: tmpJson(adj) }, RECORD).map((x) => x.code);
  assert.ok(found.includes("MOVED_OLD_ID_RESIDUE"), `expected MOVED_OLD_ID_RESIDUE, got ${found.join(",")}`);
  expectCode2("MOVED_OLD_ID_IN_DOCUMENT", mutated2((d) => (d.findings[0].summary += " It was once found at src/lib/executive/report/read.ts#L126C36.")), "DERIVED_DRIFT");
  const withOld = R.checkRelock(DATA2, `${MD2}\nIt was once at src/lib/executive/report/read.ts#L126C36 and moved.\n`, PATHS2, RECORD).map((x) => x.code);
  assert.ok(withOld.includes("MOVED_OLD_ID_IN_DOCUMENT"), `expected MOVED_OLD_ID_IN_DOCUMENT, got ${withOld.join(",")}`);
  const stale = clone(INV2);
  const site = stale.callSites.find((c) => c.id === "src/lib/executive/report/generate.ts#L393C24");
  site.adjudication.evidence = "src/lib/executive/report/generate.ts:283 (`if (!reports) return false;`); caller src/lib/executive/report/worker.ts:394 (`.catch(() => false)`, result not inspected)";
  const codes = R.checkRelock(DATA2, MD2, { ...PATHS2, inventory: tmpJson(stale) }, RECORD).map((x) => x.code);
  assert.ok(codes.includes("MOVED_EVIDENCE_WINDOW"), `expected MOVED_EVIDENCE_WINDOW, got ${codes.join(",")}`);
});

test("moved ledger: an adjudication's references are checked for range, expression and window", () => {
  const text = (path) => (path === "src/x.ts" ? Array.from({ length: 50 }, (_, i) => (i === 19 ? "  if (!reports) return false;" : `line ${i + 1}`)).join("\n") : null);
  const site = { file: "src/x.ts", line: 20 };
  assert.deepEqual(R.evidenceWindowProblems(site, "src/x.ts:20 (`if (!reports) return false;`)", text), [], "EVIDENCE_WINDOW: a reference to the expression where it is");
  assert.match(R.evidenceWindowProblems(site, "src/x.ts:12 (`if (!reports) return false;`)", text).join("|"), /expression is not there/, "EVIDENCE_WINDOW: the expression at another line is refused");
  assert.match(R.evidenceWindowProblems(site, "src/x.ts:40-41", text).join("|"), /no evidence citation of src\/x\.ts lies within/, "EVIDENCE_WINDOW: a range far from the call site is refused");
  assert.match(R.evidenceWindowProblems(site, "src/x.ts:48-60", text).join("|"), /outside the file/, "EVIDENCE_WINDOW: a range beyond the file is refused");
  assert.match(R.evidenceWindowProblems(site, "src/gone.ts:3", text).join("|"), /not in the target tree/, "EVIDENCE_WINDOW: a file that is not there is refused");
  assert.deepEqual(R.evidenceWindowProblems(site, "caller src/other.ts:3", () => "x\n".repeat(10)), [], "EVIDENCE_WINDOW: a citation of another file has no window to hold");
});

test("moved ledger: a position-only move is told from a verdict change, and the function body from its comments", () => {
  const rec = (over = {}) => ({ adjudication: { evidence: "a:1", callerPath: "p", terminalBehavior: "t", outcomeFlags: [], retryTrace: { operationIdentity: "x", sourceReferences: ["a:1"], terminal: "t" }, ...over }, classification: "C" });
  const move = R.adjudicationMove(rec(), rec({ evidence: "a:9", callerPath: "p2", retryTrace: { operationIdentity: "y", sourceReferences: ["a:9"], terminal: "t" } }));
  assert.deepEqual(move.semanticFields, [], "ADJUDICATION_MOVE: evidence, caller path and trace position are positional");
  assert.deepEqual(move.positionalFields, ["callerPath", "evidence", "retryTrace.operationIdentity", "retryTrace.sourceReferences"], "ADJUDICATION_MOVE: the positional fields are named");
  const verdict = R.adjudicationMove(rec(), rec({ terminalBehavior: "other", retryTrace: { operationIdentity: "x", sourceReferences: ["a:1"], terminal: "changed" } }));
  assert.deepEqual(verdict.semanticFields, ["retryTrace.terminal", "terminalBehavior"], "ADJUDICATION_MOVE: a changed terminal behaviour is semantic");
  assert.equal(R.adjudicationMove({}, {}).before, false, "ADJUDICATION_MOVE: no adjudication on either side is neither");
  const before = "export async function f() {\n  // old note\n  const x = await getPrisma();\n  return x;\n}\n\nexport async function g() {\n  return 1;\n}\n";
  const noteOnly = "export async function f() {\n  // a different note\n\n  const x = await getPrisma();\n  return x;\n}\n\nexport async function g() {\n  return 2;\n}\n";
  assert.equal(R.functionSpan(before, 3).code, R.functionSpan(noteOnly, 4).code, "FUNCTION_SPAN: a comment, a blank line and the next function's change are not behaviour of f");
  const changed = before.replace("return x;", "return null;");
  assert.notEqual(R.functionSpan(before, 3).code, R.functionSpan(changed, 3).code, "FUNCTION_SPAN: a changed statement is behaviour");
  assert.equal(R.functionSpan(before, 3).name, "f", "FUNCTION_SPAN: the enclosing function is named");
});

test("moved ledger: the gates read the derived ledger", () => {
  const codesOf = (mutate) => {
    const f = structuredClone(fresh2());
    mutate(f);
    return R.secondLayerViolations(DATA2, f, MD2, PATHS2, ROOT).map((x) => x.code);
  };
  const expectDerived = (code, mutate) => {
    const codes = codesOf(mutate);
    assert.ok(codes.includes(code), `expected ${code}, got ${codes.join(",") || "no violation"}`);
  };
  assert.deepEqual(codesOf(() => {}), [], "expected no violation, got a violation from the committed derivation");
  expectDerived("MOVED_PAIR_AMBIGUOUS", (f) => f.getPrisma.movedPairProblems.ambiguous.push("src/lib/x.ts#L1C1"));
  expectDerived("MOVED_LEDGER_INCOMPLETE", (f) => f.getPrisma.movedLedger.pop());
  expectDerived("MOVED_PAIR_REINTERPRETED", (f) => (f.getPrisma.movedLedger[0].classificationSemanticChange = true));
  expectDerived("MOVED_OLD_ID_RESIDUE", (f) => (f.getPrisma.movedLedger[0].oldIdResidue = 2));
  expectDerived("MOVED_EVIDENCE_WINDOW", (f) => f.getPrisma.movedLedger[0].evidenceProblems.push("evidence cites a file that is not there"));
  expectDerived("CHANGE_MODEL", (f) => (f.getPrisma.changeModel.classificationSemanticChanges = 5));
  expectDerived("LEDGER_COUNT", (f) => (f.delta.pathLedgerSummary.total += 1));
});

test("moved ledger: the words 'semantic change' are refused unless they name one of the three kinds", () => {
  assert.equal(R.unqualifiedSemanticChange("there is one semantic change"), true, "SEMANTIC_WORDS: a bare 'semantic change' is refused");
  assert.equal(R.unqualifiedSemanticChange("two semantic-changes were found"), true, "SEMANTIC_WORDS: the hyphenated plural is refused too");
  assert.equal(R.unqualifiedSemanticChange("Semantic Change"), true, "SEMANTIC_WORDS: the capitalised form is refused");
  assert.equal(R.unqualifiedSemanticChange("classificationSemanticChanges is 0 and sourceBehaviorChanges is 6"), false, "SEMANTIC_WORDS: the named kinds are allowed");
  assert.equal(R.unqualifiedSemanticChange("nothing of the kind"), false, "SEMANTIC_WORDS: other text is untouched");
  expectCode2("UNQUALIFIED_SEMANTIC_CHANGE", mutated2((d) => (d.attribution.currentMainDelta += " There was one semantic change.")), "CONTENT");
  const md = `${MD2}\nOne semantic change was found.\n`;
  const found = R.checkRelock(DATA2, md, PATHS2, RECORD).map((x) => x.code);
  assert.ok(found.includes("UNQUALIFIED_SEMANTIC_CHANGE"), `expected UNQUALIFIED_SEMANTIC_CHANGE, got ${found.join(",")}`);
});

test("moved ledger: the second-layer report carries the three generated blocks and no more", () => {
  assert.deepEqual([...R.SECOND_BLOCK_NAMES].slice(R.BLOCK_NAMES.length), ["pathledger", "movedledger", "changemodel"], "BLOCK_NAMES: the second layer adds exactly the ledger, the moved call sites and the change model");
  assert.deepEqual([...R.blockNamesOf("FIRST")], [...R.BLOCK_NAMES], "BLOCK_NAMES: the first layer keeps its own blocks");
  const blocks = R.renderBlocks(DATA2, RECORD);
  for (const n of ["pathledger", "movedledger", "changemodel"]) assert.ok(blocks[n] && blocks[n].length > 100, `BLOCK_NAMES: ${n} is rendered`);
  expectCode2("BLOCK_DRIFT", { md: MD2.replace("| classificationSemanticChanges | 0 |", "| classificationSemanticChanges | 9 |"), data: DATA2 }, "REPORT");
});
