#!/usr/bin/env node
/**
 * Mutation campaign for the S1 delta relock checker.
 *
 *   node scripts/security/s1/relock-mutation-campaign.mjs list      # validate the manifest against the checker source
 *   node scripts/security/s1/relock-mutation-campaign.mjs run       # run the campaign in a temporary copy and write the record
 *   node scripts/security/s1/relock-mutation-campaign.mjs verify    # check the record against the manifest and the exact bytes
 *   node scripts/security/s1/relock-mutation-campaign.mjs manifest  # print the manifest hash
 *
 * WHAT IT DOES. For every manifest entry it copies the checker, its one imported
 * module and the two test files into a temporary directory OUTSIDE the repository,
 * applies the entry's mutation to the copy of the checker only, and runs the ONE
 * test the entry names (filtered by its exact name). The repository is the input
 * the copy reads (S1_RELOCK_ROOT); it is never written.
 *
 * A mutant is a TARGETED_KILL only when all of these hold:
 *   1. its anchor occurs exactly once in the checker;
 *   2. the named test ran (exactly one test executed);
 *   3. the named test failed, and its failure text matches the entry's fingerprint;
 *   4. the placebo (a semantically equivalent rewrite of the same text), applied to
 *      an identical copy, leaves the same test green.
 * Otherwise it is ONLY_INCIDENTAL (failed for another reason), SURVIVED (stayed green)
 * or INVALID_MUTANT (anchor not unique, the test did not run, or the copy did not load).
 *
 * FOUR CONTROLS check the classifier itself: an identity rewrite and a comment are
 * green; a syntax break is never a kill; a real mutant with a wrong fingerprint is
 * never a targeted kill.
 *
 * `verify` is the gate that binds the record to the files: the manifest hash, the
 * SHA-256 of the checker, of both test files and of this tool's manifest must be
 * the recorded ones, so editing any of them after the campaign makes the record stale.
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { recordViolations } from "./relock-delta-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, "..", "..", "..");
export const MANIFEST_VERSION = "relock-mut-2";
export const CHECKER_REL = "scripts/security/s1/relock-delta-check.mjs";
export const IMPORT_REL = "scripts/security/s1/risk-register-check.mjs";
export const S0_REL = "scripts/security/s0/getprisma-callsite-inventory.mjs";
export const S0_DIR_REL = "scripts/security/s0";
export const TEST_FILES = Object.freeze({
  unit: "scripts/security/s1/__tests__/relock-delta.selftest.mjs",
  e2e: "scripts/security/s1/__tests__/relock-delta.e2e.mjs",
  s0: "scripts/security/s0/__tests__/getprisma-inventory.selftest.mjs",
});
export const RECORD_REL = "docs/security/s1-relock-mutation-record.json";

const FP = (code) => `expected ${code}, got`;
const UNIT = "unit";
const E2E = "e2e";
const S0 = "s0";

// <MUTATION-MANIFEST>
/**
 * Each entry: the gate it attacks, the test that must catch it, the text of the
 * failure that proves the right reason, the anchor (`find`, unique in the checker),
 * the mutation (`replace`) and the placebo (`placebo`, equivalent to the original).
 * `file` says which test file holds the named test.
 */
export const MANIFEST = Object.freeze([
  m("M01", "schema: unknown key", UNIT, "schema: an unknown key inside a finding is refused", FP("UNKNOWN_KEY"),
    'if (!(k in spec.keys)) out.push({ klass: "SCHEMA", code: "UNKNOWN_KEY"',
    'if (false) out.push({ klass: "SCHEMA", code: "UNKNOWN_KEY"',
    'if (!Object.hasOwn(spec.keys, k)) out.push({ klass: "SCHEMA", code: "UNKNOWN_KEY"'),
  m("M02", "schema: missing key", UNIT, "schema: a missing required key is refused", FP("MISSING_KEY"),
    'out.push({ klass: "SCHEMA", code: "MISSING_KEY", detail: `${where}: missing key "${k}"` });',
    "void 0;",
    'out.push({ klass: "SCHEMA", code: "MISSING_KEY", detail: `${where}: missing key "${k}"` }); void 0;'),
  m("M03", "schema: version", UNIT, "schema: a wrong schema version is refused", FP("SCHEMA_VERSION"),
    "if (data.schemaVersion !== SCHEMA_VERSION) add(",
    "if (false) add(",
    "if (data.schemaVersion !== SCHEMA_VERSION && true) add("),
  m("M04", "schema: derived section absent", UNIT, "schema: a missing derived section is refused", `${FP("MISSING_KEY")}|Cannot read properties`,
    'for (const k of DERIVED_KEYS) if (!(k in data)) add(',
    "for (const k of DERIVED_KEYS) if (false) add(",
    'for (const k of DERIVED_KEYS) if (!Object.hasOwn(data, k)) add('),
  m("M05", "sources: merge parents", UNIT, "sources: swapped merge parents are refused", `${FP("MERGE_PARENTS")}|Command failed`,
    "parents.length === 2 && parents[0] === s.targetMainSha && parents[1] === s.securityHeadSha",
    "parents.length === 2 && parents.includes(s.targetMainSha) && parents.includes(s.securityHeadSha)",
    "parents.length === 2 && parents[0] === s.targetMainSha && parents[1] === s.securityHeadSha && true"),
  m("M06", "sources: second parent", UNIT, "sources: a security head that is not the merge's second parent is refused", `${FP("MERGE_PARENTS")}|Command failed`,
    "parents[0] === s.targetMainSha && parents[1] === s.securityHeadSha",
    "parents[0] === s.targetMainSha && true",
    "parents[1] === s.securityHeadSha && parents[0] === s.targetMainSha"),
  m("M07", "sources: merge base", UNIT, "sources: a frozen source that is not the merge base is refused", FP("MERGE_BASE"),
    '.trim() !== s.frozenSourceSha) add("SOURCES", "MERGE_BASE"',
    '.trim() === "x") add("SOURCES", "MERGE_BASE"',
    '.trim() !== `${s.frozenSourceSha}`) add("SOURCES", "MERGE_BASE"'),
  m("M08", "sources: git objects", UNIT, "sources: a commit that is not in the repository is refused", `${FP("GIT_OBJECTS")}|Command failed`,
    "if (!objectsPresent) {",
    "if (false) {",
    "if (objectsPresent === false) {"),
  m("M09", "sources: ancestor", UNIT, "sources: a frozen source that is not an ancestor of the target is refused", FP("FROZEN_NOT_ANCESTOR_OF_TARGET"),
    'add("SOURCES", "FROZEN_NOT_ANCESTOR_OF_TARGET"',
    'void ("SOURCES", "FROZEN_NOT_ANCESTOR_OF_TARGET"',
    'add("SOURCES", `FROZEN_NOT_ANCESTOR_OF_TARGET`'),
  m("M10", "derived: orphan adjudication", UNIT, "derived: an orphan adjudication is refused", FP("ORPHAN_ADJUDICATION"),
    'for (const o of orphan) add("DERIVED_DRIFT", "ORPHAN_ADJUDICATION", o);',
    "void orphan;",
    'for (const o of orphan.slice()) add("DERIVED_DRIFT", "ORPHAN_ADJUDICATION", o);'),
  m("M11", "derived: stale fingerprint", UNIT, "derived: an adjudication pinned to a stale fingerprint is refused", FP("ORPHAN_ADJUDICATION"),
    "else if (live.get(a.callsiteId) !== a.sourceFingerprint) out.push(",
    "else if (false) out.push(",
    "else if (!(live.get(a.callsiteId) === a.sourceFingerprint)) out.push("),
  m("M12", "derived: stale inventory", UNIT, "derived: a stale inventory is refused", FP("STALE_INVENTORY"),
    "if (JSON.stringify(treeInventorySummary(root)) !== JSON.stringify(readJson(paths.inventory).summary)) {",
    "if (false) {",
    "if (JSON.stringify(treeInventorySummary(root)) !== JSON.stringify(readJson(paths.inventory)[\"summary\"])) {"),
  m("M13", "derived: section drift", UNIT, "derived: a delta count the tree does not produce is refused", FP("DERIVED_DRIFT"),
    'if (JSON.stringify(fresh[key]) !== JSON.stringify(data[key])) add("DERIVED_DRIFT", "DERIVED_DRIFT"',
    'if (false) add("DERIVED_DRIFT", "DERIVED_DRIFT"',
    'if (JSON.stringify(fresh[key]) !== JSON.stringify(data[key]) && true) add("DERIVED_DRIFT", "DERIVED_DRIFT"'),
  m("M14", "derived: unresolved call sites", UNIT, "derived: an unresolved call site is refused", FP("GETPRISMA_UNRESOLVED"),
    "if (fresh.getPrisma.unresolved !== 0) add(",
    "if (false) add(",
    "if (fresh.getPrisma.unresolved > 0) add("),
  m("M15", "derived: unresolved edges", UNIT, "derived: an unresolved consumer edge is refused", FP("GETPRISMA_UNRESOLVED_EDGES"),
    "if (fresh.getPrisma.unresolvedEdges !== 0) add(",
    "if (false) add(",
    "if (fresh.getPrisma.unresolvedEdges > 0) add("),
  m("M16", "derived: primary partition", UNIT, "derived: a primary partition that does not cover every call site is refused", FP("PRIMARY_PARTITION"),
    "pp.missingPrimaryIds + pp.duplicatePrimaryIds + pp.outsideClosedSet !== 0) {",
    "pp.missingPrimaryIds + pp.duplicatePrimaryIds + pp.outsideClosedSet < 0) {",
    "pp.outsideClosedSet + pp.missingPrimaryIds + pp.duplicatePrimaryIds !== 0) {"),
  m("M17", "derived: position", UNIT, "derived: a call site position that holds no getPrisma token is refused", FP("CALLSITE_POSITION"),
    "if (!a.position.tokenFound) add(",
    "if (false) add(",
    "if (a.position.tokenFound === false) add("),
  m("M18", "derived: reviewed", UNIT, "derived: a call site with no reachability review is refused", FP("CALLSITE_NOT_REVIEWED"),
    "if (a.reachability === null) add(",
    "if (false) add(",
    "if (a.reachability == null) add("),
  m("M19", "derived: review of unknown call site", UNIT, "derived: a review of a call site the delta did not add is refused", FP("REVIEW_OF_UNKNOWN_CALLSITE"),
    "for (const id of reviewedIds) if (!addedIds.has(id)) add(",
    "for (const id of reviewedIds) if (false) add(",
    "for (const id of reviewedIds) if (addedIds.has(id) === false) add("),
  m("M20", "derived: historical evidence merge", UNIT, "derived: historical S0 evidence not preserved by the merge is refused", FP("HISTORICAL_EVIDENCE_MODIFIED"),
    'if (h.role === "S0_EVIDENCE" && !h.preservedByMerge) out.push(',
    'if (false) out.push(',
    'if (h.role === "S0_EVIDENCE" && h.preservedByMerge === false) out.push('),
  m("M21", "derived: historical evidence edited", UNIT, "derived: S0 evidence edited after the merge is refused", FP("HISTORICAL_EVIDENCE_EDITED_AFTER_MERGE"),
    "if (edge && edgeCurrentSha !== edge.frozenSha256) out.push(",
    "if (false) out.push(",
    "if (edge && !(edgeCurrentSha === edge.frozenSha256)) out.push("),
  m("M22", "derived: frozen register hash", UNIT, "derived: a frozen register hash that differs from the pin is refused", FP("FROZEN_REGISTER_HASH"),
    "if (regRow && registerPinSha !== null && regRow.frozenSha256 !== registerPinSha) {",
    "if (false) {",
    "if (regRow && registerPinSha !== null && !(regRow.frozenSha256 === registerPinSha)) {"),
  m("M23", "findings: register finding missing from delta", UNIT, "findings: a register delta finding missing from the delta document is refused", FP("REGISTER_FINDING_MISSING_FROM_DELTA"),
    "if (!declared.has(f.findingId)) add(",
    "if (false) add(",
    "if (declared.has(f.findingId) === false) add("),
  m("M24", "findings: id shape", UNIT, "findings: a malformed delta finding id is refused", FP("FINDING_ID"),
    "if (!FINDING_ID.test(w)) add(",
    "if (false) add(",
    "if (FINDING_ID.test(w) === false) add("),
  m("M25", "findings: register id", UNIT, "findings: a wrong register id is refused", FP("REGISTER_ID"),
    "if (f.registerFindingId !== `${DELTA_FINDING_PREFIX}${f.findingId}`) add(",
    "if (false) add(",
    "if (!(f.registerFindingId === `${DELTA_FINDING_PREFIX}${f.findingId}`)) add("),
  m("M26", "findings: duplicate", UNIT, "findings: a duplicate delta finding is refused", FP("DUPLICATE_FINDING"),
    "if (seen.has(w)) add(",
    "if (false) add(",
    "if (seen.has(w) === true) add("),
  m("M27", "findings: not in register", UNIT, "findings: a delta finding missing from the register is refused", `${FP("FINDING_NOT_IN_REGISTER")}|Cannot read properties`,
    "if (!rf) add(",
    "if (false) add(",
    "if (rf === undefined) add("),
  m("M28", "findings: owner", UNIT, "findings: an owner that the register does not record is refused", FP("OWNER_DISAGREES"),
    "if (rf.ownerRiskId !== f.canonicalRiskId) add(",
    "if (false) add(",
    "if (!(rf.ownerRiskId === f.canonicalRiskId)) add("),
  m("M29", "findings: disposition", UNIT, "findings: a disposition that the register does not record is refused", FP("DISPOSITION_DISAGREES"),
    "if (rf.deltaDisposition !== f.disposition) add(",
    "if (false) add(",
    "if (!(rf.deltaDisposition === f.disposition)) add("),
  m("M30", "findings: status", UNIT, "findings: a register status that the disposition does not map to is refused", FP("STATUS_DISAGREES"),
    "if (rf.status !== DISPOSITION_STATUS[f.disposition]) add(",
    "if (false) add(",
    "if (!(rf.status === DISPOSITION_STATUS[f.disposition])) add("),
  m("M31", "findings: duplicate ownership", UNIT, "findings: a finding owned by two risks is refused", FP("DUPLICATE_OWNERSHIP"),
    "if (owners.length > 1) add(",
    "if (owners.length > 99) add(",
    "if (owners.length >= 2) add("),
  m("M32", "findings: no owner", UNIT, "findings: a finding no risk lists is refused", FP("NO_OWNER"),
    "if (owners.length === 0) add(",
    "if (owners.length < 0) add(",
    "if (!owners.length) add("),
  m("M33", "findings: new-risk scope", UNIT, "findings: a new-risk disposition on a historical owner is refused", FP("NEW_RISK_EXPECTED"),
    'if (f.disposition === "OWNED_BY_NEW_RISK" && !newScope) add(',
    "if (false) add(",
    'if (f.disposition === "OWNED_BY_NEW_RISK" && newScope === false) add('),
  m("M34", "findings: existing-risk scope", UNIT, "findings: an existing-risk disposition on a delta owner is refused", FP("EXISTING_RISK_EXPECTED"),
    'if (f.disposition === "OWNED_BY_EXISTING_RISK" && newScope) add(',
    "if (false) add(",
    'if (f.disposition === "OWNED_BY_EXISTING_RISK" && newScope === true) add('),
  m("M35", "findings: call-site backed without link", UNIT, "findings: a call-site-backed finding with no linked call site is refused", FP("CALLSITE_BACKED_WITHOUT_LINK"),
    "if (f.callsiteBacked && f.relatedCallsiteIds.length === 0) add(",
    "if (false) add(",
    "if (f.callsiteBacked && !f.relatedCallsiteIds.length) add("),
  m("M36", "findings: link without call-site backed", UNIT, "findings: linked call sites on a finding that is not call-site-backed are refused", FP("LINK_WITHOUT_CALLSITE_BACKED"),
    "if (!f.callsiteBacked && f.relatedCallsiteIds.length > 0) add(",
    "if (false) add(",
    "if (!f.callsiteBacked && f.relatedCallsiteIds.length >= 1) add("),
  m("M37", "findings: link relation", UNIT, "findings: a link with no stated relation is refused", FP("LINK_WITHOUT_RELATION"),
    "if (f.relatedCallsiteIds.length > 0 && !f.callsiteRelation) add(",
    "if (false) add(",
    "if (f.relatedCallsiteIds.length > 0 && f.callsiteRelation === undefined) add("),
  m("M38", "findings: link target", UNIT, "findings: a link to a call site the delta did not add is refused", FP("CALLSITE_LINK"),
    'if (!addedIds.has(id)) add("FINDINGS", "CALLSITE_LINK",',
    'if (false) add("FINDINGS", "CALLSITE_LINK",',
    'if (addedIds.has(id) === false) add("FINDINGS", "CALLSITE_LINK",'),
  m("M39", "findings: link anchored", UNIT, "findings: a link no evidence anchors is refused", FP("CALLSITE_LINK_NOT_ANCHORED"),
    "else if (!evPaths.has(addedFiles.get(id))) add(",
    "else if (false) add(",
    "else if (evPaths.has(addedFiles.get(id)) === false) add("),
  m("M40", "findings: delta evidence", UNIT, "findings: a finding with no delta-scope evidence is refused", FP("NO_DELTA_EVIDENCE"),
    'if (!f.evidence.some((e) => e.scope === "DELTA")) add(',
    "if (false) add(",
    'if (f.evidence.every((e) => e.scope !== "DELTA")) add('),
  m("M41", "findings: evidence path", UNIT, "findings: an evidence path that does not exist is refused", FP("EVIDENCE_PATH"),
    "if (text === null) return { code: \"EVIDENCE_PATH\", detail: `${e.path} is not in the target tree` };",
    "if (text === null) return null;",
    "if (text === null) return { code: \"EVIDENCE_PATH\", detail: `${e.path} is not in the target tree` }; /* kept */"),
  m("M42", "findings: evidence anchor", UNIT, "findings: an evidence anchor that no longer exists is refused", FP("EVIDENCE_ANCHOR"),
    "return typeof e.anchor === \"string\" && e.anchor.length >= 8 && text.includes(e.anchor) ? null :",
    "return typeof e.anchor === \"string\" && e.anchor.length >= 8 ? null :",
    "return typeof e.anchor === \"string\" && e.anchor.length >= 8 && text.indexOf(e.anchor) >= 0 ? null :"),
  m("M43", "findings: evidence absence", UNIT, "findings: an evidence absence that no longer holds is refused", FP("EVIDENCE_ABSENCE"),
    "return typeof e.absent === \"string\" && e.absent.length >= 4 && !text.includes(e.absent) ? null :",
    "return typeof e.absent === \"string\" && e.absent.length >= 4 ? null :",
    "return typeof e.absent === \"string\" && e.absent.length >= 4 && text.indexOf(e.absent) < 0 ? null :"),
  m("M44", "findings: evidence form", UNIT, "findings: evidence with neither an anchor nor an absence is refused", FP("EVIDENCE_NEEDS_ANCHOR_OR_ABSENT"),
    "if (rule === null) return { code: \"EVIDENCE_NEEDS_ANCHOR_OR_ABSENT\", detail: e.path };",
    "if (rule === null) return null;",
    "if (rule === null) return { code: `EVIDENCE_NEEDS_ANCHOR_OR_ABSENT`, detail: e.path };"),
  m("M45", "paths: outside delta", UNIT, "paths: delta evidence on a file the delta did not change is refused", FP("PATH_OUTSIDE_DELTA"),
    "if (e.scope === \"DELTA\" && !inDelta) add(",
    "if (false) add(",
    "if (e.scope === \"DELTA\" && inDelta === false) add("),
  m("M46", "findings: projection present", UNIT, "findings: a projection entry that is missing is refused", FP("PROJECTION_MISSING"),
    "for (const f of data.findings) if (!proj.has(f.findingId)) add(",
    "for (const f of data.findings) if (false) add(",
    "for (const f of data.findings) if (proj.has(f.findingId) === false) add("),
  m("M47", "report: block drift", UNIT, "report: a stale generated block is refused", FP("BLOCK_DRIFT"),
    'else if (found !== blocks[name]) add("REPORT", "BLOCK_DRIFT"',
    'else if (false) add("REPORT", "BLOCK_DRIFT"',
    'else if (!(found === blocks[name])) add("REPORT", "BLOCK_DRIFT"'),
  m("M48", "report: block absent", UNIT, "report: an absent generated block is refused", FP("BLOCK_ABSENT"),
    'if (found === null) add("REPORT", "BLOCK_ABSENT"',
    'if (false) add("REPORT", "BLOCK_ABSENT"',
    'if (found == null) add("REPORT", "BLOCK_ABSENT"'),
  m("M49", "report: narrative number", UNIT, "report: a digit-led count in the narrative is refused", FP("UNMARKED_NARRATIVE_NUMBER"),
    "if (NARRATIVE_NUMBER.test(line)) add(",
    "if (false) add(",
    "if (line.search(NARRATIVE_NUMBER) >= 0) add("),
  m("M50", "report: finding named", UNIT, "report: a delta finding missing from the report is refused", FP("FINDING_NOT_IN_REPORT"),
    "if (!md.includes(f.registerFindingId)) add(",
    "if (false) add(",
    "if (md.indexOf(f.registerFindingId) < 0) add("),
  m("M51", "report: independent pass claim", UNIT, "report: a claim of an independent pass is refused", FP("REPORT_CLAIM"),
    "if (/INDEPENDENT_PASS|independent PASS (?:issued|granted)/i.test(md)) add(",
    "if (false) add(",
    "if (/independent[_ ]pass(?:ed)?[^a-z]|INDEPENDENT_PASS|independent PASS (?:issued|granted)/i.test(md)) add("),
  m("M52", "report: missing report", UNIT, "report: a missing report is refused", `${FP("REPORT_MISSING")}|Cannot read properties`,
    'if (typeof md !== "string") add("REPORT", "REPORT_MISSING"',
    'if (false) add("REPORT", "REPORT_MISSING"',
    'if (typeof md === "undefined" || md === null) add("REPORT", "REPORT_MISSING"'),
  m("M53", "record: consistency", UNIT, "record: a surviving mutant is refused", FP("RECORD_COUNT"),
    'for (const r of recordViolations(record)) add("RECORD", r.code, r.detail);',
    "void record;",
    'for (const r of recordViolations(record)) add("RECORD", r.code, r.detail); void 0;'),
  m("M54", "record: all killed", UNIT, "record: a recorded survivor with consistent totals is still refused", FP("RECORD_NOT_ALL_KILLED"),
    'if (t.targetedKill !== t.mutants) bad("RECORD_NOT_ALL_KILLED"',
    'if (false) bad("RECORD_NOT_ALL_KILLED"',
    'if (t.targetedKill < t.mutants) bad("RECORD_NOT_ALL_KILLED"'),
  m("M55", "record: placebo", UNIT, "record: a placebo that is not green is refused", FP("RECORD_PLACEBO"),
    'if (t.placebosGreen !== t.mutants) bad("RECORD_PLACEBO"',
    'if (false) bad("RECORD_PLACEBO"',
    'if (t.placebosGreen < t.mutants) bad("RECORD_PLACEBO"'),
  m("M56", "record: cleanup", UNIT, "record: a cleanup that did not remove the copies is refused", FP("RECORD_CLEANUP"),
    'if (record.cleanup !== "REMOVED") bad(',
    "if (false) bad(",
    'if (!(record.cleanup === "REMOVED")) bad('),
  m("M57", "record: controls", UNIT, "record: a control that did not behave as expected is refused", FP("RECORD_COUNT"),
    "t.controlsAsExpected !== cs.filter((c) => c.observed === c.expected).length",
    "t.controlsAsExpected !== cs.length",
    "t.controlsAsExpected !== cs.filter((c) => c.expected === c.observed).length"),
  m("M58", "content: secret", UNIT, "content: a secret-shaped string is refused", FP("SECRET_SHAPE"),
    'if (hits.length) add("CONTENT", "SECRET_SHAPE"',
    'if (false) add("CONTENT", "SECRET_SHAPE"',
    'if (hits.length > 0) add("CONTENT", "SECRET_SHAPE"'),
  m("M59", "content: absolute path", UNIT, "content: an absolute local path is refused", FP("ABSOLUTE_PATH"),
    "if (ABSOLUTE_PATH.test(dataWithoutRegex) || (typeof md === \"string\" && ABSOLUTE_PATH.test(md)) || regexFields.some((p) => ABSOLUTE_PATH_NO_UNC.test(p))) {",
    "if (false) {",
    "if ((typeof md === \"string\" && ABSOLUTE_PATH.test(md)) || ABSOLUTE_PATH.test(dataWithoutRegex) || regexFields.some((p) => ABSOLUTE_PATH_NO_UNC.test(p))) {"),
  m("M60", "content: clock time", UNIT, "content: a clock time is refused", FP("TIMESTAMP"),
    'if (TIMESTAMP.test(text) || (typeof md === "string" && TIMESTAMP.test(md))) add(',
    "if (false) add(",
    'if ((typeof md === "string" && TIMESTAMP.test(md)) || TIMESTAMP.test(text)) add('),
  m("M61", "exit: order", UNIT, "exit: the lowest-order failing class sets the code", "expected exit",
    "CLASS_ORDER.indexOf(a.klass) - CLASS_ORDER.indexOf(b.klass)",
    "CLASS_ORDER.indexOf(b.klass) - CLASS_ORDER.indexOf(a.klass)",
    "-(CLASS_ORDER.indexOf(b.klass) - CLASS_ORDER.indexOf(a.klass))"),
  m("M62", "exit: distinct codes", UNIT, "exit: the validation codes are distinct from usage and from a crash", "expected (?:every exit code to be distinct|a crash code above)",
    "  INTERNAL_ERROR: 70,",
    "  INTERNAL_ERROR: 2,",
    "  INTERNAL_ERROR: 70 + 0,"),
  m("M63", "rule: strict product path", UNIT, "rule: the strict product-path rule excludes docs, workflows, scripts, tests and the attributes file", "RULE_STRICT",
    'if (p.startsWith("docs/") || p.startsWith(".github/") || p.startsWith("scripts/")) return false;',
    'if (p.startsWith("docs/") || p.startsWith(".github/")) return false;',
    'if (p.startsWith("docs/") || p.startsWith("scripts/") || p.startsWith(".github/")) return false;'),
  m("M64", "rule: broad runtime path", UNIT, "rule: the broad runtime-affecting rule keeps workflows and scripts and drops docs, tests and the attributes file", "RULE_BROAD",
    'if (p.startsWith("docs/") || p === ".gitattributes") return false;',
    'if (p === ".gitattributes") return false;',
    'if (p === ".gitattributes" || p.startsWith("docs/")) return false;'),
  m("M65", "trace: importer detection", UNIT, "trace: only a file that imports the defining module is a static importer", FP("IMPORTERS"),
    "if (resolveImport(m[1], other, ctx.fileSet) === file) {",
    "if (true) {",
    "if (file === resolveImport(m[1], other, ctx.fileSet)) {"),
  m("M66", "trace: enclosing function", UNIT, "trace: the enclosing function of a call site is the nearest definition above it", FP("ENCLOSING"),
    "for (let i = line - 1; i >= 0; i -= 1) {",
    "for (let i = 0; i < line; i += 1) {",
    "for (let i = line - 1; i > -1; i -= 1) {"),
  m("M67", "trace: local helper walk", UNIT, "trace: a local helper is followed to the exported function that calls it", FP("HELPER_WALK"),
    "if (i + 1 === fn.line || !callRx.test(l)) return;",
    "return;",
    "if (!callRx.test(l) || i + 1 === fn.line) return;"),
  m("M68", "derive: decision split", UNIT, "clean: the committed provenance has no violation", "expected no violation, got",
    'decision: c.adjudication ? "MANUAL_ADJUDICATION" : "RULE_BASED",',
    'decision: c.adjudication ? "RULE_BASED" : "MANUAL_ADJUDICATION",',
    'decision: c.adjudication !== null && c.adjudication !== undefined ? "MANUAL_ADJUDICATION" : "RULE_BASED",'),
  m("M69", "derive: strict rule applied", UNIT, "clean: the committed provenance has no violation", "expected no violation, got",
    "const strict = rows.filter((r) => isStrictProductPath(r.path)).map((r) => r.path).sort(byStr);",
    "const strict = rows.filter((r) => isBroadRuntimePath(r.path)).map((r) => r.path).sort(byStr);",
    "const strict = rows.map((r) => r.path).filter((p) => isStrictProductPath(p)).sort(byStr);"),
  m("M70", "derive: compose services", UNIT, "clean: the committed provenance has no violation", "expected no violation, got",
    "else if (service && /^    env_file:/.test(line)) out.push(service);",
    "else if (service && /^    env_file_x:/.test(line)) out.push(service);",
    "else if (service && /^ {4}env_file:/.test(line)) out.push(service);"),
  m("M71", "derive: worker variable names", UNIT, "clean: the committed provenance has no violation", "expected no violation, got",
    "matchAll(/process\\.env\\.([A-Z0-9_]+)/g)",
    "matchAll(/process\\.env\\.(EXECUTIVE_[A-Z0-9_]+)/g)",
    "matchAll(/process\\.env\\.([A-Z0-9_]{1,})/g)"),
  m("M72", "derive: projection", UNIT, "clean: the committed provenance has no violation", "expected no violation, got",
    "      severity: owner ? owner.severity : null,",
    "      severity: owner ? owner.confidence : null,",
    "      severity: owner ? (owner.severity) : null,"),
  m("M73", "trace: a handler is its own consumer", UNIT, "trace: a route handler is its own consumer", FP("HANDLER"),
    "if (isHandler) importers.add(file);",
    "void isHandler;",
    "if (isHandler === true) importers.add(file);"),
  m("M74", "render: scopes block", UNIT, "clean: the committed provenance has no violation", "expected no violation, got",
    "`| Integration merge | \\`${s.integrationMergeSha}\\` | Merge of the security head into the target; parents in that order. |`,",
    "`| Integration merge | \\`${s.integrationMergeSha}\\` | Merge of the target into the security head. |`,",
    "`| Integration merge | \\`${s.integrationMergeSha}\\` | Merge of the security head into the target; parents in that order. |`,"),
  m("M75", "render: delta block", UNIT, "clean: the committed provenance has no violation", "expected no violation, got",
    "`| Commits (all / non-merge) | ${d.commits.total} / ${d.commits.nonMerge} |`,",
    "`| Commits (all / non-merge) | ${d.commits.nonMerge} / ${d.commits.total} |`,",
    "`| Commits (all / non-merge) | ${d.commits.total} / ${d.commits.nonMerge} |`,"),
  m("M76", "cli: crash is not a validation code", E2E, "e2e crash: an input that parses but breaks the checker is exit 70, never a validation code", "crash: expected exit 70, got",
    "    process.exit(EXIT.INTERNAL_ERROR);\n  }\n}",
    "    process.exit(EXIT.SCHEMA);\n  }\n}",
    "    process.exit(Number(EXIT.INTERNAL_ERROR));\n  }\n}"),
  m("M77", "cli: canonical form", E2E, "e2e canonical: a document that is correct but not canonical is exit 12", "canonical: expected exit 12, got",
    'if (text !== readFileSync(paths.data, "utf8")) violations.push(',
    "if (false) violations.push(",
    'if (readFileSync(paths.data, "utf8") !== text) violations.push('),
  m("M78", "cli: malformed json exit", E2E, "e2e malformed json: unreadable JSON is exit 4", "malformed json: expected exit 4, got",
    "return fail(EXIT.MALFORMED_JSON,",
    "return fail(EXIT.SCHEMA,",
    "return fail(Number(EXIT.MALFORMED_JSON),"),
  m("M79", "cli: generate refreshes blocks", E2E, "e2e generate is idempotent: regenerating the committed inputs changes no byte", "generate: expected the report to be unchanged",
    "writeFileSync(paths.report, fillBlocks(md, renderBlocks(canonical, record), blockNamesOf(layerOf(canonical))));",
    "writeFileSync(paths.report, md);",
    "writeFileSync(paths.report, fillBlocks(md, renderBlocks(canonical, record ?? null), blockNamesOf(layerOf(canonical))));"),
  m("M80", "cli: usage exit", E2E, "e2e usage: an unknown mode is a usage error", "usage: expected exit 2, got",
    "return stop(EXIT.USAGE, `unknown mode",
    "return stop(EXIT.SCHEMA, `unknown mode",
    "return stop(Number(EXIT.USAGE), `unknown mode"),
  m("M81", "cli: missing record is a record failure", E2E, "e2e record: a missing mutation record is exit 13", "record: expected exit 13, got",
    'if (!record) return [{ code: "RECORD_MISSING"',
    'if (!record) return []; if (false) return [{ code: "RECORD_MISSING"',
    'if (record === null || record === undefined) return [{ code: "RECORD_MISSING"'),
  m("M82", "cli: exit follows the first class", E2E, "e2e path outside delta: delta evidence on an unchanged file is exit 11", "path outside delta: expected exit 11, got",
    "return EXIT[first.klass];",
    "return EXIT.FINDINGS;",
    "return EXIT[`${first.klass}`];"),
  m("M83", "derive: priorities order", UNIT, "priorities: the report lists the register's first ten risks in the register's order", "PRIORITIES",
    ".sort((a, b) => a.remediationPriority - b.remediationPriority)\n    .slice(0, 10)",
    ".sort((a, b) => b.remediationPriority - a.remediationPriority)\n    .slice(0, 10)",
    ".sort((a, b) => a.remediationPriority - b.remediationPriority)\n    .slice(0, 10)\n    .slice()"),
  m("M84", "identity: title", UNIT, "identity: RR-001 carrying the audit-snapshot topic is refused", "expected IDENTITY_TITLE",
    'if (f.title !== pin.title) add("IDENTITY_TITLE"',
    'if (false) add("IDENTITY_TITLE"',
    'if (pin.title !== f.title) add("IDENTITY_TITLE"'),
  m("M85", "identity: swapped ids", UNIT, "identity: swapping the contents of RR-001 and RR-002 is refused", "expected IDENTITY_TITLE for both",
    'if (f.title !== pin.title) add("IDENTITY_TITLE", `${id}: the title is not the authoritative one`);',
    'if (f.title !== pin.title && id !== "RR-002") add("IDENTITY_TITLE", `${id}: the title is not the authoritative one`);',
    'if (f.title !== pin.title) add("IDENTITY_TITLE", `${id}: the title is not the authoritative one`);\n    // title checked'),
  m("M86", "identity: delta owner", UNIT, "identity: moving the delta owner of RR-001 is refused", "expected IDENTITY_OWNER",
    'if (f.canonicalRiskId !== pin.ownerRiskId) add("IDENTITY_OWNER"',
    'if (false) add("IDENTITY_OWNER"',
    'if (pin.ownerRiskId !== f.canonicalRiskId) add("IDENTITY_OWNER"'),
  m("M87", "identity: register owner", UNIT, "identity: moving the register owner of RR-002 is refused", "expected IDENTITY_OWNER",
    'if (rf.ownerRiskId !== pin.ownerRiskId) add("IDENTITY_OWNER"',
    'if (false) add("IDENTITY_OWNER"',
    'if (pin.ownerRiskId !== rf.ownerRiskId) add("IDENTITY_OWNER"'),
  m("M88", "identity: source reference RR-001", UNIT, "identity: dropping the main source reference of RR-001 is refused", "expected IDENTITY_SOURCE_REFERENCE",
    "if (!f.evidence.some((e) => e.path === ref.path && e.anchor === ref.anchor)) add(",
    "if (!f.evidence.some((e) => e.path === ref.path)) add(",
    "if (!f.evidence.some((e) => e.anchor === ref.anchor && e.path === ref.path)) add("),
  m("M89", "identity: source reference RR-002", UNIT, "identity: dropping the main source reference of RR-002 is refused", "expected IDENTITY_SOURCE_REFERENCE",
    "if (!f.evidence.some((e) => e.path === ref.path && e.anchor === ref.anchor)) add(",
    "if (false) add(",
    "if (!f.evidence.some((e) => e.path === ref.path && e.anchor === ref.anchor)) add("),
  m("M90", "identity: mechanism", UNIT, "identity: a fixed title over a different mechanism is refused", "expected IDENTITY_MECHANISM",
    "if (!f.summary.includes(phrase)) add(",
    "if (false) add(",
    "if (f.summary.indexOf(phrase) < 0) add("),
  m("M91", "identity: register mechanism", UNIT, "identity: a register summary that no longer states the mechanism is refused", "expected IDENTITY_MECHANISM",
    "if (!String(rf.summary).includes(phrase)) add(",
    "if (false) add(",
    "if (String(rf.summary).indexOf(phrase) < 0) add("),
  m("M92", "identity: assets", UNIT, "identity: an owner risk that drops an affected asset is refused", "expected IDENTITY_ASSETS",
    "if (!owner.affectedAssets.includes(a)) add(",
    "if (false) add(",
    "if (owner.affectedAssets.indexOf(a) < 0) add("),
  m("M93", "identity: verification", UNIT, "identity: an owner risk with another verification method is refused", "expected IDENTITY_VERIFICATION",
    "if (owner.verificationMethod !== pin.verificationMethod) add(",
    "if (false) add(",
    "if (pin.verificationMethod !== owner.verificationMethod) add("),
  m("M94", "identity: acceptance", UNIT, "identity: an owner risk without the pinned acceptance criterion is refused", "expected IDENTITY_ACCEPTANCE",
    "if (!criteria.includes(phrase)) add(",
    "if (false) add(",
    "if (criteria.indexOf(phrase) < 0) add("),
  m("M95", "identity: missing finding", UNIT, "identity: an authoritative finding that is not declared is refused", "expected IDENTITY_MISSING",
    'add("IDENTITY_MISSING", `${id}: the authoritative finding is not declared`);',
    "",
    'add("IDENTITY_MISSING", `${id}: the authoritative finding is not declared.`);'),
  m("M96", "identity: gate fact", UNIT, "identity: the platform-capability gate is read from the tree, and its pin must still hold", "expected IDENTITY_GATE_FACT",
    "|| gate.customerRoutes.withGate !== 0)) {",
    "|| false)) {",
    "|| 0 !== gate.customerRoutes.withGate)) {"),
  m("M97", "identity: derive gate count", UNIT, "identity: the ERP gate facts are derived from the target tree, never typed", "GATE_FACT",
    "if (git([\"show\", `${sources.targetMainSha}:${f}`], root).includes(PLATFORM_GATE)) withGate += 1;",
    "if (git([\"show\", `${sources.targetMainSha}:${f}`], root).includes(PLATFORM_GATE)) withGate += 0;",
    "if (git([\"show\", `${sources.targetMainSha}:${f}`], root).indexOf(PLATFORM_GATE) >= 0) withGate += 1;"),
  m("M98", "duplicate: title", UNIT, "identity: a new finding that duplicates an existing finding's title is refused", "expected DUPLICATE_FINDING_CONTENT",
    "if (byTitle.has(t)) out.push(",
    "if (false) out.push(",
    "if (byTitle.get(t) !== undefined) out.push("),
  m("M99", "duplicate: evidence", UNIT, "identity: a new finding that cites exactly an existing finding's evidence is refused", "expected DUPLICATE_FINDING_CONTENT",
    "if (byKey.has(k)) out.push(",
    "if (false) out.push(",
    "if (byKey.get(k) !== undefined) out.push("),
  m("M100", "duplicate: declared duplicate allowed", UNIT, "identity: a declared duplicate is allowed to repeat its original", "expected no violation for a finding declared",
    'const live = findings.filter((f) => f.disposition !== "DUPLICATE");',
    "const live = findings.filter(() => true);",
    'const live = findings.filter((f) => !(f.disposition === "DUPLICATE"));'),
  m("M101", "render: authzgate", UNIT, "clean: the committed provenance has no violation", "expected no violation, got",
    "`| Customer routes (\\`src/app/api/tenant/customers\\`) | ${gate.customerRoutes.files} | ${gate.customerRoutes.withGate} |`,",
    "`| Customer routes (\\`src/app/api/tenant/customers\\`) | ${gate.customerRoutes.withGate} | ${gate.customerRoutes.files} |`,",
    "`| Customer routes (\\`src/app/api/tenant/customers\\`) | ${gate.customerRoutes.files} | ${gate.customerRoutes.withGate} |`,\n    // row"),
  m("M102", "pin: RR-001.SITE_IDS_FN", UNIT, "identity fact: dropping RR-001.SITE_IDS_FN is refused", "expected IDENTITY_FACT_MISSING for RR-001.SITE_IDS_FN",
    "      { fact: \"RR-001.SITE_IDS_FN\", rule: \"PRESENT\", path: \"src/lib/executive/report/worker.ts\", anchor: \"async function siteIdsOf(client: unknown, organizationId: string): Promise<string[]> {\" },",
    "",
    "      { fact: \"RR-001.SITE_IDS_FN\", rule: \"PRESENT\", path: \"src/lib/executive/report/worker.ts\", anchor: \"async function siteIdsOf(client: unknown, organizationId: string): Promise<string[]> {\" }, // pinned"),
  m("M103", "pin: RR-001.MISSING_DELEGATE_EMPTY", UNIT, "identity fact: dropping RR-001.MISSING_DELEGATE_EMPTY is refused", "expected IDENTITY_FACT_MISSING for RR-001.MISSING_DELEGATE_EMPTY",
    "      { fact: \"RR-001.MISSING_DELEGATE_EMPTY\", rule: \"PRESENT\", path: \"src/lib/executive/report/worker.ts\", anchor: \"if (!sites) return [];\" },",
    "",
    "      { fact: \"RR-001.MISSING_DELEGATE_EMPTY\", rule: \"PRESENT\", path: \"src/lib/executive/report/worker.ts\", anchor: \"if (!sites) return [];\" }, // pinned"),
  m("M104", "pin: RR-001.CATCH_EMPTY", UNIT, "identity fact: dropping RR-001.CATCH_EMPTY is refused", "expected IDENTITY_FACT_MISSING for RR-001.CATCH_EMPTY",
    "      { fact: \"RR-001.CATCH_EMPTY\", rule: \"FN_BODY_REGEX\", path: \"src/lib/executive/report/worker.ts\", pattern: \"catch\\\\s*(?:\\\\([^)]*\\\\))?\\\\s*\\\\{\\\\s*return \\\\[\\\\];\\\\s*\\\\}\", symbol: \"siteIdsOf\" },",
    "",
    "      { fact: \"RR-001.CATCH_EMPTY\", rule: \"FN_BODY_REGEX\", path: \"src/lib/executive/report/worker.ts\", pattern: \"catch\\\\s*(?:\\\\([^)]*\\\\))?\\\\s*\\\\{\\\\s*return \\\\[\\\\];\\\\s*\\\\}\", symbol: \"siteIdsOf\" }, // pinned"),
  m("M105", "pin: RR-001.SCOPE_CONSUMES", UNIT, "identity fact: dropping RR-001.SCOPE_CONSUMES is refused", "expected IDENTITY_FACT_MISSING for RR-001.SCOPE_CONSUMES",
    "      { fact: \"RR-001.SCOPE_CONSUMES\", rule: \"PRESENT\", path: \"src/lib/executive/report/worker.ts\", anchor: \"siteIds: await siteIdsOf(client, organizationId),\" },",
    "",
    "      { fact: \"RR-001.SCOPE_CONSUMES\", rule: \"PRESENT\", path: \"src/lib/executive/report/worker.ts\", anchor: \"siteIds: await siteIdsOf(client, organizationId),\" }, // pinned"),
  m("M106", "pin: RR-001.EMPTY_TO_FORBIDDEN", UNIT, "identity fact: dropping RR-001.EMPTY_TO_FORBIDDEN is refused", "expected IDENTITY_FACT_MISSING for RR-001.EMPTY_TO_FORBIDDEN",
    "      { fact: \"RR-001.EMPTY_TO_FORBIDDEN\", rule: \"REGEX\", path: \"src/lib/executive/summary.ts\", pattern: \"if \\\\(siteIds\\\\.length === 0\\\\) \\\\{\\\\s*return refusedSection\\\\(\\\"FORBIDDEN\\\", REASON\\\\.noSites\\\\);\" },",
    "",
    "      { fact: \"RR-001.EMPTY_TO_FORBIDDEN\", rule: \"REGEX\", path: \"src/lib/executive/summary.ts\", pattern: \"if \\\\(siteIds\\\\.length === 0\\\\) \\\\{\\\\s*return refusedSection\\\\(\\\"FORBIDDEN\\\", REASON\\\\.noSites\\\\);\" }, // pinned"),
  m("M107", "pin: RR-001.CORRECTION_OPTION", UNIT, "identity fact: dropping RR-001.CORRECTION_OPTION is refused", "expected IDENTITY_FACT_MISSING for RR-001.CORRECTION_OPTION",
    "      { fact: \"RR-001.CORRECTION_OPTION\", rule: \"PRESENT\", path: \"src/lib/executive/report/generate.ts\", anchor: \"correction?: { actorUserId: string; reason: string };\" },",
    "",
    "      { fact: \"RR-001.CORRECTION_OPTION\", rule: \"PRESENT\", path: \"src/lib/executive/report/generate.ts\", anchor: \"correction?: { actorUserId: string; reason: string };\" }, // pinned"),
  m("M108", "pin: RR-001.ALREADY_REPORTED_GUARD", UNIT, "identity fact: dropping RR-001.ALREADY_REPORTED_GUARD is refused", "expected IDENTITY_FACT_MISSING for RR-001.ALREADY_REPORTED_GUARD",
    "      { fact: \"RR-001.ALREADY_REPORTED_GUARD\", rule: \"PRESENT\", path: \"src/lib/executive/report/generate.ts\", anchor: \"if (existing && !args.correction) {\" },",
    "",
    "      { fact: \"RR-001.ALREADY_REPORTED_GUARD\", rule: \"PRESENT\", path: \"src/lib/executive/report/generate.ts\", anchor: \"if (existing && !args.correction) {\" }, // pinned"),
  m("M109", "pin: RR-001.WORKER_NEVER_PASSES", UNIT, "identity fact: dropping RR-001.WORKER_NEVER_PASSES is refused", "expected IDENTITY_FACT_MISSING for RR-001.WORKER_NEVER_PASSES",
    "      { fact: \"RR-001.WORKER_NEVER_PASSES\", rule: \"ABSENT\", path: \"src/lib/executive/report/worker.ts\", absent: \"correction:\" },",
    "",
    "      { fact: \"RR-001.WORKER_NEVER_PASSES\", rule: \"ABSENT\", path: \"src/lib/executive/report/worker.ts\", absent: \"correction:\" }, // pinned"),
  m("M110", "pin: RR-001.NO_CORRECTION_CALLER", UNIT, "identity fact: dropping RR-001.NO_CORRECTION_CALLER is refused", "expected IDENTITY_FACT_MISSING for RR-001.NO_CORRECTION_CALLER",
    "      { fact: \"RR-001.NO_CORRECTION_CALLER\", rule: \"CALLERS_LACK\", path: \"src/lib/executive/report/generate.ts\", pattern: \"\\\\bgenerateDailyReport\\\\s*\\\\(\", lacks: \"\\\\bcorrection\\\\b\" },",
    "",
    "      { fact: \"RR-001.NO_CORRECTION_CALLER\", rule: \"CALLERS_LACK\", path: \"src/lib/executive/report/generate.ts\", pattern: \"\\\\bgenerateDailyReport\\\\s*\\\\(\", lacks: \"\\\\bcorrection\\\\b\" }, // pinned"),
  m("M111", "pin: RR-002.PROJECTS_PERMISSION_ONLY", UNIT, "identity fact: dropping RR-002.PROJECTS_PERMISSION_ONLY is refused", "expected IDENTITY_FACT_MISSING for RR-002.PROJECTS_PERMISSION_ONLY",
    "      { fact: \"RR-002.PROJECTS_PERMISSION_ONLY\", rule: \"PRESENT\", path: \"src/app/api/tenant/customers/[id]/projects/route.ts\", anchor: \"if (!requirePermission(active.scope.role, \\\"manage_erp\\\").ok) return forbidden();\" },",
    "",
    "      { fact: \"RR-002.PROJECTS_PERMISSION_ONLY\", rule: \"PRESENT\", path: \"src/app/api/tenant/customers/[id]/projects/route.ts\", anchor: \"if (!requirePermission(active.scope.role, \\\"manage_erp\\\").ok) return forbidden();\" }, // pinned"),
  m("M112", "pin: RR-002.ERP_REFERENCE_GATE", UNIT, "identity fact: dropping RR-002.ERP_REFERENCE_GATE is refused", "expected IDENTITY_FACT_MISSING for RR-002.ERP_REFERENCE_GATE",
    "      { fact: \"RR-002.ERP_REFERENCE_GATE\", rule: \"PRESENT\", path: \"src/app/api/erp/projects/route.ts\", anchor: \"if (!can(user.role, \\\"admin\\\")) return erpFailure(new ErpError(403, \\\"FORBIDDEN\\\"));\" },",
    "",
    "      { fact: \"RR-002.ERP_REFERENCE_GATE\", rule: \"PRESENT\", path: \"src/app/api/erp/projects/route.ts\", anchor: \"if (!can(user.role, \\\"admin\\\")) return erpFailure(new ErpError(403, \\\"FORBIDDEN\\\"));\" }, // pinned"),
  m("M113", "pin: RR-002.PARTY_WRITE", UNIT, "identity fact: dropping RR-002.PARTY_WRITE is refused", "expected IDENTITY_FACT_MISSING for RR-002.PARTY_WRITE",
    "      { fact: \"RR-002.PARTY_WRITE\", rule: \"PRESENT\", path: \"src/lib/customers/service.ts\", anchor: \"data: { partyId: next },\" },",
    "",
    "      { fact: \"RR-002.PARTY_WRITE\", rule: \"PRESENT\", path: \"src/lib/customers/service.ts\", anchor: \"data: { partyId: next },\" }, // pinned"),
  m("M114", "pin: RR-002.NO_GETCURRENTUSER_PROJECTS", UNIT, "identity fact: dropping RR-002.NO_GETCURRENTUSER_PROJECTS is refused", "expected IDENTITY_FACT_MISSING for RR-002.NO_GETCURRENTUSER_PROJECTS",
    "      { fact: \"RR-002.NO_GETCURRENTUSER_PROJECTS\", rule: \"ABSENT\", path: \"src/app/api/tenant/customers/[id]/projects/route.ts\", absent: \"getCurrentUser\" },",
    "",
    "      { fact: \"RR-002.NO_GETCURRENTUSER_PROJECTS\", rule: \"ABSENT\", path: \"src/app/api/tenant/customers/[id]/projects/route.ts\", absent: \"getCurrentUser\" }, // pinned"),
  m("M115", "pin: RR-002.NO_ADMIN_GATE_PROJECTS", UNIT, "identity fact: dropping RR-002.NO_ADMIN_GATE_PROJECTS is refused", "expected IDENTITY_FACT_MISSING for RR-002.NO_ADMIN_GATE_PROJECTS",
    "      { fact: \"RR-002.NO_ADMIN_GATE_PROJECTS\", rule: \"ABSENT\", path: \"src/app/api/tenant/customers/[id]/projects/route.ts\", absent: \"can(user.role\" },",
    "",
    "      { fact: \"RR-002.NO_ADMIN_GATE_PROJECTS\", rule: \"ABSENT\", path: \"src/app/api/tenant/customers/[id]/projects/route.ts\", absent: \"can(user.role\" }, // pinned"),
  m("M116", "pin: RR-002.NO_GETCURRENTUSER_LIST", UNIT, "identity fact: dropping RR-002.NO_GETCURRENTUSER_LIST is refused", "expected IDENTITY_FACT_MISSING for RR-002.NO_GETCURRENTUSER_LIST",
    "      { fact: \"RR-002.NO_GETCURRENTUSER_LIST\", rule: \"ABSENT\", path: \"src/app/api/tenant/customers/route.ts\", absent: \"getCurrentUser\" },",
    "",
    "      { fact: \"RR-002.NO_GETCURRENTUSER_LIST\", rule: \"ABSENT\", path: \"src/app/api/tenant/customers/route.ts\", absent: \"getCurrentUser\" }, // pinned"),
  m("M117", "pin: RR-002.CUSTOMER_TREE_NO_GATE", UNIT, "identity fact: dropping RR-002.CUSTOMER_TREE_NO_GATE is refused", "expected IDENTITY_FACT_MISSING for RR-002.CUSTOMER_TREE_NO_GATE",
    "      { fact: \"RR-002.CUSTOMER_TREE_NO_GATE\", rule: \"TREE_ABSENT_REGEX\", path: \"src/app/api/tenant/customers/\", pattern: \"getCurrentUser|platformCan\\\\(|can\\\\(user\\\\.role\" },",
    "",
    "      { fact: \"RR-002.CUSTOMER_TREE_NO_GATE\", rule: \"TREE_ABSENT_REGEX\", path: \"src/app/api/tenant/customers/\", pattern: \"getCurrentUser|platformCan\\\\(|can\\\\(user\\\\.role\" }, // pinned"),
  m("M118", "pin: RR-002.PAGE_SCOPE_NO_GATE", UNIT, "identity fact: dropping RR-002.PAGE_SCOPE_NO_GATE is refused", "expected IDENTITY_FACT_MISSING for RR-002.PAGE_SCOPE_NO_GATE",
    "      { fact: \"RR-002.PAGE_SCOPE_NO_GATE\", rule: \"ABSENT_REGEX\", path: \"src/lib/customers/page-scope.ts\", pattern: \"getCurrentUser|platformCan\\\\(|can\\\\(user\\\\.role\" },",
    "",
    "      { fact: \"RR-002.PAGE_SCOPE_NO_GATE\", rule: \"ABSENT_REGEX\", path: \"src/lib/customers/page-scope.ts\", pattern: \"getCurrentUser|platformCan\\\\(|can\\\\(user\\\\.role\" }, // pinned"),
  m("M119", "pin: RR-002.PAGES_ORG_PERMISSION_ONLY", UNIT, "identity fact: dropping RR-002.PAGES_ORG_PERMISSION_ONLY is refused", "expected IDENTITY_FACT_MISSING for RR-002.PAGES_ORG_PERMISSION_ONLY",
    "      { fact: \"RR-002.PAGES_ORG_PERMISSION_ONLY\", rule: \"PRESENT\", path: \"src/lib/customers/page-scope.ts\", anchor: \"canViewProjects: can(role, \\\"view_erp\\\"),\" },",
    "",
    "      { fact: \"RR-002.PAGES_ORG_PERMISSION_ONLY\", rule: \"PRESENT\", path: \"src/lib/customers/page-scope.ts\", anchor: \"canViewProjects: can(role, \\\"view_erp\\\"),\" }, // pinned"),
  m("M120", "pin: RR-010.AUDIT_ONLY_ON_CORRECTION", UNIT, "identity fact: dropping RR-010.AUDIT_ONLY_ON_CORRECTION is refused", "expected IDENTITY_FACT_MISSING for RR-010.AUDIT_ONLY_ON_CORRECTION",
    "      { fact: \"RR-010.AUDIT_ONLY_ON_CORRECTION\", rule: \"REGEX\", path: \"src/lib/executive/report/generate.ts\", pattern: \"if \\\\(args\\\\.correction\\\\) \\\\{\\\\s*await recordAuditEvent\\\\(\" },",
    "",
    "      { fact: \"RR-010.AUDIT_ONLY_ON_CORRECTION\", rule: \"REGEX\", path: \"src/lib/executive/report/generate.ts\", pattern: \"if \\\\(args\\\\.correction\\\\) \\\\{\\\\s*await recordAuditEvent\\\\(\" }, // pinned"),
  m("M121", "pin: RR-010.SINGLE_AUDIT_CALL", UNIT, "identity fact: dropping RR-010.SINGLE_AUDIT_CALL is refused", "expected IDENTITY_FACT_MISSING for RR-010.SINGLE_AUDIT_CALL",
    "      { fact: \"RR-010.SINGLE_AUDIT_CALL\", rule: \"REGEX\", path: \"src/lib/executive/report/generate.ts\", pattern: \"^(?:(?!recordAuditEvent\\\\()[\\\\s\\\\S])*recordAuditEvent\\\\((?:(?!recordAuditEvent\\\\()[\\\\s\\\\S])*$\" },",
    "",
    "      { fact: \"RR-010.SINGLE_AUDIT_CALL\", rule: \"REGEX\", path: \"src/lib/executive/report/generate.ts\", pattern: \"^(?:(?!recordAuditEvent\\\\()[\\\\s\\\\S])*recordAuditEvent\\\\((?:(?!recordAuditEvent\\\\()[\\\\s\\\\S])*$\" }, // pinned"),
  m("M122", "pin: RR-010.CREATE_NOT_AUDITED", UNIT, "identity fact: dropping RR-010.CREATE_NOT_AUDITED is refused", "expected IDENTITY_FACT_MISSING for RR-010.CREATE_NOT_AUDITED",
    "      { fact: \"RR-010.CREATE_NOT_AUDITED\", rule: \"PRESENT\", path: \"src/lib/executive/report/generate.ts\", anchor: \"The ordinary nightly run is not audited per organization: it is\" },",
    "",
    "      { fact: \"RR-010.CREATE_NOT_AUDITED\", rule: \"PRESENT\", path: \"src/lib/executive/report/generate.ts\", anchor: \"The ordinary nightly run is not audited per organization: it is\" }, // pinned"),
  m("M123", "pin: RR-010.NO_WORKER_AUDIT", UNIT, "identity fact: dropping RR-010.NO_WORKER_AUDIT is refused", "expected IDENTITY_FACT_MISSING for RR-010.NO_WORKER_AUDIT",
    "      { fact: \"RR-010.NO_WORKER_AUDIT\", rule: \"ABSENT_REGEX\", path: \"src/lib/executive/report/worker.ts\", pattern: \"[Aa]udit\" },",
    "",
    "      { fact: \"RR-010.NO_WORKER_AUDIT\", rule: \"ABSENT_REGEX\", path: \"src/lib/executive/report/worker.ts\", pattern: \"[Aa]udit\" }, // pinned"),
  m("M124", "pin: RR-010.NO_READ_AUDIT", UNIT, "identity fact: dropping RR-010.NO_READ_AUDIT is refused", "expected IDENTITY_FACT_MISSING for RR-010.NO_READ_AUDIT",
    "      { fact: \"RR-010.NO_READ_AUDIT\", rule: \"ABSENT_REGEX\", path: \"src/lib/executive/report/read.ts\", pattern: \"[Aa]udit\" },",
    "",
    "      { fact: \"RR-010.NO_READ_AUDIT\", rule: \"ABSENT_REGEX\", path: \"src/lib/executive/report/read.ts\", pattern: \"[Aa]udit\" }, // pinned"),
  m("M125", "pin: RR-010.NO_LIST_PAGE_AUDIT", UNIT, "identity fact: dropping RR-010.NO_LIST_PAGE_AUDIT is refused", "expected IDENTITY_FACT_MISSING for RR-010.NO_LIST_PAGE_AUDIT",
    "      { fact: \"RR-010.NO_LIST_PAGE_AUDIT\", rule: \"ABSENT_REGEX\", path: \"src/app/[locale]/dashboard/executive/reports/page.tsx\", pattern: \"[Aa]udit\" },",
    "",
    "      { fact: \"RR-010.NO_LIST_PAGE_AUDIT\", rule: \"ABSENT_REGEX\", path: \"src/app/[locale]/dashboard/executive/reports/page.tsx\", pattern: \"[Aa]udit\" }, // pinned"),
  m("M126", "pin: RR-010.NO_DETAIL_PAGE_AUDIT", UNIT, "identity fact: dropping RR-010.NO_DETAIL_PAGE_AUDIT is refused", "expected IDENTITY_FACT_MISSING for RR-010.NO_DETAIL_PAGE_AUDIT",
    "      { fact: \"RR-010.NO_DETAIL_PAGE_AUDIT\", rule: \"ABSENT_REGEX\", path: \"src/app/[locale]/dashboard/executive/reports/[date]/page.tsx\", pattern: \"[Aa]udit\" },",
    "",
    "      { fact: \"RR-010.NO_DETAIL_PAGE_AUDIT\", rule: \"ABSENT_REGEX\", path: \"src/app/[locale]/dashboard/executive/reports/[date]/page.tsx\", pattern: \"[Aa]udit\" }, // pinned"),
  m("M127", "pin: RR-010.NO_RUN_ROUTE_AUDIT", UNIT, "identity fact: dropping RR-010.NO_RUN_ROUTE_AUDIT is refused", "expected IDENTITY_FACT_MISSING for RR-010.NO_RUN_ROUTE_AUDIT",
    "      { fact: \"RR-010.NO_RUN_ROUTE_AUDIT\", rule: \"ABSENT_REGEX\", path: \"src/app/api/executive/reports/run/route.ts\", pattern: \"[Aa]udit\" },",
    "",
    "      { fact: \"RR-010.NO_RUN_ROUTE_AUDIT\", rule: \"ABSENT_REGEX\", path: \"src/app/api/executive/reports/run/route.ts\", pattern: \"[Aa]udit\" }, // pinned"),
  m("M128", "pin: RR-010.NO_DB_TRIGGER_MIGRATION", UNIT, "identity fact: dropping RR-010.NO_DB_TRIGGER_MIGRATION is refused", "expected IDENTITY_FACT_MISSING for RR-010.NO_DB_TRIGGER_MIGRATION",
    "      { fact: \"RR-010.NO_DB_TRIGGER_MIGRATION\", rule: \"TREE_ABSENT_REGEX\", path: \"prisma/migrations/20261011090000_executive_daily_report/\", pattern: \"(?:TRIGGER|[Tt]rigger)\" },",
    "",
    "      { fact: \"RR-010.NO_DB_TRIGGER_MIGRATION\", rule: \"TREE_ABSENT_REGEX\", path: \"prisma/migrations/20261011090000_executive_daily_report/\", pattern: \"(?:TRIGGER|[Tt]rigger)\" }, // pinned"),
  m("M129", "pin: RR-010.NO_DB_TRIGGER_ANYWHERE", UNIT, "identity fact: dropping RR-010.NO_DB_TRIGGER_ANYWHERE is refused", "expected IDENTITY_FACT_MISSING for RR-010.NO_DB_TRIGGER_ANYWHERE",
    "      { fact: \"RR-010.NO_DB_TRIGGER_ANYWHERE\", rule: \"TREE_ABSENT_REGEX\", path: \"prisma/migrations/\", pattern: \"ExecutiveDailyReport.*(?:TRIGGER|[Tt]rigger)|(?:TRIGGER|[Tt]rigger).*ExecutiveDailyReport\" },",
    "",
    "      { fact: \"RR-010.NO_DB_TRIGGER_ANYWHERE\", rule: \"TREE_ABSENT_REGEX\", path: \"prisma/migrations/\", pattern: \"ExecutiveDailyReport.*(?:TRIGGER|[Tt]rigger)|(?:TRIGGER|[Tt]rigger).*ExecutiveDailyReport\" }, // pinned"),
  m("M130", "pin: RR-011.PARTY_PERSONAL_FIELDS", UNIT, "identity fact: dropping RR-011.PARTY_PERSONAL_FIELDS is refused", "expected IDENTITY_FACT_MISSING for RR-011.PARTY_PERSONAL_FIELDS",
    "      { fact: \"RR-011.PARTY_PERSONAL_FIELDS\", rule: \"BLOCK_REGEX\", path: \"prisma/schema.prisma\", pattern: \"email\\\\s+String\\\\?[\\\\s\\\\S]*phone\\\\s+String\\\\?[\\\\s\\\\S]*notes\\\\s+String\\\\?\", symbol: \"model Party\" },",
    "",
    "      { fact: \"RR-011.PARTY_PERSONAL_FIELDS\", rule: \"BLOCK_REGEX\", path: \"prisma/schema.prisma\", pattern: \"email\\\\s+String\\\\?[\\\\s\\\\S]*phone\\\\s+String\\\\?[\\\\s\\\\S]*notes\\\\s+String\\\\?\", symbol: \"model Party\" }, // pinned"),
  m("M131", "pin: RR-011.INTERACTION_FREE_TEXT", UNIT, "identity fact: dropping RR-011.INTERACTION_FREE_TEXT is refused", "expected IDENTITY_FACT_MISSING for RR-011.INTERACTION_FREE_TEXT",
    "      { fact: \"RR-011.INTERACTION_FREE_TEXT\", rule: \"BLOCK_REGEX\", path: \"prisma/schema.prisma\", pattern: \"summary\\\\s+String\\\\s+@db\\\\.VarChar\\\\(2000\\\\)\", symbol: \"model PartyInteraction\" },",
    "",
    "      { fact: \"RR-011.INTERACTION_FREE_TEXT\", rule: \"BLOCK_REGEX\", path: \"prisma/schema.prisma\", pattern: \"summary\\\\s+String\\\\s+@db\\\\.VarChar\\\\(2000\\\\)\", symbol: \"model PartyInteraction\" }, // pinned"),
  m("M132", "pin: RR-011.ERASURE_REGISTRY_LACKS_PARTY", UNIT, "identity fact: dropping RR-011.ERASURE_REGISTRY_LACKS_PARTY is refused", "expected IDENTITY_FACT_MISSING for RR-011.ERASURE_REGISTRY_LACKS_PARTY",
    "      { fact: \"RR-011.ERASURE_REGISTRY_LACKS_PARTY\", rule: \"ABSENT_REGEX\", path: \"src/lib/compliance/erasure-targets.ts\", pattern: \"\\\\bParty(?:Interaction)?\\\\b\" },",
    "",
    "      { fact: \"RR-011.ERASURE_REGISTRY_LACKS_PARTY\", rule: \"ABSENT_REGEX\", path: \"src/lib/compliance/erasure-targets.ts\", pattern: \"\\\\bParty(?:Interaction)?\\\\b\" }, // pinned"),
  m("M133", "pin: RR-011.EXPORT_REGISTRY_LACKS_PARTY", UNIT, "identity fact: dropping RR-011.EXPORT_REGISTRY_LACKS_PARTY is refused", "expected IDENTITY_FACT_MISSING for RR-011.EXPORT_REGISTRY_LACKS_PARTY",
    "      { fact: \"RR-011.EXPORT_REGISTRY_LACKS_PARTY\", rule: \"ABSENT_REGEX\", path: \"src/lib/compliance/export-sources.ts\", pattern: \"\\\\bParty(?:Interaction)?\\\\b\" },",
    "",
    "      { fact: \"RR-011.EXPORT_REGISTRY_LACKS_PARTY\", rule: \"ABSENT_REGEX\", path: \"src/lib/compliance/export-sources.ts\", pattern: \"\\\\bParty(?:Interaction)?\\\\b\" }, // pinned"),
  m("M134", "pin: RR-011.INVENTORY_LACKS_PARTY", UNIT, "identity fact: dropping RR-011.INVENTORY_LACKS_PARTY is refused", "expected IDENTITY_FACT_MISSING for RR-011.INVENTORY_LACKS_PARTY",
    "      { fact: \"RR-011.INVENTORY_LACKS_PARTY\", rule: \"ABSENT_REGEX\", path: \"src/lib/compliance/processing-inventory.ts\", pattern: \"\\\\bParty(?:Interaction)?\\\\b\" },",
    "",
    "      { fact: \"RR-011.INVENTORY_LACKS_PARTY\", rule: \"ABSENT_REGEX\", path: \"src/lib/compliance/processing-inventory.ts\", pattern: \"\\\\bParty(?:Interaction)?\\\\b\" }, // pinned"),
  m("M135", "pin: RR-011.NO_DELETE_IN_LIB", UNIT, "identity fact: dropping RR-011.NO_DELETE_IN_LIB is refused", "expected IDENTITY_FACT_MISSING for RR-011.NO_DELETE_IN_LIB",
    "      { fact: \"RR-011.NO_DELETE_IN_LIB\", rule: \"TREE_ABSENT_REGEX\", path: \"src/lib/customers/\", pattern: \"\\\\.(?:delete|deleteMany)\\\\(\" },",
    "",
    "      { fact: \"RR-011.NO_DELETE_IN_LIB\", rule: \"TREE_ABSENT_REGEX\", path: \"src/lib/customers/\", pattern: \"\\\\.(?:delete|deleteMany)\\\\(\" }, // pinned"),
  m("M136", "pin: RR-011.NO_DELETE_IN_ROUTES", UNIT, "identity fact: dropping RR-011.NO_DELETE_IN_ROUTES is refused", "expected IDENTITY_FACT_MISSING for RR-011.NO_DELETE_IN_ROUTES",
    "      { fact: \"RR-011.NO_DELETE_IN_ROUTES\", rule: \"TREE_ABSENT_REGEX\", path: \"src/app/api/tenant/customers/\", pattern: \"\\\\.(?:delete|deleteMany)\\\\(\" },",
    "",
    "      { fact: \"RR-011.NO_DELETE_IN_ROUTES\", rule: \"TREE_ABSENT_REGEX\", path: \"src/app/api/tenant/customers/\", pattern: \"\\\\.(?:delete|deleteMany)\\\\(\" }, // pinned"),
  m("M137", "pin: RR-011.NO_ANONYMISE_OR_EXPORT", UNIT, "identity fact: dropping RR-011.NO_ANONYMISE_OR_EXPORT is refused", "expected IDENTITY_FACT_MISSING for RR-011.NO_ANONYMISE_OR_EXPORT",
    "      { fact: \"RR-011.NO_ANONYMISE_OR_EXPORT\", rule: \"TREE_ABSENT_REGEX\", path: \"src/lib/customers/\", pattern: \"anonymi[sz]e|export(?:Customer|Party|Parties)\\\\w*\" },",
    "",
    "      { fact: \"RR-011.NO_ANONYMISE_OR_EXPORT\", rule: \"TREE_ABSENT_REGEX\", path: \"src/lib/customers/\", pattern: \"anonymi[sz]e|export(?:Customer|Party|Parties)\\\\w*\" }, // pinned"),
  m("M138", "pin: RR-011.ONLY_ORG_CASCADE", UNIT, "identity fact: dropping RR-011.ONLY_ORG_CASCADE is refused", "expected IDENTITY_FACT_MISSING for RR-011.ONLY_ORG_CASCADE",
    "      { fact: \"RR-011.ONLY_ORG_CASCADE\", rule: \"BLOCK_REGEX\", path: \"prisma/schema.prisma\", pattern: \"organization\\\\s+Organization\\\\s+@relation\\\\(fields: \\\\[organizationId\\\\], references: \\\\[id\\\\], onDelete: Cascade\\\\)\", symbol: \"model Party\" },",
    "",
    "      { fact: \"RR-011.ONLY_ORG_CASCADE\", rule: \"BLOCK_REGEX\", path: \"prisma/schema.prisma\", pattern: \"organization\\\\s+Organization\\\\s+@relation\\\\(fields: \\\\[organizationId\\\\], references: \\\\[id\\\\], onDelete: Cascade\\\\)\", symbol: \"model Party\" }, // pinned"),
  m("M139", "pin: RR-011.NOTHING_DELETED_NOTE", UNIT, "identity fact: dropping RR-011.NOTHING_DELETED_NOTE is refused", "expected IDENTITY_FACT_MISSING for RR-011.NOTHING_DELETED_NOTE",
    "      { fact: \"RR-011.NOTHING_DELETED_NOTE\", rule: \"PRESENT\", path: \"src/lib/customers/service.ts\", anchor: \"Nothing is deleted. A customer is archived; interactions are append-only.\" },",
    "",
    "      { fact: \"RR-011.NOTHING_DELETED_NOTE\", rule: \"PRESENT\", path: \"src/lib/customers/service.ts\", anchor: \"Nothing is deleted. A customer is archived; interactions are append-only.\" }, // pinned"),
  m("M140", "evidence: committed blob", UNIT, "evidence: a PRESENT fact is read from the committed blob, not from the working tree", "BLOB_READ",
    "text = lf(git([\"show\", `${sha}:${path}`], root));",
    "text = lf(readFileSync(join(root, path), \"utf8\"));",
    "text = lf(git([\"show\", sha + \":\" + path], root));"),
  m("M141", "evidence: committed blob (absence)", UNIT, "evidence: an ABSENT fact is read from the committed blob, not from the working tree", "BLOB_READ",
    "text = lf(git([\"show\", `${sha}:${path}`], root));",
    "text = lf(readFileSync(join(root, path), \"utf8\"));",
    "text = lf(git([\"show\", sha + \":\" + path], root));"),
  m("M142", "evidence: committed tree grep", UNIT, "evidence: every rule holds and fails on a fixture tree", "expected EVIDENCE_CALLERS|expected EVIDENCE_TREE|expected to hold",
    "out = git([\"grep\", \"-l\", \"-P\", \"-I\", \"-e\", pattern, sha, \"--\", ...prefixes], root);",
    "out = git([\"grep\", \"-l\", \"-P\", \"-I\", \"-e\", pattern, \"--\", ...prefixes], root);",
    "out = git([\"grep\", \"-l\", \"-P\", \"-I\", \"-e\", pattern, sha, \"--\", ...prefixes], root); /* kept */"),
  m("M143", "worktree: allowlist enforced", UNIT, "worktree: a modified product file is refused (WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST)", "WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST",
    "    if (isAllowlistedPath(path)) continue;",
    "    continue;",
    "    if (isAllowlistedPath(path) === true) continue;"),
  m("M144", "worktree: untracked kind", UNIT, "worktree: an untracked product file is refused (WORKTREE_UNTRACKED_OUTSIDE_ALLOWLIST)", "WORKTREE_UNTRACKED_OUTSIDE_ALLOWLIST",
    "status === \"??\" ? \"WORKTREE_UNTRACKED_OUTSIDE_ALLOWLIST\" : \"WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST\"",
    "\"WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST\"",
    "status !== \"??\" ? \"WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST\" : \"WORKTREE_UNTRACKED_OUTSIDE_ALLOWLIST\""),
  m("M145", "worktree: product dirty path accepted", UNIT, "worktree: a modified product file is refused (WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST)", "WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST",
    "export const WORKTREE_ALLOWLIST = Object.freeze([\".gitattributes\", \"docs/security/\", \"scripts/security/s0/\", \"scripts/security/s1/\"]);",
    "export const WORKTREE_ALLOWLIST = Object.freeze([\".gitattributes\", \"docs/security/\", \"scripts/security/s0/\", \"scripts/security/s1/\", \"src/\"]);",
    "export const WORKTREE_ALLOWLIST = Object.freeze([\"scripts/security/s1/\", \"scripts/security/s0/\", \"docs/security/\", \".gitattributes\"]);"),
  m("M146", "worktree: untracked files listed", UNIT, "worktree: the live status of a real repository is read the same way", "WORKTREE_UNTRACKED_OUTSIDE_ALLOWLIST",
    "\"--untracked-files=all\"], root);",
    "\"--untracked-files=no\"], root);",
    "\"--untracked-files=all\", ], root);"),
  m("M147", "head: moved outside the allowlist", UNIT, "head: a descendant that changed a product, workflow, package, migration, deploy or config path is refused, commit by commit", "expected HEAD_MOVED_OUTSIDE_ALLOWLIST, got",
    "if (outside.length) out.push(v(\"SOURCES\", \"HEAD_MOVED_OUTSIDE_ALLOWLIST\", `${outside.length} path(s) changed since the integration merge outside the allowlist, first ${outside[0]}`));",
    "void outside;",
    "if (outside.length > 0) out.push(v(\"SOURCES\", \"HEAD_MOVED_OUTSIDE_ALLOWLIST\", `${outside.length} path(s) changed since the integration merge outside the allowlist, first ${outside[0]}`));"),
  m("M148", "wiring: head gate", UNIT, "wiring: checkRelock applies the head gate", "WIRING_HEAD",
    "  out.push(...headViolations(s, root, headBase));",
    "  void headViolations;",
    "  out.push(...headViolations(s, root, headBase)); /* kept */"),
  m("M149", "wiring: worktree gate", UNIT, "wiring: checkRelock applies the worktree gate", "WIRING_WORKTREE",
    "  out.push(...worktreeViolations(worktreeStatus(root)));",
    "  void worktreeViolations;",
    "  out.push(...worktreeViolations(worktreeStatus(root))); /* kept */"),
  m("M150", "wiring: evidence context", UNIT, "wiring: checkRelock evaluates every evidence item against the committed integration merge", "WIRING_EVIDENCE_SHA",
    "  const evidenceCtx = { root, sha: s.integrationMergeSha };",
    "  const evidenceCtx = { root, sha: s.targetMainSha };",
    "  const evidenceCtx = { root, sha: s.integrationMergeSha }; // pinned"),
  m("M151", "mechanism: negation flip", UNIT, "mechanism: a negation flip that keeps every keyword is refused", "expected IDENTITY_MECHANISM_HASH for",
    "if (mechanismDigest(f.summary) !== pin.mechanismSha256) add(",
    "if (false) add(",
    "if (pin.mechanismSha256 !== mechanismDigest(f.summary)) add("),
  m("M152", "mechanism: subject and object swap", UNIT, "mechanism: a subject and object swap that keeps every keyword is refused", "expected IDENTITY_MECHANISM_HASH for",
    "if (mechanismDigest(f.summary) !== pin.mechanismSha256) add(",
    "if (false) add(",
    "if (pin.mechanismSha256 !== mechanismDigest(f.summary)) add("),
  m("M153", "mechanism: success and failure inversion", UNIT, "mechanism: a success and failure inversion that keeps every keyword is refused", "expected IDENTITY_MECHANISM_HASH for",
    "if (mechanismDigest(f.summary) !== pin.mechanismSha256) add(",
    "if (false) add(",
    "if (pin.mechanismSha256 !== mechanismDigest(f.summary)) add("),
  m("M154", "mechanism: owner swap", UNIT, "mechanism: an owner swap inside the sentence is refused", "expected IDENTITY_MECHANISM_HASH for",
    "if (mechanismDigest(f.summary) !== pin.mechanismSha256) add(",
    "if (false) add(",
    "if (pin.mechanismSha256 !== mechanismDigest(f.summary)) add("),
  m("M155", "mechanism: inversion that keeps every source reference", UNIT, "mechanism: a semantic inversion that keeps every pinned source reference is refused", "expected IDENTITY_MECHANISM_HASH for",
    "if (mechanismDigest(f.summary) !== pin.mechanismSha256) add(",
    "if (false) add(",
    "if (pin.mechanismSha256 !== mechanismDigest(f.summary)) add("),
  m("M156", "mechanism: register sentence", UNIT, "mechanism: a changed sentence of RR-002, RR-010 or RR-011 in the register is refused as well", "expected IDENTITY_MECHANISM_HASH on the register summary",
    "if (mechanismDigest(rf.summary) !== pin.registerSummarySha256) add(",
    "if (false) add(",
    "if (pin.registerSummarySha256 !== mechanismDigest(rf.summary)) add("),
  m("M157", "identity: unknown fact", UNIT, "identity fact: a fact name that no pin carries is refused", "IDENTITY_FACT_UNKNOWN",
    "if (!known.has(e.fact)) add(",
    "if (false) add(",
    "if (known.has(e.fact) === false) add("),
  m("M158", "identity: repeated fact", UNIT, "identity fact: a fact carried twice is refused", "IDENTITY_FACT_REPEATED",
    "if (seenFacts.has(e.fact)) add(",
    "if (false) add(",
    "if (seenFacts.has(e.fact) === true) add("),
  m("M159", "identity: edited fact", UNIT, "identity fact: an edited fact item is refused as not the pinned one", "IDENTITY_FACT_CHANGED",
    "const same = hit.path === fact.path && evidenceRuleOf(hit) === fact.rule &&",
    "const same = true || hit.path === fact.path && evidenceRuleOf(hit) === fact.rule &&",
    "const same = (hit.path === fact.path) && evidenceRuleOf(hit) === fact.rule &&"),
  m("M160", "identity: domain separation", UNIT, "domain: RR-011 evidence under the report module, and RR-007 evidence under the customer library, are refused", "must stay on the customer records",
    "if (e.path.startsWith(sep.forbiddenPrefix)) add(",
    "if (false) add(",
    "if (e.path.indexOf(sep.forbiddenPrefix) === 0) add("),
  m("M161", "identity: derived route sets", UNIT, "gate sets: the derived route sets, counts and the partyId writer are pinned", "IDENTITY_GATE_SETS",
    "if (!setsHold) add(",
    "if (false) add(",
    "if (setsHold === false) add("),
  m("M162", "identity: correction callers", UNIT, "correction callers: the derived callers of generateDailyReport must exist and must not pass a correction", "no callers",
    "if (!(callers.callers?.length >= 1 && callers.withCorrection?.length === 0)) add(",
    "if (false) add(",
    "if (!(callers.withCorrection?.length === 0 && callers.callers?.length >= 1)) add("),
  m("M164", "policy: branch count", UNIT, "policy: R-73 must keep both branches and the remediation must not choose one", "IDENTITY_POLICY: one branch",
    "if (branches.length < pin.policyBranches) add(",
    "if (false) add(",
    "if (pin.policyBranches > branches.length) add("),
  m("M165", "policy: second acceptance branch", UNIT, "policy: R-73 must keep both branches and the remediation must not choose one", "IDENTITY_ACCEPTANCE: the second branch",
    "      \"If the owner decides that tenant OWNER and ADMIN may use the customer surface without the platform capability:\",",
    "",
    "      \"If the owner decides that tenant OWNER and ADMIN may use the customer surface without the platform capability:\", // pinned"),
  m("M166", "rule: REGEX", UNIT, "evidence: every rule holds and fails on a fixture tree", "expected EVIDENCE_PATTERN",
    "return re && re.test(text) ? null : { code: \"EVIDENCE_PATTERN\", detail: `/${e.pattern}/ does not match in ${e.path}` };",
    "return null;",
    "return re && re.test(text) ? null : { code: \"EVIDENCE_PATTERN\", detail: `/${e.pattern}/ does not match in ${e.path}` }; /* kept */"),
  m("M167", "rule: ABSENT_REGEX", UNIT, "evidence: every rule holds and fails on a fixture tree", "expected EVIDENCE_ABSENT_PATTERN",
    "return re && !re.test(text) ? null : { code: \"EVIDENCE_ABSENT_PATTERN\", detail: `/${e.pattern}/ matches in ${e.path}` };",
    "return null;",
    "return re && !re.test(text) ? null : { code: \"EVIDENCE_ABSENT_PATTERN\", detail: `/${e.pattern}/ matches in ${e.path}` }; /* kept */"),
  m("M168", "rule: FN_BODY_REGEX", UNIT, "evidence: every rule holds and fails on a fixture tree", "expected EVIDENCE_PATTERN",
    "return re && re.test(body) ? null : { code: \"EVIDENCE_PATTERN\", detail: `/${e.pattern}/ does not match in function ${e.symbol} of ${e.path}` };",
    "return null;",
    "return re && re.test(body) ? null : { code: \"EVIDENCE_PATTERN\", detail: `/${e.pattern}/ does not match in function ${e.symbol} of ${e.path}` }; /* kept */"),
  m("M169", "rule: BLOCK_REGEX", UNIT, "evidence: every rule holds and fails on a fixture tree", "expected EVIDENCE_PATTERN",
    "return re && re.test(body) ? null : { code: \"EVIDENCE_PATTERN\", detail: `/${e.pattern}/ does not match in ${e.symbol} of ${e.path}` };",
    "return null;",
    "return re && re.test(body) ? null : { code: \"EVIDENCE_PATTERN\", detail: `/${e.pattern}/ does not match in ${e.symbol} of ${e.path}` }; /* kept */"),
  m("M170", "rule: TREE_ABSENT_REGEX", UNIT, "evidence: every rule holds and fails on a fixture tree", "expected EVIDENCE_TREE",
    "return hit.length ? { code: \"EVIDENCE_TREE\", detail: `${e.path}: ${hit.length} file(s) match /${e.pattern}/, first ${hit[0]}` } : null;",
    "return null;",
    "return hit.length > 0 ? { code: \"EVIDENCE_TREE\", detail: `${e.path}: ${hit.length} file(s) match /${e.pattern}/, first ${hit[0]}` } : null;"),
  m("M171", "rule: CALLERS_LACK", UNIT, "evidence: every rule holds and fails on a fixture tree", "expected EVIDENCE_CALLERS",
    "return bad.length ? { code: \"EVIDENCE_CALLERS\", detail: `${e.path}: caller(s) ${bad.join(\", \")} match /${e.lacks}/` } : null;",
    "return null;",
    "return bad.length > 0 ? { code: \"EVIDENCE_CALLERS\", detail: `${e.path}: caller(s) ${bad.join(\", \")} match /${e.lacks}/` } : null;"),
  m("M172", "rule: CALLERS_LACK needs a caller", UNIT, "evidence: every rule holds and fails on a fixture tree", "expected EVIDENCE_CALLERS",
    "if (callers.length === 0) return {",
    "if (false) return {",
    "if (callers.length < 1) return {"),
  m("M173", "rule: missing symbol", UNIT, "evidence: every rule holds and fails on a fixture tree", "expected EVIDENCE_SYMBOL",
    "if (body === null) return { code: \"EVIDENCE_SYMBOL\", detail: `${e.path}: function ${e.symbol} was not found` };",
    "if (false) return { code: \"EVIDENCE_SYMBOL\", detail: `${e.path}: function ${e.symbol} was not found` };",
    "if (body == null) return { code: \"EVIDENCE_SYMBOL\", detail: `${e.path}: function ${e.symbol} was not found` };"),
  m("M174", "s0 eol: normalisation removed", S0, "eol: LF, CRLF and CR-only checkouts give identical call sites, classifications, outcome flags and bytes", "CALLSITE_SET_IDENTICAL|CLASSIFICATIONS_IDENTICAL|OUTCOME_FLAGS_IDENTICAL|GENERATED_BYTES_IDENTICAL",
    "  return text.replace(/\\r\\n?/g, \"\\n\");",
    "  return text;",
    "  return text.split(\"\\r\\n\").join(\"\\n\").replace(/\\r/g, \"\\n\");", "s0"),
  m("M175", "s0 eol: normaliser unit", S0, "eol: normalizeSourceText turns CRLF and a lone CR into LF and leaves LF alone", "NORMALIZE_CRLF",
    "  return text.replace(/\\r\\n?/g, \"\\n\");",
    "  return text;",
    "  return text.split(\"\\r\\n\").join(\"\\n\").replace(/\\r/g, \"\\n\");", "s0"),
  m("M176", "s0 eol: normalisation missing on the inventory path", S0, "eol: every analyser read of a source file goes through readSourceText", "bypasses the normaliser",
    "    const src = readSourceText(join(root, relPath));",
    "    const src = readFileSync(join(root, relPath), \"utf8\");",
    "    const src = readSourceText(join(root, relPath)); /* kept */", "s0"),
  m("M177", "s0 eol: normalisation missing on the inventory path (bytes)", S0, "eol: LF, CRLF and CR-only checkouts give identical call sites, classifications, outcome flags and bytes", "CALLSITE_SET_IDENTICAL|CLASSIFICATIONS_IDENTICAL|OUTCOME_FLAGS_IDENTICAL|GENERATED_BYTES_IDENTICAL",
    "    const src = readSourceText(join(root, relPath));",
    "    const src = readFileSync(join(root, relPath), \"utf8\");",
    "    const src = readSourceText(join(root, relPath)); /* kept */", "s0"),
  m("M178", "s0 eol: normalisation missing on the reconcile path", S0, "eol: every analyser read of a source file goes through readSourceText", "bypasses the normaliser",
    "    const rel = \"src/lib/documents/storage-cleanup.ts\";\n    const src = readSourceText(join(root, rel));",
    "    const rel = \"src/lib/documents/storage-cleanup.ts\";\n    const src = readFileSync(join(root, rel), \"utf8\");",
    "    const rel = \"src/lib/documents/storage-cleanup.ts\";\n    const src = readSourceText(join(root, rel)); /* kept */", "s0"),
  m("M179", "s0 retry: durable state", S0, "retry: durable state that blocks a later run is suppression", "RETRY_BLOCKED_BY_STATE",
    "  if (trace.blockingState !== null && trace.blockingState !== undefined) return true;",
    "  if (false) return true;",
    "  if (trace.blockingState != null) return true;", "s0"),
  m("M180", "s0 retry: flip of the independent next run", S0, "retry: an independent next run of the same operation is not suppression", "RETRY_INDEPENDENT_NEXT_RUN",
    "  if (trace.sameOperationRetried !== true) return true;",
    "  if (trace.sameOperationRetried === true) return true;",
    "  if (!(trace.sameOperationRetried === true)) return true;", "s0"),
  m("M181", "s0 retry: a different operation", S0, "retry: a later run of a different operation, or no later run, is suppression", "RETRY_DIFFERENT_OPERATION",
    "  if (trace.sameOperationRetried !== true) return true;",
    "  if (false) return true;",
    "  if (trace.sameOperationRetried === false) return true;", "s0"),
  m("M182", "s0 retry: requester not told", S0, "retry: a requester that is not given a signal it can act on cannot retry, one that is can", "RETRY_REQUESTER_NOT_TOLD|RETRY_REQUESTER_TOLD",
    "  if (trace.retryTrigger === \"REQUESTER\") return trace.failureObservedByCaller !== true;",
    "  if (trace.retryTrigger === \"REQUESTER\") return trace.failureObservedByCaller === true;",
    "  if (trace.retryTrigger === \"REQUESTER\") return !(trace.failureObservedByCaller === true);", "s0"),
  m("M183", "s0 retry: a flag that disagrees with its trace", S0, "retry: a flag or a prose verdict that disagrees with its trace is a violation, for a call site and for an edge", "RETRY_CONFLICT",
    "    if (derived !== s.declared) out.push(",
    "    if (false) out.push(",
    "    if (s.declared !== derived) out.push(", "s0"),
  m("M184", "s0 retry: an untraced retry statement", S0, "retry: a call site or an edge that talks about a retry, or declares the outcome, without a trace is a violation", "RETRY_UNTRACED",
    "      if (needs) out.push(",
    "      if (false) out.push(",
    "      if (needs === true) out.push(", "s0"),
  m("M185", "s0 retry: trace shape", S0, "retry: a trace with a missing key, an unknown key, a bad enum, a timing that disagrees or a bad reference is a violation", "RETRY_SHAPE",
    "    const problems = retryTraceShapeProblems(s.trace, exists);",
    "    const problems = [];",
    "    const problems = retryTraceShapeProblems(s.trace, exists); // pinned", "s0"),
  m("M186", "s0 retry: edge flag is derived from the trace", S0, "retry: the outcome sets derive RETRY_SUPPRESSION from the trace, for an edge and for a call site, and never from a typed flag", "RETRY_SYNTH_EDGE",
    "  if (e.retryTrace && deriveRetrySuppression(e.retryTrace)) flags.push(\"RETRY_SUPPRESSION\");",
    "  if (false) flags.push(\"RETRY_SUPPRESSION\");",
    "  if (e.retryTrace && deriveRetrySuppression(e.retryTrace) === true) flags.push(\"RETRY_SUPPRESSION\");", "s0"),
  m("M187", "s0 retry: call site flag is derived from the trace", S0, "retry: the outcome sets derive RETRY_SUPPRESSION from the trace, for an edge and for a call site, and never from a typed flag", "RETRY_SYNTH_SITE",
    "    const flags = r.adjudication?.retryTrace && deriveRetrySuppression(r.adjudication.retryTrace) ? [...typed, \"RETRY_SUPPRESSION\"] : typed;",
    "    const flags = typed;",
    "    const flags = r.adjudication?.retryTrace && deriveRetrySuppression(r.adjudication.retryTrace) === true ? [...typed, \"RETRY_SUPPRESSION\"] : typed;", "s0"),
  m("M188", "s0 retry: the completeness gate is computed", S0, "retry: the completeness gate is computed from the committed data and stops the command line with exit 10", "WIRING_RETRY_COMPUTE",
    "  const retrySubjectList = retrySubjects(overrides.adjudications ?? [], edgeTraces.traces ?? []);",
    "  const retrySubjectList = [];",
    "  const retrySubjectList = retrySubjects(overrides.adjudications ?? [], edgeTraces.traces ?? []); // pinned", "s0"),
  m("M189", "s0 retry: the completeness gate stops the command", S0, "retry: the completeness gate is computed from the committed data and stops the command line with exit 10", "WIRING_RETRY_EXIT",
    "  if (inv.retryTraceProblems.length > 0) {",
    "  if (false) {",
    "  if (inv.retryTraceProblems.length > 0) { // pinned", "s0"),
  m("M190", "s0 scope: git ls-files path", S0, "scope: tracked files in scripts/security/s0 and scripts/security/s1 are not scanned, look-alikes and other scripts are, on both file-list paths", "SCOPE_FILES: git ls-files",
    "  if (isExcludedPath(rel)) return false;",
    "  if (false) return false;",
    "  if (isExcludedPath(rel) === true) return false;", "s0"),
  m("M191", "s0 scope: filesystem walk path", S0, "scope: tracked files in scripts/security/s0 and scripts/security/s1 are not scanned, look-alikes and other scripts are, on both file-list paths", "SCOPE_FILES: filesystem walk",
    "    if (isExcludedPath(rel)) continue;",
    "    if (false) continue;",
    "    if (isExcludedPath(rel) === true) continue;", "s0"),
  m("M192", "s0 scope: the s1 prefix is dropped", S0, "scope: isExcludedPath uses exact repository-relative prefixes for scripts/security/s0 and scripts/security/s1", "SCOPE_PREFIXES",
    "export const EXCLUDED_PATH_PREFIXES = Object.freeze([\"scripts/security/s0/\", \"scripts/security/s1/\"]);",
    "export const EXCLUDED_PATH_PREFIXES = Object.freeze([\"scripts/security/s0/\"]);",
    "export const EXCLUDED_PATH_PREFIXES = Object.freeze([\"scripts/security/s0/\", \"scripts/security/s1/\",]);", "s0"),
  m("M193", "s0 scope: the s0 prefix is dropped", S0, "scope: isExcludedPath uses exact repository-relative prefixes for scripts/security/s0 and scripts/security/s1", "SCOPE_PREFIXES",
    "export const EXCLUDED_PATH_PREFIXES = Object.freeze([\"scripts/security/s0/\", \"scripts/security/s1/\"]);",
    "export const EXCLUDED_PATH_PREFIXES = Object.freeze([\"scripts/security/s1/\"]);",
    "export const EXCLUDED_PATH_PREFIXES = Object.freeze([\"scripts/security/s0/\", \"scripts/security/s1/\",]);", "s0"),
  m("M194", "s0 scope: a look-alike prefix is excluded", S0, "scope: isExcludedPath uses exact repository-relative prefixes for scripts/security/s0 and scripts/security/s1", "SCOPE_KEPT",
    "  return EXCLUDED_PATH_PREFIXES.some((prefix) => p.startsWith(prefix) || p === prefix.replace(/\\/$/, \"\"));",
    "  return EXCLUDED_PATH_PREFIXES.some((prefix) => p.startsWith(prefix.replace(/\\/$/, \"\")));",
    "  return EXCLUDED_PATH_PREFIXES.some((prefix) => p === prefix.replace(/\\/$/, \"\") || p.startsWith(prefix));", "s0"),
  m("M195", "index flags: skip-worktree", UNIT, "index flags: the ls-files tags are parsed as assume-unchanged (lowercase), skip-worktree (S) and plain", "INDEX_PARSE",
    "    if (tag === \"S\") out.push(v(\"SOURCES\", \"INDEX_SKIP_WORKTREE\", path));",
    "    if (false) out.push(v(\"SOURCES\", \"INDEX_SKIP_WORKTREE\", path));",
    "    if (tag === \"S\" && true) out.push(v(\"SOURCES\", \"INDEX_SKIP_WORKTREE\", path));"),
  m("M196", "index flags: assume-unchanged", UNIT, "index flags: the ls-files tags are parsed as assume-unchanged (lowercase), skip-worktree (S) and plain", "INDEX_PARSE",
    "    else if (tag >= \"a\" && tag <= \"z\") out.push(v(\"SOURCES\", \"INDEX_ASSUME_UNCHANGED\", path));",
    "    else if (false) out.push(v(\"SOURCES\", \"INDEX_ASSUME_UNCHANGED\", path));",
    "    else if (tag >= \"a\" && tag <= \"z\" && true) out.push(v(\"SOURCES\", \"INDEX_ASSUME_UNCHANGED\", path));"),
  m("M197", "index flags: only one lowercase tag", UNIT, "index flags: the ls-files tags are parsed as assume-unchanged (lowercase), skip-worktree (S) and plain", "INDEX_PARSE",
    "    else if (tag >= \"a\" && tag <= \"z\") out.push(",
    "    else if (tag === \"h\") out.push(",
    "    else if (tag.toLowerCase() === tag && tag >= \"a\" && tag <= \"z\") out.push("),
  m("M198", "index flags: the verbose listing", UNIT, "index flags: assume-unchanged and skip-worktree hide a product edit from status and are refused, modified or not", "INDEX_PLAIN|INDEX_ASSUME_UNCHANGED|INDEX_SKIP_WORKTREE",
    "  return git([\"ls-files\", \"-v\", \"-z\"], root);",
    "  return git([\"ls-files\", \"-z\"], root);",
    "  return git([\"ls-files\", \"-v\", \"-z\"], root); // pinned"),
  m("M199", "wiring: index flag gate", UNIT, "wiring: checkRelock applies the index-flag gate", "WIRING_INDEX",
    "  out.push(...indexFlagViolations(indexFlags(root)));",
    "  void indexFlagViolations;",
    "  out.push(...indexFlagViolations(indexFlags(root))); /* kept */"),
  m("M200", "eol: a lone CR in a committed blob", UNIT, "eol: the blob reader turns LF, CRLF and CR-only into the same text", "EOL_BLOB",
    "const lf = (s) => s.replace(/\\r\\n?/g, \"\\n\");",
    "const lf = (s) => s.replace(/\\r\\n/g, \"\\n\");",
    "const lf = (s) => s.replace(/\\r\\n|\\r/g, \"\\n\");"),
  m("M205", "stale text: the gate is wired", UNIT, "stale text: process wording in the delta document or the report is refused, a defining open-item id is not, a quotation marker exempts", FP("STALE_PROCESS_TEXT"),
    "  if (stale.length) add(\"CONTENT\", \"STALE_PROCESS_TEXT\",",
    "  if (false) add(\"CONTENT\", \"STALE_PROCESS_TEXT\",",
    "  if (stale.length > 0) add(\"CONTENT\", \"STALE_PROCESS_TEXT\","),
  m("M206", "stale text: the report is scanned", UNIT, "stale text: process wording in the delta document or the report is refused, a defining open-item id is not, a quotation marker exempts", FP("STALE_PROCESS_TEXT"),
    "    ...(typeof md === \"string\" ? staleProcessTextHits(md, \"report\", { openIdLine: openId }) : []),",
    "    ...[],",
    "    ...(typeof md === \"string\" ? staleProcessTextHits(String(md), \"report\", { openIdLine: openId }) : []),"),
  m("M207", "stale text: the delta document is scanned", UNIT, "stale text: process wording in the delta document or the report is refused, a defining open-item id is not, a quotation marker exempts", FP("STALE_PROCESS_TEXT"),
    "    ...staleProcessTextHits(JSON.stringify(data, null, 2), \"delta\", { openIdLine: openId }),",
    "    ...[],",
    "    ...staleProcessTextHits(JSON.stringify(data, null, \"  \"), \"delta\", { openIdLine: openId }),"),
  m("M208", "stale text: a defining open-item id is exempt", UNIT, "stale text: process wording in the delta document or the report is refused, a defining open-item id is not, a quotation marker exempts", "STALE_QUOTED|STALE_CLEAN",
    "  const openId = (line) => /^\\s*\"id\": \"OPEN-\\d+\",?$/.test(line) || /^\\| `OPEN-\\d+` \\|/.test(line);",
    "  const openId = () => false;",
    "  const openId = (line) => /^\\| `OPEN-\\d+` \\|/.test(line) || /^\\s*\"id\": \"OPEN-\\d+\",?$/.test(line);"),
  m("M209", "s0 retry: a typed flag is not trusted", S0, "retry: the outcome sets derive RETRY_SUPPRESSION from the trace, for an edge and for a call site, and never from a typed flag", "RETRY_SYNTH_TYPED_IGNORED",
    "    const typed = (r.adjudication?.outcomeFlags ?? []).filter((f) => f !== \"RETRY_SUPPRESSION\");",
    "    const typed = (r.adjudication?.outcomeFlags ?? []);",
    "    const typed = (r.adjudication?.outcomeFlags ?? []).filter((f) => \"RETRY_SUPPRESSION\" !== f);", "s0"),
  m("M210", "partyId writer: the property must be the payload key", UNIT, "partyId writer: a lookalike key, another place, a comment, a string or another model is not a write", "PARTY_NEGATIVE: metadata",
    "      if (!WRITE_PAYLOAD_KEYS[m[1]].includes(prop.key) || prop.valueStart < 0) continue;",
    "      if (prop.valueStart < 0) continue;",
    "      if (!WRITE_PAYLOAD_KEYS[m[1]].includes(prop.key) || prop.valueStart < 0) continue; // pinned"),
  m("M211", "partyId writer: only the payload's own properties", UNIT, "partyId writer: a lookalike key, another place, a comment, a string or another model is not a write", "PARTY_NEGATIVE: a nested object of the data",
    "        for (const q of objectProperties(s, p)) if (q.key === \"partyId\") sites.add(lineOf(q.at));",
    "        if (/\\bpartyId\\b/.test(s.slice(p, closingBracket(s, p)))) sites.add(lineOf(p));",
    "        for (const q of objectProperties(s, p)) if (q.key === \"partyId\") sites.add(lineOf(q.at)); // pinned"),
  m("M212", "partyId writer: comments and strings are blanked", UNIT, "partyId writer: a lookalike key, another place, a comment, a string or another model is not a write", "PARTY_NEGATIVE: a block comment",
    "  const s = blankNonCode(text);",
    "  const s = text;",
    "  const s = blankNonCode(text); // pinned"),
  m("M213", "partyId writer: a line comment is blanked", UNIT, "partyId writer: a lookalike key, another place, a comment, a string or another model is not a write", "PARTY_NEGATIVE: a line comment",
    "    if (c === \"/\" && d === \"/\") {",
    "    if (false) {",
    "    if (c === \"/\" && d === \"/\" && true) {"),
  m("M214", "partyId writer: a block comment is blanked", UNIT, "partyId writer: a lookalike key, another place, a comment, a string or another model is not a write", "PARTY_NEGATIVE: a block comment after a value",
    "    if (c === \"/\" && d === \"*\") {",
    "    if (false) {",
    "    if (c === \"/\" && d === \"*\" && true) {"),
  m("M215", "partyId writer: a string is blanked", UNIT, "partyId writer: a lookalike key, another place, a comment, a string or another model is not a write", "PARTY_NEGATIVE: a string with a comma",
    "    if (c === \"'\" || c === '\"') {",
    "    if (false) {",
    "    if ((c === \"'\" || c === '\"') && true) {"),
  m("M216", "partyId writer: a template is blanked", UNIT, "partyId writer: a lookalike key, another place, a comment, a string or another model is not a write", "PARTY_NEGATIVE: a template with a comma",
    "    if (c === \"`\") {",
    "    if (false) {",
    "    if (c === \"`\" && true) {"),
  m("M217", "partyId writer: a regular-expression literal is read", UNIT, "partyId writer: a partyId property of the data of a project write is found, in any property order and layout", "PARTY_POSITIVE: a regular-expression literal",
    "    if (c === \"/\" && /^[(,=:[!&|?{};]?$/.test(prev)) {",
    "    if (false) {",
    "    if (c === \"/\" && /^[(,=:[!&|?{};]?$/.test(prev) && true) {"),
  m("M218", "partyId writer: a quoted key is a key", UNIT, "partyId writer: a partyId property of the data of a project write is found, in any property order and layout", "PARTY_POSITIVE: a quoted key",
    "      if (text.slice(i + 1, j) !== \"partyId\") blank(i + 1, j);",
    "      blank(i + 1, j);",
    "      if (text.slice(i + 1, j) !== \"partyId\") blank(i + 1, j); // pinned"),
  m("M219", "partyId writer: a shorthand property is a property", UNIT, "partyId writer: a partyId property of the data of a project write is found, in any property order and layout", "PARTY_POSITIVE: a shorthand property",
    "    } else if (key !== null && (s[k] === \",\" || k >= close)) {",
    "    } else if (false) {",
    "    } else if (key !== null && (k >= close || s[k] === \",\")) {"),
  m("M220", "partyId writer: any property position", UNIT, "partyId writer: a partyId property of the data of a project write is found, in any property order and layout", "PARTY_POSITIVE: the first property",
    "    if (valueStart >= 0 && key !== null) props.push({ key, at, valueStart, valueEnd, shorthand: false });",
    "    if (valueStart >= 0 && key !== null && props.length === 0) props.push({ key, at, valueStart, valueEnd, shorthand: false });",
    "    if (valueStart >= 0 && key !== null) props.push({ key, at, valueStart, valueEnd, shorthand: false }); // pinned"),
  m("M221", "partyId writer: a spread is not a property", UNIT, "partyId writer: a lookalike key, another place, a comment, a string or another model is not a write", "PARTY_NEGATIVE: a spread of a value that is called partyId",
    "      k += 3;\n    } else if (/[A-Za-z_$]/.test(s[k])) {",
    "      k += 3;\n      props.push({ key: \"partyId\", at, valueStart: -1, valueEnd: k, shorthand: true });\n    } else if (/[A-Za-z_$]/.test(s[k])) {",
    "      k += 3; // pinned\n    } else if (/[A-Za-z_$]/.test(s[k])) {"),
  m("M222", "partyId writer: a createMany array is a payload", UNIT, "partyId writer: a partyId property of the data of a project write is found, in any property order and layout", "PARTY_POSITIVE: an element of a createMany array",
    "      else if (s[v] === \"[\") {",
    "      else if (false) {",
    "      else if (s[v] === \"[\" && true) {"),
  m("M223", "partyId writer: the create and update payloads of an upsert", UNIT, "partyId writer: a partyId property of the data of a project write is found, in any property order and layout", "PARTY_POSITIVE: the create payload of an upsert",
    "upsert: [\"create\", \"update\"]",
    "upsert: [\"data\"]",
    "upsert: [\"update\", \"create\"]"),
  m("M224", "partyId writer: only the project model", UNIT, "partyId writer: a lookalike key, another place, a comment, a string or another model is not a write", "PARTY_NEGATIVE: a call on another receiver",
    "\\s*erpProject\\s*(?:\\.|\\?\\.)\\s*(update|updateMany",
    "\\s*\\w+\\s*(?:\\.|\\?\\.)\\s*(update|updateMany",
    "\\s*erpProject\\s*(?:\\?\\.|\\.)\\s*(update|updateMany"),
  m("M225", "partyId writer: optional chaining on the model", UNIT, "partyId writer: a partyId property of the data of a project write is found, in any property order and layout", "PARTY_POSITIVE: optional chaining",
    "\\s*erpProject\\s*(?:\\.|\\?\\.)\\s*(update|updateMany",
    "\\s*erpProject\\s*(?:\\.)\\s*(update|updateMany",
    "\\s*erpProject\\s*(?:\\?\\.|\\.)\\s*(update|updateMany"),
  m("M226", "partyId writer: a generic call", UNIT, "partyId writer: a partyId property of the data of a project write is found, in any property order and layout", "PARTY_POSITIVE: a generic call",
    "(?:<[^<>()]*>)?\\s*\\(/g;",
    "\\s*\\(/g;",
    "(?:<[^<>()]*>)?\\s*\\((?:)/g;"),
  m("M227", "partyId writer: a writer file is one with a write site", UNIT, "partyId writer: only a file with a real project write is a writer, a file that merely names the column is not", "PARTY_FILES",
    "root))).length > 0)\n    .sort(byStr);",
    "root))).length >= 0)\n    .sort(byStr);",
    "root))).length !== 0)\n    .sort(byStr);"),
  m("M228", "partyId writer: the customer service is read from the committed blob", UNIT, "partyId writer: the committed tree has exactly one project write of the customer, found through the structural reader", "PARTY_TREE: the writer set",
    "      partyIdWriters: partyIdWriterFiles(sources, root),",
    "      partyIdWriters: [],",
    "      partyIdWriters: partyIdWriterFiles(sources, root), // pinned"),
  m("M229", "policy pin: a decided policy without the owner's evidence", UNIT, "policy: R-73 must keep both branches and the remediation must not choose one", "IDENTITY_POLICY: a decided policy",
    "      if (owner.policy?.status === \"DECIDED\") {",
    "      if (false) {",
    "      if (owner.policy?.status === \"DECIDED\" && true) {"),
  m("M230", "policy pin: a decided policy is refused whatever its evidence", UNIT, "policy: R-73 must keep both branches and the remediation must not choose one", "IDENTITY_POLICY_OWNED|reading 'why'",
    "        if (problems.length > 0) add(\"IDENTITY_POLICY\",",
    "        if (true) add(\"IDENTITY_POLICY\",",
    "        if (problems.length >= 1) add(\"IDENTITY_POLICY\","),
  m("M231", "policy pin: evidence that is a deliverable is not the owner's", UNIT, "policy: R-73 must keep both branches and the remediation must not choose one", "IDENTITY_POLICY_SELF",
    "        if (problems.length > 0) add(\"IDENTITY_POLICY\",",
    "        if (problems.length > 0 && !problems.some((x) => x.why === \"POLICY_EVIDENCE_SELF_REFERENCE\")) add(\"IDENTITY_POLICY\",",
    "        if (problems.length > 0 && true) add(\"IDENTITY_POLICY\","),
  m("M232", "environment: no repository is a missing prerequisite", E2E, "e2e environment: when git cannot answer the checker exits 3 (a missing prerequisite), never 0 and never a validation code", "ENV_NO_GIT: the failure names the prerequisite",
    "  if (!gitOk([\"rev-parse\", \"--git-dir\"], paths.root)) return stop(EXIT.MISSING_FILE, \"git is required\");",
    "  if (false) return stop(EXIT.MISSING_FILE, \"git is required\");",
    "  if (gitOk([\"rev-parse\", \"--git-dir\"], paths.root) === false) return stop(EXIT.MISSING_FILE, \"git is required\");"),
  m("M233", "layer 2: original frozen source required", UNIT, "layer 2: a second-layer document without the original frozen source is refused", FP("ORIGINAL_FROZEN_SOURCE_ABSENT"),
    "if (!s.originalFrozenSourceSha) add(\"SOURCES\", \"ORIGINAL_FROZEN_SOURCE_ABSENT\"",
    "if (false) add(\"SOURCES\", \"ORIGINAL_FROZEN_SOURCE_ABSENT\"",
    "if (s.originalFrozenSourceSha === undefined) add(\"SOURCES\", \"ORIGINAL_FROZEN_SOURCE_ABSENT\""),
  m("M234", "layer 2: original frozen source must be an ancestor", UNIT, "layer 2: an original frozen source that is not a proper ancestor of the range base is refused", FP("ORIGINAL_FROZEN_SOURCE_NOT_ANCESTOR"),
    "else if (!gitOk([\"merge-base\", \"--is-ancestor\", s.originalFrozenSourceSha, s.frozenSourceSha], root) || s.originalFrozenSourceSha === s.frozenSourceSha) {",
    "else if (false || s.originalFrozenSourceSha === s.frozenSourceSha) {",
    "else if (!gitOk([\"merge-base\", \"--is-ancestor\", s.originalFrozenSourceSha, s.frozenSourceSha], root) || s.originalFrozenSourceSha === s.frozenSourceSha || false) {"),
  m("M235", "layer 2: original frozen source must be a proper ancestor", UNIT, "layer 2: an original frozen source that is not a proper ancestor of the range base is refused", FP("ORIGINAL_FROZEN_SOURCE_NOT_ANCESTOR"),
    "else if (!gitOk([\"merge-base\", \"--is-ancestor\", s.originalFrozenSourceSha, s.frozenSourceSha], root) || s.originalFrozenSourceSha === s.frozenSourceSha) {",
    "else if (!gitOk([\"merge-base\", \"--is-ancestor\", s.originalFrozenSourceSha, s.frozenSourceSha], root)) {",
    "else if (!gitOk([\"merge-base\", \"--is-ancestor\", s.originalFrozenSourceSha, s.frozenSourceSha], root) || s.frozenSourceSha === s.originalFrozenSourceSha) {"),
  m("M236", "layer 2: a first-layer document has no original frozen source", UNIT, "layer 2: a first-layer document that names an original frozen source is refused", FP("ORIGINAL_FROZEN_SOURCE_UNEXPECTED"),
    "} else if (s.originalFrozenSourceSha !== undefined) {",
    "} else if (false) {",
    "} else if (undefined !== s.originalFrozenSourceSha) {"),
  m("M237", "layer 2: reconciled tree must descend from the merge", UNIT, "layer 2: a reconciled tree commit that does not descend from the integration merge is refused", FP("RECONCILED_TREE_NOT_DESCENDANT"),
    "if (s.reconciledTreeSha !== undefined && (!hasCommit(s.reconciledTreeSha, root) ||",
    "if (false && (!hasCommit(s.reconciledTreeSha, root) ||",
    "if (undefined !== s.reconciledTreeSha && (!hasCommit(s.reconciledTreeSha, root) ||"),
  m("M238", "layer 2: the first layer's head base is the later merge", UNIT, "head: the committed layer is measured from the repository's real history, whatever position HEAD has", "HEAD_BASE_FIRST",
    "  const headBase = layer === \"FIRST\" ? successorBase(paths, s) : s.integrationMergeSha;",
    "  const headBase = s.integrationMergeSha;",
    "  const headBase = layer !== \"SECOND\" ? successorBase(paths, s) : s.integrationMergeSha;"),
  m("M239", "layer 2: a successor must descend from the first-layer merge", UNIT, "layer 2: a successor that does not descend from the first-layer merge is not accepted as the head base", "HEAD_BASE_DESCENDANT",
    "if (hasCommit(sha, paths.root) && sha !== sources.integrationMergeSha && gitOk([\"merge-base\", \"--is-ancestor\", sources.integrationMergeSha, sha], paths.root)) return sha;",
    "if (hasCommit(sha, paths.root) && sha !== sources.integrationMergeSha) return sha;",
    "if (hasCommit(sha, paths.root) && sha !== sources.integrationMergeSha && gitOk([\"merge-base\", \"--is-ancestor\", sources.integrationMergeSha, sha], paths.root) === true) return sha;"),
  m("M240", "layer 2: HEAD is judged against the base it is given", UNIT, "layer 2: HEAD is judged against the base it is given", "expected HEAD_MOVED_OUTSIDE_ALLOWLIST, got",
    "  if (head === base) return [];",
    "  if (head === sources.integrationMergeSha) return [];",
    "  if (head === base && true) return [];"),
  m("M241", "layer 2: the diff is taken from the base it is given", UNIT, "layer 2: the diff is taken from the base it is given", "expected HEAD_MOVED_OUTSIDE_ALLOWLIST, got",
    "git([\"diff\", \"--name-only\", \"--no-renames\", base, head], root)",
    "git([\"diff\", \"--name-only\", \"--no-renames\", sources.integrationMergeSha, head], root)",
    "git([\"diff\", \"--name-only\", \"--no-renames\", `${base}`, head], root)"),
  m("M242", "layer 2: a finding carries its own layer's prefix", UNIT, "layer 2: a first-layer identifier in a second-layer document is refused", FP("FINDING_LAYER"),
    "else if (!LAYER_ID_PREFIXES[layer].includes(idPrefix(w))) add(\"FINDINGS\", \"FINDING_LAYER\"",
    "else if (false) add(\"FINDINGS\", \"FINDING_LAYER\"",
    "else if (LAYER_ID_PREFIXES[layer].includes(idPrefix(w)) === false) add(\"FINDINGS\", \"FINDING_LAYER\""),
  m("M243", "layer 2: an observation carries its own layer's prefix", UNIT, "layer 2: an observation of the wrong layer is refused", FP("OBSERVATION_ID"),
    "if (!OBSERVATION_ID.test(p.id) || !LAYER_ID_PREFIXES[layer].includes(idPrefix(p.id))) add(",
    "if (!OBSERVATION_ID.test(p.id)) add(",
    "if (!OBSERVATION_ID.test(p.id) || LAYER_ID_PREFIXES[layer].includes(idPrefix(p.id)) === false) add("),
  m("M244", "layer 2: a new-risk disposition needs a risk of the second layer", UNIT, "layer 2: a second-layer finding that claims a new risk is refused", "expected SECOND_LAYER_NEW_RISK, got",
    "if (f.disposition === \"OWNED_BY_NEW_RISK\" && !ownScope) add(\"FINDINGS\", \"SECOND_LAYER_NEW_RISK\"",
    "if (false) add(\"FINDINGS\", \"SECOND_LAYER_NEW_RISK\"",
    "if (\"OWNED_BY_NEW_RISK\" === f.disposition && ownScope === false) add(\"FINDINGS\", \"SECOND_LAYER_NEW_RISK\""),
  m("M245", "layer 2: a document is asked only for its own layer's findings", UNIT, "layer 2: the first-layer document is not asked to declare the second layer's findings", "LAYER_SOURCE_FILTER",
    "x.family === DELTA_FAMILY && (x.source === undefined || x.source === docRel)",
    "x.family === DELTA_FAMILY",
    "x.family === DELTA_FAMILY && (x.source === docRel || x.source === undefined)"),
  m("M246", "layer 2: the first layer's content pins are not applied to the second", UNIT, "layer 2: the content pins of the first layer are not applied to the second", "LAYER_PIN_SCOPE",
    "if (layer === \"FIRST\") out.push(...identityViolations(data, reg, fresh.derivedFacts, root));",
    "out.push(...identityViolations(data, reg, fresh.derivedFacts, root));",
    "if (layer !== \"SECOND\") out.push(...identityViolations(data, reg, fresh.derivedFacts, root));"),
  m("M247", "layer 2: the original register hash pin belongs to the first layer", UNIT, "layer 2: the original register hash pin belongs to the first layer", "FROZEN_REGISTER_PIN_SCOPE",
    "layer === \"FIRST\" ? reg.reconciliation?.historicalSnapshot?.registerFileSha256 ?? null : null",
    "reg.reconciliation?.historicalSnapshot?.registerFileSha256 ?? null",
    "layer !== \"SECOND\" ? reg.reconciliation?.historicalSnapshot?.registerFileSha256 ?? null : null"),
  m("M248", "layer 2: only a document that names a reconciled tree is sealed", UNIT, "layer 2: a sealed layer reads its reconciled tree from git and an unsealed one reads the files", "SEALED: the second layer is not sealed",
    "  if (sources.reconciledTreeSha === undefined) return false;",
    "  if (false) return false;",
    "  if (undefined === sources.reconciledTreeSha) return false;"),
  m("M249", "layer 2: a sealed layer yields to caller-supplied files", UNIT, "layer 2: a sealed layer reads its reconciled tree from git and an unsealed one reads the files", "SEALED: a caller-supplied inventory is read as given",
    "  return paths.inventory === d.inventory && paths.adjudications === d.adjudications;",
    "  return true;",
    "  return d.inventory === paths.inventory && d.adjudications === paths.adjudications;"),
  m("M250", "layer 2: a sealed layer reads its inventory from git", UNIT, "layer 2: the sealed first layer's figures do not follow the current inventory", "SEALED_FIGURES: the sealed figures are the recorded ones",
    "const after = sealedTree(sources, paths) ? JSON.parse(git([\"show\", `${sources.reconciledTreeSha}:${S0_INVENTORY_REL}`], root)) : readJson(paths.inventory);",
    "const after = readJson(paths.inventory);",
    "const after = sealedTree(sources, paths) === true ? JSON.parse(git([\"show\", `${sources.reconciledTreeSha}:${S0_INVENTORY_REL}`], root)) : readJson(paths.inventory);"),
  m("M251", "layer 2: the batch blob reader skips what is not a blob", UNIT, "layer 2: the batch blob reader returns what git returns", "BLOB_READER",
    "if (header[1] !== \"blob\") continue;",
    "",
    "if (header[1] !== \"blob\") { continue; }"),
  m("M252", "layer 2: the batch blob reader steps over the separator", UNIT, "layer 2: the batch blob reader returns what git returns", "BLOB_READER",
    "    at += size + 1;",
    "    at += size;",
    "    at += 1 + size;"),
  m("M253", "layer 2: a document without a layer is the first", UNIT, "layer 2: a document without a layer is the first, and the layers are named by their document", "LAYER_DEFAULT",
    "export const layerOf = (data) => data?.sources?.layer ?? \"FIRST\";",
    "export const layerOf = (data) => data?.sources?.layer ?? \"SECOND\";",
    "export const layerOf = (data) => (data?.sources?.layer === undefined ? \"FIRST\" : data.sources.layer);"),
  m("M254", "layer 2: the second-layer report names its columns", UNIT, "layer 2: the committed second-layer provenance has no violation", "expected no violation, got",
    "second ? \"| | First relock tree | Integrated tree |\" : \"| | Frozen source | Integrated tree |\",",
    "\"| | Frozen source | Integrated tree |\",",
    "(second === true) ? \"| | First relock tree | Integrated tree |\" : \"| | Frozen source | Integrated tree |\","),
  m("M255", "layer 2: the second layer has its own prefix", UNIT, "layer 2: a first-layer identifier in a second-layer document is refused", FP("FINDING_LAYER"),
    "SECOND: Object.freeze([\"RS\"])",
    "SECOND: Object.freeze([\"RS\", \"RL\"])",
    "SECOND: Object.freeze([\"R\" + \"S\"])"),
  m("M256", "layer 2: the first layer has its own prefixes", UNIT, "layer 2: a second-layer identifier in a first-layer document is refused", FP("FINDING_LAYER"),
    "FIRST: Object.freeze([\"RL\", \"RR\"])",
    "FIRST: Object.freeze([\"RL\", \"RR\", \"RS\"])",
    "FIRST: Object.freeze([\"RL\", \"R\" + \"R\"])"),
  m("M257", "layer 2: --layer=2 selects the second layer", E2E, "e2e layer: --layer=2 checks the second-layer document and its report and exits 0 on the committed files", "layer 2 clean: the summary is the second layer",
    "opts.layer === \"2\" ? \"SECOND\" : \"FIRST\"",
    "\"FIRST\"",
    "opts.layer == \"2\" ? \"SECOND\" : \"FIRST\""),
  m("M258", "layer 2: the layers have different documents", E2E, "e2e layer: the second-layer paths are not the first layer's", "LAYER_PATHS: the documents differ",
    "SECOND: Object.freeze({ data: \"s1-second-relock-delta.json\", report: \"S1-SECOND-DELTA-RELOCK.md\", record: \"s1-relock-mutation-record.json\" }),",
    "SECOND: Object.freeze({ data: \"s1-relock-delta.json\", report: \"S1-SECOND-DELTA-RELOCK.md\", record: \"s1-relock-mutation-record.json\" }),",
    "SECOND: Object.freeze({ data: \"s1-second-relock-delta.json\", report: \"S1-SECOND-DELTA-RELOCK.md\", record: \"s1-relock-mutation-record.json\", }),"),
  m("M259", "cli parser: an invalid layer value", UNIT, "cli parser: every other spelling of the layer is refused and never read as the first layer", "LAYER_PARSER: expected",
    "else if (name === \"layer\" && !LAYER_VALUES.includes(value)) errors.push(",
    "else if (false) errors.push(",
    "else if (name === \"layer\" && !(LAYER_VALUES.includes(value))) errors.push("),
  m("M260", "cli parser: a repeated option", UNIT, "cli parser: every other spelling of the layer is refused and never read as the first layer", "LAYER_PARSER: expected",
    "else if (Object.prototype.hasOwnProperty.call(opts, name)) errors.push(",
    "else if (false) errors.push(",
    "else if (Object.prototype.hasOwnProperty.call(opts, name) === true) errors.push("),
  m("M261", "cli parser: an empty value", UNIT, "cli parser: unknown options, stray arguments, repeated options and empty values are usage errors", "LAYER_PARSER: expected",
    "else if (value === \"\") errors.push(",
    "else if (false) errors.push(",
    "else if (value.length === 0) errors.push("),
  m("M262", "cli parser: an unknown option", UNIT, "cli parser: unknown options, stray arguments, repeated options and empty values are usage errors", "LAYER_PARSER: expected",
    "if (!OPTION_NAMES.includes(name)) errors.push(",
    "if (false) errors.push(",
    "if (OPTION_NAMES.includes(name) === false) errors.push("),
  m("M263", "cli parser: a stray argument", UNIT, "cli parser: unknown options, stray arguments, repeated options and empty values are usage errors", "LAYER_PARSER: expected",
    "if (rest.length > 1) errors.push(",
    "if (false) errors.push(",
    "if (rest.length >= 2) errors.push("),
  m("M264", "cli: a usage error stops the command", E2E, "e2e layer parser: an invalid layer is a usage error for every mode and never falls back to the first layer", "expected exit 2, got",
    "if (errors.length > 0) return stop(EXIT.USAGE, `usage: ${errors[0]}`);",
    "void errors;",
    "if (errors.length !== 0) return stop(EXIT.USAGE, `usage: ${errors[0]}`);"),
  m("M265", "cli: no layer is the first layer", E2E, "e2e layer parser: the two valid layers give different answers and no layer gives the first", "no layer is the first layer",
    "defaultPaths(root, opts.layer === \"2\" ? \"SECOND\" : \"FIRST\")",
    "defaultPaths(root, opts.layer === \"1\" ? \"FIRST\" : \"SECOND\")",
    "defaultPaths(root, opts.layer !== \"2\" ? \"FIRST\" : \"SECOND\")"),
  m("M266", "head: not a descendant of the base", UNIT, "head: an unrelated commit, a rewritten history and a history that lost the merge are not descendants", "expected HEAD_NOT_DESCENDANT_OF_BASE, got",
    "return [v(\"SOURCES\", \"HEAD_NOT_DESCENDANT_OF_BASE\", \"HEAD does not descend from the commit it is measured against\")];",
    "return [];",
    "return [v(\"SOURCES\", \"HEAD_NOT_DESCENDANT_OF_BASE\", \"HEAD does not descend from the commit it is measured against\")]; /* pinned */"),
  m("M267", "head: a merge after the integration merge", UNIT, "head: a merge commit after the integration merge is refused even when it brings only allowlisted paths", "expected HEAD_MERGE_AFTER_INTEGRATION, got",
    "if (merges.length) out.push(v(\"SOURCES\", \"HEAD_MERGE_AFTER_INTEGRATION\"",
    "if (false) out.push(v(\"SOURCES\", \"HEAD_MERGE_AFTER_INTEGRATION\"",
    "if (merges.length > 0) out.push(v(\"SOURCES\", \"HEAD_MERGE_AFTER_INTEGRATION\""),
  m("M268", "head: every commit is judged, not only the net change", UNIT, "head: a product change that a later commit reverted still fails, because the history is the subject", "expected HEAD_COMMIT_OUTSIDE_ALLOWLIST, got",
    "if (outsideOne.length) offending.push(",
    "if (false) offending.push(",
    "if (outsideOne.length > 0) offending.push("),
  m("M269", "head: the per-commit gate reports", UNIT, "head: a descendant that changed a product, workflow, package, migration, deploy or config path is refused, commit by commit", "expected HEAD_COMMIT_OUTSIDE_ALLOWLIST, got",
    "if (offending.length) out.push(v(\"SOURCES\", \"HEAD_COMMIT_OUTSIDE_ALLOWLIST\"",
    "if (false) out.push(v(\"SOURCES\", \"HEAD_COMMIT_OUTSIDE_ALLOWLIST\"",
    "if (offending.length > 0) out.push(v(\"SOURCES\", \"HEAD_COMMIT_OUTSIDE_ALLOWLIST\""),
  m("M270", "head: the allowlist is the allowlist", UNIT, "head: HEAD may be the integration merge or a descendant whose every commit stayed inside the allowlist", "expected no violation, got a violation",
    "export const WORKTREE_ALLOWLIST = Object.freeze([\".gitattributes\", \"docs/security/\", \"scripts/security/s0/\", \"scripts/security/s1/\"]);",
    "export const WORKTREE_ALLOWLIST = Object.freeze([\".gitattributes\", \"docs/security/\", \"scripts/security/s0/\"]);",
    "export const WORKTREE_ALLOWLIST = Object.freeze([\".gitattributes\", \"scripts/security/s1/\", \"docs/security/\", \"scripts/security/s0/\"]);"),
  m("M271", "ledger: a path without a disposition", UNIT, "ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused", "expected LEDGER_MISSING, got",
    "add(\"FINDINGS\", \"LEDGER_MISSING\", `${row.path}: no disposition is recorded`);",
    "void row;",
    "add(\"FINDINGS\", \"LEDGER_MISSING\", `${row.path}: no disposition is recorded`); /* pinned */"),
  m("M272", "ledger: a retyped path", UNIT, "ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused", "expected LEDGER_CHANGE_TYPE, got",
    "if (a.changeType !== row.changeType) add(",
    "if (false) add(",
    "if (!(a.changeType === row.changeType)) add("),
  m("M273", "ledger: a path reviewed at another blob", UNIT, "ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused", "expected LEDGER_STALE, got",
    "else if (a.reviewedBlob !== (row.targetBlob ?? \"ABSENT\")) add(",
    "else if (false) add(",
    "else if (!(a.reviewedBlob === (row.targetBlob ?? \"ABSENT\"))) add("),
  m("M274", "ledger: a disposition for a path the range did not change", UNIT, "ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused", "expected LEDGER_EXTRA, got",
    "for (const a of authoredByPath.keys()) if (!ledgerPaths.has(a)) add(",
    "for (const a of authoredByPath.keys()) if (false) add(",
    "for (const a of authoredByPath.keys()) if (ledgerPaths.has(a) === false) add("),
  m("M275", "ledger: a path recorded twice", UNIT, "ledger: a path that is missing, extra, duplicated, retyped or reviewed at another blob is refused", "expected LEDGER_DUPLICATE, got",
    "if (authoredByPath.has(a.path)) add(\"FINDINGS\", \"LEDGER_DUPLICATE\"",
    "if (false) add(\"FINDINGS\", \"LEDGER_DUPLICATE\"",
    "if (authoredByPath.has(a.path) === true) add(\"FINDINGS\", \"LEDGER_DUPLICATE\""),
  m("M276", "ledger: a disposition that does not describe the category", UNIT, "ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round", "expected LEDGER_DISPOSITION_CATEGORY, got",
    "if (row.disposition in DISPOSITION_CATEGORY && DISPOSITION_CATEGORY[row.disposition] !== row.category) add(",
    "if (false) add(",
    "if (row.disposition in DISPOSITION_CATEGORY && !(DISPOSITION_CATEGORY[row.disposition] === row.category)) add("),
  m("M277", "ledger: security-relevant and unlinked", UNIT, "ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round", "expected LEDGER_SECURITY_UNLINKED, got",
    "if (row.securityRelevant && !hasLinks) add(",
    "if (false) add(",
    "if (row.securityRelevant === true && !hasLinks) add("),
  m("M278", "ledger: linked and not security-relevant", UNIT, "ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round", "expected LEDGER_LINK_WITHOUT_SECURITY, got",
    "if (!row.securityRelevant && hasLinks) add(",
    "if (false) add(",
    "if (row.securityRelevant === false && hasLinks) add("),
  m("M279", "ledger: a disposition that cannot be linked", UNIT, "ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round", "expected LEDGER_DISPOSITION_LINKS, got",
    "if (![\"FINDING_EVIDENCE\", \"POSITIVE_CONTROL_EVIDENCE\"].includes(row.disposition) && (row.securityRelevant || hasLinks)) add(",
    "if (false) add(",
    "if (![\"FINDING_EVIDENCE\", \"POSITIVE_CONTROL_EVIDENCE\"].includes(row.disposition) && (hasLinks || row.securityRelevant)) add("),
  m("M280", "ledger: a finding the document does not hold", UNIT, "ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round", "expected LEDGER_FINDING_UNKNOWN, got",
    "add(\"FINDINGS\", \"LEDGER_FINDING_UNKNOWN\", `${w}: ${id} is not a finding of this document`);",
    "void id;",
    "add(\"FINDINGS\", \"LEDGER_FINDING_UNKNOWN\", `${w}: ${id} is not a finding of this document`); /* pinned */"),
  m("M281", "ledger: an observation the document does not hold", UNIT, "ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round", "expected LEDGER_CONTROL_UNKNOWN, got",
    "add(\"FINDINGS\", \"LEDGER_CONTROL_UNKNOWN\", `${w}: ${id} is not an observation of this document`);",
    "void id;",
    "add(\"FINDINGS\", \"LEDGER_CONTROL_UNKNOWN\", `${w}: ${id} is not an observation of this document`); /* pinned */"),
  m("M282", "ledger: a finding that cites no evidence at the path", UNIT, "ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round", "expected LEDGER_LINK_NOT_EVIDENCED, got",
    "if (!f.evidence.some((e) => evidenceCovers(e.path, row.path) || (row.previousPath && evidenceCovers(e.path, row.previousPath)))) add(",
    "if (false) add(",
    "if (f.evidence.every((e) => !(evidenceCovers(e.path, row.path) || (row.previousPath && evidenceCovers(e.path, row.previousPath))))) add("),
  m("M283", "ledger: an observation that cites no evidence at the path", UNIT, "ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round", "expected LEDGER_LINK_NOT_EVIDENCED, got",
    "if (!c.evidence.some((e) => evidenceCovers(e.path, row.path) || (row.previousPath && evidenceCovers(e.path, row.previousPath)))) add(",
    "if (false) add(",
    "if (c.evidence.every((e) => !(evidenceCovers(e.path, row.path) || (row.previousPath && evidenceCovers(e.path, row.previousPath))))) add("),
  m("M284", "ledger: evidence that no row names", UNIT, "ledger: a security-relevant path needs a finding or an observation that cites it, and the other way round", "expected LEDGER_EVIDENCE_NOT_LINKED, got",
    "if (rows.length === 0 || !rows.some((r) => linked.has(`${item.id}|${r.path}`))) add(",
    "if (false) add(",
    "if (rows.length === 0 || rows.every((r) => !linked.has(`${item.id}|${r.path}`))) add("),
  m("M285", "ledger: the second layer carries the list", UNIT, "ledger: a ledger key in a first-layer document is refused, and a second-layer document must carry both lists", "expected LEDGER_ABSENT, got",
    "if (!Array.isArray(data.pathDispositions)) add(\"FINDINGS\", \"LEDGER_ABSENT\"",
    "if (false) add(\"FINDINGS\", \"LEDGER_ABSENT\"",
    "if (Array.isArray(data.pathDispositions) === false) add(\"FINDINGS\", \"LEDGER_ABSENT\""),
  m("M286", "ledger: the first layer carries no ledger key", UNIT, "ledger: a ledger key in a first-layer document is refused, and a second-layer document must carry both lists", "expected LAYER_KEY, got",
    "else if (\"pathDispositions\" in data || \"sourceBehaviorChanges\" in data) add(\"SCHEMA\", \"LAYER_KEY\"",
    "else if (false) add(\"SCHEMA\", \"LAYER_KEY\"",
    "else if (\"sourceBehaviorChanges\" in data || \"pathDispositions\" in data) add(\"SCHEMA\", \"LAYER_KEY\""),
  m("M287", "ledger: the aggregates are the ledger's", UNIT, "ledger: every path of the range has exactly one row, and the aggregates are read from the rows", "LEDGER_AGGREGATES",
    "paths: { total: rows.length, added: ledger.summary.byChangeType.A, modified: ledger.summary.byChangeType.M,",
    "paths: { total: rows.length, added: ledger.summary.byChangeType.M, modified: ledger.summary.byChangeType.A,",
    "paths: { total: rows.length, added: ledger.summary.byChangeType[\"A\"], modified: ledger.summary.byChangeType[\"M\"],"),
  m("M288", "ledger: strict means product", UNIT, "ledger: the strict, broad and category rules classify known paths", "LEDGER_RULES",
    "if (p.startsWith(\"docs/\") || p.startsWith(\".github/\") || p.startsWith(\"scripts/\")) return false;",
    "if (p.startsWith(\"docs/\") || p.startsWith(\".github/\")) return false;",
    "if (p.startsWith(\"docs/\") || p.startsWith(\".github/\") || p.startsWith(\"scripts/\")) return false; /* pinned */"),
  m("M289", "ledger: the categories", UNIT, "ledger: the strict, broad and category rules classify known paths", "LEDGER_RULES",
    "if (path.startsWith(\"messages/\")) return \"LOCALIZATION\";",
    "if (path.startsWith(\"messages/\")) return \"LIBRARY\";",
    "if (path.startsWith(\"messages/\")) return \"LOCALIZATION\"; /* pinned */"),
  m("M290", "ledger: a rename names where it came from", UNIT, "ledger: added, modified, deleted and renamed paths are all shown, and a later edit makes the row stale", "LEDGER_KINDS",
    "previousPath: second === null ? null : first,",
    "previousPath: null,",
    "previousPath: second === null ? null : first, /* pinned */"),
  m("M291", "ledger: a row is reviewed only at the same blob", UNIT, "ledger: added, modified, deleted and renamed paths are all shown, and a later edit makes the row stale", "LEDGER_STALE",
    "const reviewed = a !== undefined && a.changeType === g.changeType && a.reviewedBlob === (g.targetBlob ?? \"ABSENT\");",
    "const reviewed = a !== undefined && a.changeType === g.changeType;",
    "const reviewed = a !== undefined && a.reviewedBlob === (g.targetBlob ?? \"ABSENT\") && a.changeType === g.changeType;"),
  m("M292", "ledger: the rename is detected", UNIT, "ledger: added, modified, deleted and renamed paths are all shown, and a later edit makes the row stale", "LEDGER_KINDS",
    "[\"diff\", \"--raw\", \"--no-abbrev\", \"-M\", \"-z\", sources.frozenSourceSha, sources.targetMainSha]",
    "[\"diff\", \"--raw\", \"--no-abbrev\", \"--no-renames\", \"-z\", sources.frozenSourceSha, sources.targetMainSha]",
    "[\"diff\", \"--raw\", \"--no-abbrev\", \"-z\", \"-M\", sources.frozenSourceSha, sources.targetMainSha]"),
  m("M293", "moved: a source behaviour change must be described", UNIT, "moved ledger: a source behaviour change must be described, and only a real one may be", "expected SOURCE_BEHAVIOR_UNDECLARED, got",
    "if (r.sourceBehavior.bodyChanged && !declared.get(w)) add(",
    "if (false) add(",
    "if (r.sourceBehavior.bodyChanged === true && !declared.get(w)) add("),
  m("M294", "moved: a description needs a real change", UNIT, "moved ledger: a source behaviour change must be described, and only a real one may be", "expected SOURCE_BEHAVIOR_SPURIOUS, got",
    "if (!r.sourceBehavior.bodyChanged && declared.get(w)) add(",
    "if (false) add(",
    "if (r.sourceBehavior.bodyChanged === false && declared.get(w)) add("),
  m("M295", "moved: a description needs a moved call site", UNIT, "moved ledger: a source behaviour change must be described, and only a real one may be", "expected SOURCE_BEHAVIOR_UNKNOWN_CALLSITE, got",
    "for (const id of declared.keys()) if (!movedAfter.has(id)) add(",
    "for (const id of declared.keys()) if (false) add(",
    "for (const id of declared.keys()) if (movedAfter.has(id) === false) add("),
  m("M296", "moved: a description once", UNIT, "moved ledger: a source behaviour change must be described, and only a real one may be", "expected SOURCE_BEHAVIOR_DUPLICATE, got",
    "if (declared.has(s.callsiteId)) add(\"FINDINGS\", \"SOURCE_BEHAVIOR_DUPLICATE\"",
    "if (false) add(\"FINDINGS\", \"SOURCE_BEHAVIOR_DUPLICATE\"",
    "if (declared.has(s.callsiteId) === true) add(\"FINDINGS\", \"SOURCE_BEHAVIOR_DUPLICATE\""),
  m("M297", "moved: the old identifier in an S0 artifact", UNIT, "moved ledger: an old identifier left in an artifact, or in the document, is refused", "expected MOVED_OLD_ID_RESIDUE, got",
    "if (r.oldIdResidue > 0) add(",
    "if (false) add(",
    "if (r.oldIdResidue >= 1) add("),
  m("M298", "moved: the old identifier in the document", UNIT, "moved ledger: an old identifier left in an artifact, or in the document, is refused", "expected MOVED_OLD_ID_IN_DOCUMENT, got",
    "if (authoredText.includes(r.before.id) ||",
    "if (false ||",
    "if (authoredText.indexOf(r.before.id) >= 0 ||"),
  m("M299", "moved: the old identifier in the report", UNIT, "moved ledger: an old identifier left in an artifact, or in the document, is refused", "expected MOVED_OLD_ID_IN_DOCUMENT, got",
    "|| (typeof md === \"string\" && narrativeOnly(md, SECOND_BLOCK_NAMES).includes(r.before.id))) add(",
    ") add(",
    "|| (typeof md === \"string\" && narrativeOnly(md, SECOND_BLOCK_NAMES).indexOf(r.before.id) >= 0)) add("),
  m("M300", "moved: an adjudication that points elsewhere", UNIT, "moved ledger: an old identifier left in an artifact, or in the document, is refused", "expected MOVED_EVIDENCE_WINDOW, got",
    "for (const problem of r.evidenceProblems) add(",
    "for (const problem of []) add(",
    "for (const problem of [...r.evidenceProblems]) add("),
  m("M301", "moved: a pair whose verdict changed is not a move", UNIT, "moved ledger: the gates read the derived ledger", "expected MOVED_PAIR_REINTERPRETED, got",
    "if (r.classificationSemanticChange) add(",
    "if (false) add(",
    "if (r.classificationSemanticChange === true) add("),
  m("M302", "moved: an ambiguous pair", UNIT, "moved ledger: the gates read the derived ledger", "expected MOVED_PAIR_AMBIGUOUS, got",
    "if (mp.ambiguous.length) add(",
    "if (false) add(",
    "if (mp.ambiguous.length > 0) add("),
  m("M303", "moved: one row per moved call site", UNIT, "moved ledger: the gates read the derived ledger", "expected MOVED_LEDGER_INCOMPLETE, got",
    "if (g.movedLedger.length !== g.moved.length - mp.ambiguous.length) add(",
    "if (false) add(",
    "if (!(g.movedLedger.length === g.moved.length - mp.ambiguous.length)) add("),
  m("M304", "moved: the change model is counted from the rows", UNIT, "moved ledger: the gates read the derived ledger", "expected CHANGE_MODEL, got",
    "if (m.classificationSemanticChanges !== g.movedLedger.filter((r) => r.classificationSemanticChange).length) add(",
    "if (false) add(",
    "if (m.classificationSemanticChanges !== g.movedLedger.filter((r) => r.classificationSemanticChange === true).length) add("),
  m("M305", "moved: the ledger counts its rows", UNIT, "moved ledger: the gates read the derived ledger", "expected LEDGER_COUNT, got",
    "if (sum.total !== ledger.length || sum.uniquePaths !== ledger.length) add(",
    "if (false) add(",
    "if (!(sum.total === ledger.length) || sum.uniquePaths !== ledger.length) add("),
  m("M306", "moved: the report names no unqualified count", UNIT, "moved ledger: the words 'semantic change' are refused unless they name one of the three kinds", "expected UNQUALIFIED_SEMANTIC_CHANGE, got",
    "if (unqualifiedSemanticChange(authoredText)) add(",
    "if (false) add(",
    "if (unqualifiedSemanticChange(authoredText) === true) add("),
  m("M307", "moved: the narrative names no unqualified count", UNIT, "moved ledger: the words 'semantic change' are refused unless they name one of the three kinds", "expected UNQUALIFIED_SEMANTIC_CHANGE, got",
    "if (typeof md === \"string\" && unqualifiedSemanticChange(narrativeOnly(md, SECOND_BLOCK_NAMES))) add(",
    "if (false) add(",
    "if (typeof md === \"string\" && unqualifiedSemanticChange(narrativeOnly(md, SECOND_BLOCK_NAMES)) === true) add("),
  m("M308", "moved: the phrase is recognised", UNIT, "moved ledger: the words 'semantic change' are refused unless they name one of the three kinds", "SEMANTIC_WORDS",
    "return /semantic[\\s-]*changes?/i.test(String(text).replace(ALLOWED_SEMANTIC_PHRASE, \"\"));",
    "return false;",
    "return /semantic[\\s-]*changes?/i.test(String(text).replace(ALLOWED_SEMANTIC_PHRASE, \"\")) === true;"),
  m("M309", "moved: the named kinds are allowed", UNIT, "moved ledger: the words 'semantic change' are refused unless they name one of the three kinds", "SEMANTIC_WORDS",
    "const ALLOWED_SEMANTIC_PHRASE = /classificationSemanticChanges?/g;",
    "const ALLOWED_SEMANTIC_PHRASE = /(?!)/g;",
    "const ALLOWED_SEMANTIC_PHRASE = /classificationSemanticChange(?:s)?/g;"),
  m("M310", "moved: a position is not a verdict", UNIT, "moved ledger: a position-only move is told from a verdict change, and the function body from its comments", "ADJUDICATION_MOVE",
    "    } else semantic.push(k);",
    "    } else positional.push(k);",
    "    } else { semantic.push(k); }"),
  m("M311", "moved: evidence and caller path are positions", UNIT, "moved ledger: a position-only move is told from a verdict change, and the function body from its comments", "ADJUDICATION_MOVE",
    "const POSITIONAL_ADJUDICATION_KEYS = Object.freeze([\"evidence\", \"callerPath\"]);",
    "const POSITIONAL_ADJUDICATION_KEYS = Object.freeze([]);",
    "const POSITIONAL_ADJUDICATION_KEYS = Object.freeze([\"callerPath\", \"evidence\"]);"),
  m("M312", "moved: the trace position is a position", UNIT, "moved ledger: a position-only move is told from a verdict change, and the function body from its comments", "ADJUDICATION_MOVE",
    "const POSITIONAL_TRACE_KEYS = Object.freeze([\"operationIdentity\", \"sourceReferences\"]);",
    "const POSITIONAL_TRACE_KEYS = Object.freeze([]);",
    "const POSITIONAL_TRACE_KEYS = Object.freeze([\"sourceReferences\", \"operationIdentity\"]);"),
  m("M313", "moved: comments are not behaviour", UNIT, "moved ledger: a position-only move is told from a verdict change, and the function body from its comments", "FUNCTION_SPAN",
    "    .filter((l) => !COMMENT_LINE.test(l))",
    "    .filter((l) => true)",
    "    .filter((l) => COMMENT_LINE.test(l) === false)"),
  m("M314", "moved: a function ends at the next declaration", UNIT, "moved ledger: a position-only move is told from a verdict change, and the function body from its comments", "FUNCTION_SPAN",
    "    if (TOP_LEVEL_DECL.test(lines[i])) {",
    "    if (false) {",
    "    if (TOP_LEVEL_DECL.test(lines[i]) === true) {"),
  m("M315", "moved: the derived tags", UNIT, "moved ledger: the three kinds of change are counted apart, from the rows", "CHANGE_MODEL_DERIVED",
    "const tagsAdded = (n.secondaryTags ?? []).filter((t) => !(o.secondaryTags ?? []).includes(t)).sort(byStr);",
    "const tagsAdded = [];",
    "const tagsAdded = (n.secondaryTags ?? []).filter((t) => (o.secondaryTags ?? []).includes(t) === false).sort(byStr);"),
  m("M316", "moved: the source behaviour is read from the code", UNIT, "moved ledger: the three kinds of change are counted apart, from the rows", "CHANGE_MODEL_DERIVED",
    "const bodyChanged = bs.code !== as.code;",
    "const bodyChanged = false;",
    "const bodyChanged = !(bs.code === as.code);"),
  m("M317", "moved: the pair is one to one", UNIT, "moved ledger: the three kinds of change are counted apart, from the rows", "CHANGE_MODEL_DERIVED",
    "return n.file === o.file && n.fingerprint === o.fingerprint && n.ordinalInFile === o.ordinalInFile;",
    "return n.file === o.file;",
    "return n.ordinalInFile === o.ordinalInFile && n.file === o.file && n.fingerprint === o.fingerprint;"),
  m("M318", "moved: the first-layer tree is the before", UNIT, "moved ledger: the three kinds of change are counted apart, from the rows", "CHANGE_MODEL_DERIVED",
    "const beforeText = blobText(root, sources.securityHeadSha, o.file) ?? \"\";",
    "const beforeText = blobText(root, sources.integrationMergeSha, o.file) ?? \"\";",
    "const beforeText = (blobText(root, sources.securityHeadSha, o.file)) ?? \"\";"),
  m("M319", "evidence window: the expression is where the line says", UNIT, "moved ledger: an adjudication's references are checked for range, expression and window", "EVIDENCE_WINDOW",
    "if (snippet !== undefined && !lines.slice(from - 1, to).join(\"\\n\").includes(snippet)) out.push(",
    "if (false) out.push(",
    "if (snippet !== undefined && lines.slice(from - 1, to).join(\"\\n\").indexOf(snippet) < 0) out.push("),
  m("M320", "evidence window: the range is inside the file", UNIT, "moved ledger: an adjudication's references are checked for range, expression and window", "EVIDENCE_WINDOW",
    "if (to < from || from < 1 || to > lines.length) {",
    "if (false) {",
    "if (to < from || from < 1 || lines.length < to) {"),
  m("M321", "evidence window: a file in the tree", UNIT, "moved ledger: an adjudication's references are checked for range, expression and window", "EVIDENCE_WINDOW",
    "    if (text === null) {\n      out.push(`evidence cites ${path}, which is not in the target tree`);",
    "    if (false) {\n      out.push(`evidence cites ${path}, which is not in the target tree`);",
    "    if (text === null || text === undefined) {\n      out.push(`evidence cites ${path}, which is not in the target tree`);"),
  m("M322", "evidence window: the citation of the call site's own file is near it", UNIT, "moved ledger: an adjudication's references are checked for range, expression and window", "EVIDENCE_WINDOW",
    "if (own.length > 0 && !own.some((r) => r.to >= site.line - EVIDENCE_WINDOW_BEFORE && r.from <= site.line + EVIDENCE_WINDOW_AFTER)) {",
    "if (false) {",
    "if (own.length > 0 && own.every((r) => !(r.to >= site.line - EVIDENCE_WINDOW_BEFORE && r.from <= site.line + EVIDENCE_WINDOW_AFTER))) {"),
  m("M323", "s0 retry identity: the operation names its call site", S0, "retry identity: the old identifier of a moved call site is refused as the operation identity", "RETRY_IDENTITY_OLD",
    "if (s.trace.operationIdentity !== expected) {",
    "if (false) {",
    "if (!(s.trace.operationIdentity === expected)) {", "s0"),
  m("M324", "s0 retry identity: a range inside the file", S0, "retry identity: a source reference at the old position, or outside its file, is refused", "RETRY_REFERENCE_OUTSIDE",
    "if (r.to < r.from || r.from < 1 || (n !== null && r.to > n)) out.push(",
    "if (false) out.push(",
    "if (r.to < r.from || r.from < 1 || (n !== null && n < r.to)) out.push(", "s0"),
  m("M325", "s0 retry identity: a reference near the call site", S0, "retry identity: a source reference at the old position, or outside its file, is refused", "RETRY_REFERENCE_OLD_RANGE",
    "if (!own.some((r) => r.to >= line - RETRY_WINDOW_BEFORE && r.from <= line + RETRY_WINDOW_AFTER)) {",
    "if (false) {",
    "if (own.every((r) => !(r.to >= line - RETRY_WINDOW_BEFORE && r.from <= line + RETRY_WINDOW_AFTER))) {", "s0"),
  m("M326", "s0 retry identity: an edge reference includes its consumer line", S0, "retry identity: a source reference at the old position, or outside its file, is refused", "RETRY_REFERENCE_EDGE",
    "if (!own.some((r) => r.from <= line && r.to >= line)) out.push(",
    "if (false) out.push(",
    "if (own.every((r) => !(r.from <= line && r.to >= line))) out.push(", "s0"),
  m("M327", "s0 retry identity: an edge names its consumer", S0, "retry identity: a trace that moved with its call site is clean, and its identity is derived from the current identifier", "RETRY_IDENTITY_FORM",
    "  edge: (id) => `the consumer ${String(id).split(\"::\")[1] ?? \"\"}`,",
    "  edge: (id) => `the consumer ${String(id)}`,",
    "  edge: (id) => `the consumer ${String(id).split(\"::\")[1] ?? \"\"}`, // pinned", "s0"),
  m("M328", "s0 retry identity: a call site names its identifier", S0, "retry identity: a trace that moved with its call site is clean, and its identity is derived from the current identifier", "RETRY_IDENTITY_(?:FORM|CLEAN)",
    "  callsite: (id) => `the operation behind ${id}`,",
    "  callsite: (id) => `the operation ${id}`,",
    "  callsite: (id) => `the operation behind ${id}`, // pinned", "s0"),
  m("M329", "s0 retry identity: the gate runs on every subject", S0, "retry: the completeness gate is computed from the committed data and stops the command line with exit 10", "WIRING_RETRY_IDENTITY",
    "    ...retryTraceIdentityViolations(retrySubjectList, { lineCountOf: (p) => lineCountAt(root, p) }),",
    "    ...[],",
    "    ...retryTraceIdentityViolations(retrySubjectList, { lineCountOf: (p) => lineCountAt(root, p) }), // pinned", "s0"),
]);
// </MUTATION-MANIFEST>

/** `target` says which source the mutation is applied to: the relock checker (default) or the S0 scanner. */
function m(id, gate, file, test, fingerprint, find, replace, placebo, target = "relock") {
  return Object.freeze({ id, gate, file, test, fingerprint, find, replace, placebo, target });
}

/** Four controls that exercise the classifier itself. */
export const CONTROLS = Object.freeze([
  { id: "C1", kind: "IDENTITY_REWRITE_IS_GREEN", expected: "GREEN" },
  { id: "C2", kind: "COMMENT_IS_GREEN", expected: "GREEN" },
  { id: "C3", kind: "SYNTAX_BREAK_IS_NOT_A_KILL", expected: "NOT_A_KILL" },
  { id: "C4", kind: "WRONG_FINGERPRINT_IS_NOT_A_TARGETED_KILL", expected: "ONLY_INCIDENTAL" },
]);

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const lf = (s) => s.replace(/\r\n?/g, "\n");
const read = (p) => readFileSync(p);

export function manifestSha256() {
  const f = ["id", "gate", "file", "test", "fingerprint", "find", "replace", "placebo", "target"];
  return sha(JSON.stringify([[...MANIFEST].sort((a, b) => (a.id < b.id ? -1 : 1)).map((e) => f.map((k) => e[k])), CONTROLS.map((c) => [c.id, c.kind, c.expected])]));
}

/** Validate every anchor against the checker and every named test against its file. */
export function listViolations(root = REPO_ROOT) {
  const out = [];
  const checker = lf(readFileSync(join(root, CHECKER_REL), "utf8"));
  const scanner = lf(readFileSync(join(root, S0_REL), "utf8"));
  const tests = Object.fromEntries(Object.entries(TEST_FILES).map(([k, rel]) => [k, lf(readFileSync(join(root, rel), "utf8"))]));
  const ids = new Set();
  for (const e of MANIFEST) {
    if (ids.has(e.id)) out.push(`${e.id}: duplicate id`);
    ids.add(e.id);
    if (e.target !== "relock" && e.target !== "s0") out.push(`${e.id}: the target ${e.target} is not a known source`);
    const count = (e.target === "s0" ? scanner : checker).split(e.find).length - 1;
    if (count !== 1) out.push(`${e.id}: the anchor occurs ${count} times in the ${e.target === "s0" ? "scanner" : "checker"}`);
    if (e.find === e.replace) out.push(`${e.id}: the mutation equals the anchor`);
    if (e.placebo === e.replace) out.push(`${e.id}: the placebo equals the mutation`);
    if (!tests[e.file] || !tests[e.file].includes(`test(${JSON.stringify(e.test)},`)) out.push(`${e.id}: the test "${e.test}" is not registered in the ${e.file} test file`);
    try {
      new RegExp(e.fingerprint);
    } catch {
      out.push(`${e.id}: the fingerprint is not a valid expression`);
    }
    out.push(...positionProblems(e, tests));
  }
  return out;
}

/**
 * POSITION. A mutant of the code that decides where HEAD may be must be killed by a test that does not depend on where the
 * repository's HEAD happens to be. The first campaign recorded 253 of 253 kills with HEAD at the integration merge; the
 * moment the artifacts were committed HEAD became its child, one test no longer separated the mutant from the original,
 * and the same campaign gave 252 of 253. An entry whose anchor mentions HEAD, a head base, the successor merge or the
 * worktree therefore names a test that either builds its own repository (`positionRepo` or `fixtureRepo`) or declares in
 * its body that it is independent of the position (`POSITION-INDEPENDENT:` with its reason).
 */
export const POSITION_TOKENS = /\bHEAD\b|HEAD_|(?<!security )\bhead\b|headBase|successorBase|[Ww]orktree|WORKTREE|offending|outsideOne|\bmerges\b/;
export const POSITION_ANSWERS = /positionRepo\(|fixtureRepo\(|POSITION-INDEPENDENT:/;

export function testBody(source, title) {
  const at = source.indexOf(`test(${JSON.stringify(title)},`);
  if (at < 0) return null;
  const next = source.indexOf("\ntest(", at + 5);
  return source.slice(at, next < 0 ? source.length : next);
}

export function isPositionSensitive(e) {
  return e.target === "relock" && POSITION_TOKENS.test(e.find);
}

/**
 * Tests that decide a position-sensitive mutant without building a repository, with the reason each is independent of where HEAD is.
 * They are named here, in the tool and not in the test file, so that naming one changes no byte the record is bound to.
 */
export const POSITION_INDEPENDENT_TESTS = Object.freeze({
  "worktree: an untracked product file is refused (WORKTREE_UNTRACKED_OUTSIDE_ALLOWLIST)": "it feeds the parser a porcelain string and reads no repository",
  "worktree: a modified product file is refused (WORKTREE_MODIFIED_OUTSIDE_ALLOWLIST)": "it feeds the parser a porcelain string and reads no repository",
  "index flags: the ls-files tags are parsed as assume-unchanged (lowercase), skip-worktree (S) and plain": "it feeds the parser a listing string and reads no repository",
});

export function positionProblems(e, tests) {
  if (!isPositionSensitive(e)) return [];
  if (Object.prototype.hasOwnProperty.call(POSITION_INDEPENDENT_TESTS, e.test)) return [];
  const body = tests[e.file] ? testBody(tests[e.file], e.test) : null;
  if (body === null) return [];
  return POSITION_ANSWERS.test(body) ? [] : [`${e.id}: its anchor decides where HEAD may be, and the test "${e.test}" neither builds its own repository nor declares POSITION-INDEPENDENT`];
}

/**
 * Re-run, at the CURRENT repository position, every mutant whose anchor decides where HEAD may be, and require the same
 * result the record claims: killed by the named test, placebo green. `verify` calls this, so a record made at one position
 * cannot stay green at another position in which the campaign would not reproduce it.
 */
export async function reproducePositionSensitive(root = REPO_ROOT, concurrency = 4) {
  const checker = lf(readFileSync(join(root, CHECKER_REL), "utf8"));
  const env = { S1_RELOCK_ROOT: root };
  const made = [];
  const problems = [];
  const entries = MANIFEST.filter(isPositionSensitive);
  await pool(entries, concurrency, async (e) => {
    const mutantDir = stage(root, "relock", checker.replace(e.find, () => e.replace));
    const placeboDir = stage(root, "relock", checker.replace(e.find, () => e.placebo));
    made.push(mutantDir, placeboDir);
    const mutated = await runTest(mutantDir, e.file, e.test, env);
    const placebo = await runTest(placeboDir, e.file, e.test, env);
    const status = classify(mutated, e.fingerprint);
    const green = executed(placebo.out) === 1 && placebo.code === 0 && passed(placebo.out) === 1;
    if (status !== "TARGETED_KILL") problems.push(`${e.id}: at this repository position the mutant is ${status}, not a targeted kill`);
    if (!green) problems.push(`${e.id}: at this repository position the placebo is not green`);
  });
  for (const d of made) rmSync(d, { recursive: true, force: true });
  return { checked: entries.length, problems: problems.sort() };
}

function runTest(dir, file, testName, env) {
  return new Promise((resolveRun) => {
    const args = ["--test", `--test-name-pattern=^${testName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, join(dir, TEST_FILES[file])];
    const e = { ...process.env, ...env };
    delete e.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, args, { cwd: dir, env: e, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 240000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code, out });
    });
  });
}

const executed = (out) => Number(/ℹ tests (\d+)/.exec(out)?.[1] ?? 0);
const passed = (out) => Number(/ℹ pass (\d+)/.exec(out)?.[1] ?? 0);

function classify(r, fingerprint) {
  if (executed(r.out) !== 1) return "INVALID_MUTANT";
  if (r.code === 0 && passed(r.out) === 1) return "SURVIVED";
  if (new RegExp(fingerprint).test(r.out)) return "TARGETED_KILL";
  return "ONLY_INCIDENTAL";
}

function stage(root, target, text) {
  const dir = mkdtempSync(join(tmpdir(), "relock-mut-"));
  mkdirSync(join(dir, "scripts", "security", "s1", "__tests__"), { recursive: true });
  cpSync(join(root, IMPORT_REL), join(dir, IMPORT_REL));
  cpSync(join(root, CHECKER_REL), join(dir, CHECKER_REL));
  // the whole S0 tool directory (scanner, data files, fixtures, selftest): the S0 selftest is self-contained there
  cpSync(join(root, S0_DIR_REL), join(dir, S0_DIR_REL), { recursive: true });
  if (target === "s0") writeFileSync(join(dir, S0_REL), text);
  else writeFileSync(join(dir, CHECKER_REL), text);
  for (const rel of [TEST_FILES.unit, TEST_FILES.e2e]) cpSync(join(root, rel), join(dir, rel));
  return dir;
}

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runCampaign(root = REPO_ROOT, concurrency = 4) {
  const bad = listViolations(root);
  if (bad.length) throw new Error(`the manifest is invalid:\n${bad.join("\n")}`);
  const checker = lf(readFileSync(join(root, CHECKER_REL), "utf8"));
  const scanner = lf(readFileSync(join(root, S0_REL), "utf8"));
  const env = { S1_RELOCK_ROOT: root };
  const made = [];
  const sourceOf = (e) => (e.target === "s0" ? scanner : checker);
  const apply = (e, replace) => sourceOf(e).replace(e.find, () => replace);
  const attempt = async (target, text, file, test) => {
    const dir = stage(root, target, text);
    made.push(dir);
    return runTest(dir, file, test, env);
  };

  const mutants = await pool(MANIFEST, concurrency, async (e) => {
    const mutated = await attempt(e.target, apply(e, e.replace), e.file, e.test);
    const placebo = await attempt(e.target, apply(e, e.placebo), e.file, e.test);
    const status = classify(mutated, e.fingerprint);
    const placeboGreen = executed(placebo.out) === 1 && placebo.code === 0 && passed(placebo.out) === 1;
    return { id: e.id, gate: e.gate, test: e.test, status, placebo: placeboGreen ? "GREEN" : "NOT_GREEN" };
  });

  const first = MANIFEST[0];
  const controlRuns = {
    C1: await attempt("relock", apply(first, first.find), first.file, first.test),
    C2: await attempt("relock", `${checker}\n// a comment changes no behaviour\n`, first.file, first.test),
    C3: await attempt("relock", `${checker}\n}}} syntax break {{{\n`, first.file, first.test),
    C4: await attempt("relock", apply(first, first.replace), first.file, first.test),
  };
  const observed = {
    C1: executed(controlRuns.C1.out) === 1 && controlRuns.C1.code === 0 ? "GREEN" : "NOT_GREEN",
    C2: executed(controlRuns.C2.out) === 1 && controlRuns.C2.code === 0 ? "GREEN" : "NOT_GREEN",
    C3: classify(controlRuns.C3, first.fingerprint) === "TARGETED_KILL" ? "TARGETED_KILL" : "NOT_A_KILL",
    C4: classify(controlRuns.C4, "a fingerprint that no failure can contain"),
  };
  const controls = CONTROLS.map((c) => ({ id: c.id, kind: c.kind, expected: c.expected, observed: observed[c.id] }));

  for (const d of made) rmSync(d, { recursive: true, force: true });
  const cleanup = made.every((d) => !existsSync(d)) ? "REMOVED" : "LEFT_BEHIND";

  const count = (st) => mutants.filter((x) => x.status === st).length;
  const deviations = mutants.filter((x) => x.status !== "TARGETED_KILL" || x.placebo !== "GREEN").length + controls.filter((c) => c.observed !== c.expected).length;
  return {
    schemaVersion: 1,
    manifestVersion: MANIFEST_VERSION,
    manifestSha256: manifestSha256(),
    targetFile: CHECKER_REL,
    targetFiles: { relock: CHECKER_REL, s0: S0_REL },
    files: boundFiles(root),
    mutants: mutants.map(({ id, gate, test, status, placebo }) => ({ id, gate, test, status, placebo })),
    controls,
    totals: {
      mutants: mutants.length,
      targetedKill: count("TARGETED_KILL"),
      incidental: count("ONLY_INCIDENTAL"),
      survived: count("SURVIVED"),
      invalid: count("INVALID_MUTANT"),
      placebosGreen: mutants.filter((x) => x.placebo === "GREEN").length,
      controls: controls.length,
      controlsAsExpected: controls.filter((c) => c.observed === c.expected).length,
      deviations,
    },
    cleanup,
  };
}

export function boundFiles(root = REPO_ROOT) {
  return {
    checkerSha256: sha(read(join(root, CHECKER_REL))),
    selftestSha256: sha(read(join(root, TEST_FILES.unit))),
    e2eSha256: sha(read(join(root, TEST_FILES.e2e))),
    s0ScannerSha256: sha(read(join(root, S0_REL))),
    s0SelftestSha256: sha(read(join(root, TEST_FILES.s0))),
    s0AdjudicationsSha256: sha(read(join(root, S0_DIR_REL, "getprisma-manual-adjudications.json"))),
  };
}

/** The record belongs to the manifest and to the exact bytes of the files it was run against. */
export function verifyViolations(root = REPO_ROOT) {
  const out = [];
  const path = join(root, RECORD_REL);
  if (!existsSync(path)) return ["the campaign record is missing"];
  const record = JSON.parse(readFileSync(path, "utf8"));
  for (const v of recordViolations(record)) out.push(`${v.code}: ${v.detail}`);
  for (const v of listViolations(root)) out.push(`manifest: ${v}`);
  if (record.manifestVersion !== MANIFEST_VERSION) out.push("the record names another manifest version");
  if (record.manifestSha256 !== manifestSha256()) out.push("the record is bound to another manifest");
  const now = boundFiles(root);
  for (const k of Object.keys(now)) if (record.files?.[k] !== now[k]) out.push(`the record is bound to other bytes of ${k}`);
  const ids = MANIFEST.map((e) => e.id).sort();
  const rec = (record.mutants ?? []).map((x) => x.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify(rec)) out.push("the record's mutants are not the manifest's mutants");
  return out;
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const mode = process.argv[2] ?? "verify";
  if (mode === "manifest") {
    process.stdout.write(`${manifestSha256()}\n`);
  } else if (mode === "list") {
    const bad = listViolations();
    process.stdout.write(bad.length ? `${bad.join("\n")}\n` : `[relock-mutation] manifest ${MANIFEST_VERSION} valid — ${MANIFEST.length} mutants\n`);
    process.exit(bad.length ? 1 : 0);
  } else if (mode === "verify") {
    const bad = verifyViolations();
    if (bad.length || process.argv.includes("--static")) {
      process.stdout.write(bad.length ? `${bad.join("\n")}\n` : `[relock-mutation] record verified (static) — ${MANIFEST.length} mutants, bound to the current bytes\n`);
      process.exit(bad.length ? 1 : 0);
    }
    reproducePositionSensitive(REPO_ROOT)
      .then((r) => {
        process.stdout.write(
          r.problems.length
            ? `${r.problems.join("\n")}\n`
            : `[relock-mutation] record verified — ${MANIFEST.length} mutants, bound to the current bytes; ${r.checked} position-sensitive mutants reproduced at this repository position\n`,
        );
        process.exit(r.problems.length ? 1 : 0);
      })
      .catch((e) => {
        process.stderr.write(`${String(e.message ?? e)}\n`);
        process.exit(2);
      });
  } else if (mode === "run") {
    const workers = Number((process.argv.find((a) => a.startsWith("--workers=")) ?? "--workers=4").slice(10)) || 4;
    runCampaign(REPO_ROOT, workers)
      .then((record) => {
        writeFileSync(join(REPO_ROOT, RECORD_REL), `${JSON.stringify(record, null, 2)}\n`);
        const t = record.totals;
        process.stdout.write(`[relock-mutation] ${t.targetedKill}/${t.mutants} targeted kills, ${t.incidental} incidental, ${t.survived} survivors, ${t.invalid} invalid, ${t.placebosGreen} placebos green, deviations ${t.deviations}, cleanup ${record.cleanup}\n`);
        for (const x of record.mutants.filter((y) => y.status !== "TARGETED_KILL" || y.placebo !== "GREEN")) process.stdout.write(`  ${x.id} ${x.gate}: ${x.status} placebo ${x.placebo}\n`);
        for (const c of record.controls.filter((y) => y.observed !== y.expected)) process.stdout.write(`  control ${c.id}: expected ${c.expected}, observed ${c.observed}\n`);
        process.exit(t.deviations === 0 && t.targetedKill === t.mutants && record.cleanup === "REMOVED" ? 0 : 1);
      })
      .catch((e) => {
        process.stderr.write(`${String(e.message ?? e)}\n`);
        process.exit(2);
      });
  } else {
    process.stderr.write("usage: list | run | verify [--static] | manifest\n");
    process.exit(64);
  }
}
