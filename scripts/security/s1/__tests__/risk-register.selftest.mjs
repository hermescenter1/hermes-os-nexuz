/**
 * S1 risk-register selftest. Runs on `node:test` with no dependency, because the
 * security worktree has no `node_modules`.
 *
 * NAMED `.selftest.mjs`, NOT `.test.mjs`, ON PURPOSE. `vitest.config.ts` sets no
 * explicit `include`, so vitest uses its default glob
 * `**\/*.{test,spec}.?(c|m)[jt]s?(x)`. A file named `*.test.mjs` would be
 * collected by `npm run test` in continuous integration and executed by vitest,
 * which does not run `node:test` suites — a green local run would become a broken
 * one. The name keeps this suite out of that glob, the same convention the S0
 * selftest uses.
 *
 *   node --test scripts/security/s1/__tests__/risk-register.selftest.mjs
 *
 * Every test here proves one of two things: that the committed register satisfies
 * an invariant, or that violating that invariant is DETECTED. The second half is
 * the one that matters — a gate nobody has seen fail is not known to work.
 */

import { test as nodeTest } from "node:test";
import baseAssert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, cpSync, mkdirSync, writeFileSync, existsSync, statSync, symlinkSync, rmdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, sep } from "node:path";

import {
  REPO_ROOT,
  REGISTER_PATH,
  REPORT_PATH,
  METHOD_VERSION,
  PRODUCTION_STATES,
  SEVERITIES,
  FINDING_STATUSES,
  OWNED_STATUSES,
  THREAT_ACTORS,
  ASSETS,
  STRIDE,
  REMEDIATION_PHASES,
  VERIFICATION_METHODS,
  LIKELIHOOD_FACTOR_KEYS,
  IMPACT_FACTOR_KEYS,
  CLAMP_RULE,
  computeLikelihood,
  computeImpact,
  severityForScore,
  derive,
  canonicalize,
  render,
  forbiddenContent,
  missingEvidence,
  enumViolations,
  duplicateRiskIds,
  duplicateFindingIds,
  orphanFindings,
  ownershipViolations,
  duplicateRemediationOwnership,
  arithmeticViolations,
  missingRequiredFields,
  acceptanceCriteriaViolations,
  criticalWithoutActiveConfirmed,
  priorityViolations,
  orderingViolations,
  counters,
  markdownDrift,
  parseMarkdownSummary,
  MARKDOWN_MIRRORED_KEYS,
  SUMMARY_BLOCK_MARKER,
  NEXT_ACTION_MARKER,
  CLAMP_REASON_GUARDED,
  clampReasonFor,
  runtimeEvidenceContradictions,
  guardEvidenceViolations,
  nextSafeActionViolations,
  reportContradictions,
  narrativeOnly,
  findingUniverseViolations,
  extractSourceUniverse,
  SOURCE_DOCUMENTS,
  PHASE99_REGISTER,
  LOCK_UNIVERSE_COUNT,
  LOCK_UNIVERSE_SHA256,
  lockUniverseString,
  sha256Hex,
  SECRET_SHAPES,
  SECRET_SCAN_EXCLUDED_PATHS,
  secretShapeHits,
  secretShapeViolations,
  VERIFICATION_LINKAGE,
  VERIFICATION_LINKAGE_VERSION,
  verificationLinkageViolations,
  IMPACT_DIMENSION_LABELS,
  dominantImpactDimensions,
  dominantImpactViolations,
  calibration,
  markdownBlocks,
  markdownBlockDrift,
  extractBlock,
  BLOCK_OPEN,
  REVIEW_CLOSURE,
  HISTORICAL_MARKER,
  CURRENT_OBLIGATION,
  hasExemptableHistoricalPhrase,
  BLOCK_MARKER_RX,
  parseMarkdownBlocks,
  PLACEHOLDER_VALUES,
  ALLOWED_WEAK_DEFAULT,
  isPlaceholderValue,
  assignedSecretHits,
  REPORT_FORBIDDEN,
  reportForbiddenHits,
  deliverableForbiddenViolations,
  renderFindingTables,
  HISTORICAL_MARKER_PINS,
  HISTORICAL_MARKER_PINS_VERSION,
  historicalMarkerPinViolations,
  normalizeMarkerLine,
  criterionLinksMethod,
  registerSecretHits,
  walkJsonStrings,
  isSensitiveKeyName,
  normalizeKeyName,
  SENSITIVE_KEY_FAMILIES,
  narrativeFactViolations,
  narrativeFacts,
  numberToWords,
  renderHeadlinePanel,
  renderVerdictPanel,
  EXIT,
  EXIT_SHARED,
  BLOCK_CLOSE,
  FACT_MARKER_VERSION,
  renderTruthfulnessLead,
  renderCalibration,
  renderReviewClosure,
  registerForbiddenHits,
  isEntrypoint,
  mutationManifestViolations,
  MUTATION_MANIFEST,
  MUTATION_CAMPAIGN,
  applyMutation,
  renderMutationManifest,
  runGates,
  classifyMutantRun,
  summarizeCampaign,
  parseTapResults,
  rebindSource,
  renderManifestRegion,
  PLACEBO_CONTROLS,
  CAMPAIGN_STATUSES,
  MUTATION_MANIFEST_VERSION,
  mutationManifestSha256,
  walkJsonKeys,
  KEY_METADATA_SUFFIXES,
  reviewClosureViolations,
  REVIEW_CLOSED_STATUSES,
  redactPaths,
  createAssertionLedger,
  sensitiveKeySegments,
  COMPACT_SENSITIVE_FAMILIES,
  STRUCTURE_LIMITS,
  registerStructureViolations,
  formatInternalError,
} from "../risk-register-check.mjs";

/**
 * S1-FA-04 — every test below runs through the assertion ledger: `test` records each
 * test it registers and runs, `assert` credits each assertion to the test that is
 * running, and a test that ends with no assertion fails. See `createAssertionLedger`.
 */
const ledger = createAssertionLedger(nodeTest, baseAssert);
const { test, assert } = ledger;

const RAW = readFileSync(REGISTER_PATH, "utf8");
const REGISTER = JSON.parse(RAW);
const REPORT = readFileSync(REPORT_PATH, "utf8");

/**
 * The live pins plus one more line, with the digest computed HERE (whitespace
 * collapsed, ends trimmed, SHA-256) rather than by the function under test, so a
 * test can mark a synthetic line without being able to pin it for free.
 */
const lineDigest = (line) => createHash("sha256").update(String(line).replace(/\s+/g, " ").trim(), "utf8").digest("hex");
const pinsWith = (...lines) => ({
  count: HISTORICAL_MARKER_PINS.count + lines.length,
  lineSha256: [...HISTORICAL_MARKER_PINS.lineSha256, ...lines.map(lineDigest)],
});

/** A deep copy, so a mutation in one test cannot leak into another. */
const clone = () => JSON.parse(RAW);
const riskIn = (reg, id) => reg.risks.find((r) => r.riskId === id);
const findingIn = (reg, id) => reg.findings.find((f) => f.findingId === id);
/** Re-derive after a factor change, so only the invariant under test is violated. */
function resync(risk) {
  Object.assign(risk, derive(risk));
  return risk;
}

// ───────────────────────────── the declared method ─────────────────────────────

test("likelihood is the mean of its four factors, rounded half up", () => {
  assert.equal(computeLikelihood({ reachability: 0, exploitability: 0, privilegeAccessibility: 0, repeatability: 0 }), 0);
  assert.equal(computeLikelihood({ reachability: 5, exploitability: 5, privilegeAccessibility: 5, repeatability: 5 }), 5);
  // 10/4 = 2.5 -> 3, the half-up case the tool documents
  assert.equal(computeLikelihood({ reachability: 3, exploitability: 2, privilegeAccessibility: 3, repeatability: 2 }), 3);
  // 9/4 = 2.25 -> 2
  assert.equal(computeLikelihood({ reachability: 3, exploitability: 2, privilegeAccessibility: 2, repeatability: 2 }), 2);
  // 11/4 = 2.75 -> 3
  assert.equal(computeLikelihood({ reachability: 3, exploitability: 3, privilegeAccessibility: 3, repeatability: 2 }), 3);
});

test("impact is the maximum of its five factors, never an average", () => {
  assert.equal(
    computeImpact({ confidentiality: 5, integrity: 0, availability: 0, auditability: 0, industrialSafety: 0 }),
    5,
    "one severe axis must set the impact",
  );
  assert.equal(
    computeImpact({ confidentiality: 2, integrity: 2, availability: 2, auditability: 2, industrialSafety: 2 }),
    2,
  );
});

test("the severity bands are exactly as declared, at every boundary", () => {
  for (const [score, band] of [
    [25, "CRITICAL"], [20, "CRITICAL"], [19, "HIGH"], [12, "HIGH"],
    [11, "MEDIUM"], [6, "MEDIUM"], [5, "LOW"], [1, "LOW"], [0, "INFORMATIONAL"],
  ]) {
    assert.equal(severityForScore(score), band, `score ${score}`);
  }
});

test("CRITICAL is clamped to HIGH unless the production state is ACTIVE_CONFIRMED", () => {
  const top = {
    likelihoodFactors: { reachability: 5, exploitability: 5, privilegeAccessibility: 5, repeatability: 5 },
    impactFactors: { confidentiality: 5, integrity: 0, availability: 0, auditability: 0, industrialSafety: 0 },
  };
  const active = derive({ ...top, productionState: "ACTIVE_CONFIRMED" });
  assert.equal(active.score, 25);
  assert.equal(active.severity, "CRITICAL");
  assert.equal(active.severityClamp, null, "a confirmed, reachable path is allowed to be critical");

  for (const state of PRODUCTION_STATES.filter((s) => s !== "ACTIVE_CONFIRMED")) {
    const d = derive({ ...top, productionState: state });
    assert.equal(d.severityFromScore, "CRITICAL", `${state} still scores 25`);
    assert.equal(d.severity, "HIGH", `${state} must be clamped`);
    assert.equal(d.severityClamp.rule, CLAMP_RULE);
    assert.equal(
      d.severityClamp.reason,
      clampReasonFor(state),
      "the clamp reason is derived from the state, and the two forms are not interchangeable",
    );
    if (state === "LATENT_CONFIG_GUARDED") {
      // A measured guard, so the reason says so instead of naming the state.
      assert.equal(d.severityClamp.reason, CLAMP_REASON_GUARDED);
    } else {
      assert.ok(d.severityClamp.reason.includes(state), "an unobserved path must name its state");
    }
  }
});

test("the clamp is a rule, not an override: severity is always the computed value", () => {
  const reg = clone();
  // Hand-set a severity that the method would not produce.
  riskIn(reg, "R-01").severity = "LOW";
  const v = arithmeticViolations(reg);
  assert.ok(
    v.some((x) => x.riskId === "R-01" && x.field === "severity"),
    "a stored severity that disagrees with the method must fail",
  );
});

// ───────────────────────── the committed register is sound ─────────────────────

test("the committed register satisfies every invariant", () => {
  assert.deepEqual(duplicateRiskIds(REGISTER), []);
  assert.deepEqual(duplicateFindingIds(REGISTER), []);
  assert.deepEqual(enumViolations(REGISTER), []);
  assert.deepEqual(missingRequiredFields(REGISTER), []);
  assert.deepEqual(orphanFindings(REGISTER), []);
  assert.deepEqual(ownershipViolations(REGISTER), []);
  assert.deepEqual(missingEvidence(REGISTER), []);
  assert.deepEqual(arithmeticViolations(REGISTER), []);
  assert.deepEqual(criticalWithoutActiveConfirmed(REGISTER), []);
  assert.deepEqual(acceptanceCriteriaViolations(REGISTER), []);
  assert.deepEqual(duplicateRemediationOwnership(REGISTER), []);
  assert.deepEqual(forbiddenContent(REGISTER), []);
  assert.deepEqual(priorityViolations(REGISTER), []);
  assert.deepEqual(orderingViolations(REGISTER), []);
  assert.deepEqual(markdownDrift(REGISTER, REPORT), []);
});

test("the committed register is already in canonical form, and canonicalising is idempotent", () => {
  assert.equal(RAW, render(REGISTER), "the file on disk must equal its canonical rendering");
  assert.equal(render(JSON.parse(render(REGISTER))), render(REGISTER), "a second pass must change nothing");
});

test("the register carries the method version and the source lock, and no derived state is missing", () => {
  assert.equal(REGISTER.methodVersion, METHOD_VERSION);
  assert.equal(REGISTER.sourceSha, "bcf3be9aa51f8d9f8f75e5568a2e4efea5f8fbd2");
  assert.equal(REGISTER.scoringMethod.manualOverrides, "none exist; severity is always the computed value");
  for (const r of REGISTER.risks) {
    assert.ok(Number.isInteger(r.score), `${r.riskId} has a score`);
    assert.ok("severityClamp" in r, `${r.riskId} declares its clamp state explicitly, even when null`);
  }
});

test("coverage is total: every finding has a disposition and none is owned twice", () => {
  const c = counters(REGISTER);
  assert.equal(c.FINDING_COVERAGE_PERCENT, 100);
  assert.equal(c.ORPHAN_FINDINGS, 0);
  assert.equal(c.OWNERSHIP_VIOLATIONS, 0);
  const owners = new Map();
  for (const r of REGISTER.risks) {
    for (const f of r.sourceFindingIds) owners.set(f, (owners.get(f) ?? 0) + 1);
  }
  assert.equal([...owners.values()].filter((n) => n > 1).length, 0, "no finding may have two owning risks");
  for (const f of REGISTER.findings) {
    if (OWNED_STATUSES.includes(f.status)) {
      assert.ok(f.ownerRiskId, `${f.findingId} needs an owner`);
      assert.ok(owners.has(f.findingId), `${f.findingId}'s risk must claim it back`);
    }
  }
});

test("every S0 finding family is represented, so no document was skipped", () => {
  const fams = new Set(REGISTER.findings.map((f) => f.family));
  for (const expected of ["H", "L", "U", "EDGE", "IP", "RL", "PRIV", "A", "DB", "TOOL", "LOCK", "P99-INT", "P99-DEP"]) {
    assert.ok(fams.has(expected), `family ${expected} must appear`);
  }
  // The named findings the mandate required by name.
  for (const id of [
    "H-1", "H-7", "L-1", "L-5", "U-1", "U-3", "EDGE-01", "EDGE-10", "IP-01", "IP-07",
    "RL-01", "RL-02", "PRIV-01", "PRIV-07", "DB-F1", "DB-F2", "DB-26",
    "LOCK-MFA-ABSENT", "LOCK-HSTS-ABSENT", "LOCK-AUDIT-NO-CHAIN", "LOCK-CI-TOOLING-ABSENT",
    "LOCK-UPLOADS-IN-PUBLIC", "LOCK-CONTAINER-HARDENING",
  ]) {
    assert.ok(findingIn(REGISTER, id), `${id} must be in the register`);
  }
});

test("a positive control scores zero on every factor, and nothing else claims that state", () => {
  const pc = REGISTER.risks.filter((r) => r.productionState === "POSITIVE_CONTROL");
  assert.ok(pc.length > 0);
  for (const r of pc) {
    for (const k of LIKELIHOOD_FACTOR_KEYS) assert.equal(r.likelihoodFactors[k], 0, `${r.riskId}.${k}`);
    for (const k of IMPACT_FACTOR_KEYS) assert.equal(r.impactFactors[k], 0, `${r.riskId}.${k}`);
    assert.equal(r.score, 0);
    assert.equal(r.severity, "INFORMATIONAL");
  }
});

test("a positive control with a non-zero factor is refused", () => {
  const reg = clone();
  const r = reg.risks.find((x) => x.productionState === "POSITIVE_CONTROL");
  r.impactFactors.confidentiality = 3;
  resync(r);
  assert.ok(
    enumViolations(reg).some((v) => v.where === r.riskId && v.field === "POSITIVE_CONTROL_MUST_SCORE_ZERO"),
    "a scored positive control must fail the gate",
  );
});

// ─────────────────────────── each failure mode is detected ─────────────────────

test("a duplicate risk id is detected", () => {
  const reg = clone();
  reg.risks.push({ ...riskIn(reg, "R-01") });
  assert.deepEqual(duplicateRiskIds(reg), ["R-01"]);
});

test("a duplicate finding id is detected", () => {
  const reg = clone();
  reg.findings.push({ ...findingIn(reg, "H-1") });
  assert.deepEqual(duplicateFindingIds(reg), ["H-1"]);
});

test("an orphan finding is detected in each of its four shapes", () => {
  const noStatus = clone();
  delete findingIn(noStatus, "H-2").status;
  assert.ok(orphanFindings(noStatus).some((o) => o.findingId === "H-2" && o.why === "NO_STATUS"));

  const noOwner = clone();
  delete findingIn(noOwner, "H-2").ownerRiskId;
  assert.ok(orphanFindings(noOwner).some((o) => o.why === "STATUS_REQUIRES_OWNER"));

  const noTarget = clone();
  const dup = noTarget.findings.find((f) => f.status === "DUPLICATE_OF");
  delete dup.duplicateOf;
  assert.ok(orphanFindings(noTarget).some((o) => o.why === "DUPLICATE_WITHOUT_TARGET"));

  const chain = clone();
  const d2 = chain.findings.find((f) => f.status === "DUPLICATE_OF");
  const target = findingIn(chain, d2.duplicateOf);
  target.status = "DUPLICATE_OF";
  target.duplicateOf = d2.findingId;
  assert.ok(
    orphanFindings(chain).some((o) => o.why === "DUPLICATE_CHAIN"),
    "a duplicate pointing at a duplicate leaves the chain with no real owner",
  );

  const noReason = clone();
  const nr = noReason.findings.find((f) => f.status === "NOT_A_SECURITY_RISK_WITH_REASON");
  delete nr.reason;
  assert.ok(orphanFindings(noReason).some((o) => o.why === "NOT_A_RISK_WITHOUT_REASON"));
});

test("a finding claimed by two risks is detected", () => {
  const reg = clone();
  riskIn(reg, "R-02").sourceFindingIds.push("L-5"); // already owned by R-01
  const v = ownershipViolations(reg);
  assert.ok(v.some((x) => x.findingId === "L-5" && x.why === "MULTIPLE_OWNING_RISKS"));
});

test("ownership that disagrees between the finding and the risk is detected, in both directions", () => {
  const onFinding = clone();
  findingIn(onFinding, "L-5").ownerRiskId = "R-02";
  assert.ok(ownershipViolations(onFinding).some((x) => x.why === "OWNER_DISAGREEMENT"));

  const onRisk = clone();
  riskIn(onRisk, "R-01").sourceFindingIds = riskIn(onRisk, "R-01").sourceFindingIds.filter((x) => x !== "L-5");
  assert.ok(ownershipViolations(onRisk).some((x) => x.findingId === "L-5" && x.why === "RISK_DOES_NOT_CLAIM_IT"));
});

test("an evidence path that does not exist is detected, and so is an absolute one", () => {
  const missing = clone();
  riskIn(missing, "R-01").evidence.push({ path: "src/lib/auth/does-not-exist.ts", locator: "x", note: "y" });
  assert.ok(missingEvidence(missing).some((e) => e.why === "DOES_NOT_EXIST"));

  const absolute = clone();
  riskIn(absolute, "R-01").evidence.push({ path: "/etc/passwd", locator: "x", note: "y" });
  assert.ok(missingEvidence(absolute).some((e) => e.why === "NOT_REPO_RELATIVE"));
});

test("every evidence path in the committed register resolves inside the repository", () => {
  assert.deepEqual(missingEvidence(REGISTER, REPO_ROOT), []);
  const paths = new Set(REGISTER.risks.flatMap((r) => r.evidence.map((e) => e.path)));
  assert.ok(paths.size > 60, `expected a wide evidence base, got ${paths.size} distinct paths`);
});

test("a wrong score and a wrong severity are both detected", () => {
  const score = clone();
  riskIn(score, "R-01").score = 99;
  assert.ok(arithmeticViolations(score).some((v) => v.field === "score"));

  const likelihood = clone();
  riskIn(likelihood, "R-01").likelihood = 1;
  assert.ok(arithmeticViolations(likelihood).some((v) => v.field === "likelihood"));

  const impact = clone();
  riskIn(impact, "R-01").impact = 1;
  assert.ok(arithmeticViolations(impact).some((v) => v.field === "impact"));

  const clampRemoved = clone();
  riskIn(clampRemoved, "R-01").severityClamp = null;
  riskIn(clampRemoved, "R-01").severity = "CRITICAL";
  const v = arithmeticViolations(clampRemoved);
  assert.ok(v.some((x) => x.field === "severityClamp"), "removing a required clamp must fail");
  assert.ok(
    criticalWithoutActiveConfirmed(clampRemoved).includes("R-01"),
    "and the dedicated counter must catch the critical that resulted",
  );
});

test("an unknown enum value is detected for every closed vocabulary", () => {
  const cases = [
    ["productionState", (r) => { r.productionState = "PROBABLY_FINE"; }],
    ["confidence", (r) => { r.confidence = "VERY_HIGH"; }],
    ["remediationPhase", (r) => { r.remediationPhase = "S99_SOMETHING"; }],
    ["verificationMethod", (r) => { r.verificationMethod = "VIBES"; }],
    ["threatActors", (r) => { r.threatActors = [...r.threatActors, "SPACE_PIRATE"]; }],
    ["affectedAssets", (r) => { r.affectedAssets = [...r.affectedAssets, "THE_VIBE"]; }],
    ["stride", (r) => { r.stride = [...r.stride, "SPOOFINGG"]; }],
  ];
  for (const [field, mutate] of cases) {
    const reg = clone();
    const r = riskIn(reg, "R-04");
    mutate(r);
    if (field === "productionState") resync(r);
    assert.ok(
      enumViolations(reg).some((v) => v.field === field),
      `${field} must be validated against its closed set`,
    );
  }
  const badStatus = clone();
  findingIn(badStatus, "H-1").status = "PROBABLY_OK";
  assert.ok(enumViolations(badStatus).some((v) => v.field === "status"));
});

test("a factor outside zero to five is detected, including a non-integer", () => {
  for (const bad of [-1, 6, 2.5, "3", null]) {
    const reg = clone();
    riskIn(reg, "R-04").likelihoodFactors.reachability = bad;
    assert.ok(
      enumViolations(reg).some((v) => v.field === "likelihoodFactors.reachability"),
      `reachability ${JSON.stringify(bad)} must be refused`,
    );
  }
  const reg = clone();
  riskIn(reg, "R-04").impactFactors.industrialSafety = 9;
  assert.ok(enumViolations(reg).some((v) => v.field === "impactFactors.industrialSafety"));
});

test("a reference to a risk or finding that does not exist is detected", () => {
  const badFinding = clone();
  riskIn(badFinding, "R-04").sourceFindingIds.push("GHOST-1");
  assert.ok(enumViolations(badFinding).some((v) => v.field === "sourceFindingIds" && v.value === "GHOST-1"));

  const badDep = clone();
  riskIn(badDep, "R-04").dependencies = ["R-999"];
  assert.ok(enumViolations(badDep).some((v) => v.field === "dependencies"));

  const badOwner = clone();
  findingIn(badOwner, "H-1").ownerRiskId = "R-999";
  assert.ok(enumViolations(badOwner).some((v) => v.field === "ownerRiskId"));
});

test("a HIGH or CRITICAL risk without acceptance criteria or residual risk is detected", () => {
  const noCriteria = clone();
  const high = noCriteria.risks.find((r) => r.severity === "HIGH");
  high.acceptanceCriteria = [];
  assert.ok(acceptanceCriteriaViolations(noCriteria).some((v) => v.why === "NO_ACCEPTANCE_CRITERIA"));

  const noResidual = clone();
  const high2 = noResidual.risks.find((r) => r.severity === "HIGH");
  high2.residualRisk = "   ";
  assert.ok(acceptanceCriteriaViolations(noResidual).some((v) => v.why === "NO_RESIDUAL_RISK"));
});

test("a risk missing its production state or its confidence is detected", () => {
  for (const field of ["productionState", "confidence", "title", "remediationOwnership", "verificationMethod"]) {
    const reg = clone();
    delete riskIn(reg, "R-04")[field];
    assert.ok(
      missingRequiredFields(reg).some((v) => v.riskId === "R-04" && v.field === field),
      `a missing ${field} must fail`,
    );
  }
});

test("duplicate or missing remediation ownership is detected", () => {
  const dup = clone();
  riskIn(dup, "R-04").remediationOwnership = riskIn(dup, "R-01").remediationOwnership;
  assert.ok(duplicateRemediationOwnership(dup).some((v) => v.why === "DUPLICATE"));

  const missing = clone();
  delete riskIn(missing, "R-04").remediationOwnership;
  assert.ok(duplicateRemediationOwnership(missing).some((v) => v.why === "MISSING"));
});

test("a timestamp, a timestamp-shaped key and an absolute path are all refused", () => {
  const clock = clone();
  riskIn(clock, "R-04").residualRisk = "observed at 15:38:34 during the run";
  assert.ok(forbiddenContent(clock).some((h) => h.kind === "TIMESTAMP"));

  const iso = clone();
  riskIn(iso, "R-04").residualRisk = "recorded 2026-10-11T15:38:34Z";
  assert.ok(forbiddenContent(iso).some((h) => h.kind === "TIMESTAMP"));

  const key = clone();
  riskIn(key, "R-04").generatedAt = "whenever";
  assert.ok(forbiddenContent(key).some((h) => h.kind === "TIMESTAMP_KEY"));

  for (const p of ["E:/hermes-security-dragon/src", "/home/ryan/x", "C:\\\\Users\\\\x", "/Users/someone/y", "/tmp/scratch"]) {
    const abs = clone();
    riskIn(abs, "R-04").residualRisk = `see ${p}`;
    assert.ok(forbiddenContent(abs).some((h) => h.kind === "ABSOLUTE_PATH"), `${p} must be refused`);
  }

  // A plain historical date is content, not a timestamp, and must stay allowed.
  const date = clone();
  riskIn(date, "R-04").residualRisk = "the source lock was taken on 2026-10-10";
  assert.deepEqual(forbiddenContent(date), []);
});

test("non-deterministic ordering is detected for the arrays and for the top-level lists", () => {
  const risksOut = clone();
  risksOut.risks.reverse();
  assert.ok(orderingViolations(risksOut).some((v) => v.what === "risks"));

  const findingsOut = clone();
  findingsOut.findings.reverse();
  assert.ok(orderingViolations(findingsOut).some((v) => v.what === "findings"));

  const inner = clone();
  const r = inner.risks.find((x) => x.affectedAssets.length > 1);
  r.affectedAssets.reverse();
  assert.ok(orderingViolations(inner).some((v) => v.what === `${r.riskId}.affectedAssets`));
});

test("remediation priority must be a total order that never contradicts severity", () => {
  const dup = clone();
  riskIn(dup, "R-04").remediationPriority = riskIn(dup, "R-01").remediationPriority;
  assert.ok(priorityViolations(dup).some((v) => v.why === "DUPLICATE_PRIORITY"));

  const inverted = clone();
  // Put a MEDIUM ahead of every HIGH.
  const medium = inverted.risks.find((r) => r.severity === "MEDIUM");
  medium.remediationPriority = 0;
  assert.ok(
    priorityViolations(inverted).some((v) => v.why === "SEVERITY_INVERSION"),
    "scheduling a less severe risk before a more severe one must fail",
  );
});

// ───────────────────────────── the Markdown drift gate ────────────────────────

test("the report carries a summary block that mirrors every required counter", () => {
  const parsed = parseMarkdownSummary(REPORT);
  assert.ok(parsed, "the block must be present and parseable");
  const c = counters(REGISTER);
  for (const k of MARKDOWN_MIRRORED_KEYS) {
    assert.ok(k in parsed, `${k} must appear in the report`);
    assert.equal(String(parsed[k]), String(c[k]), `${k} must agree with the register`);
  }
});

test("a changed counter in the report is detected as drift", () => {
  const tampered = REPORT.replace("SEVERITY_HIGH = 35", "SEVERITY_HIGH = 7");
  assert.notEqual(tampered, REPORT, "the anchor must exist, or this test proves nothing");
  assert.ok(markdownDrift(REGISTER, tampered).some((d) => d.key === "SEVERITY_HIGH" && d.why === "VALUE_DIFFERS"));
});

test("a missing counter, an unexpected counter and a missing block are each detected", () => {
  const removed = REPORT.replace("ORPHAN_FINDINGS = 0\n", "");
  assert.ok(markdownDrift(REGISTER, removed).some((d) => d.key === "ORPHAN_FINDINGS" && d.why === "MISSING_IN_MARKDOWN"));

  const added = REPORT.replace("ORPHAN_FINDINGS = 0", "ORPHAN_FINDINGS = 0\nINVENTED_COUNTER = 3");
  assert.ok(markdownDrift(REGISTER, added).some((d) => d.key === "INVENTED_COUNTER" && d.why === "UNEXPECTED_IN_MARKDOWN"));

  const noBlock = REPORT.replace(SUMMARY_BLOCK_MARKER, "");
  assert.ok(markdownDrift(REGISTER, noBlock).some((d) => d.why === "NO_SUMMARY_BLOCK"));
});

test("a risk or finding absent from the report is detected, so the register cannot grow in silence", () => {
  const reg = clone();
  const base = riskIn(reg, "R-04");
  reg.risks.push({
    ...base,
    riskId: "R-99",
    remediationOwnership: "a-slug-nothing-else-uses",
    remediationPriority: 999,
    sourceFindingIds: [],
    severity: base.severity,
  });
  reg.risks.sort((a, b) => a.riskId.localeCompare(b.riskId));
  assert.ok(
    markdownDrift(reg, REPORT).some((d) => d.key === "R-99" && d.why === "RISK_ABSENT_FROM_MARKDOWN"),
    "a risk the management document never mentions must fail the gate",
  );

  const reg2 = clone();
  reg2.findings.push({ ...findingIn(reg2, "H-1"), findingId: "ZZ-1" });
  reg2.findings.sort((a, b) => a.findingId.localeCompare(b.findingId));
  assert.ok(markdownDrift(reg2, REPORT).some((d) => d.key === "ZZ-1" && d.why === "FINDING_ABSENT_FROM_MARKDOWN"));
});

test("the report states the method identically to the tool", () => {
  assert.ok(REPORT.includes("round( mean(reachability, exploitability, privilegeAccessibility, repeatability) )"));
  assert.ok(REPORT.includes("max( confidentiality, integrity, availability, auditability, industrialSafety )"));
  assert.ok(REPORT.includes("20–25 CRITICAL"), "the bands must be stated in the document too");
  assert.ok(
    REPORT.includes("`privilegeAccessibility` scores **5 when no privilege is needed**"),
    "the factor orientation must be spelled out, because a privilege factor is easy to read backwards",
  );
  assert.ok(REPORT.includes("PROPOSED_NOT_AUTHORIZED"), "the phase mapping must carry its label");
});

// ──────────────────────── properties the mandate asked for ────────────────────

test("no risk is CRITICAL, and if one ever is it must be ACTIVE_CONFIRMED", () => {
  assert.deepEqual(criticalWithoutActiveConfirmed(REGISTER), []);
  for (const r of REGISTER.risks) {
    if (r.severity === "CRITICAL") assert.equal(r.productionState, "ACTIVE_CONFIRMED", r.riskId);
  }
});

test("an assurance gap is never reported as a product vulnerability", () => {
  // The twelve reclassified security-control dependencies are the worked example:
  // a classifier finding that could not see a correct control is a POSITIVE_CONTROL
  // entry, not a risk against the product.
  const twelve = findingIn(REGISTER, "LOCK-TWELVE-RECLASSIFIED");
  assert.equal(twelve.status, "POSITIVE_CONTROL");
  assert.equal(riskIn(REGISTER, twelve.ownerRiskId).productionState, "POSITIVE_CONTROL");
  // And the classifier's own blindness is an assurance gap, not an authorization failure.
  for (const id of ["PRIV-01", "PRIV-02", "PRIV-03", "PRIV-04", "PRIV-05", "PRIV-06"]) {
    assert.equal(findingIn(REGISTER, id).status, "ASSURANCE_GAP", id);
  }
  assert.equal(riskIn(REGISTER, "R-13").productionState, "ASSURANCE_GAP");
});

test("the tool defects are not product risks and own nothing", () => {
  for (const id of ["TOOL-03", "TOOL-05", "TOOL-06", "TOOL-07", "TOOL-08"]) {
    const f = findingIn(REGISTER, id);
    assert.equal(f.status, "NOT_A_SECURITY_RISK_WITH_REASON", id);
    assert.equal(f.ownerRiskId, undefined, `${id} must not own a risk slot`);
    assert.ok(f.reason.includes("audit instrument"), `${id} must say why`);
  }
  for (const r of REGISTER.risks) {
    for (const id of ["TOOL-03", "TOOL-05", "TOOL-06", "TOOL-07", "TOOL-08"]) {
      assert.ok(!r.sourceFindingIds.includes(id), `${r.riskId} must not claim ${id}`);
    }
  }
});

test("the withdrawn and retired edge findings stay recorded and stay non-risks", () => {
  for (const id of ["EDGE-02", "EDGE-06"]) {
    const f = findingIn(REGISTER, id);
    assert.equal(f.status, "NOT_A_SECURITY_RISK_WITH_REASON", id);
    assert.ok(f.reason.length > 40, `${id} must carry its withdrawal reason`);
  }
  assert.ok(
    findingIn(REGISTER, "EDGE-06").reason.includes("retired"),
    "the retired identifier must stay retired and say so",
  );
});

test("the Phase 99 register is reconciled rather than restated", () => {
  const p99 = JSON.parse(readFileSync(join(REPO_ROOT, "docs", "security", "phase99-findings.json"), "utf8"));
  for (const x of p99.findings) {
    const f = findingIn(REGISTER, x.findingId);
    assert.ok(f, `${x.findingId} must be reconciled into the register`);
    if (x.status === "VERIFIED_FIXED") {
      assert.equal(f.status, "ASSURANCE_GAP", `${x.findingId} is inherited, not re-verified`);
      assert.equal(f.ownerRiskId, "R-45");
    } else {
      assert.equal(f.status, "MAPPED_TO_RISK", `${x.findingId} is open`);
      assert.equal(f.ownerRiskId, "R-44");
    }
  }
  assert.equal(riskIn(REGISTER, "R-45").sourceFindingIds.length, 29, "all 29 inherited closures are owned once");
  assert.equal(riskIn(REGISTER, "R-44").sourceFindingIds.length, 5, "all five open advisories are owned once");
});

test("every risk names at least one threat actor, one asset, one STRIDE category and evidence", () => {
  for (const r of REGISTER.risks) {
    assert.ok(r.threatActors.length > 0, `${r.riskId} actors`);
    assert.ok(r.affectedAssets.length > 0, `${r.riskId} assets`);
    assert.ok(r.stride.length > 0, `${r.riskId} stride`);
    assert.ok(r.evidence.length > 0, `${r.riskId} evidence`);
    for (const e of r.evidence) {
      assert.ok(e.path && e.locator && e.note, `${r.riskId} evidence entries are complete`);
    }
    assert.ok(r.existingControls.length > 0, `${r.riskId} must state what already protects it`);
    assert.ok(r.controlGaps.length > 0, `${r.riskId} must state what does not`);
  }
});

test("the ten mandated actors and the modelled asset classes are all exercised", () => {
  const usedActors = new Set(REGISTER.risks.flatMap((r) => r.threatActors));
  for (const a of THREAT_ACTORS) assert.ok(usedActors.has(a), `actor ${a} must appear on some risk`);
  const usedAssets = new Set(REGISTER.risks.flatMap((r) => r.affectedAssets));
  for (const a of ASSETS) assert.ok(usedAssets.has(a), `asset ${a} must appear on some risk`);
  const usedStride = new Set(REGISTER.risks.flatMap((r) => r.stride));
  for (const s of STRIDE) assert.ok(usedStride.has(s), `stride ${s} must appear on some risk`);
});

test("the closed vocabularies are frozen and non-empty", () => {
  for (const [name, set] of Object.entries({
    PRODUCTION_STATES, SEVERITIES, FINDING_STATUSES, THREAT_ACTORS, ASSETS, STRIDE,
    REMEDIATION_PHASES, VERIFICATION_METHODS,
  })) {
    assert.ok(Object.isFrozen(set), `${name} must be frozen`);
    assert.ok(set.length > 0, `${name} must be non-empty`);
    assert.equal(new Set(set).size, set.length, `${name} must have no duplicate member`);
  }
});

test("the register carries no secret-shaped value", () => {
  // Deliberately narrow: this register names variables, never values.
  const text = RAW;
  for (const re of [
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
    /(?:password|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{8,}["']/i,
    /\b(?:postgres(?:ql)?|redis|mysql):\/\/[^\s"]*:[^\s"]*@/i,
  ]) {
    assert.equal(re.test(text), false, `the register must not contain ${re}`);
  }
  // The positive control for the scanner itself.
  assert.ok(/AKIA[0-9A-Z]{16}/.test(`AKIA${"A".repeat(16)}`), "the scanner must not be inert");
});

test("canonicalising reorders without losing anything", () => {
  const shuffled = clone();
  shuffled.risks.reverse();
  shuffled.findings.reverse();
  const c = canonicalize(shuffled);
  assert.equal(c.risks.length, REGISTER.risks.length);
  assert.equal(c.findings.length, REGISTER.findings.length);
  assert.deepEqual(
    c.risks.map((r) => r.riskId),
    REGISTER.risks.map((r) => r.riskId),
  );
  assert.equal(render(shuffled), RAW, "a shuffled register canonicalises back to the committed bytes");
});

// ──────────── the evidence-consistency gates added by the reconciliation ──────
//
// The register once carried "precondition UNVERIFIED" for a variable a committed
// S0 document had already recorded as present. These tests exist so that exact
// contradiction cannot return, and so each gate is seen to fail.

test("the reconciled identity risks are configuration-guarded, with named guards and cited evidence", () => {
  for (const id of ["R-01", "R-02"]) {
    const r = riskIn(REGISTER, id);
    assert.equal(r.productionState, "LATENT_CONFIG_GUARDED", `${id} state`);
    assert.ok(r.guardEvidence?.length >= 1, `${id} names its guard`);
    assert.ok(r.runtimeEvidence, `${id} carries runtime evidence`);
    assert.equal(r.runtimeEvidence.activeInCurrentContainer, false, `${id} is observed inactive`);
    assert.ok(r.runtimeEvidence.source.includes("docs/security/"), `${id} cites a committed document`);
    assert.ok(r.runtimeEvidence.doesNotProve.length >= 3, `${id} states the limits of its evidence`);
    // The clamp survives, with the reason the reconciliation requires.
    assert.ok(r.severityClamp, `${id} is still clamped`);
    assert.equal(r.severityClamp.reason, CLAMP_REASON_GUARDED, `${id} clamp reason`);
    assert.equal(r.severity, "HIGH");
  }
});

test("the evidence is never overclaimed: presence is all that is asserted", () => {
  const r = riskIn(REGISTER, "R-01");
  const limits = r.runtimeEvidence.doesNotProve.join(" ").toLowerCase();
  for (const must of ["strength", "independence", "replica", "rotat", "disclos", "next deploy"]) {
    assert.ok(limits.includes(must), `the stated limits must cover ${must}`);
  }
  assert.ok(
    /presence|present and non-empty/i.test(r.runtimeEvidence.statement),
    "the statement must be about presence, not about quality",
  );
});

test("no reconciled risk still calls its settled condition unknown", () => {
  assert.deepEqual(runtimeEvidenceContradictions(REGISTER), []);
  for (const r of REGISTER.risks) {
    if (!r.runtimeEvidence) continue;
    const prose = [
      r.title,
      ...r.preconditions,
      ...r.existingControls,
      ...r.controlGaps,
      ...r.acceptanceCriteria,
      r.residualRisk,
    ].join(" ");
    assert.equal(/\bprecondition[^.]{0,60}unverified/i.test(prose), false, `${r.riskId}`);
    assert.equal(/docker inspect/i.test(prose), false, `${r.riskId} must not embed a production command`);
  }
});

test("a risk that contradicts its own runtime evidence is detected, in each shape", () => {
  const calledUnknown = clone();
  riskIn(calledUnknown, "R-01").residualRisk = "The precondition is unverified and must be checked.";
  assert.ok(
    runtimeEvidenceContradictions(calledUnknown).some((v) => v.why === "CONDITION_CALLED_UNKNOWN"),
    "describing the settled precondition as unverified must fail",
  );

  const namedVariable = clone();
  riskIn(namedVariable, "R-01").controlGaps.push("AUTH_SECRET has not been checked in production.");
  assert.ok(
    runtimeEvidenceContradictions(namedVariable).some((v) => v.why === "SETTLED_VARIABLE_CALLED_UNKNOWN"),
    "naming the settled variable beside an uncertainty word must fail",
  );

  const asksAgain = clone();
  riskIn(asksAgain, "R-01").acceptanceCriteria.unshift("A read-only presence check is executed and recorded.");
  assert.ok(
    runtimeEvidenceContradictions(asksAgain).some((v) => v.why === "ASKS_TO_REPEAT_RECORDED_EVIDENCE"),
    "asking for the recorded check to be repeated must fail",
  );

  const embedsCommand = clone();
  riskIn(embedsCommand, "R-01").residualRisk = "Settle it with docker inspect on the container.";
  assert.ok(runtimeEvidenceContradictions(embedsCommand).some((v) => v.why === "ASKS_TO_REPEAT_RECORDED_EVIDENCE"));

  const noActiveFlag = clone();
  delete riskIn(noActiveFlag, "R-01").runtimeEvidence.activeInCurrentContainer;
  assert.ok(
    runtimeEvidenceContradictions(noActiveFlag).some((v) => v.why === "ACTIVE_IN_CURRENT_CONTAINER_NOT_STATED"),
  );

  const noSource = clone();
  delete riskIn(noSource, "R-01").runtimeEvidence.source;
  assert.ok(runtimeEvidenceContradictions(noSource).some((v) => v.why === "EVIDENCE_WITHOUT_SOURCE_OR_VARIABLES"));

  const noLimits = clone();
  riskIn(noLimits, "R-01").runtimeEvidence.doesNotProve = [];
  assert.ok(
    runtimeEvidenceContradictions(noLimits).some((v) => v.why === "EVIDENCE_WITHOUT_STATED_LIMITS"),
    "evidence without stated limits is an overclaim waiting to happen",
  );
});

test("every configuration-guarded risk names its guard, and nothing else carries guard evidence", () => {
  assert.deepEqual(guardEvidenceViolations(REGISTER), []);
  const guarded = REGISTER.risks.filter((r) => r.productionState === "LATENT_CONFIG_GUARDED");
  assert.ok(guarded.length >= 4, `expected at least four guarded risks, got ${guarded.length}`);
  for (const r of guarded) assert.ok(r.guardEvidence.length >= 1, r.riskId);
});

test("a configuration-guarded risk without guard evidence is detected, and so is the reverse", () => {
  const stripped = clone();
  delete riskIn(stripped, "R-10").guardEvidence;
  assert.ok(
    guardEvidenceViolations(stripped).some((v) => v.riskId === "R-10" && v.why === "LATENT_WITHOUT_GUARD_EVIDENCE"),
    "calling a risk latent without naming the guard must fail",
  );

  const misplaced = clone();
  riskIn(misplaced, "R-04").guardEvidence = ["something"];
  assert.ok(
    guardEvidenceViolations(misplaced).some((v) => v.why === "GUARD_EVIDENCE_ON_UNGUARDED_STATE"),
    "guard evidence on a state that is not guarded must fail, or the field loses its meaning",
  );
});

test("the next-action block does not ask for evidence the register already holds", () => {
  assert.deepEqual(nextSafeActionViolations(REGISTER, REPORT), []);
  assert.ok(REPORT.includes(NEXT_ACTION_MARKER), "the block must exist for the gate to mean anything");
});

test("a next-action block that re-requests settled evidence is detected", () => {
  const settledVariable = REPORT.replace(
    NEXT_ACTION_MARKER,
    `${NEXT_ACTION_MARKER}\n\nFirst, re-check AUTH_SECRET in the container.`,
  );
  assert.ok(
    nextSafeActionViolations(REGISTER, settledVariable).some((v) => v.why === "ASKS_FOR_SETTLED_EVIDENCE"),
    "naming a settled variable in the next action must fail",
  );

  const repeats = REPORT.replace(
    NEXT_ACTION_MARKER,
    `${NEXT_ACTION_MARKER}\n\nRun the presence check again and record it.`,
  );
  assert.ok(nextSafeActionViolations(REGISTER, repeats).some((v) => v.why === "ASKS_TO_REPEAT_A_CHECK"));

  const missing = REPORT.replace(NEXT_ACTION_MARKER, "");
  assert.ok(nextSafeActionViolations(REGISTER, missing).some((v) => v.why === "NO_NEXT_SAFE_ACTION_BLOCK"));
});

test("the clamp reason distinguishes a measured guard from an unobserved path", () => {
  assert.equal(clampReasonFor("LATENT_CONFIG_GUARDED"), CLAMP_REASON_GUARDED);
  for (const state of ["CODE_CONFIRMED_RUNTIME_UNPROVEN", "ASSURANCE_GAP", "POLICY_AMBIGUITY"]) {
    const reason = clampReasonFor(state);
    assert.notEqual(reason, CLAMP_REASON_GUARDED, `${state} must not claim a measurement`);
    assert.ok(reason.includes(state), `${state} must be named in its own reason`);
  }
  // And a hand-edited reason is refused.
  const tampered = clone();
  riskIn(tampered, "R-01").severityClamp.reason = "unconfirmed precondition";
  assert.ok(
    arithmeticViolations(tampered).some((v) => v.field === "severityClamp.reason"),
    "the clamp reason is derived, so overwriting it must fail",
  );
});

test("the inter-document contradiction that caused the reconciliation is registered as a finding", () => {
  const f = findingIn(REGISTER, "LOCK-L5-EVIDENCE-CONTRADICTION");
  assert.ok(f, "the contradiction must be recorded, not silently resolved");
  assert.equal(f.status, "ASSURANCE_GAP");
  assert.equal(f.ownerRiskId, "R-29");
  assert.ok(f.source.includes("AUTH-TOKEN-LIFECYCLE"), "it must cite both documents");
  assert.ok(f.source.includes("EDGE-ORIGIN-AND-CLIENT-IP"));
  assert.ok(
    riskIn(REGISTER, "R-29").sourceFindingIds.includes("LOCK-L5-EVIDENCE-CONTRADICTION"),
    "and R-29 must claim it back",
  );
  assert.ok(
    /NEITHER SOURCE-DOCUMENT DEFECT IS FIXED BY THIS PHASE/.test(riskIn(REGISTER, "R-29").residualRisk),
    "and the register must say plainly that the source documents were not corrected",
  );
});

test("the reconciliation changed no factor, and each reconciled risk says so", () => {
  for (const id of ["R-01", "R-02"]) {
    const r = riskIn(REGISTER, id);
    assert.ok(r.evidenceReconciliation, `${id} must record what the reconciliation did to its factors`);
    assert.ok(
      /no factor was moved in order to move a severity/i.test(r.evidenceReconciliation),
      `${id} must state that no factor was moved to move a severity`,
    );
    assert.equal(r.likelihoodFactors.reachability, 1, `${id} reachability is unchanged`);
    assert.equal(r.score, 20, `${id} score is unchanged`);
  }
  // R-20 and R-26 were corrected earlier and must not have moved again.
  assert.equal(riskIn(REGISTER, "R-20").impactFactors.integrity, 3);
  assert.equal(riskIn(REGISTER, "R-26").likelihoodFactors.exploitability, 2);
  assert.equal(riskIn(REGISTER, "R-20").severity, "HIGH");
  assert.equal(riskIn(REGISTER, "R-26").severity, "HIGH");
});

// ════════ gates added after the first independent adversarial review ═════════
//
// Each block below exists because a reviewer demonstrated the previous build
// could not detect a specific defect class. The negative half is the point: a
// gate nobody has watched fail is not known to work.

// ───────────── S1-RV-002: the contradiction gate reads the report ────────────

test("the report carries no contradiction of the evidence the register holds", () => {
  assert.deepEqual(reportContradictions(REGISTER, REPORT), [], "REPORT_CLEAN: the live report contradicts nothing the register carries");
  assert.deepEqual(runtimeEvidenceContradictions(REGISTER, REPORT), []);
});

test("a contradiction in the JSON fails, exactly as before", () => {
  const reg = clone();
  riskIn(reg, "R-01").controlGaps.push("AUTH_SECRET has not been verified in production.");
  assert.ok(runtimeEvidenceContradictions(reg).length > 0, "the register-side rule must still fire");
});

test("a contradiction only in the report's narrative fails", () => {
  const injected = REPORT.replace(
    "## 2. Threat model",
    "The single precondition is unverified and nobody has checked it.\n\n## 2. Threat model",
  );
  assert.notEqual(injected, REPORT, "the anchor must exist or this test proves nothing");
  const hits = reportContradictions(REGISTER, injected);
  assert.ok(
    hits.some((h) => h.why === "REPORT_CALLS_SETTLED_PRECONDITION_UNKNOWN"),
    "a settled precondition called unknown in the narrative must fail",
  );
  assert.ok(runtimeEvidenceContradictions(REGISTER, injected).length > 0, "and the combined gate must fail too");
});

test("naming a settled variable beside an uncertainty word in the report fails", () => {
  const injected = REPORT.replace(
    "## 3. Attack-surface map",
    "AUTH_SECRET has not been checked on the host.\n\n## 3. Attack-surface map",
  );
  assert.ok(
    reportContradictions(REGISTER, injected).some((h) => h.why === "REPORT_CALLS_SETTLED_VARIABLE_UNKNOWN"),
    "an unambiguous variable name must be caught wherever it appears",
  );
});

test("asking the reader to re-run a recorded check fails", () => {
  const injected = REPORT.replace(
    "## 3. Attack-surface map",
    "First, re-run the presence check on the container.\n\n## 3. Attack-surface map",
  );
  assert.ok(
    reportContradictions(REGISTER, injected).some((h) => h.why === "REPORT_ASKS_TO_REPEAT_RECORDED_EVIDENCE"),
  );
});

test("an explicitly MARKED superseded quotation PASSES — the report must be able to disclose it", () => {
  // The report's own finding is that two S0 documents disagree, so it has to be
  // able to quote the stale one. After S1-R2-001 the exemption is no longer a
  // keyword in the neighbourhood: the quoting line must carry the exact marker.
  // After S1-R3-005 the line must also be PINNED, so the test pins it explicitly
  // — with a digest computed here, not by the function under test.
  const markedLine = "Revision 1 stated that the single precondition is unverified; that sentence was superseded. "
    + HISTORICAL_MARKER;
  const quoted = REPORT.replace(
    "## 3. Attack-surface map",
    `${markedLine}\n` +
      "The evidence recorded in the edge document is quoted here only to disclose the contradiction.\n\n" +
      "## 3. Attack-surface map",
  );
  assert.deepEqual(
    reportContradictions(REGISTER, quoted, { pins: pinsWith(markedLine) }),
    [],
    "a marked, pinned historical quotation must not be treated as a live claim",
  );
  // and the SAME text without the marker must fail, so the pass above is earned
  const unmarked = REPORT.replace(
    "## 3. Attack-surface map",
    "Revision 1 stated that the single precondition is unverified; that sentence was superseded.\n\n" +
      "## 3. Attack-surface map",
  );
  assert.ok(
    reportContradictions(REGISTER, unmarked).length > 0,
    "the word 'superseded' alone must not exempt anything",
  );
});

test("a hard-wrapped disclosure is marked on the line that makes the claim", () => {
  // Markdown hard-wraps, and the FIRST implementation answered that by exempting a
  // five-line neighbourhood — which S1-R2-001 showed silenced live claims four
  // ways out of six. The marker is now line-scoped, so a wrapped disclosure must
  // carry it on whichever line actually states the superseded sentence.
  const markedLine = "The legacy-token document still called the signing-variable precondition unverified. "
    + HISTORICAL_MARKER;
  const marked = REPORT.replace(
    "## 3. Attack-surface map",
    `${markedLine}\n` +
      "The edge document records the presence check that settled it.\n\n" +
      "## 3. Attack-surface map",
  );
  assert.deepEqual(reportContradictions(REGISTER, marked, { pins: pinsWith(markedLine) }), []);

  // the wrap WITHOUT the marker on the claiming line must fail
  const wrapped = REPORT.replace(
    "## 3. Attack-surface map",
    "The legacy-token document still calls the signing-variable\n" +
      "precondition unverified while the edge document records the presence check.\n\n" +
      "## 3. Attack-surface map",
  );
  assert.ok(
    reportContradictions(REGISTER, wrapped).length > 0,
    "a neighbouring line may no longer exempt a live claim",
  );
});

test("the generated blocks are excluded from the narrative scan, and the register's own words are gated on the JSON side", () => {
  const narrative = narrativeOnly(REPORT, REGISTER);
  assert.equal(narrative.split("\n").length, REPORT.split("\n").length, "line numbers must stay meaningful");
  assert.ok(!narrative.includes("| **Residual risk** |"), "matrix rows must be blanked");
  assert.ok(narrative.includes("## 2. Threat model"), "the narrative must survive");
  // R-05's precondition genuinely IS unverified and it carries no runtime evidence,
  // so its residual must be allowed to say so.
  const r5 = riskIn(REGISTER, "R-05");
  assert.equal(r5.runtimeEvidence, undefined);
  assert.ok(/unverified/i.test(r5.residualRisk), "R-05 states the one presence question still open");
  assert.deepEqual(reportContradictions(REGISTER, REPORT), [], "and that must not be read as a contradiction");
});

// ───────────── S1-RV-003: the source finding universe is closed ──────────────

test("the finding universe matches the source documents exactly", () => {
  assert.deepEqual(findingUniverseViolations(REGISTER), []);
  const { error, ids } = extractSourceUniverse();
  assert.equal(error, null);
  assert.equal(ids.size, 110, "the eight S0 documents plus the Phase 99 register carry 110 identifiers");
  const lock = REGISTER.findings.filter((f) => f.family === "LOCK");
  assert.equal(lock.length, LOCK_UNIVERSE_COUNT);
  assert.equal(ids.size + lock.length, REGISTER.findings.length, "110 source + 51 bookkeeping = every finding");
  assert.equal(sha256Hex(lockUniverseString(REGISTER)), LOCK_UNIVERSE_SHA256);
});

test("every source document in the fixed list exists and contributes", () => {
  assert.equal(SOURCE_DOCUMENTS.length, 8);
  const { ids } = extractSourceUniverse();
  const contributing = new Set();
  for (const docs of ids.values()) for (const d of docs) contributing.add(d);
  for (const d of SOURCE_DOCUMENTS) assert.ok(contributing.has(d), `${d} must contribute an identifier`);
  assert.ok(contributing.has(PHASE99_REGISTER));
});

test("deleting a finding fails, even when its ownership entry goes with it", () => {
  // The reviewer's exact probe: EDGE-02 is a withdrawn finding owned by nobody,
  // so before this gate existed its removal passed every check.
  const dropped = clone();
  dropped.findings = dropped.findings.filter((f) => f.findingId !== "EDGE-02");
  const v = findingUniverseViolations(dropped);
  assert.ok(
    v.some((x) => x.why === "MISSING_FROM_REGISTER" && x.findingId === "EDGE-02"),
    "a withdrawn finding cannot be dropped quietly",
  );

  const both = clone();
  both.findings = both.findings.filter((f) => f.findingId !== "H-1");
  riskIn(both, "R-16").sourceFindingIds = riskIn(both, "R-16").sourceFindingIds.filter((x) => x !== "H-1");
  assert.ok(
    findingUniverseViolations(both).some((x) => x.findingId === "H-1" && x.why === "MISSING_FROM_REGISTER"),
    "removing a finding together with its ownership must still fail",
  );
});

test("an invented source finding fails", () => {
  const reg = clone();
  reg.findings.push({
    findingId: "EDGE-99",
    family: "EDGE",
    source: "docs/security/EDGE-ORIGIN-AND-CLIENT-IP.md §1",
    summary: "A finding that appears in no document.",
    status: "NOT_A_SECURITY_RISK_WITH_REASON",
    reason: "invented for this test",
  });
  reg.findings.sort((a, b) => a.findingId.localeCompare(b.findingId));
  assert.ok(
    findingUniverseViolations(reg).some((x) => x.findingId === "EDGE-99" && x.why === "NOT_IN_ANY_SOURCE_DOCUMENT"),
    "a source-family finding with no document behind it must fail",
  );
});

test("a finding in an unknown family fails", () => {
  const reg = clone();
  reg.findings.push({ ...findingIn(reg, "H-1"), findingId: "ZZZ-1", family: "ZZZ" });
  reg.findings.sort((a, b) => a.findingId.localeCompare(b.findingId));
  assert.ok(findingUniverseViolations(reg).some((x) => x.why === "UNKNOWN_FAMILY"));
});

test("adding or removing a LOCK finding without updating the pinned invariant fails", () => {
  const added = clone();
  added.findings.push({
    findingId: "LOCK-INVENTED",
    family: "LOCK",
    source: "docs/security/ARCHITECTURE-INVENTORY.md §1",
    summary: "x",
    status: "NOT_A_SECURITY_RISK_WITH_REASON",
    reason: "y",
  });
  added.findings.sort((a, b) => a.findingId.localeCompare(b.findingId));
  const v1 = findingUniverseViolations(added);
  assert.ok(v1.some((x) => x.why === "LOCK_COUNT_CHANGED"), "the count is pinned");
  assert.ok(v1.some((x) => x.why === "LOCK_HASH_CHANGED"), "and so is the membership");

  const removed = clone();
  removed.findings = removed.findings.filter((f) => f.findingId !== "LOCK-MFA-ABSENT");
  const v2 = findingUniverseViolations(removed);
  assert.ok(v2.some((x) => x.why === "LOCK_COUNT_CHANGED"));
  assert.ok(v2.some((x) => x.why === "LOCK_HASH_CHANGED"));

  // Renaming one keeps the count and still fails on the hash.
  const renamed = clone();
  renamed.findings.find((f) => f.findingId === "LOCK-MFA-ABSENT").findingId = "LOCK-MFA-MISSING";
  riskIn(renamed, "R-04").sourceFindingIds = ["LOCK-MFA-MISSING"];
  renamed.findings.sort((a, b) => a.findingId.localeCompare(b.findingId));
  const v3 = findingUniverseViolations(renamed);
  assert.ok(!v3.some((x) => x.why === "LOCK_COUNT_CHANGED"), "the count is unchanged by a rename");
  assert.ok(v3.some((x) => x.why === "LOCK_HASH_CHANGED"), "so the hash is what catches it");
});

test("a missing source document fails rather than silently shrinking the universe", () => {
  const v = findingUniverseViolations(REGISTER, join(REPO_ROOT, "no-such-tree"));
  assert.ok(v.some((x) => String(x.why).startsWith("MISSING_SOURCE_DOCUMENT")));
});

test("the review findings are NOT security findings and own nothing", () => {
  for (const [id] of REVIEW_CLOSURE) {
    assert.equal(findingIn(REGISTER, id), undefined, `${id} must not be in the register`);
    for (const r of REGISTER.risks) assert.ok(!r.sourceFindingIds.includes(id), `${r.riskId} must not claim ${id}`);
  }
  assert.equal(REVIEW_CLOSURE.length, 11, "all eleven review findings are accounted for");
  for (const [, , status] of REVIEW_CLOSURE) {
    assert.ok(
      ["FIXED", "FIXED_BY_DISCLOSURE_AND_DERIVED_PRESENTATION"].includes(status),
      "no review finding may remain open",
    );
  }
});

// ───────────── S1-RV-004: secret shapes are gated, not just tested ───────────

test("the deliverables carry no secret-shaped value", () => {
  assert.deepEqual(secretShapeViolations(RAW, REPORT), []);
});

test("every secret shape class is detected", () => {
  const samples = {
    PEM_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----",
    AWS_ACCESS_KEY_ID: `AKIA${"Q".repeat(16)}`,
    GITHUB_TOKEN: `ghp_${"a".repeat(36)}`,
    GITHUB_PAT_FINE_GRAINED: `github_pat_${"b".repeat(42)}`,
    SLACK_TOKEN: `xoxb-${"1".repeat(24)}`,
    JWT_THREE_PART: `eyJ${"a".repeat(20)}.${"b".repeat(20)}.${"c".repeat(20)}`,
    CONNECTION_STRING_WITH_CREDENTIAL: "postgresql://someuser:hunter2hunter2@db.internal:5432/app",
  };
  for (const [kind, sample] of Object.entries(samples)) {
    const hits = secretShapeHits(sample, "probe");
    assert.ok(hits.some((h) => h.kind === kind), `${kind} must be detected in ${JSON.stringify(sample.slice(0, 24))}`);
  }
  assert.equal(Object.keys(samples).length, SECRET_SHAPES.length, "every declared shape has a probe");

  // S1-R2-003 moved the assignment class into `assignedSecretHits`, which also
  // covers the unquoted form, so the quoted probe lives there and the old
  // quoted-only shape was removed rather than left as an overlapping duplicate.
  const quotedAssignment = 'api_key = "abcdefghijklmnop"';
  assert.deepEqual(secretShapeHits(quotedAssignment, "probe"), [], "no longer a shape");
  assert.ok(
    assignedSecretHits(quotedAssignment).some((h) => h.kind === "ASSIGNED_SECRET_VALUE" && h.form === "QUOTED"),
    "but still detected, as a quoted assignment",
  );
  assert.ok(secretShapeViolations(RAW, `${REPORT}\n${quotedAssignment}`).length > 0, "and the gate still fires");
});

/**
 * A copy of the register with `text` appended to one field and rendered by the REAL
 * renderer. Fixtures must reach the deliverable by the route a real edit takes —
 * through JSON string escaping — never be appended after the closing brace, which
 * is how the quoted-assignment blind spot of S1-R3-002 went unseen.
 */
function renderedWith(text, riskId = "R-04") {
  const reg = clone();
  riskIn(reg, riskId).residualRisk += ` ${text}`;
  return render(reg);
}

test("the gate fires when a secret shape is planted in either deliverable", () => {
  const planted = `AKIA${"Z".repeat(16)}`;
  assert.ok(secretShapeViolations(renderedWith(planted), REPORT).length > 0, "register side");
  assert.ok(secretShapeViolations(RAW, `${REPORT}\n${planted}`).length > 0, "report side");
});

test("harmless placeholders and documentation pass", () => {
  for (const benign of [
    "AWS_ACCESS_KEY_ID=<your-key-here>",
    "set AUTH_SECRET in the environment",
    "api_key = <redacted>",
    "postgresql://localhost:5432/app",
    "a JWT is three dot-separated parts",
    "DATABASE_URL is supplied from the environment",
    'password: "" // never committed',
  ]) {
    assert.deepEqual(secretShapeHits(benign, "benign"), [], `${benign} must not trip the gate`);
  }
});

test("the detector's own rule table is excluded, so the scanner cannot report itself", () => {
  // The S0 call-site scanner learned this the hard way: being committed changed
  // its own output because it lived under its own scan root.
  assert.ok(SECRET_SCAN_EXCLUDED_PATHS.includes("scripts/security/s1/risk-register-check.mjs"));
  assert.ok(SECRET_SCAN_EXCLUDED_PATHS.includes("scripts/security/s1/__tests__/risk-register.selftest.mjs"));
  // and the gate is applied only to the two deliverables
  assert.deepEqual(secretShapeViolations(RAW, REPORT), []);
});

// ───────────── S1-RV-005: R-52's asset model ────────────────────────────────

test("a risk scoring industrial safety names an industrial asset", () => {
  const INDUSTRIAL = ["FACTORY_AND_ERP_DATA", "OT_GATEWAY_BOUNDARY", "DIGITAL_TWIN_AND_KNOWLEDGE_GRAPH", "SITE_ISOLATION"];
  for (const r of REGISTER.risks) {
    if (r.impactFactors.industrialSafety < 3) continue;
    assert.ok(
      r.affectedAssets.some((a) => INDUSTRIAL.includes(a)),
      `${r.riskId} scores industrialSafety ${r.impactFactors.industrialSafety} and must name an industrial asset`,
    );
  }
  const r52 = riskIn(REGISTER, "R-52");
  assert.ok(r52.affectedAssets.includes("OT_GATEWAY_BOUNDARY"));
  assert.equal(r52.score, 12, "the asset correction must not move the score");
  assert.equal(r52.severity, "HIGH");
});

// ───────────── S1-RV-006/009/010/013: the generated blocks ───────────────────

test("every generated block is present in the report and byte-identical", () => {
  assert.deepEqual(markdownBlockDrift(REGISTER, REPORT), []);
  for (const name of Object.keys(markdownBlocks(REGISTER))) {
    assert.notEqual(extractBlock(REPORT, name), null, `block ${name} must be present`);
  }
});

test("a hand edit inside a generated block fails, and the failure names the line", () => {
  const blocks = markdownBlocks(REGISTER);
  const first = blocks.matrix.split("\n")[0];
  const tampered = REPORT.replace(first, `${first} (edited by hand)`);
  assert.notEqual(tampered, REPORT);
  const v = markdownBlockDrift(REGISTER, tampered);
  assert.ok(v.some((x) => x.block === "matrix" && x.why === "BLOCK_DRIFT"), "a hand edit must fail");
  assert.ok(v.find((x) => x.block === "matrix").line >= 1, "and the report must say where");
});

test("a removed block fails", () => {
  const removed = REPORT.replace(BLOCK_OPEN("calibration"), "");
  assert.ok(markdownBlockDrift(REGISTER, removed).some((x) => x.block === "calibration" && x.why === "BLOCK_ABSENT"));
});

test("the management matrix shows controls, criteria, method and residual for every risk", () => {
  const matrix = extractBlock(REPORT, "matrix");
  for (const r of REGISTER.risks) {
    assert.ok(matrix.includes(`\`${r.riskId}\``), `${r.riskId} must appear in the matrix`);
    assert.ok(matrix.includes(r.existingControls[0].slice(0, 40)), `${r.riskId} controls`);
    assert.ok(matrix.includes(r.acceptanceCriteria[0].slice(0, 40)), `${r.riskId} criteria`);
    assert.ok(matrix.includes(`\`${r.verificationMethod}\``), `${r.riskId} method`);
    assert.ok(matrix.includes(r.residualRisk.slice(0, 40)), `${r.riskId} residual`);
  }
});

test("the calibration block states the saturation the reviewer measured", () => {
  const c = calibration(REGISTER);
  const block = extractBlock(REPORT, "calibration");
  assert.ok(block.includes(`HIGH_PERCENT_OF_SCORED       ${c.highPercentOfScored}%`));
  // the reachable-score count is computed here, not taken from the checker
  const reachable = new Set();
  for (let l = 1; l <= 5; l += 1) for (let i = 1; i <= 5; i += 1) reachable.add(l * i);
  assert.ok(block.includes(`DISTINCT_SCORES_USED         ${c.distinctScores} of ${reachable.size} reachable`));
  assert.ok(/severity therefore does not order the work on its own/i.test(block));
  assert.ok(/remediationPriority/.test(block) && /productionState/.test(block));
  assert.equal(c.scoredRisks + REGISTER.risks.filter((r) => r.score === 0).length, REGISTER.risks.length);
});

test("the dominant impact dimension is derived, tie-ordered and displayed", () => {
  assert.deepEqual(dominantImpactViolations(REGISTER), []);
  for (const r of REGISTER.risks) {
    const d = dominantImpactDimensions(r);
    assert.deepEqual(r.dominantImpact, d, r.riskId);
    if (r.score === 0) assert.deepEqual(d, [], `${r.riskId} scores nothing so has no dominant axis`);
    for (const label of d) assert.ok(Object.values(IMPACT_DIMENSION_LABELS).includes(label));
  }
  // ties follow the declared factor order, never object-iteration order
  const tie = REGISTER.risks.find((r) => r.dominantImpact.length > 1);
  assert.ok(tie, "the register contains at least one tie");
  const order = Object.values(IMPACT_DIMENSION_LABELS);
  const positions = tie.dominantImpact.map((l) => order.indexOf(l));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "ties are in the fixed order");
  const block = extractBlock(REPORT, "dominant");
  assert.ok(/AUDITABILITY/.test(block));
  assert.ok(/ASSURANCE_GAP. risk can reach HIGH/i.test(block), "the block must explain why an assurance gap can be HIGH");
});

test("a wrong stored dominant dimension fails", () => {
  const reg = clone();
  riskIn(reg, "R-01").dominantImpact = ["AVAILABILITY"];
  const v = dominantImpactViolations(reg);
  assert.ok(v.some((x) => x.riskId === "R-01" && x.why === "DOMINANT_IMPACT_MISMATCH"));
  assert.ok(arithmeticViolations(reg).some((x) => x.field === "dominantImpact"), "and the arithmetic gate catches it too");
});

test("the review closure table is rendered from the committed constant", () => {
  const block = extractBlock(REPORT, "closure");
  for (const [id, sev, status] of REVIEW_CLOSURE) {
    assert.ok(block.includes(`\`${id}\``), `${id} must appear`);
    assert.ok(block.includes(sev), `${id} severity`);
    assert.ok(block.includes(status), `${id} status`);
  }
  assert.ok(/No review finding is OPEN/.test(block));
  assert.ok(/deliberately NOT security findings/.test(block));
});

// ───────────── S1-RV-007: verification-method linkage ───────────────────────

test("every scored risk links a criterion to its declared verification method", () => {
  assert.deepEqual(verificationLinkageViolations(REGISTER), []);
  assert.equal(VERIFICATION_LINKAGE_VERSION, "s1-vlink-3");
  for (const m of VERIFICATION_METHODS) {
    assert.ok(VERIFICATION_LINKAGE[m], `${m} must have linkage patterns`);
    assert.ok(VERIFICATION_LINKAGE[m].length > 0);
  }
  // the risks the reviewers named, judged by the operational phrase and its negation guard
  for (const id of ["R-05", "R-06", "R-31", "R-40", "R-44", "R-46"]) {
    const r = riskIn(REGISTER, id);
    assert.ok(
      r.acceptanceCriteria.some((c) => criterionLinksMethod(c, r.verificationMethod)),
      `${id} must name its declared method in a criterion`,
    );
  }
});

test("a risk whose criteria name no method fails", () => {
  const reg = clone();
  riskIn(reg, "R-40").acceptanceCriteria = ["Things are better afterwards."];
  assert.ok(
    verificationLinkageViolations(reg).some((v) => v.riskId === "R-40" && v.why === "NO_CRITERION_NAMES_THE_DECLARED_METHOD"),
  );
});

test("declaring the wrong method fails, because the criteria no longer match it", () => {
  const reg = clone();
  riskIn(reg, "R-24").verificationMethod = "FAULT_INJECTION_REHEARSAL";
  assert.ok(
    verificationLinkageViolations(reg).some((v) => v.riskId === "R-24"),
    "an external-vantage risk relabelled as a rehearsal must fail",
  );
});

test("an unmapped method name fails rather than passing silently", () => {
  const reg = clone();
  riskIn(reg, "R-24").verificationMethod = "NOT_YET_VERIFIABLE";
  const v = verificationLinkageViolations(reg);
  assert.ok(v.some((x) => x.riskId === "R-24"), "a method with no matching criterion must fail");
});

test("positive controls are exempt, because their criteria preserve rather than verify", () => {
  for (const r of REGISTER.risks.filter((x) => x.score === 0)) {
    assert.equal(
      verificationLinkageViolations({ ...REGISTER, risks: [r] }).length,
      0,
      `${r.riskId} must be exempt`,
    );
  }
});

// ───────────── S1-RV-011: the factor rename ─────────────────────────────────

test("the reversed factor is renamed everywhere, with its direction documented", () => {
  assert.ok(LIKELIHOOD_FACTOR_KEYS.includes("privilegeAccessibility"));
  assert.ok(!LIKELIHOOD_FACTOR_KEYS.includes("requiredPrivileges"));
  assert.equal(RAW.includes("requiredPrivileges"), false, "the register must not carry the old key");
  // The report mentions the old name exactly once, in the sentence explaining why
  // it was renamed. That is documentation of the hazard rather than use of the
  // key, so the bar is that the old name never appears as DATA — never in the
  // formula, never as a field — not that the word is unmentionable.
  const oldKeyLines = REPORT.split("\n").filter((l) => l.includes("requiredPrivileges"));
  assert.equal(oldKeyLines.length, 1, "the old name may appear only where the rename is explained");
  assert.ok(/originally called/.test(oldKeyLines[0]), "and that mention must be the explanation");
  assert.equal(
    REPORT.includes("mean(reachability, exploitability, requiredPrivileges"),
    false,
    "the formula must carry the new name",
  );
  for (const r of REGISTER.risks) {
    assert.ok(
      Number.isInteger(r.likelihoodFactors.privilegeAccessibility),
      `${r.riskId} must carry the new key`,
    );
    assert.equal(r.likelihoodFactors.requiredPrivileges, undefined);
  }
  assert.ok(
    /privilegeAccessibility/.test(REGISTER.scoringMethod.likelihood),
    "the register's own method description must use the new name",
  );
  assert.ok(
    /higher always means more risk/i.test(REGISTER.scoringMethod.factorOrientation),
    "and must state the direction",
  );
});

test("the rename changed no value: higher still means more risk, monotonically", () => {
  // Anonymous-reachable risks must cluster at the accessible end.
  const anon = REGISTER.risks.filter((r) => r.score > 0 && r.threatActors.includes("ANONYMOUS_PUBLIC"));
  assert.ok(anon.length >= 15, `expected a meaningful sample, got ${anon.length}`);
  const accessible = anon.filter((r) => r.likelihoodFactors.privilegeAccessibility >= 4);
  assert.ok(accessible.length / anon.length >= 0.75, "most anonymous risks must score 4 or 5");
  for (const r of anon) {
    assert.ok(
      r.likelihoodFactors.privilegeAccessibility >= 3,
      `${r.riskId} is anonymous-reachable so it cannot need high privilege`,
    );
  }
  // and the operator-only risks must sit at the inaccessible end
  const operatorOnly = REGISTER.risks.filter(
    (r) => r.score > 0 && r.threatActors.includes("INSIDER_OR_ERRING_OPERATOR") && !r.threatActors.includes("ANONYMOUS_PUBLIC"),
  );
  for (const r of operatorOnly) {
    assert.ok(r.likelihoodFactors.privilegeAccessibility <= 3, `${r.riskId} needs operator access`);
  }
});

test("the report documents the direction under the new name", () => {
  assert.ok(/privilegeAccessibility/.test(REPORT));
  assert.ok(
    /5 (?:when|means)[^.]{0,60}no privilege/i.test(REPORT),
    "the report must state that 5 means no privilege is needed",
  );
});

// ════════ gates hardened after the SECOND independent adversarial review ═════
//
// Every bypass the reviewer reproduced is turned into a failing test below. The
// pattern is deliberate: a gate nobody has watched fail is not known to work, and
// a gate whose bypass nobody has watched fail is not known to be closed.

// ──────── S1-R2-001: the historical exemption is one exact marker ────────────

test("no keyword creates an exemption any more", () => {
  // The old implementation exempted a line when any of these appeared within a
  // five-line window. Four of six variants silenced a live claim.
  const live = "AUTH_SECRET has not been checked and must be verified before release.";
  const decoys = [
    ["bare 'superseded' two lines below", `${live}\n\nThat earlier guidance was superseded.`],
    ["bare 'no longer' on the next line", `${live}\nThis is no longer a draft.`],
    ["bare 'historical' above", `Some historical notes follow.\n\n${live}`],
    ["bare 'revision 1' above", `Revision 1 of this table.\n\n${live}`],
    ["'superseded' in the same paragraph, other sentence", `${live} That sentence was superseded.`],
    ["no decoy at all", live],
  ];
  for (const [label, text] of decoys) {
    const injected = REPORT.replace("## 2. Threat model", `${text}\n\n## 2. Threat model`);
    assert.ok(
      reportContradictions(REGISTER, injected).length > 0,
      `${label} must NOT exempt a live claim`,
    );
  }
  // and the constant that powered the old window is gone
  assert.equal(typeof HISTORICAL_MARKER, "string");
  assert.ok(HISTORICAL_MARKER.startsWith("<!--"), "the exemption is a machine marker, not a word");
});

test("a genuine superseded quotation passes with the exact marker on its own line", () => {
  const quoted = `Revision 1 stated that the single precondition is unverified. ${HISTORICAL_MARKER}`;
  const injected = REPORT.replace("## 2. Threat model", `${quoted}\n\n## 2. Threat model`);
  assert.deepEqual(reportContradictions(REGISTER, injected, { pins: pinsWith(quoted) }), []);
  // and the same line is refused when it is NOT pinned: the pin, not the shape, is the permission
  assert.ok(
    reportContradictions(REGISTER, injected).some((v) => v.why === "MARKER_LINE_NOT_PINNED"),
    "an exact marker on an unpinned line must be refused by the real pin",
  );
});

test("the marker exempts only its own line, never a neighbour", () => {
  // The marker lines are PINNED here so the only thing under test is scope: if the
  // marker leaked onto a neighbour, the live claim would pass; it must not.
  const live = "The single precondition is unverified.";
  const above = REPORT.replace("## 2. Threat model", `${HISTORICAL_MARKER}\n${live}\n\n## 2. Threat model`);
  assert.ok(
    reportContradictions(REGISTER, above, { pins: pinsWith(HISTORICAL_MARKER) }).some((v) => v.why === "REPORT_CALLS_SETTLED_PRECONDITION_UNKNOWN"),
    "a marker on the line above must not help",
  );
  const below = REPORT.replace("## 2. Threat model", `${live}\n${HISTORICAL_MARKER}\n\n## 2. Threat model`);
  assert.ok(
    reportContradictions(REGISTER, below, { pins: pinsWith(HISTORICAL_MARKER) }).some((v) => v.why === "REPORT_CALLS_SETTLED_PRECONDITION_UNKNOWN"),
    "a marker on the line below must not help",
  );
  const farLine = `${HISTORICAL_MARKER} quoted precondition unverified`;
  const far = REPORT.replace("## 2. Threat model", `${live}\n\n\n\n${farLine}\n\n## 2. Threat model`);
  assert.ok(
    reportContradictions(REGISTER, far, { pins: pinsWith(farLine) }).some((v) => v.why === "REPORT_CALLS_SETTLED_PRECONDITION_UNKNOWN"),
    "a marker four lines away must not help",
  );
});

test("a marker that covers nothing is itself a violation", () => {
  const idle = REPORT.replace("## 2. Threat model", `This sentence is perfectly ordinary. ${HISTORICAL_MARKER}\n\n## 2. Threat model`);
  const v = reportContradictions(REGISTER, idle);
  assert.ok(
    v.some((x) => x.why === "UNUSED_HISTORICAL_MARKER"),
    "an idle marker must fail, so markers cannot be scattered to pre-authorise future edits",
  );
});

test("the marker is refused on a line stating a current obligation", () => {
  const sneaky = `AUTH_SECRET is unverified and must be verified before release. ${HISTORICAL_MARKER}`;
  const injected = REPORT.replace("## 2. Threat model", `${sneaky}\n\n## 2. Threat model`);
  const v = reportContradictions(REGISTER, injected);
  assert.ok(
    v.some((x) => x.why === "HISTORICAL_MARKER_ON_CURRENT_OBLIGATION"),
    "a marker may quote a superseded sentence but never excuse a live verdict",
  );
  for (const rx of CURRENT_OBLIGATION) assert.ok(rx instanceof RegExp);
});

test("the report's own two historical quotations carry the marker and are the only ones", () => {
  const marked = REPORT.split("\n").filter((l) => l.includes(HISTORICAL_MARKER));
  assert.equal(marked.length, 2, "exactly the two S0-contradiction disclosures are marked");
  for (const line of marked) {
    assert.ok(
      hasExemptableHistoricalPhrase(line, new Set(["AUTH_SECRET", "HERMES_STORAGE_MODE", "JWT_ACCESS_SECRET"])),
      "each marked line must actually contain the quotation it covers",
    );
    assert.ok(!CURRENT_OBLIGATION.some((rx) => rx.test(line)), "and must not be a current obligation");
  }
  // the clamped risks' live verdict must never be marked
  const verdictLines = REPORT.split("\n").filter((l) => /observed not to hold in the/.test(l));
  assert.ok(verdictLines.length >= 1);
  for (const l of verdictLines) assert.ok(!l.includes(HISTORICAL_MARKER), "the current verdict is never marked");
});

// ──────── S1-R2-002: one validated block parser ─────────────────────────────

test("the report's block markers parse cleanly and every block is present", () => {
  const { violations, regions, allowed } = parseMarkdownBlocks(REGISTER, REPORT);
  assert.deepEqual(violations, []);
  assert.equal(regions.length, allowed.length, "every declared block appears exactly once");
  assert.deepEqual(regions.map((r) => r.name), allowed, "and in the renderer's own order");
  assert.ok(allowed.includes("findings"), "the finding tables are now a validated region too");
});

test("an unknown block name fails, closed or unterminated", () => {
  const closed = REPORT.replace("## 3. Attack-surface map",
    "<!-- S1-BLOCK:notes -->\nAUTH_SECRET has not been checked.\n<!-- /S1-BLOCK:notes -->\n\n## 3. Attack-surface map");
  assert.ok(parseMarkdownBlocks(REGISTER, closed).violations.some((v) => v.why === "UNKNOWN_BLOCK_NAME"));
  assert.ok(markdownBlockDrift(REGISTER, closed).some((v) => v.why === "UNKNOWN_BLOCK_NAME"));
  // and the contradiction scan refuses to run rather than silently blanking
  assert.ok(reportContradictions(REGISTER, closed).some((v) => v.why === "BLOCK_MARKERS_INVALID"));

  const open = REPORT.replace("## 3. Attack-surface map",
    "<!-- S1-BLOCK:notes -->\nAUTH_SECRET has not been checked.\n\n## 3. Attack-surface map");
  assert.ok(parseMarkdownBlocks(REGISTER, open).violations.some((v) => v.why === "UNKNOWN_BLOCK_NAME"));
});

test("an unterminated KNOWN block fails instead of blanking the rest of the document", () => {
  // The reviewer's worst case: one stray opening marker removed 871 of 998
  // narrative lines from the scan while every gate stayed silent.
  const stray = REPORT.replace("## 2. Threat model", "<!-- S1-BLOCK:summary -->\n\n## 2. Threat model");
  const v = parseMarkdownBlocks(REGISTER, stray).violations;
  // `summary` already appears earlier in the report, so a second opening is a duplicate — and only that
  assert.deepEqual(v.map((x) => x.why), ["DUPLICATE_BLOCK"], "a stray opening of a known name must be named for what it is");
  assert.ok(markdownBlockDrift(REGISTER, stray).some((x) => x.why === "DUPLICATE_BLOCK"));
  assert.throws(() => narrativeOnly(stray, REGISTER), /INVALID_BLOCK_MARKERS/);

  const tailOpen = `${REPORT}\n<!-- S1-BLOCK:summary -->\nAUTH_SECRET has not been checked.\n`;
  assert.deepEqual(parseMarkdownBlocks(REGISTER, tailOpen).violations.map((x) => x.why), ["DUPLICATE_BLOCK"], "an opening that runs to EOF must fail");
});

test("an orphan closing marker, a mismatched pair, a duplicate and a nest all fail", () => {
  const orphan = REPORT.replace("## 3. Attack-surface map", "<!-- /S1-BLOCK:summary -->\n\n## 3. Attack-surface map");
  assert.ok(parseMarkdownBlocks(REGISTER, orphan).violations.some((v) => v.why === "CLOSING_WITHOUT_OPENING"));

  const mismatched = REPORT.replace("<!-- /S1-BLOCK:calibration -->", "<!-- /S1-BLOCK:dominant -->");
  assert.ok(parseMarkdownBlocks(REGISTER, mismatched).violations.some((v) => v.why === "MISMATCHED_BLOCK_NAMES"));

  const duplicate = REPORT.replace("## 3. Attack-surface map",
    "<!-- S1-BLOCK:matrix -->\nx\n<!-- /S1-BLOCK:matrix -->\n\n## 3. Attack-surface map");
  assert.ok(parseMarkdownBlocks(REGISTER, duplicate).violations.some((v) => v.why === "DUPLICATE_BLOCK"));

  const nested = REPORT.replace(BLOCK_OPEN("dominant"), `${BLOCK_OPEN("dominant")}\n${BLOCK_OPEN("closure")}`);
  assert.ok(parseMarkdownBlocks(REGISTER, nested).violations.some((v) => v.why === "NESTED_BLOCK"));
});

test("reordering the blocks fails, and each invariant is asserted on its own", () => {
  const whole = (n) => `${BLOCK_OPEN(n)}\n${extractBlock(REPORT, n)}\n${BLOCK_CLOSE(n)}`;
  const a = whole("calibration");
  const b = whole("dominant");
  const swapped = REPORT.replace(a, "@@A@@").replace(b, a).replace("@@A@@", b);
  assert.notEqual(swapped, REPORT, "the swap must have happened or this proves nothing");
  // the parser alone names the reorder — not the drift comparison, not an accident
  assert.deepEqual(
    parseMarkdownBlocks(REGISTER, swapped).violations.map((v) => v.why),
    ["BLOCK_ORDER_DIFFERS"],
    "BLOCK_ORDER: reordering two generated blocks is reported, and reported only as an order violation",
  );
  assert.ok(markdownBlockDrift(REGISTER, swapped).some((v) => v.why === "BLOCK_ORDER_DIFFERS"), "and the drift gate reports it");

  // moving the CONTENT between intact markers is a different failure: drift in both blocks
  const ca = extractBlock(REPORT, "calibration");
  const cb = extractBlock(REPORT, "dominant");
  const contentSwap = REPORT.replace(ca, "@@A@@").replace(cb, ca).replace("@@A@@", cb);
  assert.deepEqual(parseMarkdownBlocks(REGISTER, contentSwap).violations, [], "the markers are still in order");
  const drift = markdownBlockDrift(REGISTER, contentSwap).filter((v) => v.why === "BLOCK_DRIFT").map((v) => v.block).sort();
  assert.deepEqual(drift, ["calibration", "dominant"]);
});

test("a known block whose CLOSING marker is missing is UNTERMINATED, named as such", () => {
  // the last block cannot be reported as nested (nothing follows it), so only the
  // unterminated check can name it — removing that check must fail this test
  const last = Object.keys(markdownBlocks(REGISTER)).at(-1);
  const stray = REPORT.replace(`\n${BLOCK_CLOSE(last)}`, "");
  assert.notEqual(stray, REPORT);
  assert.deepEqual(parseMarkdownBlocks(REGISTER, stray).violations.map((v) => v.why), ["UNTERMINATED_BLOCK"], "UNTERMINATED: a block with no closing marker is reported as unterminated");
  assert.ok(markdownBlockDrift(REGISTER, stray).some((v) => v.why === "UNTERMINATED_BLOCK" && v.block === last));
});

test("narrativeOnly keeps the line count and refuses an invalid marker set", () => {
  const narrative = narrativeOnly(REPORT, REGISTER);
  assert.equal(narrative.split("\n").length, REPORT.split("\n").length);
  assert.ok(!narrative.includes("| **Residual risk** |"), "the matrix is blanked");
  assert.ok(!narrative.includes("| `TOOL-03` |"), "the finding tables are blanked too");
  assert.ok(narrative.includes("## 2. Threat model"), "the narrative survives");
  assert.throws(() => narrativeOnly(REPORT), /requires the register/);
});

test("a one-byte edit inside a real block still fails the drift gate", () => {
  const first = markdownBlocks(REGISTER).findings.split("\n")[0];
  const tampered = REPORT.replace(first, `${first}.`);
  assert.notEqual(tampered, REPORT);
  assert.ok(markdownBlockDrift(REGISTER, tampered).some((v) => v.why === "BLOCK_DRIFT"));
});

// ──────── S1-R2-003: the unquoted secret assignment ─────────────────────────

test("the four shapes the reviewer planted are now all detected", () => {
  for (const sample of [
    "AUTH_SECRET=s3cr3tvaluethatislong",
    "password=hunter2hunter2hunter2",
    "api_key: abcdefghijklmnopqrst",
    "ADMIN_PASSWORD: correcthorsebatterystaple",
  ]) {
    assert.ok(assignedSecretHits(sample).length > 0, `${sample} must be detected`);
    assert.ok(secretShapeViolations(RAW, `${REPORT}\n${sample}`).length > 0, "and must fail the report gate");
    assert.ok(secretShapeViolations(renderedWith(sample), REPORT).length > 0, "and the register gate");
  }
});

test("the same credential is caught however it is dressed up", () => {
  const secret = "AUTH_SECRET=s3cr3tvaluethatislong";
  for (const [label, dressed] of [
    ["code span", `\`${secret}\``],
    ["fenced block", `\`\`\`\n${secret}\n\`\`\``],
    ["table cell", `| env | ${secret} |`],
    ["yaml-like", "  auth_secret: s3cr3tvaluethatislong"],
    ["env-like", "AUTH_SECRET=s3cr3tvaluethatislong # production"],
    ["spaces around =", "AUTH_SECRET = s3cr3tvaluethatislong"],
    ["spaces around :", "auth_secret :  s3cr3tvaluethatislong"],
    ["lowercase key", "auth_secret=s3cr3tvaluethatislong"],
    ["quoted", 'AUTH_SECRET="s3cr3tvaluethatislong"'],
    ["single-quoted", "AUTH_SECRET='s3cr3tvaluethatislong'"],
    ["beside the word example", `example only: ${secret}`],
    ["beside the word test", `test fixture ${secret}`],
    ["beside the word fixture", `fixture: ${secret}`],
  ]) {
    assert.ok(assignedSecretHits(dressed).length > 0, `${label} must be detected`);
  }
});

test("placeholders and evidence states pass — and only the documented, exact ones", () => {
  for (const benign of [
    "AUTH_SECRET=SET",
    "AUTH_SECRET=UNSET",
    "AUTH_SECRET=MISSING",
    "AUTH_SECRET=<redacted>",
    "AUTH_SECRET=<secret>",
    "AUTH_SECRET=${AUTH_SECRET}",
    "AUTH_SECRET=",
    "AUTH_SECRET=REDACTED",
    "AUTH_SECRET=PLACEHOLDER",
    "AUTH_SECRET=EXAMPLE",
    "AUTH_SECRET=redacted",
    "AUTH_SECRET: `SET`",
    'AUTH_SECRET="SET"',
    "JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}",
    "the owner has verified JWT_ACCESS_SECRET=SET",
    "password: ****",
    "| AUTH_SECRET=SET |",
  ]) {
    assert.deepEqual(assignedSecretHits(benign), [], `${benign} must pass`);
  }
  // the near-misses: a placeholder is the WHOLE value, never a prefix, suffix or truncation
  for (const unsafe of [
    "AUTH_SECRET=REDACTEDX",
    "AUTH_SECRET=SET_REAL_VALUE",
    "AUTH_SECRET=${X}realsecret",
    "AUTH_SECRET=${X",
    "AUTH_SECRET=<redacte",
    "AUTH_SECRET=$AUTH_SECRET",
    "api_key = <your-key>",
    "AUTH_SECRET=UNSETTLED",
  ]) {
    assert.ok(assignedSecretHits(unsafe).length > 0, `${unsafe} must NOT pass as a placeholder`);
  }
});

test("the weak-default policy is explicit, not accidental", () => {
  // The architecture inventory records `changeme` as a real weak default that
  // EXISTS in the compose files, and R-46's fourth criterion is about removing it.
  // Treating it as a secret VALUE would stop the register describing its own
  // finding, so it is allowed as a value — deliberately, and asserted here.
  assert.equal(ALLOWED_WEAK_DEFAULT, "changeme");
  assert.deepEqual(assignedSecretHits("REDIS_PASSWORD=changeme"), []);
  assert.ok(
    /weak default credential/i.test(JSON.stringify(REGISTER.risks.find((r) => r.riskId === "R-46"))),
    "and the register still names the weak default as a finding",
  );
});

test("a verdict token or a hash under a NON-sensitive key is not a credential; under a sensitive key it is", () => {
  for (const benign of [
    "ORIGIN_CONTROL_VERDICT: PUBLICLY_REACHABLE",
    "LOCK_UNIVERSE_SHA256 = db4bf4c9f3f662ee61dced5bfa63f78a55f17ad601cc4dc510ccfd278e224b9f",
    "SECRET_STATE: ABSENT_CONFIRMED",
    "TOKEN_POLICY: NOT_APPLICABLE",
    "max_tokens: 4096",
    "token_count=12345678",
    "password_policy: strict-enforcement",
    "secretary: abcdefghijkl",
    "tokenizer=abcdefghijkl",
  ]) {
    assert.deepEqual(assignedSecretHits(benign), [], `${benign} must pass`);
  }
  // S1-R3-003: shape is never a reason to look away once the KEY is sensitive
  for (const unsafe of [
    "AUTH_SECRET=3f2a9c1be45d7788a0c1d2e3f4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3b",
    "AUTH_SECRET=db4bf4c9f3f662ee61dced5bfa63f78a",
    "AUTH_SECRET=ABCDEFGHIJKLMNOP",
    "AUTH_SECRET=UPPER_SNAKE_VALUE",
    "secret: ABSENT_CONFIRMED",
    "token: NOT_APPLICABLE",
  ]) {
    assert.ok(assignedSecretHits(unsafe).length > 0, `${unsafe} must be detected`);
  }
  assert.deepEqual(secretShapeViolations(RAW, REPORT), [], "and the real deliverables are clean");
});

test("every declared shape class still fires, and the assigned class is no longer duplicated", () => {
  assert.equal(SECRET_SHAPES.length, 7, "the quoted-only assigned pattern was folded into assignedSecretHits");
  assert.ok(!SECRET_SHAPES.some((s) => s.name === "ASSIGNED_SECRET_VALUE"), "no overlapping duplicate");
  for (const [kind, sample] of Object.entries({
    PEM_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----",
    AWS_ACCESS_KEY_ID: `AKIA${"Q".repeat(16)}`,
    GITHUB_TOKEN: `ghp_${"a".repeat(36)}`,
    GITHUB_PAT_FINE_GRAINED: `github_pat_${"b".repeat(42)}`,
    SLACK_TOKEN: `xoxb-${"1".repeat(24)}`,
    JWT_THREE_PART: `eyJ${"a".repeat(20)}.${"b".repeat(20)}.${"c".repeat(20)}`,
    CONNECTION_STRING_WITH_CREDENTIAL: "postgresql://someuser:hunter2hunter2@db.internal:5432/app",
  })) {
    assert.ok(secretShapeHits(sample, "probe").some((h) => h.kind === kind), `${kind} must fire`);
  }
});

// ──────── S1-R2-004: no keyword gaming on the tool-gate method ──────────────

test("a criterion that merely mentions a keyword is refused", () => {
  for (const gamed of [
    "This criterion mentions the word gate but demands nothing at all.",
    "gate",
    "this is a gate criterion",
    "The gate is an interesting concept worth considering.",
    "A gate, broadly speaking, would be nice to have one day.",
  ]) {
    const reg = clone();
    riskIn(reg, "R-40").acceptanceCriteria = [gamed];
    assert.ok(
      verificationLinkageViolations(reg).length > 0,
      `${JSON.stringify(gamed.slice(0, 40))} must be refused`,
    );
  }
});

test("operational gate phrasings are accepted", () => {
  for (const real of [
    "The silence counters run as a gate in continuous integration.",
    "The gate rejects drift between the inventory and the tree.",
    "A deterministic gate fails the build when inventory changes.",
    "Guard helpers are registered by module provenance so a rename fails the gate.",
    "The checks all run on every pull request, with a documented triage path.",
    "A gate asserts that no handler reads a tenant identifier from the request.",
  ]) {
    const reg = clone();
    riskIn(reg, "R-40").acceptanceCriteria = [real];
    assert.deepEqual(
      verificationLinkageViolations(reg),
      [],
      `${JSON.stringify(real.slice(0, 44))} must be accepted`,
    );
  }
});

test("the register's own tool-gate criteria still pass, unchanged", () => {
  assert.deepEqual(verificationLinkageViolations(REGISTER), []);
  const gated = REGISTER.risks.filter((r) => r.score > 0 && r.verificationMethod === "DETERMINISTIC_TOOL_GATE");
  assert.ok(gated.length >= 8, `expected a real sample, got ${gated.length}`);
  for (const r of gated) {
    assert.ok(r.acceptanceCriteria.some((c) => criterionLinksMethod(c, "DETERMINISTIC_TOOL_GATE")), `${r.riskId}`);
  }
  assert.ok(!VERIFICATION_LINKAGE.DETERMINISTIC_TOOL_GATE.some((rx) => rx.source === "\\bgate\\b"), "the bare pattern is gone");
});

test("a wrong or unknown method still fails, and a keyword from another method does not help", () => {
  const wrong = clone();
  riskIn(wrong, "R-24").verificationMethod = "DETERMINISTIC_TOOL_GATE";
  assert.ok(verificationLinkageViolations(wrong).length > 0, "an external-vantage risk relabelled must fail");

  const unknown = clone();
  riskIn(unknown, "R-24").verificationMethod = "VIBES_BASED";
  assert.ok(verificationLinkageViolations(unknown).some((v) => v.why === "METHOD_HAS_NO_LINKAGE_PATTERN"));

  const crossed = clone();
  riskIn(crossed, "R-40").acceptanceCriteria = ["A fault-injection rehearsal shows the behaviour."];
  assert.ok(verificationLinkageViolations(crossed).length > 0, "a rehearsal phrase cannot satisfy a gate method");
});

// ──────── S1-R2-005: forbidden content over BOTH deliverables ───────────────

test("both deliverables are clean of absolute paths, date-times and commands", () => {
  assert.deepEqual(deliverableForbiddenViolations(RAW, REPORT), []);
});

test("an absolute path, a date-time or a command in the REPORT fails", () => {
  for (const [label, sample, kind] of [
    ["windows path", "see C:\\Users\\someone\\notes.txt", "WINDOWS_ABSOLUTE_PATH"],
    ["unix home", "see /home/ryan/notes.txt", "UNIX_USER_ABSOLUTE_PATH"],
    ["unc path", "see \\\\fileserver\\share", "UNC_PATH"],
    ["temp dir", "written to /tmp/scratch", "USER_PROFILE_DIRECTORY"],
    ["iso datetime", "observed 2026-10-11T15:38:34Z", "ISO_DATETIME"],
    ["raw docker command", "docker inspect --format '{{.Config.Env}}' hermes-web", "CONTAINER_OR_HOST_COMMAND"],
    ["imperative docker", "Run docker inspect on the container.", "IMPERATIVE_PRODUCTION_COMMAND"],
    ["remote shell", "ssh ops@host 'cat /etc/passwd'", "REMOTE_SHELL"],
  ]) {
    const v = deliverableForbiddenViolations(RAW, `${REPORT}\n${sample}`);
    assert.ok(v.some((x) => x.kind === kind), `${label} must fail as ${kind}`);
    const w = deliverableForbiddenViolations(renderedWith(sample), REPORT);
    assert.ok(w.some((x) => x.kind === kind), `${label} must also fail in the register`);
  }
});

test("legitimate content is not mistaken for a command or a path", () => {
  for (const benign of [
    "Docker DNATs both ports publicly.",
    "the Docker socket is not mounted",
    "`hermes_internal` is a plain bridge, not `internal: true`",
    "nginx binds 0.0.0.0:80 and 0.0.0.0:443",
    "docs/security/EDGE-ORIGIN-AND-CLIENT-IP.md §3",
    "src/lib/auth/session-store.ts",
    "the source lock was taken on 2026-10-10",
    "node scripts/security/s1/risk-register-check.mjs check",
    "npm run security:phase99:inventory:check",
  ]) {
    assert.deepEqual(
      deliverableForbiddenViolations("{}", benign),
      [],
      `${JSON.stringify(benign.slice(0, 48))} must pass`,
    );
  }
  // the clock-shaped port in the attack-surface map must survive
  assert.ok(REPORT.includes("0.0.0.0:80"), "the map still carries the port");
  assert.deepEqual(deliverableForbiddenViolations(RAW, REPORT), []);
});

// ──────── S1-R2-006: the disclosure ─────────────────────────────────────────

test("the report discloses which gates are consistency-only and why the scan is scoped", () => {
  assert.ok(/exits 13, 21 and 24 prove consistency and absence of drift, not external truth/i.test(REPORT));
  // the S1-R3 disclosures: what is exact, what is lexical, what is pinned, and what is deferred
  assert.ok(/compared with this document \*\*byte for\s+byte\*\*/i.test(REPORT), "the block comparison is stated as exact");
  assert.ok(/Exact-byte gates and semantic gates are different things/i.test(REPORT));
  assert.ok(/The marker is therefore \*pinned\*/i.test(REPORT), "the marker's real protection is stated");
  assert.ok(/an earlier version of this paragraph overstated it/i.test(REPORT), "and the earlier overclaim is retracted");
  assert.ok(/DEFERRED_TO_SECURITY_INTEGRATION_PHASE/.test(REPORT), "the CI wiring is disclosed as deferred");
  assert.ok(/Three codes are shared by two gates each/i.test(REPORT), "shared exit codes are declared, not hidden");
  assert.ok(/What the secret detector can and cannot see/i.test(REPORT));
  assert.ok(/source-universe closure/i.test(REPORT));
  assert.ok(/evidence-path check/i.test(REPORT));
  assert.ok(/does not mean any security claim has been observed at runtime/i.test(REPORT));
  assert.ok(/Why the contradiction scan reads only the hand-authored prose/i.test(REPORT));
  assert.ok(/This is not a hole:/i.test(REPORT), "the disclosure must not read as an excuse for a bypass");
  assert.ok(/one validated\s+parser decides what a generated region is/i.test(REPORT));
});

// ──────── the register is untouched by any of this ──────────────────────────

test("no risk datum moved during the checker hardening", () => {
  const c = counters(REGISTER);
  assert.equal(c.S1_RISKS_TOTAL, 64);
  assert.equal(c.S1_FINDINGS_TOTAL, 161);
  assert.equal(c.SEVERITY_CRITICAL, 0);
  assert.equal(c.SEVERITY_HIGH, 35);
  assert.equal(c.SEVERITY_MEDIUM, 17);
  assert.equal(c.SEVERITY_LOW, 1);
  assert.equal(c.SEVERITY_INFORMATIONAL, 11);
  assert.equal(c.STATE_ACTIVE_CONFIRMED, 24);
  assert.equal(c.STATE_LATENT_CONFIG_GUARDED, 4);
  assert.equal(c.STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN, 12);
  assert.equal(c.STATE_ASSURANCE_GAP, 10);
  assert.equal(c.STATE_POLICY_AMBIGUITY, 3);
  assert.equal(c.STATE_POSITIVE_CONTROL, 11);
  assert.equal(c.SEVERITY_CLAMPS_APPLIED, 2);
  assert.equal(c.FINDING_COVERAGE_PERCENT, 100);
  assert.equal(c.ORPHAN_FINDINGS, 0);
  assert.equal(c.LOCK_UNIVERSE_COUNT, 51);
  assert.equal(sha256Hex(lockUniverseString(REGISTER)), LOCK_UNIVERSE_SHA256);
  assert.equal(extractSourceUniverse().ids.size, 110);
  assert.equal(riskIn(REGISTER, "R-20").impactFactors.integrity, 3);
  assert.equal(riskIn(REGISTER, "R-26").likelihoodFactors.exploitability, 2);
  assert.ok(riskIn(REGISTER, "R-26").dependencies.includes("R-24"));
  assert.equal(riskIn(REGISTER, "R-52").score, 12);
  assert.ok(riskIn(REGISTER, "R-52").affectedAssets.includes("OT_GATEWAY_BOUNDARY"));
  const hist = calibration(REGISTER).histogram;
  assert.deepEqual(hist, { 4: 1, 6: 5, 8: 5, 9: 3, 10: 4, 12: 15, 15: 14, 16: 4, 20: 2 });
});

// ──────── every new predicate carries its own negative test ─────────────────

test("the block-marker pattern accepts only the exact comment form", () => {
  for (const good of [
    "<!-- S1-BLOCK:summary -->",
    "<!-- /S1-BLOCK:summary -->",
    "<!--S1-BLOCK:summary-->",
    "<!--  S1-BLOCK:summary  -->",
  ]) {
    assert.ok(BLOCK_MARKER_RX.test(good.trim()), `${good} must parse`);
  }
  for (const bad of [
    "<!-- S1-BLOCK summary -->",
    "<!-- S1BLOCK:summary -->",
    "text <!-- S1-BLOCK:summary -->",
    "<!-- S1-BLOCK:summary --> text",
    "<!-- S1-BLOCK:sum mary -->",
    "<!-- //S1-BLOCK:summary -->",
  ]) {
    assert.ok(!BLOCK_MARKER_RX.test(bad.trim()), `${bad} must NOT parse as a marker`);
  }
});

test("isPlaceholderValue is a whole-value test, not a substring test", () => {
  for (const v of ["SET", "set", "UNSET", "", "   ", "${X}", "${AUTH_SECRET}", "<redacted>", "<secret>", "****", "MISSING", "REDACTED", "PLACEHOLDER", "EXAMPLE", "changeme"]) {
    assert.ok(isPlaceholderValue(v), `${JSON.stringify(v)} is a placeholder`);
  }
  for (const v of ["SETsomethingelse", "unsetbutnotreally", "redactedish", "changemenow", "s3cr3tvalue", "$AUTH_SECRET", "<your-key>", "${X", "${X}tail", "REDACTEDX", "SET_REAL_VALUE", "your-secret"]) {
    assert.ok(!isPlaceholderValue(v), `${JSON.stringify(v)} is NOT a placeholder`);
  }
  assert.deepEqual([...PLACEHOLDER_VALUES], ["set", "unset", "missing", "redacted", "placeholder", "example"], "the allowlist is exactly the documented one");
  assert.ok(!PLACEHOLDER_VALUES.includes(ALLOWED_WEAK_DEFAULT), "the weak default is NOT a general placeholder");
  assert.ok(isPlaceholderValue(ALLOWED_WEAK_DEFAULT), "it is the single, separately declared exception");
});

test("reportForbiddenHits reports the line and the class, not just a boolean", () => {
  const hits = reportForbiddenHits("clean line\nobserved 2026-10-11T15:38:34Z\nclean again", "probe");
  // the date-time is also a clock time, so two classes name the same line
  assert.deepEqual(hits.map((h) => h.kind).sort(), ["CLOCK_TIME_HMS", "ISO_DATETIME"], "FORBIDDEN_CLASSES: both the clock time and the date-time are reported, by class");
  assert.ok(hits.every((h) => h.line === 2 && h.where === "probe"));
  assert.deepEqual(reportForbiddenHits("nothing to see here", "probe"), []);
  // every declared class must be reachable, or it is decoration
  for (const { name, rx } of REPORT_FORBIDDEN) {
    assert.ok(rx instanceof RegExp, `${name} must be a pattern`);
    assert.ok(!rx.global, `${name} must not be global, or lastIndex leaks between lines`);
  }
});

test("the finding tables are rendered from the register, not stored", () => {
  const rendered = renderFindingTables(REGISTER);
  assert.equal(rendered, markdownBlocks(REGISTER).findings, "the block and the renderer are the same text");
  assert.equal(extractBlock(REPORT, "findings"), rendered.trim(), "and the report carries exactly it");
  for (const f of REGISTER.findings) {
    assert.ok(rendered.includes(f.findingId), `${f.findingId} must appear in the tables`);
  }
});

// ════════ gates rebuilt after the THIRD independent review (S1-R3-001 … 009) ════
//
// The third review found that the second round of hardening fixed the four shapes
// it had been shown and left the commonest real form open. Every test below is a
// fresh mutation, and where a fixture stands for a real edit it reaches the
// deliverable by the real route (the renderer, JSON escaping) rather than being
// appended to the file.

// ──────── S1-R3-001: sensitive keys are judged by their whole name ───────────

/** The variable NAMES in the tracked example environment files. Only the name is read; the right-hand side is never captured. */
function exampleEnvNames() {
  const names = new Set();
  for (const f of [".env.example", ".env.production.example"]) {
    for (const line of readFileSync(join(REPO_ROOT, f), "utf8").split("\n")) {
      const m = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line);
      if (m) names.add(m[1]);
    }
  }
  return [...names].sort();
}

const UNSAFE_VALUE = "aB3dE5gH7jK9mN1pQ3sT5vW7y";

test("every sensitive variable name in the tracked example files is detected, bare and as a JSON key", () => {
  const names = exampleEnvNames();
  assert.ok(names.length > 20, `expected a wide set of example names, got ${names.length}`);
  const sensitive = names.filter((n) => isSensitiveKeyName(n));
  for (const must of [
    "ANTHROPIC_API_KEY", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "POSTGRES_PASSWORD", "HERMES_VOICE_SIGNING_SECRET",
    "DOCUMENT_CLEANUP_WORKER_TOKEN", "AUTH_SECRET", "JWT_SECRET", "NEXTAUTH_SECRET", "OPENAI_API_KEY", "REDIS_PASSWORD", "ADMIN_PASSWORD",
  ]) {
    assert.ok(sensitive.includes(must), `${must} is a real secret name and must be classified sensitive`);
  }
  for (const n of sensitive) {
    assert.ok(assignedSecretHits(`${n}=${UNSAFE_VALUE}`).length > 0, `${n}=… must be detected`);
    assert.ok(assignedSecretHits(`${n}="${UNSAFE_VALUE}"`).length > 0, `${n}="…" must be detected`);
    assert.ok(assignedSecretHits(`"${n}": "${UNSAFE_VALUE}"`).length > 0, `"${n}": "…" must be detected`);
    assert.deepEqual(assignedSecretHits(`${n}=SET`), [], `${n}=SET is an evidence state`);
  }
  // nothing that LOOKS credential-bearing may be left unclassified without a reviewed reason
  const lookalike = names.filter((n) => /SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|APIKEY|ACCESS_KEY|PRIVATE_KEY|SIGNING_KEY/.test(n) && !isSensitiveKeyName(n));
  assert.deepEqual(lookalike, [], "an example name that looks like a credential must be classified sensitive");
});

test("the eight named credentials fail", () => {
  for (const sample of [
    "JWT_ACCESS_SECRET=s3cr3tvaluethatislong",
    "JWT_REFRESH_SECRET=s3cr3tvaluethatislong",
    "POSTGRES_PASSWORD=hunter2hunter2hunter2",
    "ANTHROPIC_API_KEY=abcdefghijklmnopqrst",
    "HERMES_VOICE_SIGNING_SECRET=abcdefghijklmnopqrst",
    "INTERNAL_SERVICE_TOKEN=abcdefghijklmnopqrst",
    '"password": "hunter2hunter2hunter2"',
    '"AUTH_SECRET": "abcdefghijklmnopqrst"',
  ]) {
    assert.ok(assignedSecretHits(sample).length > 0, `${sample} must be detected as text`);
    assert.ok(secretShapeViolations(renderedWith(sample), REPORT).length > 0, `${sample} must fail the register gate`);
    assert.ok(secretShapeViolations(RAW, `${REPORT}\n${sample}`).length > 0, `${sample} must fail the report gate`);
  }
});

test("a key is sensitive by its final segment, whatever prefix or case it carries", () => {
  for (const k of [
    "SECRET", "password", "Passwd", "API_KEY", "apiKey", "APIKEY", "client_secret", "clientSecret", "ACCESS_KEY", "private-key",
    "TOKEN_SIGNING_KEY", "INTERNAL_SERVICE_TOKEN", "x-auth-token", "JWT_ACCESS_SECRET", "secret_key", "SESSION_SECRET_KEY",
  ]) {
    assert.ok(isSensitiveKeyName(k), `${k} is a credential name`);
  }
  for (const k of ["max_tokens", "token_count", "tokenizer", "secretary", "password_policy", "passwordHash", "TOKEN_EXPIRY", "key", "api", "ORIGIN_CONTROL_VERDICT", "monkey"]) {
    assert.ok(!isSensitiveKeyName(k), `${k} only resembles a credential name`);
  }
  assert.equal(normalizeKeyName("apiKey"), "api_key");
  assert.equal(normalizeKeyName("JWT-ACCESS-SECRET"), "jwt_access_secret");
  for (const f of SENSITIVE_KEY_FAMILIES) assert.ok(isSensitiveKeyName(f), `the family ${f} is itself sensitive`);
  assert.ok(Object.isFrozen(SENSITIVE_KEY_FAMILIES));
});

// ──────── S1-R3-002: the register is scanned decoded, structured and raw ─────

test("a quoted assignment inside a register STRING is detected after JSON escaping", () => {
  for (const [label, text] of [
    ["double-quoted", 'password="hunter2hunter2hunter2"'],
    ["colon, double-quoted", 'ADMIN_PASSWORD: "correcthorsebatterystaple"'],
    ["single-quoted", "password='hunter2hunter2hunter2'"],
    ["unquoted", "AUTH_SECRET=s3cr3tvaluethatislong"],
    ["prefixed, quoted", 'JWT_ACCESS_SECRET="s3cr3tvaluethatislong"'],
  ]) {
    const registerText = renderedWith(text);
    assert.ok(registerText.includes(JSON.stringify(text).slice(1, -1)), `${label}: the fixture reached the file JSON-escaped, by the renderer`);
    const hits = registerSecretHits(registerText);
    assert.ok(hits.some((h) => h.kind === "ASSIGNED_SECRET_VALUE"), `${label} must be detected in the register`);
    assert.ok(secretShapeViolations(registerText, REPORT).length > 0, `${label} must fail the gate`);
  }
});

test("a sensitive JSON PROPERTY is detected by its own name; a placeholder value passes", () => {
  const reg = clone();
  riskIn(reg, "R-04").credentials = { password: "hunter2hunter2hunter2" };
  const hits = registerSecretHits(render(reg));
  assert.ok(hits.some((h) => h.level === "STRUCTURED" && h.key === "password" && h.path === "$.risks[3].credentials.password"), "the path is reported deterministically");

  const placeholder = clone();
  riskIn(placeholder, "R-04").credentials = { password: "SET", api_key: "<redacted>", token: "${TOKEN}", client_secret: "" };
  assert.deepEqual(registerSecretHits(render(placeholder)), []);

  const arrayValue = clone();
  riskIn(arrayValue, "R-04").credentials = { token: ["SET", "abcdefghijklmnop"] };
  const ah = registerSecretHits(render(arrayValue));
  assert.equal(ah.length, 1, "only the non-placeholder element is a finding");
  assert.equal(ah[0].path, "$.risks[3].credentials.token[1]");
});

test("nested objects, nested arrays and several string leaves are all walked", () => {
  const reg = clone();
  riskIn(reg, "R-04").nested = { a: [{ b: ["fine", "AUTH_SECRET=nestedsecretvalue1"] }, "ok"], c: { d: 'JWT_REFRESH_SECRET="another-nested-secret"' } };
  const hits = registerSecretHits(render(reg));
  assert.deepEqual(
    hits.map((h) => h.path).sort(),
    ["$.risks[3].nested.a[0].b[1]", "$.risks[3].nested.c.d"],
    "both leaves, at their exact paths",
  );
});

test("one credential is one finding, however many levels see it", () => {
  const registerText = renderedWith("AUTH_SECRET=s3cr3tvaluethatislong");
  const hits = registerSecretHits(registerText);
  assert.equal(hits.length, 1, "decoded and raw scans of the same secret are one finding");
  assert.equal(hits[0].level, "DECODED", "and the level that carries a path wins");
  assert.ok(hits[0].path.startsWith("$.risks["));
  assert.ok(!JSON.stringify(hits).includes("s3cr3tvaluethatislong"), "a finding never echoes the value");
  assert.equal(registerSecretHits(registerText)[0].id, hits[0].id, "the identity is stable across runs");
});

test("a register that does not parse fails closed, and the raw text is still scanned", () => {
  const broken = `${RAW}\nAUTH_SECRET=s3cr3tvaluethatislong`;
  const hits = registerSecretHits(broken);
  assert.ok(hits.some((h) => h.kind === "REGISTER_JSON_UNPARSEABLE"));
  assert.ok(hits.some((h) => h.kind === "ASSIGNED_SECRET_VALUE"), "the raw scan still runs");
  assert.ok(secretShapeViolations(broken, REPORT).length > 0);
  assert.ok(registerSecretHits("").some((h) => h.kind === "REGISTER_JSON_UNPARSEABLE"));
});

test("the JSON walker is deterministic and cannot be sent round in a circle", () => {
  const loop = { a: "x", child: {} };
  loop.child.back = loop;
  loop.child.token = "abcdefghijklmnop";
  const seen = [];
  walkJsonStrings(loop, (path, key, value) => seen.push([path, key, value]));
  assert.deepEqual(seen, [["$.a", null, "x"], ["$.child.token", "token", "abcdefghijklmnop"], ["$.child.token", null, "abcdefghijklmnop"]]);
  const again = [];
  walkJsonStrings(loop, (path, key, value) => again.push([path, key, value]));
  assert.deepEqual(again, seen, "the same walk twice gives the same sequence");
  // S1-FA-02: deep is walked to the leaf; past the budget the walk says so instead of stopping quietly
  let deep = "leaf";
  for (let i = 0; i < 200; i += 1) deep = { n: deep };
  const leaves = [];
  assert.equal(walkJsonStrings(deep, (p, k, v) => leaves.push(v)), null, "a deep value under the budget is walked completely");
  assert.deepEqual(leaves, ["leaf"], "and its leaf is visited");
  let deeper = "leaf";
  for (let i = 0; i < 20000; i += 1) deeper = { n: deeper };
  const stopped = walkJsonStrings(deeper, () => undefined);
  assert.equal(stopped?.why, "STRUCTURE_LIMIT_EXCEEDED", "past the budget the walk returns a violation, never a silent stop or a crash");
});

test("the live register has no sensitive property and no credential in any decoded string", () => {
  assert.deepEqual(registerSecretHits(RAW), []);
});

// ──────── S1-R3-003: no shape is a reason to look away ──────────────────────

test("under a sensitive key every non-placeholder value is a credential", () => {
  for (const sample of [
    `AUTH_SECRET=${"3f2a9c1be45d7788a0c1d2e3f4b5a697".repeat(2)}`,
    "AUTH_SECRET=ABCDEFGHIJKLMNOP",
    "AUTH_SECRET=UPPER_SNAKE_VALUE",
    "AUTH_SECRET=${X}realsecret",
    "AUTH_SECRET=${X",
    "AUTH_SECRET=abc;defghijklmnop",
    "AUTH_SECRET=abc|defghijklmnop",
    "AUTH_SECRET=abc,defghijklmnop",
    "AUTH_SECRET=abc*defghijklmnop",
    "AUTH_SECRET=abc)defghijklmnop",
    "AUTH_SECRET=abc`defghijklmnop",
    "AUTH_SECRET=abc",
    'AUTH_SECRET="abc"',
    `AUTH_SECRET="it's-a-long-password-1"`,
    `AUTH_SECRET='say "hi" to the long password'`,
    'AUTH_SECRET="unclosedvaluehere',
    "AUTH_SECRET='unclosed",
    'AUTH_SECRET="',
    "AUTH_SECRET=s3cr3t#valuethatislong",
  ]) {
    assert.ok(assignedSecretHits(sample).length > 0, `${sample} must fail`);
  }
});

test("a comment boundary acts only OUTSIDE a quote", () => {
  const bare = assignedSecretHits("AUTH_SECRET=s3cr3t # production")[0];
  assert.ok(bare, "the bare value is read up to the comment");
  const quoted = assignedSecretHits('AUTH_SECRET="s3cr3t # still the value"')[0];
  assert.ok(quoted, "inside quotes a # belongs to the value");
  assert.equal(quoted.form, "QUOTED");
  assert.deepEqual(assignedSecretHits('AUTH_SECRET="SET" # production'), [], "a placeholder followed by a comment is still a placeholder");
});

test("the exact placeholders pass, case-insensitively and as a whole", () => {
  for (const ok of ["SET", "set", "UNSET", "Missing", "REDACTED", "redacted", "PLACEHOLDER", "EXAMPLE", "<redacted>", "<SECRET>", "${AUTH_SECRET}", "${A_1}", ""]) {
    assert.deepEqual(assignedSecretHits(`AUTH_SECRET=${ok}`), [], `${JSON.stringify(ok)} is a placeholder`);
    assert.deepEqual(assignedSecretHits(`"AUTH_SECRET": "${ok}"`).filter((h) => h.form === "QUOTED"), [], `${JSON.stringify(ok)} as a JSON value`);
  }
  for (const no of ["REDACTEDX", "xREDACTED", "SET_REAL_VALUE", "UNSETX", "MISSING1", "EXAMPLES", "${a-b}", "${}", "$AUTH_SECRET", "<redacted", "<redacted>x", "<secret >", "${A}${B}"]) {
    assert.ok(assignedSecretHits(`AUTH_SECRET=${no}`).length > 0, `${no} is not a placeholder`);
  }
});

// ──────── S1-R3-005: the historical marker is pinned ────────────────────────

test("the live report carries exactly the pinned markers, and the pin lives in the checker", () => {
  assert.equal(HISTORICAL_MARKER_PINS_VERSION, "s1-hm-1");
  assert.equal(HISTORICAL_MARKER_PINS.count, 2);
  assert.equal(HISTORICAL_MARKER_PINS.lineSha256.length, 2);
  const marked = REPORT.split("\n").filter((l) => l.includes(HISTORICAL_MARKER));
  assert.equal(marked.length, HISTORICAL_MARKER_PINS.count, "the actual count");
  assert.deepEqual(
    marked.map(lineDigest).sort(),
    [...HISTORICAL_MARKER_PINS.lineSha256].sort(),
    "each marked line hashes to a pinned value, computed here independently",
  );
  assert.deepEqual(historicalMarkerPinViolations(REPORT), []);
  assert.ok(Object.isFrozen(HISTORICAL_MARKER_PINS) && Object.isFrozen(HISTORICAL_MARKER_PINS.lineSha256));
});

test("a third marker, a removed marker, an edited line and a look-alike are each refused", () => {
  const ln = REPORT.split("\n").filter((l) => l.includes(HISTORICAL_MARKER));
  const whys = (md) => historicalMarkerPinViolations(md).map((v) => v.why);

  const third = REPORT.replace("## 2. Threat model", `A third quotation, superseded. ${HISTORICAL_MARKER}\n\n## 2. Threat model`);
  assert.ok(whys(third).includes("MARKER_COUNT_MISMATCH"), "PIN_COUNT: a third historical marker is refused by the pinned count");
  assert.ok(whys(third).includes("MARKER_LINE_NOT_PINNED"));

  const removed = REPORT.replace(ln[0], ln[0].replace(HISTORICAL_MARKER, "").trimEnd());
  assert.notEqual(removed, REPORT);
  assert.ok(whys(removed).includes("MARKER_COUNT_MISMATCH"));
  assert.ok(whys(removed).includes("PINNED_MARKER_LINE_MISSING_OR_EDITED"), "PIN_DIGEST: a pinned marked line that was removed or edited is refused");

  const edited = REPORT.replace(ln[1], ln[1].replace("precondition", "condition"));
  assert.notEqual(edited, REPORT);
  assert.ok(whys(edited).includes("MARKER_LINE_NOT_PINNED"));
  assert.ok(whys(edited).includes("PINNED_MARKER_LINE_MISSING_OR_EDITED"));

  const doubled = REPORT.replace(ln[0], `${ln[0]}\n${ln[0]}`);
  assert.ok(whys(doubled).includes("PINNED_MARKER_LINE_DUPLICATED"));

  const twoOnALine = REPORT.replace(ln[0], `${ln[0]} ${HISTORICAL_MARKER}`);
  assert.ok(whys(twoOnALine).includes("MULTIPLE_MARKERS_ON_ONE_LINE"), "PIN_ONE_PER_LINE: two markers on one line are refused");
});

test("a marker on a live claim is refused however the claim is phrased", () => {
  for (const [label, text] of [
    ["plain present tense", "AUTH_SECRET is currently unverified."],
    ["imperative", "Please verify AUTH_SECRET, which remains unverified."],
    ["requires verification", "AUTH_SECRET is unverified and requires verification before go-live."],
    ["awaits confirmation", "AUTH_SECRET is unconfirmed and awaits owner confirmation."],
    ["must verify", "AUTH_SECRET is unverified and we must verify it before release."],
    ["historical then live", "Revision 1 said AUTH_SECRET was unverified. AUTH_SECRET is currently unverified."],
  ]) {
    const md = REPORT.replace("## 2. Threat model", `${text} ${HISTORICAL_MARKER}\n\n## 2. Threat model`);
    const v = reportContradictions(REGISTER, md);
    assert.ok(v.some((x) => x.why === "MARKER_LINE_NOT_PINNED"), `${label}: the marker cannot excuse a line nobody pinned`);
    assert.ok(v.some((x) => x.why === "MARKER_COUNT_MISMATCH"), `${label}: and the count moved`);
  }
});

test("a marker disguised by whitespace or Unicode neither exempts nor goes unnoticed", () => {
  for (const [label, marker] of [
    ["lower case", "<!-- s1-historical-superseded -->"],
    ["no spaces", "<!--S1-HISTORICAL-SUPERSEDED-->"],
    ["zero-width space", "<!-- S1-HISTORICAL\u200b-SUPERSEDED -->"],
    ["soft hyphen", "<!-- S1-HISTORICAL\u00ad-SUPERSEDED -->"],
    ["full-width letters", "<!-- ＳＩ－ＨＩＳＴＯＲＩＣＡＬ－ＳＵＰＥＲＳＥＤＥＤ -->"],
    ["non-breaking space", "<!--\u00a0S1-HISTORICAL-SUPERSEDED\u00a0-->"],
  ]) {
    const live = "The single precondition is unverified.";
    const md = REPORT.replace("## 2. Threat model", `${live} ${marker}\n\n## 2. Threat model`);
    const v = reportContradictions(REGISTER, md);
    assert.ok(v.some((x) => x.why === "REPORT_CALLS_SETTLED_PRECONDITION_UNKNOWN"), `${label}: the live claim is still read as live`);
  }
  const lookalike = REPORT.replace("## 2. Threat model", "Quoted. <!-- s1-historical-superseded -->\n\n## 2. Threat model");
  assert.ok(historicalMarkerPinViolations(lookalike).some((v) => v.why === "MARKER_LOOKALIKE"), "a look-alike is reported as one");
  assert.equal(normalizeMarkerLine("  a \t b\u00a0\n c  "), "a b c", "only whitespace is normalised");
  assert.notEqual(lineDigest("a\u200bb"), lineDigest("ab"), "a hidden character changes the digest");
});

// ──────── S1-R3-006: every verification method demands an operational phrase ─

const METHOD_PROBES = {
  SOURCE_REVIEW: {
    reject: ["Source review is a phrase.", "source review", "declares", "The sky declares nothing.", "is read", "Nothing is read.", "Isolation is not established by reading anything.", "comments"],
    accept: ["Isolation is established by reading the key derivation.", "Each of the five is examined and its result recorded.", "The two comments are corrected to state the real failure mode.", "The proxy declares the edge provider's ranges as trusted."],
  },
  AUTOMATED_TEST: {
    reject: ["A test of patience.", "test", "in a test", "No work happens in a test.", "A test would be nice to have one day.", "Nothing is checked with a test.", "This mentions a test."],
    accept: ["A test asserts that the refusal is returned.", "The refusal is covered, with a test per handler.", "Regression tests run in continuous integration so a reintroduction is seen.", "A negative test proves the detection."],
  },
  DETERMINISTIC_TOOL_GATE: {
    reject: ["gate", "This is a gate criterion.", "Nothing blocks the build.", "The gate never fails the build.", "A gate is an interesting idea.", "The team walked through the gate.", "It would be good if a gate failed the build."],
    accept: ["The silence counters run as a gate in continuous integration.", "A gate asserts the count equals the tool's output.", "The check fails the build on a mismatch.", "The inventory is tracked against the committed baseline."],
  },
  FAULT_INJECTION_REHEARSAL: {
    reject: ["A rehearsal dinner.", "rehearsal", "no rehearsal is planned", "The rehearsal room is booked.", "Nothing is rehearsed here."],
    accept: ["A rehearsal proves the application still works under the restricted role.", "It is demonstrated by a fault-injection rehearsal with the database made unavailable.", "Each runbook is rehearsed once and corrected."],
  },
  OWNER_READ_ONLY_PRODUCTION_CHECK: {
    reject: ["read-only check", "counts only", "An owner is a person.", "The owner never runs a check."],
    accept: ["An owner read-only production check records whether the variable is set, as counts only."],
  },
  EXTERNAL_VANTAGE_OBSERVATION: {
    reject: ["observation", "This mentions an observation.", "vantage", "Nobody has a vantage.", "The observation deck is closed."],
    accept: ["The closure is re-verified from an independent external vantage.", "The header is verified present on a response from the edge and on a direct origin response.", "Any check uses repeated observations over time from more than one vantage."],
  },
  OWNER_POLICY_STATEMENT: {
    reject: ["is recorded", "Nothing is recorded anywhere.", "The weather is recorded.", "No decision is recorded on whether anything matters.", "owner"],
    accept: ["The owner records a decision on each question.", "A decision is recorded on whether intra-cluster encryption is adopted.", "The residual is accepted in writing."],
  },
  NOT_YET_VERIFIABLE: {
    reject: ["not yet verifiable", "Verifiability is a word."],
    accept: ["The claim is not yet verifiable because the surface has not been read."],
  },
};

test("every verification method has a real operational positive and a real negative", () => {
  assert.deepEqual(Object.keys(METHOD_PROBES).sort(), [...VERIFICATION_METHODS].sort(), "no method is left unprobed");
  for (const m of VERIFICATION_METHODS) {
    assert.ok(METHOD_PROBES[m].reject.length >= 2, `${m} needs negatives`);
    assert.ok(METHOD_PROBES[m].accept.length >= 1, `${m} needs a positive`);
    for (const c of METHOD_PROBES[m].reject) assert.equal(criterionLinksMethod(c, m), false, `${m} must reject ${JSON.stringify(c)}`);
    for (const c of METHOD_PROBES[m].accept) assert.equal(criterionLinksMethod(c, m), true, `${m} must accept ${JSON.stringify(c)}`);
  }
});

test("a method's phrase cannot satisfy a different method", () => {
  for (const m of VERIFICATION_METHODS) {
    for (const other of VERIFICATION_METHODS) {
      if (other === m) continue;
      for (const c of METHOD_PROBES[other].accept) {
        // a phrase may legitimately belong to two methods only if it is literally in both tables
        const inBoth = METHOD_PROBES[m].accept.includes(c);
        if (!inBoth) assert.equal(criterionLinksMethod(c, m), false, `${JSON.stringify(c)} belongs to ${other}, not ${m}`);
      }
    }
  }
});

test("linkage is enforced through the register for EVERY method, not just the gate method", () => {
  const byMethod = new Map();
  for (const r of REGISTER.risks) if (r.score > 0) byMethod.set(r.verificationMethod, [...(byMethod.get(r.verificationMethod) ?? []), r.riskId]);
  assert.ok(byMethod.size >= 7, "the register exercises seven distinct methods");
  for (const [method, ids] of byMethod) {
    const reg = clone();
    riskIn(reg, ids[0]).acceptanceCriteria = [METHOD_PROBES[method].reject[0]];
    assert.ok(
      verificationLinkageViolations(reg).some((v) => v.riskId === ids[0] && v.why === "NO_CRITERION_NAMES_THE_DECLARED_METHOD"),
      `${method}: a bare keyword must not link ${ids[0]}`,
    );
    const ok = clone();
    riskIn(ok, ids[0]).acceptanceCriteria = [METHOD_PROBES[method].accept[0]];
    assert.deepEqual(verificationLinkageViolations(ok), [], `${method}: a real phrase links ${ids[0]}`);
  }
});

test("the linkage patterns are generic: no pattern names a risk, and the live criteria link by their own words", () => {
  for (const pats of Object.values(VERIFICATION_LINKAGE)) {
    for (const rx of pats) assert.equal(/\bR-\d+/.test(rx.source), false, `${rx} must not name a risk`);
  }
  for (const r of REGISTER.risks.filter((x) => x.score > 0)) {
    const linking = r.acceptanceCriteria.filter((c) => criterionLinksMethod(c, r.verificationMethod));
    assert.ok(linking.length >= 1, `${r.riskId} links ${r.verificationMethod} by an operational phrase`);
  }
});

test("a negated or hedged sentence is not evidence of the method, but a negation elsewhere in the sentence is harmless", () => {
  assert.equal(criterionLinksMethod("Nothing blocks the build.", "DETERMINISTIC_TOOL_GATE"), false);
  assert.equal(criterionLinksMethod("The gate never fails the build.", "DETERMINISTIC_TOOL_GATE"), false);
  assert.equal(criterionLinksMethod("Ideally a test asserts the refusal, someday.", "AUTOMATED_TEST"), false, "LINKAGE_HEDGE: a hedged sentence is not evidence of the method");
  // negation that belongs to the CONTENT of the assertion does not withdraw it
  assert.equal(criterionLinksMethod("A test asserts that a handler does not read a tenant identifier from the request.", "AUTOMATED_TEST"), true);
  assert.equal(criterionLinksMethod("The allow-list cannot be resolved, with a test that asserts zero rows.", "AUTOMATED_TEST"), true);
});

// ──────── S1-R3-007: the report is no weaker than the register ───────────────

const FORBIDDEN_FAMILIES = [
  ["ISO date-time", "observed 2026-10-11T15:38:34Z", "ISO_DATETIME"],
  ["bare HH:MM:SS", "it happened at 15:38:34 during the run", "CLOCK_TIME_HMS"],
  ["Windows drive path", "see C:\\Users\\someone\\notes.txt", "WINDOWS_ABSOLUTE_PATH"],
  ["/home path", "see /home/ryan/notes.txt", "UNIX_USER_ABSOLUTE_PATH"],
  ["/root path", "see /root/.ssh/id_rsa", "UNIX_USER_ABSOLUTE_PATH"],
  ["/etc path", "edit /etc/nginx/nginx.conf", "UNIX_SYSTEM_ABSOLUTE_PATH"],
  ["/var/lib path", "data in /var/lib/postgresql/data", "UNIX_SYSTEM_ABSOLUTE_PATH"],
  ["/opt path", "installed in /opt/hermes/app", "UNIX_SYSTEM_ABSOLUTE_PATH"],
  ["/srv path", "served from /srv/www/site", "UNIX_SYSTEM_ABSOLUTE_PATH"],
  ["curl", "curl -I https://www.example.org", "NETWORK_OR_PRIVILEGE_COMMAND"],
  ["wget", "wget https://www.example.org/file", "NETWORK_OR_PRIVILEGE_COMMAND"],
  ["sudo", "sudo ufw status verbose", "NETWORK_OR_PRIVILEGE_COMMAND"],
  ["nginx -T", "nginx -T", "NETWORK_OR_PRIVILEGE_COMMAND"],
  ["openssl", "openssl s_client -connect host:443", "NETWORK_OR_PRIVILEGE_COMMAND"],
  ["nc", "nc -vz host 443", "NETWORK_OR_PRIVILEGE_COMMAND"],
  ["netcat", "netcat -l 4444", "NETWORK_OR_PRIVILEGE_COMMAND"],
  ["ssh", "ssh ops@host 'ls'", "REMOTE_SHELL"],
  ["scp", "scp archive.tar ops@host:/backup", "REMOTE_SHELL"],
  ["docker", "docker inspect --format x web", "CONTAINER_OR_HOST_COMMAND"],
  ["docker-compose", "docker-compose up -d", "CONTAINER_OR_HOST_COMMAND"],
  ["docker compose", "docker compose logs web", "CONTAINER_OR_HOST_COMMAND"],
  ["kubectl", "kubectl get pods -n prod", "CONTAINER_OR_HOST_COMMAND"],
  ["systemctl", "systemctl status nginx", "CONTAINER_OR_HOST_COMMAND"],
  ["imperative", "Use docker inspect to confirm the value.", "IMPERATIVE_PRODUCTION_COMMAND"],
];

test("every forbidden family is caught in the report AND the register, in prose, inline code, a fence and a table cell", () => {
  for (const [label, sample, kind] of FORBIDDEN_FAMILIES) {
    for (const [shape, dressed] of [
      ["prose", sample],
      ["inline code", `\`${sample}\``],
      ["fenced block", `\`\`\`\n${sample}\n\`\`\``],
      ["table cell", `| step | ${sample} |`],
    ]) {
      assert.ok(reportForbiddenHits(dressed, "probe").some((h) => h.kind === kind), `${label} (${shape}) must be caught as ${kind} in the report`);
      assert.ok(deliverableForbiddenViolations(renderedWith(dressed), REPORT).some((h) => h.kind === kind), `${label} (${shape}) must be caught in the register`);
      assert.ok(deliverableForbiddenViolations(RAW, `${REPORT}\n${dressed}`).some((h) => h.kind === kind), `${label} (${shape}) must be caught in the report body`);
    }
  }
});

test("descriptive and legitimate content still passes in both deliverables", () => {
  for (const benign of [
    "nginx binds 0.0.0.0:80 and 0.0.0.0:443",
    "Docker DNATs both ports publicly.",
    "the docker socket is not mounted",
    "nginx permits 50 MB per request",
    "docs/security/EDGE-ORIGIN-AND-CLIENT-IP.md §3",
    "src/lib/auth/session-store.ts",
    "the file is /etc-free and lives under etc/ in the repository",
    "the source lock was taken on 2026-10-10",
    "histogram bucket 12:15 holds fourteen risks",
    "a curl-like client is simulated",
    "node scripts/security/s1/risk-register-check.mjs check",
  ]) {
    assert.deepEqual(reportForbiddenHits(benign, "probe"), [], `${JSON.stringify(benign)} must pass`);
  }
  assert.deepEqual(deliverableForbiddenViolations(RAW, REPORT), []);
});

test("the report rule table is a superset of the register's older absolute-path and clock rules", () => {
  // Parity, stated as a test: whatever the register's own gate (exit 11) refuses as a
  // path or an operational time, the shared table also refuses, except the bare HH:MM
  // that cannot be banned because 0.0.0.0:80 is a port.
  for (const sample of ["C:\\Users\\x\\y", "E:/hermes/src", "/home/ryan/x", "/Users/ryan/x", "\\\\fileserver\\share", "AppData", "/tmp/scratch", "2026-10-11T15:38:34Z", "15:38:34"]) {
    assert.ok(reportForbiddenHits(sample, "probe").length > 0, `${sample} is refused by the shared table`);
  }
  assert.deepEqual(reportForbiddenHits("0.0.0.0:80", "probe"), []);
});

// ──────── S1-R3-008: figures in the narrative are derived ────────────────────

test("the live narrative carries only derived figures", () => {
  assert.deepEqual(narrativeFactViolations(REGISTER, REPORT), []);
  assert.equal(FACT_MARKER_VERSION, "s1-fact-1");
  const markers = REPORT.match(/<!-- S1-FACT:/g) ?? [];
  assert.ok(markers.length >= 20, `expected the prose counts to be marked, got ${markers.length}`);
});

test("the two figures that went stale are caught, in both shapes", () => {
  const stale160 = REPORT.replace("<!-- S1-FACT:S1_FINDINGS_TOTAL -->161<!-- /S1-FACT --> findings carries", "<!-- S1-FACT:S1_FINDINGS_TOTAL -->160<!-- /S1-FACT --> findings carries");
  assert.notEqual(stale160, REPORT, "the anchor must exist");
  assert.ok(
    narrativeFactViolations(REGISTER, stale160).some((v) => v.why === "FACT_DIFFERS" && v.key === "S1_FINDINGS_TOTAL" && v.written === "160" && v.derived === "161"),
    "FACT_DIFFERS: a marked figure that no longer matches the register is refused, with both values named",
  );

  const staleWord = REPORT.replace(
    "<!-- S1-FACT:STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN:W -->Twelve<!-- /S1-FACT --> risks are `CODE_CONFIRMED_RUNTIME_UNPROVEN`",
    "<!-- S1-FACT:STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN:W -->Fourteen<!-- /S1-FACT --> risks are `CODE_CONFIRMED_RUNTIME_UNPROVEN`",
  );
  assert.notEqual(staleWord, REPORT);
  assert.ok(narrativeFactViolations(REGISTER, staleWord).some((v) => v.why === "FACT_DIFFERS" && v.written === "Fourteen" && v.derived === "Twelve"));

  // the unmarked originals
  const bare160 = REPORT.replace("<!-- S1-FACT:S1_FINDINGS_TOTAL -->161<!-- /S1-FACT --> findings carries", "160 findings carries");
  assert.ok(narrativeFactViolations(REGISTER, bare160).some((v) => v.why === "UNMARKED_NARRATIVE_FACT"), "FACT_UNMARKED: a figure typed into the prose without a marker is refused");
  const bareWord = REPORT.replace(
    "<!-- S1-FACT:STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN:W -->Twelve<!-- /S1-FACT --> risks are `CODE_CONFIRMED_RUNTIME_UNPROVEN`",
    "Fourteen risks are `CODE_CONFIRMED_RUNTIME_UNPROVEN`",
  );
  assert.ok(narrativeFactViolations(REGISTER, bareWord).some((v) => v.why === "UNMARKED_NARRATIVE_FACT"));
});

test("a new count typed into the narrative without a marker is refused, and a malformed marker is too", () => {
  const typed = REPORT.replace("## 2. Threat model", "There are 99 findings in the register.\n\n## 2. Threat model");
  assert.ok(narrativeFactViolations(REGISTER, typed).some((v) => v.why === "UNMARKED_NARRATIVE_FACT"));
  const word = REPORT.replace("## 2. Threat model", "Nineteen clamps were applied.\n\n## 2. Threat model");
  assert.ok(narrativeFactViolations(REGISTER, word).some((v) => v.why === "UNMARKED_NARRATIVE_FACT"));

  const unknown = REPORT.replace("## 2. Threat model", "Some <!-- S1-FACT:NO_SUCH_FACT -->5<!-- /S1-FACT --> things.\n\n## 2. Threat model");
  assert.ok(narrativeFactViolations(REGISTER, unknown).some((v) => v.why === "UNKNOWN_FACT_KEY"), "FACT_UNKNOWN_KEY: a marker naming no derived figure is refused");
  const open = REPORT.replace("## 2. Threat model", "Some <!-- S1-FACT:SEVERITY_HIGH -->35 things.\n\n## 2. Threat model");
  assert.ok(narrativeFactViolations(REGISTER, open).some((v) => v.why === "MALFORMED_FACT_MARKER"), "FACT_MALFORMED: an unclosed fact marker is refused");
  const stray = REPORT.replace("## 2. Threat model", "Some 35 things <!-- /S1-FACT -->.\n\n## 2. Threat model");
  assert.ok(narrativeFactViolations(REGISTER, stray).some((v) => v.why === "MALFORMED_FACT_MARKER"));
  // things that are not counts of the counted nouns are left alone
  const harmless = REPORT.replace("## 2. Threat model", "See section 10.3 and R-05; one risk at a time, 59 privileged operations.\n\n## 2. Threat model");
  assert.deepEqual(narrativeFactViolations(REGISTER, harmless), []);
});

test("the facts a marker may name cover every figure the review required", () => {
  const f = narrativeFacts(REGISTER);
  assert.equal(f.S1_RISKS_TOTAL, 64);
  assert.equal(f.S1_FINDINGS_TOTAL, 161);
  assert.equal(f.SEVERITY_HIGH, 35);
  assert.equal(f.STATE_CODE_CONFIRMED_RUNTIME_UNPROVEN, 12);
  assert.equal(f.SEVERITY_CLAMPS_APPLIED, 2);
  assert.equal(f.LOCK_UNIVERSE_COUNT, 51);
  assert.equal(f.SOURCE_UNIVERSE_COUNT, 110);
  assert.equal(f.LATENT_DESIGN_FLAWS, 16, "FACT_LATENT: the latent-design-flaw figure is the sum of the two states that make it up");
  assert.equal(f.HISTOGRAM, "4:1 6:5 8:5 9:3 10:4 12:15 15:14 16:4 20:2");
  // a figure that is not in the register cannot be invented by a marker
  for (const [key, text, fmt] of [["SOURCE_UNIVERSE_COUNT", "110"], ["HISTOGRAM", "4:1 6:5 8:5 9:3 10:4 12:15 15:14 16:4 20:2"], ["LOCK_UNIVERSE_COUNT", "51"]]) {
    const md = REPORT.replace("## 2. Threat model", `Fact: <!-- S1-FACT:${key} -->${text}<!-- /S1-FACT -->.\n\n## 2. Threat model`);
    assert.deepEqual(narrativeFactViolations(REGISTER, md), [], `${key} is accepted when true`);
    const wrong = md.replace(`>${text}<`, ">999<");
    assert.ok(narrativeFactViolations(REGISTER, wrong).some((v) => v.why === "FACT_DIFFERS" && v.key === key), `${key} is refused when false`);
  }
});

test("number words are derived, in both letter cases", () => {
  assert.deepEqual([0, 4, 12, 19, 20, 35, 64, 99].map(numberToWords), ["zero", "four", "twelve", "nineteen", "twenty", "thirty-five", "sixty-four", "ninety-nine"]);
  const md = REPORT.replace("## 2. Threat model", "Fact: <!-- S1-FACT:SEVERITY_HIGH:w -->thirty-five<!-- /S1-FACT --> and <!-- S1-FACT:SEVERITY_HIGH:W -->Thirty-five<!-- /S1-FACT -->.\n\n## 2. Threat model");
  assert.deepEqual(narrativeFactViolations(REGISTER, md), []);
  const bad = md.replace(">thirty-five<", ">thirty-six<");
  assert.ok(narrativeFactViolations(REGISTER, bad).some((v) => v.why === "FACT_DIFFERS"));
});

test("the two verdict panels are generated from the register, not typed", () => {
  for (const name of ["headline", "verdict"]) {
    assert.equal(extractBlock(REPORT, name), markdownBlocks(REGISTER)[name], `${name} is the rendered text, byte for byte`);
  }
  const reg = clone();
  for (const k of Object.keys(riskIn(reg, "R-04").likelihoodFactors)) riskIn(reg, "R-04").likelihoodFactors[k] = 0;
  Object.assign(riskIn(reg, "R-04"), derive(riskIn(reg, "R-04")));
  assert.notEqual(renderVerdictPanel(reg), renderVerdictPanel(REGISTER), "a changed register changes the panel");
  assert.ok(renderVerdictPanel(REGISTER).includes("S1_HIGH:                         35"));
  assert.ok(renderHeadlinePanel(REGISTER).includes("HIGH_RISKS_OPEN:            35"));
  // a hand edit of a panel figure is block drift
  const edited = REPORT.replace("S1_HIGH:                         35", "S1_HIGH:                         36");
  assert.ok(markdownBlockDrift(REGISTER, edited).some((v) => v.block === "verdict" && v.why === "BLOCK_DRIFT"));
});

// ──────── S1-R3-009: a block is compared byte for byte ───────────────────────

test("blocks are framed exactly: marker, one line feed, the rendered text, one line feed, marker", () => {
  for (const [name, body] of Object.entries(markdownBlocks(REGISTER))) {
    assert.equal(body, body.trim(), `${name}: the rendered text has no edge whitespace of its own`);
    assert.ok(REPORT.includes(`${BLOCK_OPEN(name)}\n${body}\n${BLOCK_CLOSE(name)}`), `${name}: the report holds exactly that framing`);
    assert.equal(extractBlock(REPORT, name), body, `${name}: extraction returns the text untrimmed`);
  }
});

test("whitespace at either edge of a block is drift", () => {
  for (const name of Object.keys(markdownBlocks(REGISTER))) {
    const open = `${BLOCK_OPEN(name)}\n`;
    const close = `\n${BLOCK_CLOSE(name)}`;
    for (const [label, mutated] of [
      ["blank line after the opening marker", REPORT.replace(open, `${open}\n`)],
      ["space after the opening marker", REPORT.replace(open, `${BLOCK_OPEN(name)} \n`)],
      ["blank line before the closing marker", REPORT.replace(close, `\n${close}`)],
      ["trailing space before the closing marker", REPORT.replace(close, ` ${close}`)],
      ["tab at the start of the content", REPORT.replace(open, `${open}\t`)],
    ]) {
      assert.notEqual(mutated, REPORT, `${name}/${label}: the mutation must have applied`);
      assert.ok(markdownBlockDrift(REGISTER, mutated).some((v) => v.block === name), `${name}: ${label} must be reported`);
    }
  }
  const crlf = REPORT.replace(/\n/g, "\r\n");
  assert.ok(markdownBlockDrift(REGISTER, crlf).length > 0, "a carriage return is drift, not something to normalise");
});

// ──────── S1-R3-004 / 009: the real command line, end to end ─────────────────

/** Existence is all the checker needs of an evidence path, so stubs stand in for the product tree. */
function buildMirror() {
  const dir = mkdtempSync(join(tmpdir(), "s1-selftest-"));
  assert.ok(!`${dir}${sep}`.startsWith(`${REPO_ROOT}${sep}`), "the mirror must live OUTSIDE the repository");
  mkdirSync(join(dir, "scripts", "security", "s1"), { recursive: true });
  cpSync(join(REPO_ROOT, "scripts", "security", "s1", "risk-register-check.mjs"), join(dir, "scripts", "security", "s1", "risk-register-check.mjs"));
  cpSync(join(REPO_ROOT, "docs", "security"), join(dir, "docs", "security"), { recursive: true });
  for (const r of REGISTER.risks) {
    for (const e of r.evidence) {
      const src = join(REPO_ROOT, ...e.path.split("/"));
      const dst = join(dir, ...e.path.split("/"));
      if (!existsSync(src) || existsSync(dst)) continue;
      if (statSync(src).isDirectory()) mkdirSync(dst, { recursive: true });
      else {
        mkdirSync(dirname(dst), { recursive: true });
        writeFileSync(dst, "");
      }
    }
  }
  return dir;
}

function withMirror(fn) {
  const dir = buildMirror();
  try {
    return fn({
      dir,
      /** Write the two deliverables (default: the live ones), run the REAL command line, return its outcome. */
      run({ registerText = RAW, reportText = REPORT, args = ["check"] } = {}) {
        writeFileSync(join(dir, "docs", "security", "s1-risk-register.json"), registerText, "utf8");
        writeFileSync(join(dir, "docs", "security", "THREAT-MODEL-AND-RISK-REGISTER.md"), reportText, "utf8");
        const p = spawnSync(process.execPath, [join(dir, "scripts", "security", "s1", "risk-register-check.mjs"), ...args], { encoding: "utf8", timeout: 120000 });
        return { code: p.status, out: p.stdout, err: p.stderr };
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The report with its generated blocks re-rendered from a changed register, as a real edit would leave it. */
function regenerated(reg, md = REPORT) {
  let out = md;
  for (const [name, body] of Object.entries(markdownBlocks(reg))) {
    const old = extractBlock(out, name);
    assert.notEqual(old, null, `${name} must exist`);
    out = out.replace(old, () => body);
  }
  return out;
}

const withRisk = (id, mutate) => {
  const reg = clone();
  mutate(riskIn(reg, id), reg);
  return reg;
};

test("the real command line exits 0 on the live deliverables, from a mirror outside the repository", () => {
  withMirror(({ dir, run }) => {
    assert.ok(!`${dir}${sep}`.startsWith(`${REPO_ROOT}${sep}`));
    const r = run();
    assert.equal(r.code, EXIT.OK, r.err);
    assert.match(r.out, /register consistent — 64 risks, 161 findings, coverage 100%/);
  });
  // and the mirror is gone afterwards
});

test("every exit code of `check` is reachable from the command line, with the code the table names", () => {
  withMirror(({ dir, run }) => {
    const reach = [];
    const expectExit = (label, code, opts) => {
      const r = run(opts);
      assert.equal(r.code, code, `${label}: expected exit ${code}, got ${r.code}\n${r.err.split("\n").slice(0, 3).join("\n")}`);
      reach.push(code);
    };

    // 1 — a deliverable is missing
    {
      const r = run({ args: ["bogus"] });
      assert.equal(r.code, EXIT.USAGE, "an unknown mode is a usage error");
      reach.push(EXIT.USAGE);
    }
    // 3 — a duplicate identifier, risk and finding (a shared code)
    expectExit("duplicate risk id", EXIT.DUPLICATE_IDENTIFIER, { registerText: render(withRisk("R-04", (r, reg) => reg.risks.push({ ...r }))) });
    expectExit("duplicate finding id", EXIT.DUPLICATE_IDENTIFIER, { registerText: render(withRisk("R-04", (r, reg) => reg.findings.push({ ...reg.findings[0] }))) });
    // 2 — an enum outside its vocabulary
    expectExit("unknown enum", EXIT.UNKNOWN_ENUM, { registerText: render(withRisk("R-04", (r) => { r.verificationMethod = "VIBES"; })) });
    // 4, 5, 6, 9 — the structural gates
    expectExit("orphan finding", EXIT.ORPHAN_FINDING, { registerText: render((() => { const reg = clone(); delete reg.findings.find((f) => f.findingId === "H-2").ownerRiskId; return reg; })()) });
    expectExit("ownership", EXIT.OWNERSHIP, { registerText: render(withRisk("R-02", (r) => r.sourceFindingIds.push("L-5"))) });
    expectExit("evidence path", EXIT.MISSING_EVIDENCE, { registerText: render(withRisk("R-04", (r) => r.evidence.push({ path: "src/lib/auth/does-not-exist.ts", locator: "x", note: "y" }))) });
    expectExit("missing required field", EXIT.MISSING_FIELD, { registerText: render(withRisk("R-04", (r) => { delete r.title; })) });
    // 7 — a stored derived value (two gates share this code); written RAW, because the renderer would repair it
    {
      const raw = clone();
      riskIn(raw, "R-01").score = 99;
      expectExit("stored score", EXIT.DERIVED_VALUE_MISMATCH, { registerText: `${JSON.stringify(raw, null, 2)}\n` });
      const crit = clone();
      riskIn(crit, "R-01").severityClamp = null;
      riskIn(crit, "R-01").severity = "CRITICAL";
      expectExit("critical without the clamp", EXIT.DERIVED_VALUE_MISMATCH, { registerText: `${JSON.stringify(crit, null, 2)}\n` });
    }
    // 20 — a stored dominant dimension: now reachable, because derived values are judged before canonical form
    {
      const raw = clone();
      riskIn(raw, "R-01").dominantImpact = ["AVAILABILITY"];
      expectExit("stored dominant impact", EXIT.DOMINANT_IMPACT, { registerText: `${JSON.stringify(raw, null, 2)}\n` });
    }
    // 8 — a HIGH risk with no acceptance criteria
    expectExit("residual risk", EXIT.MISSING_ACCEPTANCE, { registerText: render(withRisk("R-04", (r) => { r.residualRisk = "   "; })) });
    // 10 — remediation ordering (a shared code)
    expectExit("duplicate remediation ownership", EXIT.REMEDIATION_ORDER, { registerText: render(withRisk("R-04", (r, reg) => { r.remediationOwnership = riskIn(reg, "R-01").remediationOwnership; })) });
    // a MEDIUM swapped into the first slot: both priorities stay in range, only the ORDER is wrong
    expectExit("priority inversion", EXIT.REMEDIATION_ORDER, {
      registerText: render(withRisk("R-04", (r, reg) => {
        const first = reg.risks.find((x) => x.remediationPriority === 1);
        const m = reg.risks.find((x) => x.severity === "MEDIUM");
        [first.remediationPriority, m.remediationPriority] = [m.remediationPriority, first.remediationPriority];
      })),
    });
    // 11 — the register's own forbidden content
    expectExit("register timestamp", EXIT.FORBIDDEN_IN_REGISTER, { registerText: renderedWith("observed at 15:38:34") });
    // 12 — non-deterministic order, written raw reversed
    {
      const raw = clone();
      raw.risks.reverse();
      expectExit("risk order", EXIT.NON_DETERMINISTIC_ORDER, { registerText: `${JSON.stringify(raw, null, 2)}\n` });
    }
    // 14 — correct in content, wrong only in form
    expectExit("canonical form", EXIT.NOT_CANONICAL, { registerText: `${JSON.stringify(clone(), null, 4)}\n` });
    // 18, 19, 16 — register gates whose report blocks are re-rendered, as a real edit would leave them
    {
      const universe = withRisk("R-04", (r, reg) => { reg.findings = reg.findings.filter((f) => f.findingId !== "EDGE-02"); });
      expectExit("finding universe", EXIT.FINDING_UNIVERSE, { registerText: render(universe), reportText: regenerated(universe) });
      const linkage = withRisk("R-40", (r) => { r.acceptanceCriteria = ["gate"]; });
      expectExit("verification linkage", EXIT.VERIFICATION_LINKAGE, { registerText: render(linkage), reportText: regenerated(linkage) });
      const guard = withRisk("R-10", (r) => { delete r.guardEvidence; });
      expectExit("guard evidence", EXIT.GUARD_EVIDENCE, { registerText: render(guard), reportText: regenerated(guard) });
    }
    // 13 — the report's summary counters
    expectExit("summary drift", EXIT.SUMMARY_DRIFT, { reportText: REPORT.replace("SEVERITY_HIGH = 35", "SEVERITY_HIGH = 36") });
    // 15 — a contradiction, and the three marker mutations
    expectExit("contradiction", EXIT.CONTRADICTION, { reportText: REPORT.replace("## 2. Threat model", "The single precondition is unverified.\n\n## 2. Threat model") });
    expectExit("third historical marker", EXIT.CONTRADICTION, { reportText: REPORT.replace("## 2. Threat model", `Quoted. ${HISTORICAL_MARKER}\n\n## 2. Threat model`) });
    expectExit("unterminated block", EXIT.CONTRADICTION, { reportText: REPORT.replace(`\n${BLOCK_CLOSE("closure")}`, "") });
    // 17 — the next action asks for settled evidence
    expectExit("next action", EXIT.NEXT_ACTION, { reportText: REPORT.replace(NEXT_ACTION_MARKER, `${NEXT_ACTION_MARKER}\n\nFirst, re-check AUTH_SECRET.`) });
    // 21 — a hand edit inside a generated block
    {
      const first = markdownBlocks(REGISTER).matrix.split("\n")[0];
      expectExit("block drift", EXIT.BLOCK_DRIFT, { reportText: REPORT.replace(first, `${first} x`) });
      expectExit("blank line inside a block", EXIT.BLOCK_DRIFT, { reportText: REPORT.replace(`${BLOCK_OPEN("closure")}\n`, `${BLOCK_OPEN("closure")}\n\n`) });
    }
    // 24 — a stale figure in the prose
    expectExit("narrative fact", EXIT.NARRATIVE_FACT, { reportText: REPORT.replace("<!-- S1-FACT:S1_FINDINGS_TOTAL -->161<", "<!-- S1-FACT:S1_FINDINGS_TOTAL -->160<") });
    // 22 — a secret, in the report and in the register
    expectExit("secret in the report", EXIT.SECRET_IN_DELIVERABLE, { reportText: `${REPORT}\nJWT_ACCESS_SECRET=s3cr3tvaluethatislong\n` });
    {
      const reg = withRisk("R-04", (r) => { r.residualRisk += ' password="hunter2hunter2hunter2"'; });
      expectExit("secret in the register", EXIT.SECRET_IN_DELIVERABLE, { registerText: render(reg), reportText: regenerated(reg) });
    }
    // 23 — an operational command or a date-time, in the report and in the register
    expectExit("command in the report", EXIT.FORBIDDEN_IN_DELIVERABLE, { reportText: `${REPORT}\nsudo ufw status verbose\n` });
    {
      const reg = withRisk("R-04", (r) => { r.residualRisk += " Use docker inspect to confirm."; });
      expectExit("command in the register", EXIT.FORBIDDEN_IN_DELIVERABLE, { registerText: render(reg), reportText: regenerated(reg) });
    }

    // 70 — an internal failure: a register that is not JSON
    expectExit("register that is not JSON", EXIT.INTERNAL_ERROR, { registerText: "{ not json" });
    // 27 — a register nested past the structure budget (S1-FA-02)
    {
      let deep = "x";
      for (let i = 0; i < 300; i += 1) deep = { n: deep };
      expectExit("structure past the budget", EXIT.STRUCTURE_LIMIT, { registerText: render(withRisk("R-04", (r) => { r.notes = deep; })) });
    }
    // 25 — a campaign recorded against a different manifest, in a COPY of the checker
    {
      const cli = join(dir, "scripts", "security", "s1", "risk-register-check.mjs");
      const original = readFileSync(cli, "utf8");
      const recorded = `manifestSha256: ${JSON.stringify(MUTATION_CAMPAIGN.manifestSha256)}`;
      assert.equal(original.split(recorded).length - 1, 1, "the recorded binding occurs once");
      try {
        writeFileSync(cli, original.replace(recorded, `manifestSha256: "${"0".repeat(64)}"`), "utf8");
        expectExit("stale mutation campaign", EXIT.MUTATION_MANIFEST, {});
      } finally {
        writeFileSync(cli, original, "utf8");
      }
    }

    // 26 — an OPEN review finding, in a COPY of the checker, with the closure block rendered from it
    {
      const cli = join(dir, "scripts", "security", "s1", "risk-register-check.mjs");
      const original = readFileSync(cli, "utf8");
      const [id, sev, status] = REVIEW_CLOSURE[0];
      const row = `[${JSON.stringify(id)}, ${JSON.stringify(sev)}, ${JSON.stringify(status)},`;
      assert.equal(original.split(row).length - 1, 1, "the first closure row occurs once");
      const open = REVIEW_CLOSURE.map((r, i) => (i === 0 ? [r[0], r[1], "OPEN", r[3], r[4]] : r));
      try {
        writeFileSync(cli, original.replace(row, () => `[${JSON.stringify(id)}, ${JSON.stringify(sev)}, "OPEN",`), "utf8");
        const reportText = REPORT.replace(extractBlock(REPORT, "closure"), () => renderReviewClosure(REGISTER, open));
        expectExit("open review finding", EXIT.OPEN_REVIEW_FINDING, { reportText });
      } finally {
        writeFileSync(cli, original, "utf8");
      }
    }

    // Every name in the table is reached except the one that needs a file to be absent.
    const named = Object.values(EXIT).filter((c) => c !== EXIT.MISSING_FILE && c !== EXIT.OK);
    for (const code of named) assert.ok(reach.includes(code), `exit ${code} must be reached from the command line`);
  });
});

test("a missing deliverable is exit 1, not a crash", () => {
  withMirror(({ dir, run }) => {
    run();
    rmSync(join(dir, "docs", "security", "THREAT-MODEL-AND-RISK-REGISTER.md"));
    const p = spawnSync(process.execPath, [join(dir, "scripts", "security", "s1", "risk-register-check.mjs"), "check"], { encoding: "utf8" });
    assert.equal(p.status, EXIT.MISSING_FILE);
    assert.ok(!/at .*\.mjs:\d+/.test(p.stderr), "no stack trace is shown");
  });
});

test("the exit table is honest: names are distinct, shared codes are declared, and nothing else is shared", () => {
  const values = Object.values(EXIT);
  assert.equal(new Set(values).size, values.length, "no two NAMES share a value");
  assert.deepEqual(
    Object.keys(EXIT_SHARED).map(Number).sort((a, b) => a - b),
    [EXIT.DUPLICATE_IDENTIFIER, EXIT.DERIVED_VALUE_MISMATCH, EXIT.REMEDIATION_ORDER],
    "EXIT_SHARED: exactly the three shared codes are declared shared",
  );
  for (const gates of Object.values(EXIT_SHARED)) assert.equal(gates.length, 2, "each shared code names exactly its two gates");
  // the gates' own stop() calls use only table members
  const src = readFileSync(join(REPO_ROOT, "scripts", "security", "s1", "risk-register-check.mjs"), "utf8");
  const used = new Set([...src.matchAll(/stop\(EXIT\.([A-Z_]+)/g)].map((m) => m[1]));
  assert.ok(used.size >= 20, `the gates are found (${used.size})`);
  for (const name of used) assert.ok(name in EXIT, `${name} is a declared exit`);
  assert.equal(/(?:stop|fail)\(\d/.test(src), false, "no gate stops with a bare number");
  // distinct gates that are NOT declared shared must have distinct names
  const perCode = new Map();
  for (const m of src.matchAll(/stop\(EXIT\.([A-Z_]+), "([^"]+)"/g)) perCode.set(m[1], [...(perCode.get(m[1]) ?? []), m[2]]);
  for (const [name, labels] of perCode) {
    const code = EXIT[name];
    if (!(code in EXIT_SHARED)) assert.equal(labels.length, 1, `${name} (exit ${code}) is used by one gate only`);
  }
});

test("the checker never writes inside the repository: its test mirror is removed afterwards", () => {
  let seen = null;
  withMirror(({ dir }) => { seen = dir; assert.ok(existsSync(dir)); });
  assert.equal(existsSync(seen), false, "the temporary mirror is deleted in a finally");
  assert.ok(!`${seen}${sep}`.startsWith(`${REPO_ROOT}${sep}`));
});

test("a register string that merely ENDS in a key and an equals sign is not a finding, but an open quote inside a string still is", () => {
  // found by the regression harness: the JSON closing quote after `KEY=` was read as
  // the opening quote of a value that never closes
  assert.deepEqual(registerSecretHits(renderedWith("Set AUTH_SECRET=")), [], "ENDS_IN_KEY: a register string that merely ends in a key and an equals sign is not a finding");
  assert.deepEqual(registerSecretHits(renderedWith("Set AUTH_SECRET=SET")), []);
  const unclosed = registerSecretHits(renderedWith('AUTH_SECRET="'));
  assert.equal(unclosed.length, 1, "decoded, the string really does end in an open quote");
  assert.equal(unclosed[0].form, "UNCLOSED_QUOTE");
  assert.equal(unclosed[0].level, "DECODED");
  // the excuse is narrow: only structure (nothing but , ] } after the quote), only the raw level
  assert.deepEqual(assignedSecretHits('"x": "see AUTH_SECRET=",', { jsonStructure: true }), []);
  assert.ok(assignedSecretHits('"x": "see AUTH_SECRET=",').length > 0, "free text keeps the strict reading");
  assert.ok(assignedSecretHits('AUTH_SECRET="abc', { jsonStructure: true }).length > 0, "a quote followed by real characters is still unclosed");
});

test("a placeholder PREFIX never excuses the rest of the value", () => {
  // Found by mutation: with every non-placeholder value already a finding, a reader
  // that truncated at a delimiter or closed a quote on the wrong character still
  // failed the earlier probes. These probes start with a real placeholder, so a
  // truncation would turn a credential into a pass.
  for (const sample of [
    "AUTH_SECRET=SET;realsecretvalue",
    "AUTH_SECRET=SET|realsecretvalue",
    "AUTH_SECRET=SET,realsecretvalue",
    "AUTH_SECRET=SET*realsecretvalue",
    "AUTH_SECRET=SET)realsecretvalue",
    "AUTH_SECRET=SET`realsecretvalue",
    "AUTH_SECRET=;realsecretvalue",
    `AUTH_SECRET="SET's real value is hunter2hunter2"`,
    `AUTH_SECRET='SET"realsecretvalue'`,
  ]) {
    assert.ok(assignedSecretHits(sample).length > 0, `${sample} must fail`);
  }
});

test("a credential assignment inside a property NAME is caught at the STRUCTURED_KEY level, with its path", () => {
  const reg = clone();
  riskIn(reg, "R-04").notes = { "AUTH_SECRET=s3cr3tvaluethatislong": "a key, not a value" };
  const hits = registerSecretHits(render(reg));
  assert.equal(hits.length, 1, "one credential, one finding");
  assert.equal(hits[0].level, "STRUCTURED_KEY", "the decoded property name is the witness");
  assert.ok(hits[0].path.endsWith('["notes"]["AUTH_SECRET=s3cr3tvaluethatislong"]'), "and it names the path");
});

// ════════ the final review's findings (S1-FR-01 … S1-FR-12) ═════════════════════
//
// Each test below carries behaviour, not the reviewer's literal: the names, quotes,
// figures and paths are GENERATED from the example files, the placeholder list, the
// register or a fixture derived from it, so a fix that special-cased the reported
// string would fail them.

/** A deterministic pseudo-random upper-case word, so prefixes are not hand-picked. */
function syntheticWord(seed) {
  let x = seed * 2654435761 % 4294967296;
  let w = "";
  for (let i = 0; i < 6; i += 1) {
    x = (x * 1103515245 + 12345) % 2147483648;
    w += String.fromCharCode(65 + (x % 26));
  }
  return w;
}

/** Example names that only LOOK like credentials, each with the reason it is not one. */
const REVIEWED_NON_SENSITIVE_EXAMPLE_NAMES = Object.freeze({
  HERMES_BACKUP_KEY_FILE: "a filesystem path to the key, not the key",
  HERMES_BACKUP_KEY_ID: "an identifier that selects a key, not the key",
});

test("S1-R4 FR-01: every credential-looking example name is sensitive, with qualifiers and prefixes", () => {
  const names = exampleEnvNames();
  const lookalike = names.filter((n) => /SECRET|PASSWORD|PASSWD|PASS(?!PORT)|PWD|TOKEN|API_?KEY|ACCESS_KEY|PRIVATE_KEY|SIGNING_KEY|(?:^|_)KEY(?:_|$)/.test(n));
  assert.ok(lookalike.length >= 15, `expected a wide set of credential-looking names, got ${lookalike.length}`);
  for (const n of lookalike) {
    if (n in REVIEWED_NON_SENSITIVE_EXAMPLE_NAMES) {
      assert.equal(isSensitiveKeyName(n), false, `${n}: ${REVIEWED_NON_SENSITIVE_EXAMPLE_NAMES[n]}`);
      continue;
    }
    assert.ok(isSensitiveKeyName(n), `${n} looks like a credential and must be classified sensitive`);
    const variants = [n, `${n}_V2`, `${n}_PROD`, `${n}_2`, `${n}_OLD`, `${syntheticWord(n.length)}_${n}`, normalizeKeyName(n).replace(/_([a-z])/g, (_m, c) => c.toUpperCase())];
    for (const v of variants) {
      assert.ok(isSensitiveKeyName(v), `${v} (a qualified or prefixed ${n}) is still a credential name`);
      assert.ok(assignedSecretHits(`${v}=${UNSAFE_VALUE}`).length > 0, `${v}=… must fail`);
      assert.ok(assignedSecretHits(`"${v}": "${UNSAFE_VALUE}"`).length > 0, `"${v}": "…" must fail`);
    }
    // a suffix that changes what the value IS is not a qualifier
    for (const v of [`${n}_FILE`, `${n}_PATH`, `${n}_ID`, `${n}_HASH`, `${n}_TTL`]) {
      assert.equal(isSensitiveKeyName(v), false, `${v} names something about the credential, not the credential`);
    }
  }
  for (const reviewed of Object.keys(REVIEWED_NON_SENSITIVE_EXAMPLE_NAMES)) {
    assert.ok(names.includes(reviewed), `${reviewed} is reviewed, so it must still exist in an example file`);
  }
});

test("S1-R4 FR-01: SMTP_PASS and its shapes fail; look-alike names do not", () => {
  assert.ok(exampleEnvNames().includes("SMTP_PASS"), "the reported name is real");
  for (const sample of [
    "SMTP_PASS=real-secret-value",
    "smtp_pass: real-secret-value",
    "smtpPass=real-secret-value",
    '"SMTP_PASS": "real-secret-value"',
    "SMTP_PASS_2=real-secret-value",
    "X_SMTP_PASS=real-secret-value",
    "DB_PWD=real-secret-value",
    "VAULT_PASSPHRASE=real-secret-value",
  ]) {
    assert.ok(assignedSecretHits(sample).length > 0, `${sample} must fail`);
  }
  // the family is the rule, not the name: a synthetic service never seen before is covered too
  for (let i = 1; i <= 5; i += 1) {
    assert.ok(assignedSecretHits(`${syntheticWord(i)}_PASS=real-secret-value`).length > 0, "any *_PASS");
  }
  const reg = clone();
  riskIn(reg, "R-04").credentials = { SMTP_PASS: "real-secret-value" };
  assert.ok(registerSecretHits(render(reg)).some((h) => h.level === "STRUCTURED" && h.key === "SMTP_PASS"), "as a JSON property");
  for (const benign of ["bypass=abcdefgh", "compass=north-north-west", "PASSPORT_FORMAT=iso", "passage=chapter-two", "SMTP_PASS_FILE=secrets-dir-entry", "PASSWORD_HASH=argon2id", "SMTP_PASS=SET", "SMTP_HOST=mail.example.org"]) {
    assert.deepEqual(assignedSecretHits(benign), [], `${benign} must pass`);
  }
});

test("S1-R4 FR-02: nothing may be glued to a quoted placeholder", () => {
  const contexts = [
    (v) => `AUTH_SECRET=${v}`,
    (v) => `auth_secret: ${v}`,
    (v) => `| env | AUTH_SECRET=${v} |`,
    (v) => `"AUTH_SECRET": ${v},`,
    (v) => `\`AUTH_SECRET=${v}\``,
  ];
  for (const p of [...PLACEHOLDER_VALUES, "<redacted>", "${AUTH_SECRET}"]) {
    for (const q of ['"', "'"]) {
      const quoted = `${q}${p.toUpperCase() === p ? p : p.toUpperCase()}${q}`;
      for (const ctx of contexts) {
        assert.deepEqual(assignedSecretHits(ctx(quoted)), [], `${ctx(quoted)} is a placeholder`);
        assert.deepEqual(assignedSecretHits(`${ctx(quoted)}  # comment`), [], "followed by whitespace and a comment");
        for (const glued of [`${quoted}realvalue`, `${quoted}.realvalue`, `${quoted}+realvalue`, `${quoted}_x`, `${quoted}${q}x${q}`]) {
          assert.ok(assignedSecretHits(ctx(glued)).length > 0, `${ctx(glued)} must fail: text is glued to the closing quote`);
        }
      }
      // the wrong closing quote and a missing one
      const other = q === '"' ? "'" : '"';
      assert.ok(assignedSecretHits(`AUTH_SECRET=${q}${p}${other}`).length > 0, "a quote closed by the other kind is open");
      assert.ok(assignedSecretHits(`AUTH_SECRET=${q}${p}`).length > 0, "an unclosed quote");
    }
  }
  // and through the real renderer, decoded
  assert.ok(registerSecretHits(renderedWith('AUTH_SECRET="SET"realvalue')).length > 0);
  assert.deepEqual(registerSecretHits(renderedWith('AUTH_SECRET="SET".')), []);
});

test("S1-R4 FR-03: the truthfulness lead is rendered from the register", () => {
  assert.equal(extractBlock(REPORT, "truthfulness"), renderTruthfulnessLead(REGISTER), "the live lead is the rendered one");
  // the figures, computed here without the renderer
  const high = REGISTER.risks.filter((r) => r.severity === "HIGH");
  const rep = high.filter((r) => r.stride.includes("REPUDIATION")).length;
  const disc = high.filter((r) => r.stride.includes("INFORMATION_DISCLOSURE")).length;
  const s7 = high.filter((r) => r.remediationPhase === "S7_FAILURE_SEMANTICS_AND_TRUTHFULNESS").length;
  const lead = renderTruthfulnessLead(REGISTER);
  assert.ok(lead.includes(`among the ${high.length} HIGH risks — ${rep} of them, against ${disc} for`), lead);
  assert.ok(lead.includes(`and the ${s7} HIGH risks scheduled for`));
  assert.ok(!/\bEleven\b/.test(REPORT.split("\n").slice(40, 60).join("\n")), "the typed figure is gone from §1");

  // a fixture in which disclosure overtakes repudiation changes the CLAIM, not just a number
  const flipped = clone();
  for (const r of flipped.risks.filter((x) => x.severity === "HIGH")) {
    r.stride = r.stride.filter((s) => s !== "REPUDIATION");
    if (!r.stride.includes("INFORMATION_DISCLOSURE")) r.stride.push("INFORMATION_DISCLOSURE");
  }
  const fl = renderTruthfulnessLead(flipped);
  assert.ok(fl.startsWith("**The largest cluster of HIGH risk is `INFORMATION_DISCLOSURE`.**"), fl);
  assert.ok(!fl.includes("it is truthfulness"));

  // one more disclosure-tagged HIGH risk moves the "against" figure
  const plusOne = clone();
  const target = plusOne.risks.find((r) => r.severity === "HIGH" && !r.stride.includes("INFORMATION_DISCLOSURE"));
  target.stride.push("INFORMATION_DISCLOSURE");
  assert.ok(renderTruthfulnessLead(plusOne).includes(`against ${disc + 1} for`), "TRUTHFULNESS_LEAD: the disclosure figure in the lead moves with the register");
  // and a hand edit of the rendered lead is drift
  assert.ok(markdownBlockDrift(REGISTER, REPORT.replace(`against ${disc} for`, `against ${disc + 1} for`)).some((v) => v.block === "truthfulness"));
});

test("S1-R4 FR-03: a typed 'N of the M HIGH risks' claim is refused", () => {
  for (const claim of [
    "Eleven of the 35 HIGH risks are about truthfulness.",
    "11 of the 35 HIGH risks are about truthfulness.",
    "Twelve of the thirty-five HIGH risks are listed.",
    "Nine of the risks are perimeter risks.",
    // four words between the figure and the noun, and no second figure to fall back on
    "Eleven of the documented HIGH risks are about truthfulness.",
  ]) {
    const md = REPORT.replace("## 2. Threat model", `${claim}\n\n## 2. Threat model`);
    assert.ok(narrativeFactViolations(REGISTER, md).some((v) => v.why === "UNMARKED_NARRATIVE_FACT"), `${claim} must be refused`);
  }
  // the same claim with both figures derived and marked passes only when true
  const marked = REPORT.replace(
    "## 2. Threat model",
    "Of the <!-- S1-FACT:SEVERITY_HIGH -->35<!-- /S1-FACT --> HIGH risks, <!-- S1-FACT:STATE_ACTIVE_CONFIRMED -->24<!-- /S1-FACT --> states are confirmed.\n\n## 2. Threat model",
  );
  assert.deepEqual(narrativeFactViolations(REGISTER, marked), []);
  assert.ok(narrativeFactViolations(REGISTER, marked.replace(">35<", ">36<")).some((v) => v.why === "FACT_DIFFERS"));
});

test("S1-R4 FR-04: renderer figures move with the register", () => {
  // the method's constants, computed here independently of the checker
  const reachable = new Set();
  for (let l = 1; l <= 5; l += 1) for (let i = 1; i <= 5; i += 1) reachable.add(l * i);
  const cal = renderCalibration(REGISTER);
  assert.ok(cal.includes(`of ${reachable.size} reachable`), "the reachable-score count is derived");
  assert.ok(cal.includes("spans 12 to 19"), "the HIGH band comes from the severity function");
  assert.ok(!/\b25 (?:possible|reachable)\b/.test(cal), "the false 25 is gone");

  // a fixture with one more zero-score risk
  const zero = clone();
  const r = riskIn(zero, "R-04");
  for (const k of Object.keys(r.likelihoodFactors)) r.likelihoodFactors[k] = 0;
  Object.assign(r, derive(r));
  const unscored = zero.risks.filter((x) => x.score === 0).length;
  assert.equal(unscored, REGISTER.risks.filter((x) => x.score === 0).length + 1);
  assert.ok(renderCalibration(zero).includes(`(the ${unscored} positive controls score 0`), "the count follows the register");

  // a fixture with one finding fewer
  const fewer = clone();
  fewer.findings = fewer.findings.filter((f) => f.findingId !== "EDGE-02");
  assert.ok(renderReviewClosure(fewer).includes(`the register's ${fewer.findings.length} and`), "CLOSURE_FIGURE: the finding count in the closure prose moves with the register");
  assert.ok(!renderReviewClosure(fewer).includes(`the register's ${REGISTER.findings.length} and`));

  // the closure's count of disclosure-closed reviews is derived from the constant
  const disclosed = REVIEW_CLOSURE.filter(([, , s]) => s === "FIXED_BY_DISCLOSURE_AND_DERIVED_PRESENTATION").length;
  assert.ok(renderReviewClosure(REGISTER).includes(`The ${numberToWords(disclosed)} marked`));
  // the verdict panel no longer carries a word that is true for exactly two clamps
  assert.ok(!renderVerdictPanel(REGISTER).includes("both recorded"));
  assert.ok(renderVerdictPanel(REGISTER).includes("each recorded"));
});

const SCANNER_AND_PATH_FAMILIES = [
  ["nmap with a flag", "nmap -sV host.example.org", "SCANNER_OR_PROBE_COMMAND"],
  ["nmap with an address", "nmap 10.0.0.1", "SCANNER_OR_PROBE_COMMAND"],
  ["masscan", "masscan -p443 10.0.0.0/8", "SCANNER_OR_PROBE_COMMAND"],
  ["telnet host port", "telnet origin.example.org 443", "SCANNER_OR_PROBE_COMMAND"],
  ["dig @server", "dig @1.1.1.1 example.org", "SCANNER_OR_PROBE_COMMAND"],
  ["dig +flag", "dig +short example.org", "SCANNER_OR_PROBE_COMMAND"],
  ["testssl.sh", "testssl.sh --fast example.org", "SCANNER_OR_PROBE_COMMAND"],
  ["testssl", "testssl https://example.org", "SCANNER_OR_PROBE_COMMAND"],
  ["/usr path", "installed under /usr/local/bin/tool", "UNIX_SYSTEM_ABSOLUTE_PATH"],
  ["/proc path", "read /proc/self/environ", "UNIX_SYSTEM_ABSOLUTE_PATH"],
  ["/var/log path", "see /var/log/nginx/access.log", "UNIX_SYSTEM_ABSOLUTE_PATH"],
];

test("S1-R4 FR-05: scanners and system paths are forbidden in both deliverables, raw and decoded", () => {
  for (const [label, sample, kind] of SCANNER_AND_PATH_FAMILIES) {
    for (const dressed of [sample, `\`${sample}\``, `\`\`\`\n${sample}\n\`\`\``, `| step | ${sample} |`]) {
      assert.ok(reportForbiddenHits(dressed, "probe").some((h) => h.kind === kind), `${label}: report`);
      // decoded: the sample is a string VALUE of the register
      assert.ok(registerForbiddenHits(renderedWith(dressed)).some((h) => h.kind === kind), `${label}: register, decoded`);
    }
    // raw: the sample is a property NAME, which no string leaf carries
    const reg = clone();
    riskIn(reg, "R-04").notes = { [sample]: "x" };
    assert.ok(registerForbiddenHits(render(reg)).some((h) => h.kind === kind), `${label}: register, raw`);
  }
  for (const benign of [
    "dig into the logs before deciding",
    "telnet is not exposed on any interface",
    "no nmap scan was run in this phase",
    "the masscan tool is out of scope",
    "testssl is a tool a later phase may use",
    "src/usr/local is not a path here",
    "the /usr directory is mentioned without a file",
    "see http://example.org/usr/share for the convention",
  ]) {
    assert.deepEqual(reportForbiddenHits(benign, "probe"), [], `${JSON.stringify(benign)} must pass`);
  }
  assert.deepEqual(deliverableForbiddenViolations(RAW, REPORT), []);
});

test("S1-R4 FR-06 / S1-R5 F-03: a token shape that exists only in a property NAME is caught at the STRUCTURED_KEY level", () => {
  for (const [kind, token] of [
    ["AWS_ACCESS_KEY_ID", `AKIA${"Q".repeat(16)}`],
    ["GITHUB_TOKEN", `ghp_${"a".repeat(36)}`],
    ["JWT_THREE_PART", `eyJ${"a".repeat(20)}.${"b".repeat(20)}.${"c".repeat(20)}`],
  ]) {
    const reg = clone();
    riskIn(reg, "R-04").notes = { [token]: "a key, not a value" };
    const hits = registerSecretHits(render(reg));
    assert.ok(
      hits.some((h) => h.kind === kind && h.level === "STRUCTURED_KEY" && h.path.endsWith(`[${JSON.stringify(token)}]`)),
      `${kind} in a property name must be caught at the STRUCTURED_KEY level`,
    );
    assert.ok(!hits.some((h) => h.kind === kind && h.level === "DECODED"), "no string leaf carries it");
    assert.ok(secretShapeViolations(render(reg), REPORT).some((h) => h.kind === kind), "and the gate fails");
  }
});

test("S1-R4 FR-07: credential-bearing Redis URLs fail; credential-free and placeholder ones pass", () => {
  for (const s of ["redis://:pw@host:6379", "rediss://:longerpassword@cache.internal:6380/0", "redis://user:pw@host", "amqps://user:secretpw@mq.internal"]) {
    assert.ok(secretShapeHits(s, "probe").some((h) => h.kind === "CONNECTION_STRING_WITH_CREDENTIAL"), `${s} must fail`);
    assert.ok(registerSecretHits(renderedWith(s)).some((h) => h.kind === "CONNECTION_STRING_WITH_CREDENTIAL"), `${s} in the register`);
  }
  for (const s of ["redis://host:6379", "rediss://cache.internal:6380/0", "redis://:${REDIS_PASSWORD}@redis:6379", "redis://:REDACTED@redis", "redis://:<password>@host", "postgresql://localhost:5432/app"]) {
    assert.deepEqual(secretShapeHits(s, "probe"), [], `${s} must pass`);
  }
});

test("S1-R4 FR-08: the checker run through a junction or symlink still checks", () => {
  withMirror(({ dir, run }) => {
    const realDir = join(dir, "scripts", "security", "s1");
    const parent = mkdtempSync(join(tmpdir(), "s1-link-"));
    const link = join(parent, "linked-s1");
    try {
      symlinkSync(realDir, link, process.platform === "win32" ? "junction" : "dir");
      const viaLink = join(link, "risk-register-check.mjs");
      // the unit: both sides resolve to the same real file
      assert.equal(isEntrypoint(viaLink, pathToFileURL(join(realDir, "risk-register-check.mjs")).href), true, "ENTRYPOINT_LINK: a path through a link and the real module are the same program");
      assert.equal(isEntrypoint(join(dir, "elsewhere.mjs"), pathToFileURL(join(realDir, "risk-register-check.mjs")).href), false);
      assert.equal(isEntrypoint(undefined, pathToFileURL(join(realDir, "risk-register-check.mjs")).href), false);
      // the behaviour: a defect reached through the link is still reported
      run({ reportText: REPORT.replace("SEVERITY_HIGH = 35", "SEVERITY_HIGH = 36") });
      const bad = spawnSync(process.execPath, [viaLink, "check"], { encoding: "utf8", timeout: 120000 });
      assert.equal(bad.status, EXIT.SUMMARY_DRIFT, `through the link the drift must be caught, got ${bad.status}`);
      run();
      const good = spawnSync(process.execPath, [viaLink, "check"], { encoding: "utf8", timeout: 120000 });
      assert.equal(good.status, EXIT.OK);
      assert.match(good.stdout, /register consistent/, "and a clean run actually ran");
    } finally {
      if (existsSync(link)) rmdirSync(link);
      rmSync(parent, { recursive: true, force: true });
    }
    assert.ok(existsSync(join(realDir, "risk-register-check.mjs")), "removing the link left the target intact");
  });
});

test("S1-R4 FR-10: a block marker line must be exactly canonical", () => {
  assert.deepEqual(parseMarkdownBlocks(REGISTER, REPORT).violations, []);
  for (const [label, mutate] of [
    ["leading space on an opening marker", (o) => ` ${o}`],
    ["trailing space on an opening marker", (o) => `${o} `],
    ["a tab before an opening marker", (o) => `\t${o}`],
    ["no inner spacing", (o) => o.replace("<!-- ", "<!--").replace(" -->", "-->")],
    ["doubled inner spacing", (o) => o.replace("<!-- ", "<!--  ")],
  ]) {
    for (const name of ["summary", "closure"]) {
      const md = REPORT.replace(`\n${BLOCK_OPEN(name)}\n`, `\n${mutate(BLOCK_OPEN(name))}\n`);
      assert.notEqual(md, REPORT, `${label}/${name}: the mutation applied`);
      assert.ok(
        parseMarkdownBlocks(REGISTER, md).violations.some((v) => v.why === "NONCANONICAL_BLOCK_MARKER" && v.name === name),
        `${label} on ${name} must be refused`,
      );
    }
  }
  const closing = REPORT.replace(`\n${BLOCK_CLOSE("matrix")}\n`, `\n  ${BLOCK_CLOSE("matrix")}\n`);
  assert.ok(parseMarkdownBlocks(REGISTER, closing).violations.some((v) => v.why === "NONCANONICAL_BLOCK_MARKER" && v.name === "matrix"));
});

test("S1-R4 FR-11: an internal failure exits 70 without a stack trace", () => {
  withMirror(({ run }) => {
    for (const [label, registerText] of [["not JSON", "{ not json"], ["no risks at all", "{}\n"]]) {
      const r = run({ registerText });
      assert.equal(r.code, EXIT.INTERNAL_ERROR, `${label}: expected 70, got ${r.code}`);
      assert.match(r.err, /internal error/);
      assert.equal(/\n\s+at /.test(r.err), false, "no stack trace");
    }
  });
  assert.equal(EXIT.INTERNAL_ERROR, 70);
  assert.notEqual(EXIT.INTERNAL_ERROR, EXIT.MISSING_FILE, "a crash is not a missing file");
});

test("S1-R4 FR-12 / S1-R5 F-01: the mutation manifest is bound, current, and every mutant is a TARGETED_KILL", () => {
  assert.deepEqual(mutationManifestViolations(), []);
  const ids = MUTATION_MANIFEST.map((e) => e.id);
  const all = [...ids, ...PLACEBO_CONTROLS.map((c) => c.id)];
  assert.equal(new Set(all).size, all.length, "mutant and control ids are distinct");
  assert.deepEqual(Object.keys(MUTATION_CAMPAIGN.observed).sort(), [...ids].sort(), "one recorded result per mutant");
  assert.ok(Object.values(MUTATION_CAMPAIGN.observed).every((s) => s === "TARGETED_KILL"), "every recorded result is a targeted kill");
  for (const c of PLACEBO_CONTROLS) assert.equal(MUTATION_CAMPAIGN.controls[c.id], c.expected, `${c.id}: the control behaved as expected`);
  // the binding hash, recomputed here independently of the checker
  const byId = (a, b) => (a.id < b.id ? -1 : 1);
  const fields = ["id", "target", "description", "find", "replace", "placebo", "detector", "fingerprint"];
  const controlFields = ["id", "kind", "description", "find", "replace", "detector", "fingerprint", "expected", "inRegion"];
  const canon = JSON.stringify([
    [...MUTATION_MANIFEST].sort(byId).map((e) => fields.map((k) => e[k] ?? null)),
    [...PLACEBO_CONTROLS].sort(byId).map((c) => controlFields.map((k) => c[k] ?? null)),
  ]);
  assert.equal(createHash("sha256").update(canon, "utf8").digest("hex"), MUTATION_CAMPAIGN.manifestSha256);
  assert.equal(mutationManifestSha256(), MUTATION_CAMPAIGN.manifestSha256);
  // every named test is a real test in THIS file, every fingerprint is a pattern, every placebo is a rewrite
  const self = readFileSync(join(REPO_ROOT, "scripts", "security", "s1", "__tests__", "risk-register.selftest.mjs"), "utf8");
  for (const e of [...MUTATION_MANIFEST, ...PLACEBO_CONTROLS]) {
    assert.ok(self.includes(`test(${JSON.stringify(e.detector)}`), `${e.id}: named test ${JSON.stringify(e.detector)} must be a test here`);
    assert.doesNotThrow(() => new RegExp(e.fingerprint), `${e.id}: fingerprint`);
  }
  for (const e of MUTATION_MANIFEST) {
    assert.notEqual(e.placebo, e.find, `${e.id}: a placebo changes the text`);
    assert.notEqual(e.placebo, e.replace, `${e.id}: a placebo is not the mutation`);
  }
  // the six control kinds the review asked for, none of which may count as a kill
  assert.deepEqual(
    [...new Set(PLACEBO_CONTROLS.map((c) => c.kind))].sort(),
    ["COMMENT_OR_WHITESPACE", "EARLIER_GATE", "MANIFEST_DRIFT_ONLY", "SEMANTIC_NOOP", "SETUP_BREAK", "UNRELATED_FAILURE"],
  );
  for (const c of PLACEBO_CONTROLS) assert.notEqual(c.expected, "TARGETED_KILL", `${c.id} may not expect a kill`);
  // the region in the source is exactly the rendered region: no hand-edited evidence
  const checker = readFileSync(join(REPO_ROOT, "scripts", "security", "s1", "risk-register-check.mjs"), "utf8");
  assert.ok(checker.includes(renderManifestRegion(MUTATION_MANIFEST, PLACEBO_CONTROLS, MUTATION_CAMPAIGN)), "the manifest region is generated");

  // the gate refuses each way the evidence could rot
  const edited = MUTATION_MANIFEST.map((e, i) => (i === 0 ? { ...e, description: `${e.description}!` } : e));
  assert.ok(
    mutationManifestViolations(undefined, edited).some((v) => v.why === "CAMPAIGN_RECORDED_AGAINST_A_DIFFERENT_MANIFEST"),
    "MANIFEST_GATE:BINDING a record bound to another manifest is refused",
  );
  for (const status of ["ONLY_INCIDENTAL", "SURVIVED", "INVALID_MUTANT"]) {
    const rotted = { ...MUTATION_CAMPAIGN, observed: { ...MUTATION_CAMPAIGN.observed, [ids[0]]: status } };
    assert.ok(
      mutationManifestViolations(undefined, MUTATION_MANIFEST, rotted).some((v) => v.why === "MUTATION_NOT_A_TARGETED_KILL"),
      `MANIFEST_GATE:STATUS a recorded ${status} is refused`,
    );
  }
  const control = PLACEBO_CONTROLS[0];
  const drifted = { ...MUTATION_CAMPAIGN, controls: { ...MUTATION_CAMPAIGN.controls, [control.id]: "TARGETED_KILL" } };
  assert.ok(mutationManifestViolations(undefined, MUTATION_MANIFEST, drifted).some((v) => v.why === "CONTROL_RESULT_DIFFERS"), "MANIFEST_GATE:CONTROL");
  const stale = [...MUTATION_MANIFEST, { id: "ZZ-STALE", target: "t", description: "d", find: "text that is nowhere in the checker", replace: "", placebo: "p", detector: "x", fingerprint: "x" }];
  assert.ok(mutationManifestViolations(undefined, stale).some((v) => v.why === "MUTATION_ANCHOR_STALE" && v.id === "ZZ-STALE"), "MANIFEST_GATE:STALE a stale anchor is refused");
  const noPlacebo = MUTATION_MANIFEST.map((e, i) => (i === 0 ? { ...e, placebo: e.find } : e));
  assert.ok(mutationManifestViolations(undefined, noPlacebo).some((v) => v.why === "PLACEBO_MISSING_OR_NOT_A_REWRITE"), "MANIFEST_GATE:PLACEBO");
  const killControl = PLACEBO_CONTROLS.map((c, i) => (i === 0 ? { ...c, expected: "TARGETED_KILL" } : c));
  assert.ok(
    mutationManifestViolations(undefined, MUTATION_MANIFEST, MUTATION_CAMPAIGN, killControl).some((v) => v.why === "A_CONTROL_MAY_NOT_EXPECT_A_TARGETED_KILL"),
    "MANIFEST_GATE:CONTROL_KILL",
  );
  // Appendix E is the rendered manifest, and its totals come from the records
  assert.equal(extractBlock(REPORT, "mutations"), renderMutationManifest());
  const block = renderMutationManifest();
  assert.ok(block.includes(`MUTATION_MANIFEST_VERSION    ${MUTATION_MANIFEST_VERSION}`));
  assert.ok(block.includes(`MUTANTS_TOTAL                ${MUTATION_MANIFEST.length}`));
  assert.ok(block.includes(`TARGETED_KILL                ${MUTATION_MANIFEST.length}`));
  for (const s of CAMPAIGN_STATUSES.filter((x) => x !== "TARGETED_KILL")) assert.ok(block.includes(`${s.padEnd(29)}0`), `${s} is zero`);
});

test("S1-R4 FR-12: three manifest mutations, applied for real, change the behaviour their tests watch", async () => {
  // A live spot-check, independent of the recorded campaign: apply the mutation to a
  // copy of the checker, import the copy, and show that the behaviour the named test
  // asserts is gone — while the unmutated checker keeps it.
  const source = readFileSync(join(REPO_ROOT, "scripts", "security", "s1", "risk-register-check.mjs"), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "s1-spot-"));
  try {
    mkdirSync(join(dir, "scripts", "security", "s1"), { recursive: true });
    cpSync(join(REPO_ROOT, "docs", "security"), join(dir, "docs", "security"), { recursive: true });
    const load = async (id) => {
      const e = MUTATION_MANIFEST.find((x) => x.id === id);
      const m = applyMutation(source, e);
      assert.ok(m.ok, `${id} applies`);
      const file = join(dir, "scripts", "security", "s1", `mutant-${id}.mjs`);
      writeFileSync(file, m.mutated, "utf8");
      return import(pathToFileURL(file).href);
    };
    const shadowed = withShadowedProperty(`AKIA${"Q".repeat(16)}`);
    const m15 = await load("R4-M15");
    assert.ok(registerSecretHits(shadowed).some((h) => h.level === "RAW"), "the real checker sees it");
    assert.equal(m15.registerSecretHits(shadowed).some((h) => h.level === "RAW"), false, "M15 does not");

    const m01 = await load("R4-01a");
    assert.ok(assignedSecretHits("SMTP_PASS=real-secret-value").length > 0);
    assert.deepEqual(m01.assignedSecretHits("SMTP_PASS=real-secret-value"), [], "R4-01a misses SMTP_PASS");

    const m02 = await load("R4-02");
    assert.ok(assignedSecretHits('AUTH_SECRET="SET"realvalue').length > 0);
    assert.deepEqual(m02.assignedSecretHits('AUTH_SECRET="SET"realvalue'), [], "R4-02 lets the glued value through");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ════════ the final assurance review's findings (S1-R5 F-01 … F-05, I-01 … I-05) ═══════

// ──────── F-01: every gate's wiring, called directly ──────────────────────────
//
// A command-line run of a mutated checker used to meet the stale mutation manifest
// first, so a CLI test failed whatever the mutation did. These tests call `runGates`
// in process on a fixture that violates exactly one gate. The message names the gate,
// the code expected and the code that came back: that text is the FINGERPRINT a
// targeted kill must carry, and "got 25" is refused as incidental by the classifier.

function wiring(name, { reg = REGISTER, md = REPORT, registerText = RAW, reviewClosure, mutationManifest } = {}) {
  const got = runGates(reg, md, REPO_ROOT, { registerText, reviewClosure, mutationManifest });
  const expected = EXIT[name];
  assert.equal(got?.code ?? null, expected, `WIRING:${name} expected ${expected} got ${got?.code ?? null}`);
  return got;
}

test("S1-R5 F-01 wiring: the live deliverables pass every gate in process", () => {
  assert.equal(runGates(REGISTER, REPORT, REPO_ROOT, { registerText: RAW }), null);
});

test("S1-R5 F-01 wiring: a stored dominant impact stops runGates with exit 20", () => {
  const raw = clone();
  riskIn(raw, "R-01").dominantImpact = ["AVAILABILITY"];
  wiring("DOMINANT_IMPACT", { reg: raw, registerText: `${JSON.stringify(raw, null, 2)}\n` });
});

test("S1-R5 F-01 wiring: a register in non-canonical form stops runGates with exit 14", () => {
  wiring("NOT_CANONICAL", { registerText: `${JSON.stringify(clone(), null, 4)}\n` });
});

test("S1-R5 F-01 wiring: a shrunken finding universe stops runGates with exit 18", () => {
  const reg = withRisk("R-04", (r, all) => { all.findings = all.findings.filter((f) => f.findingId !== "EDGE-02"); });
  wiring("FINDING_UNIVERSE", { reg, registerText: render(reg), md: regenerated(reg) });
});

test("S1-R5 F-01 wiring: an unlinked verification method stops runGates with exit 19", () => {
  const reg = withRisk("R-40", (r) => { r.acceptanceCriteria = ["gate"]; });
  wiring("VERIFICATION_LINKAGE", { reg, registerText: render(reg), md: regenerated(reg) });
});

test("S1-R5 F-01 wiring: a contradiction of the runtime evidence stops runGates with exit 15", () => {
  wiring("CONTRADICTION", { md: REPORT.replace("## 2. Threat model", "The single precondition is unverified.\n\n## 2. Threat model") });
});

test("S1-R5 F-01 wiring: summary drift stops runGates with exit 13", () => {
  wiring("SUMMARY_DRIFT", { md: REPORT.replace("SEVERITY_HIGH = 35", "SEVERITY_HIGH = 36") });
});

test("S1-R5 F-01 wiring: a hand edit inside a generated block stops runGates with exit 21", () => {
  const first = markdownBlocks(REGISTER).matrix.split("\n")[0];
  wiring("BLOCK_DRIFT", { md: REPORT.replace(first, `${first} x`) });
});

test("S1-R5 F-01 wiring: a stale narrative figure stops runGates with exit 24", () => {
  wiring("NARRATIVE_FACT", { md: REPORT.replace("<!-- S1-FACT:S1_FINDINGS_TOTAL -->161<", "<!-- S1-FACT:S1_FINDINGS_TOTAL -->160<") });
});

test("S1-R5 F-01 wiring: a secret in a deliverable stops runGates with exit 22", () => {
  const got = wiring("SECRET_IN_DELIVERABLE", { md: `${REPORT}\nJWT_ACCESS_SECRET=s3cr3tvaluethatislong\n` });
  assert.match(got.label, /secret-shaped value/, "WIRING-LABEL:SECRET_IN_DELIVERABLE the label names the gate");
});

test("S1-R5 F-01 wiring: an operational command in a deliverable stops runGates with exit 23", () => {
  wiring("FORBIDDEN_IN_DELIVERABLE", { md: `${REPORT}\nsudo ufw status verbose\n` });
});

test("S1-R5 F-01 wiring: a mutation record that is not a targeted kill stops runGates with exit 25", () => {
  const notKilled = { ...MUTATION_CAMPAIGN, observed: { ...MUTATION_CAMPAIGN.observed, [MUTATION_MANIFEST[0].id]: "ONLY_INCIDENTAL" } };
  wiring("MUTATION_MANIFEST", { mutationManifest: { manifest: MUTATION_MANIFEST, campaign: notKilled, controls: PLACEBO_CONTROLS } });
  const unbound = { ...MUTATION_CAMPAIGN, manifestSha256: "0".repeat(64) };
  wiring("MUTATION_MANIFEST", { mutationManifest: { manifest: MUTATION_MANIFEST, campaign: unbound, controls: PLACEBO_CONTROLS } });
  // and the committed evidence passes the same gate
  assert.equal(runGates(REGISTER, REPORT, REPO_ROOT, { registerText: RAW, mutationManifest: { manifest: MUTATION_MANIFEST, campaign: MUTATION_CAMPAIGN, controls: PLACEBO_CONTROLS } }), null);
});

test("S1-R5 F-01 wiring: an open review finding stops runGates with exit 26", () => {
  const open = REVIEW_CLOSURE.map((r, i) => (i === 0 ? [r[0], r[1], "OPEN", r[3], r[4]] : r));
  wiring("OPEN_REVIEW_FINDING", { reviewClosure: open });
});

test("S1-R5 F-01 rebinding: a copy is rebound by metadata only, and the placebo copy is rebound the same way", () => {
  const source = readFileSync(join(REPO_ROOT, "scripts", "security", "s1", "risk-register-check.mjs"), "utf8");
  const outside = (s) => s.slice(0, s.indexOf("// <MUTATION-MANIFEST>")) + s.slice(s.indexOf("// </MUTATION-MANIFEST>"));
  for (const id of ["R3-X03", "R3-T05", "R3-D01"]) {
    const e = MUTATION_MANIFEST.find((x) => x.id === id);
    const m = applyMutation(source, e);
    assert.ok(m.ok, `${id} applies once`);
    const r = rebindSource(m.mutated, e.id);
    assert.equal(r.ok, true, `REBIND:${id} the rebound copy passes its own manifest gate`);
    assert.ok(r.dropped.includes(e.id), "the entry under test is dropped from the copy");
    assert.equal(outside(r.source), outside(m.mutated), `REBIND:${id} only the region changes: the mutated code is never repaired`);
    assert.deepEqual(mutationManifestViolations(r.source, r.kept, r.rebound, r.keptControls), [], "the copy's gate is clean");
    const p = rebindSource(applyMutation(source, e, e.placebo).mutated, e.id);
    assert.deepEqual(p.kept.map((x) => x.id), r.kept.map((x) => x.id), `REBIND:${id} the placebo copy keeps the same entries`);
  }
  // a mutation that also invalidates a SIBLING's anchor drops the sibling as well
  const twin = MUTATION_MANIFEST.find((x) => x.id === "R3-D15");
  const twinned = rebindSource(applyMutation(source, twin).mutated, twin.id);
  assert.equal(twinned.ok, true, "REBIND:R3-D15 the rebound copy passes its own manifest gate");
  assert.deepEqual(twinned.dropped.sort(), ["R3-D14", "R3-D15"], "REBIND:SIBLING a collaterally stale entry is dropped too");
  // a rebinding that cannot verify is reported, never silently used
  assert.equal(rebindSource("no region here", "R3-X03").ok, false);
  const unpatternable = MUTATION_MANIFEST.map((e, i) => (i === 0 ? { ...e, fingerprint: "(" } : e));
  assert.equal(rebindSource(source, "R3-X03", unpatternable).ok, false, "REBIND:VERIFIED a list the gate refuses is never used as a rebinding");
});

// ──────── F-02: the classifier, driven through every branch ───────────────────

const CLASSIFY_ENTRY = Object.freeze({ id: "T-1", detector: "the named test", fingerprint: "WIRING:SECRET_IN_DELIVERABLE expected 22 got null" });
const tapRun = (state, text = "") => ({ code: state === "ok" ? 0 : 1, tests: { "the named test": { state, text } } });
const KILLED_RUN = tapRun("not ok", "  error: 'WIRING:SECRET_IN_DELIVERABLE expected 22 got null'");

function expectStatus(scenario, over, want) {
  let got;
  try {
    got = classifyMutantRun({ entry: CLASSIFY_ENTRY, anchorCount: 1, rebound: true, mutant: KILLED_RUN, placebo: tapRun("ok"), ...over }).status;
  } catch (e) {
    got = `THREW ${e.name}`;
  }
  assert.equal(got, want, `CLASSIFY:${scenario} expected ${want} got ${got}`);
}

test("S1-R5 F-02 classifier: a named failure with its fingerprint and a green placebo is a TARGETED_KILL", () => {
  expectStatus("TARGETED", {}, "TARGETED_KILL");
});

test("S1-R5 F-02 classifier: a failure that only reaches exit 25 is ONLY_INCIDENTAL", () => {
  // the fingerprint is deliberately loose enough to match, so the manifest rule alone must refuse it
  const loose = { ...CLASSIFY_ENTRY, fingerprint: "WIRING:SECRET_IN_DELIVERABLE expected 22 got \\w+" };
  expectStatus("EXIT_25", { entry: loose, mutant: tapRun("not ok", "  error: 'WIRING:SECRET_IN_DELIVERABLE expected 22 got 25'") }, "ONLY_INCIDENTAL");
  expectStatus("EXIT_25_ACTUAL", { entry: { ...CLASSIFY_ENTRY, fingerprint: "." }, mutant: tapRun("not ok", "  expected: 0\n  actual: 25") }, "ONLY_INCIDENTAL");
  expectStatus(
    "MANIFEST_STALE",
    { entry: { ...CLASSIFY_ENTRY, fingerprint: "." }, mutant: tapRun("not ok", "  error: 'the mutation manifest is stale, unbound to its campaign, or records a survivor'") },
    "ONLY_INCIDENTAL",
  );
  expectStatus("MANIFEST_ANCHOR", { entry: { ...CLASSIFY_ENTRY, fingerprint: "." }, mutant: tapRun("not ok", '  error: \'{"why":"MUTATION_ANCHOR_STALE","id":"R3-D01"}\'') }, "ONLY_INCIDENTAL");
  // but a test that is ABOUT the manifest gate says "expected exit 25", and its failure is the point
  const aboutTheGate = { ...CLASSIFY_ENTRY, fingerprint: "WIRING:MUTATION_MANIFEST expected 25 got" };
  expectStatus(
    "ABOUT_THE_MANIFEST_GATE",
    { entry: aboutTheGate, mutant: tapRun("not ok", "  error: 'WIRING:MUTATION_MANIFEST expected 25 got null'") },
    "TARGETED_KILL",
  );
});

test("S1-R5 F-02 classifier: a setup error is INVALID_MUTANT, never a kill", () => {
  const any = { ...CLASSIFY_ENTRY, fingerprint: "." };
  expectStatus("SETUP_SYNTAX", { entry: any, mutant: tapRun("not ok", "  error: 'SyntaxError: Unexpected token'") }, "INVALID_MUTANT");
  expectStatus("SETUP_IMPORT", { entry: any, mutant: tapRun("not ok", "  error: 'does not provide an export named runGates'") }, "INVALID_MUTANT");
});

test("S1-R5 F-02 classifier: a named test that did not run is INVALID_MUTANT", () => {
  expectStatus("NOT_RUN", { mutant: { code: 1, tests: { "another test": { state: "not ok", text: "" } } } }, "INVALID_MUTANT");
});

test("S1-R5 F-02 classifier: a green named test is SURVIVED even when another test fails", () => {
  const otherRed = { code: 1, tests: { "the named test": { state: "ok", text: "" }, "another test": { state: "not ok", text: "  error: 'WIRING:SECRET_IN_DELIVERABLE expected 22 got null'" } } };
  expectStatus("OTHER_TEST_RED", { mutant: otherRed }, "SURVIVED");
});

test("S1-R5 F-02 classifier: a red placebo voids the kill", () => {
  expectStatus("PLACEBO_RED", { placebo: KILLED_RUN }, "INVALID_MUTANT");
  expectStatus("PLACEBO_NOT_RUN", { placebo: null }, "INVALID_MUTANT");
});

test("S1-R5 F-02 classifier: a failure without the fingerprint is ONLY_INCIDENTAL", () => {
  expectStatus("NO_FINGERPRINT", { mutant: tapRun("not ok", "  error: 'WIRING:SECRET_IN_DELIVERABLE expected 22 got 3'") }, "ONLY_INCIDENTAL");
});

test("S1-R5 F-02 classifier: an anchor that is not unique, or a copy that was not rebound, is INVALID_MUTANT", () => {
  expectStatus("ANCHOR_ZERO", { anchorCount: 0 }, "INVALID_MUTANT");
  expectStatus("ANCHOR_TWO", { anchorCount: 2 }, "INVALID_MUTANT");
  expectStatus("NOT_REBOUND", { rebound: false }, "INVALID_MUTANT");
});

test("S1-R5 F-02 campaign: anything but a TARGETED_KILL makes the campaign exit non-zero", () => {
  const clean = [{ kind: "mutant", status: "TARGETED_KILL" }, { kind: "control", status: "SURVIVED", expected: "SURVIVED" }];
  assert.equal(summarizeCampaign(clean, "REMOVED").exitCode, 0, "CAMPAIGN:CLEAN expected exit 0");
  for (const s of ["ONLY_INCIDENTAL", "SURVIVED", "INVALID_MUTANT"]) {
    const sum = summarizeCampaign([...clean, { kind: "mutant", status: s }], "REMOVED");
    assert.equal(sum.exitCode, 1, `CAMPAIGN:${s} expected exit 1 got ${sum.exitCode}`);
    assert.equal(sum.deviations, 1);
    assert.equal(sum[s], 1);
  }
  const control = summarizeCampaign([...clean, { kind: "control", status: "TARGETED_KILL", expected: "ONLY_INCIDENTAL" }], "REMOVED");
  assert.equal(control.exitCode, 1, `CAMPAIGN:CONTROL_DIFFERS expected exit 1 got ${control.exitCode}`);
  assert.equal(summarizeCampaign(clean, "LEFT_BEHIND").exitCode, 1, "CAMPAIGN:TEMP_LEFT_BEHIND expected exit 1");
});

test("S1-R5 F-02 tap: the parser keeps ok and not ok results, drops skipped ones, and never reads the stack", () => {
  const tap = [
    "TAP version 13",
    "ok 1 - alpha",
    "  ---",
    "  duration_ms: 1",
    "  ...",
    "not ok 2 - beta \\# with a hash",
    "  ---",
    "  location: 'C:\\\\tmp\\\\x.mjs:1:1'",
    "  error: 'WIRING:X expected 1 got 2'",
    "  stack: |-",
    "    SyntaxError: in a frame, not in the failure",
    "  ...",
    "ok 3 - gamma # SKIP test name does not match pattern",
  ].join("\n");
  const { tests } = parseTapResults(tap);
  assert.deepEqual(Object.keys(tests).sort(), ["alpha", "beta # with a hash"], "TAP:SKIP a filtered test did not run");
  assert.equal(tests.alpha.state, "ok");
  assert.equal(tests["beta # with a hash"].state, "not ok");
  assert.match(tests["beta # with a hash"].text, /WIRING:X expected 1 got 2/);
  assert.equal(/SyntaxError|location/.test(tests["beta # with a hash"].text), false, "TAP:STACK the stack and the location are never evidence");
});

// ──────── F-03: property NAMES are scanned decoded, at every depth ───────────

/** A register text whose R-04 carries `notes` exactly as given. */
function registerWithNotes(notes) {
  const reg = clone();
  riskIn(reg, "R-04").notes = notes;
  return render(reg);
}

const KEY_SECRET_PROBES = [
  ["a newline then an AWS key", `note\nAKIA${"Q".repeat(16)}`, "AWS_ACCESS_KEY_ID"],
  ["a tab then a GitHub token", `\tghp_${"a".repeat(36)}`, "GITHUB_TOKEN"],
  ["a JWT", `eyJ${"a".repeat(20)}.${"b".repeat(20)}.${"c".repeat(20)}`, "JWT_THREE_PART"],
  ["an assignment", "AUTH_SECRET=s3cr3tvaluethatislong", "ASSIGNED_SECRET_VALUE"],
];

test("S1-R5 F-03: every property NAME is scanned decoded, with its path, for secret shapes and assignments", () => {
  for (const [label, key, kind] of KEY_SECRET_PROBES) {
    for (const [shape, notes, pathTail] of [
      ["flat", { [key]: "x" }, `["notes"][${JSON.stringify(key)}]`],
      ["nested", { outer: { [key]: "x" } }, `["outer"][${JSON.stringify(key)}]`],
      ["array, then object, then key", [{ [key]: "x" }], `["notes"][0][${JSON.stringify(key)}]`],
    ]) {
      const text = registerWithNotes(notes);
      const hits = registerSecretHits(text);
      assert.ok(
        hits.some((h) => h.kind === kind && h.level === "STRUCTURED_KEY" && h.path.endsWith(pathTail)),
        `KEY_SECRET:${label}/${shape} ${JSON.stringify(hits.map((h) => [h.kind, h.level, h.path]))}`,
      );
      assert.ok(secretShapeViolations(text, REPORT).some((h) => h.kind === kind), `${label}/${shape}: the gate fails`);
    }
  }
  // the \u000a escape is the same name as \n once decoded
  const escaped = registerWithNotes({ PLACEHOLDER_NAME: "x" }).replace('"PLACEHOLDER_NAME"', `"note\\u000aAKIA${"Q".repeat(16)}"`);
  assert.ok(registerSecretHits(escaped).some((h) => h.kind === "AWS_ACCESS_KEY_ID" && h.level === "STRUCTURED_KEY"), "KEY_SECRET:u000a");
});

const KEY_FORBIDDEN_PROBES = [
  ["nmap", "nmap -sS 10.0.0.1", "SCANNER_OR_PROBE_COMMAND"],
  ["testssl.sh", "testssl.sh host.example.org", "SCANNER_OR_PROBE_COMMAND"],
  ["a system path", "/etc/hermes/app.conf", "UNIX_SYSTEM_ABSOLUTE_PATH"],
  ["a newline then sudo", "note\nsudo ufw status", "NETWORK_OR_PRIVILEGE_COMMAND"],
];

test("S1-R5 F-03: every property NAME is scanned for forbidden content at the STRUCTURED_KEY level", () => {
  for (const [label, key, kind] of KEY_FORBIDDEN_PROBES) {
    for (const [shape, notes] of [["flat", { [key]: "x" }], ["nested", { outer: { [key]: "x" } }], ["array, then object, then key", [{ [key]: "x" }]]]) {
      const text = registerWithNotes(notes);
      const hits = registerForbiddenHits(text);
      assert.ok(
        hits.some((h) => h.kind === kind && h.level === "STRUCTURED_KEY" && h.path.endsWith(`[${JSON.stringify(key)}]`)),
        `KEY_FORBIDDEN:${label}/${shape} ${JSON.stringify(hits.map((h) => [h.kind, h.level ?? "RAW"]))}`,
      );
      assert.ok(deliverableForbiddenViolations(text, REPORT).some((h) => h.kind === kind), `${label}/${shape}: the gate fails`);
    }
  }
});

test("S1-R5 F-03: benign property names pass, and de-duplication keeps the STRUCTURED_KEY witness", () => {
  const benign = registerWithNotes({ "dig into the evidence": "x", "telnet is not exposed": "x", "https://example.com": "x", SMTP_HOST: "mail.example.org", nested: [{ PASSWORD_HASH: "argon2id" }] });
  assert.deepEqual(registerSecretHits(benign), [], "KEY_NEGATIVE:secret");
  assert.deepEqual(registerForbiddenHits(benign), [], "KEY_NEGATIVE:forbidden");
  const once = registerSecretHits(registerWithNotes({ "AUTH_SECRET=s3cr3tvaluethatislong": "x" })).filter((h) => h.kind === "ASSIGNED_SECRET_VALUE");
  assert.equal(once.length, 1, "one credential, one finding");
  assert.equal(once[0].level, "STRUCTURED_KEY", "KEY_DEDUPE: the structured witness survives de-duplication");
  const walked = [];
  walkJsonKeys({ a: [{ b: { c: 1 } }] }, (path) => walked.push(path));
  assert.deepEqual(walked, ['$["a"]', '$["a"][0]["b"]', '$["a"][0]["b"]["c"]'], "the key walk is deterministic and reaches every depth");
});

// ──────── F-04: a qualifier fails CLOSED ──────────────────────────────────────

const QUALIFIED_CREDENTIAL_NAMES = ["STRIPE_SECRET_KEY_LIVE", "JWT_SECRET_LEGACY", "SMTP_PASS_FALLBACK", "API_KEY_ENC", "DATABASE_PASSWORD_EU", "AUTH_SECRET_BLUE", "SMTP_PASS_CANARY"];

test("S1-R5 F-04: an unknown qualifier after a credential family stays sensitive in every syntax", () => {
  for (const n of QUALIFIED_CREDENTIAL_NAMES) {
    assert.ok(isSensitiveKeyName(n), `QUALIFIER:${n} must stay sensitive`);
    for (const form of [`${n}=${UNSAFE_VALUE}`, `${n.toLowerCase()}: ${UNSAFE_VALUE}`, `"${n}": "${UNSAFE_VALUE}"`, `  ${n}: "${UNSAFE_VALUE}"`]) {
      assert.ok(assignedSecretHits(form).length > 0, `QUALIFIER:${n} in ${JSON.stringify(form)} must fail`);
    }
    const reg = clone();
    riskIn(reg, "R-04").credentials = { [n]: UNSAFE_VALUE };
    assert.ok(registerSecretHits(render(reg)).some((h) => h.level === "STRUCTURED" && h.key === n), `QUALIFIER:${n} as a register property`);
  }
  // a qualifier nobody has listed is covered too
  for (let i = 1; i <= 6; i += 1) {
    const q = syntheticWord(i + 40);
    if (KEY_METADATA_SUFFIXES.includes(q.toLowerCase())) continue;
    assert.ok(isSensitiveKeyName(`AUTH_SECRET_${q}`), `QUALIFIER:AUTH_SECRET_${q}`);
  }
});

test("S1-R5 F-04: only the closed metadata suffixes and look-alike words are exempt", () => {
  assert.deepEqual(
    [...KEY_METADATA_SUFFIXES].sort(),
    ["count", "dir", "expiry", "file", "hash", "id", "length", "name", "path", "policy", "state", "status", "ttl", "url"],
    "METADATA:the exemption list is closed and pinned",
  );
  for (const n of ["bypass", "compass", "passport", "PASSPORT_FILE", "PASSWORD_HASH", "AUTH_SECRET_FILE", "JWT_SECRET_TTL", "API_KEY_ID", "SMTP_PASS_PATH"]) {
    assert.equal(isSensitiveKeyName(n), false, `NOT_SENSITIVE:${n}`);
    for (const form of [`${n}=real-secret-value`, `${n}: real-secret-value`, `"${n}": "real-secret-value"`]) {
      assert.deepEqual(assignedSecretHits(form), [], `NOT_SENSITIVE:${n} in ${JSON.stringify(form)}`);
    }
    const reg = clone();
    riskIn(reg, "R-04").credentials = { [n]: "real-secret-value" };
    assert.equal(registerSecretHits(render(reg)).some((h) => h.key === n), false, `NOT_SENSITIVE:${n} as a register property`);
  }
});

// ──────── F-05: Markdown wrappers and DNS record types ────────────────────────

const WRAPPED_FORBIDDEN = [
  ["bold", "**/proc/x**", "UNIX_SYSTEM_ABSOLUTE_PATH"],
  ["table bar", "|/usr/x|", "UNIX_SYSTEM_ABSOLUTE_PATH"],
  ["link bracket", "[/var/log/x]", "UNIX_SYSTEM_ABSOLUTE_PATH"],
  ["quote marker", ">/var/log/x", "UNIX_SYSTEM_ABSOLUTE_PATH"],
  ["inline code", "`/proc/x`", "UNIX_SYSTEM_ABSOLUTE_PATH"],
  ["dig A", "dig A example.com", "SCANNER_OR_PROBE_COMMAND"],
  ["dig AAAA", "dig AAAA example.com", "SCANNER_OR_PROBE_COMMAND"],
  ["dig MX", "dig MX example.com", "SCANNER_OR_PROBE_COMMAND"],
  ["nmap -sS", "nmap -sS host", "SCANNER_OR_PROBE_COMMAND"],
  ["testssl.sh", "testssl.sh host", "SCANNER_OR_PROBE_COMMAND"],
];

test("S1-R5 F-05: a wrapped system path or a probe command fails in Markdown and at every JSON level", () => {
  for (const [label, sample, kind] of WRAPPED_FORBIDDEN) {
    assert.ok(reportForbiddenHits(`See ${sample} here.`, "probe").some((h) => h.kind === kind), `WRAPPED:${label} markdown`);
    const decoded = renderedWith(sample);
    assert.ok(reportForbiddenHits(decoded, "raw").some((h) => h.kind === kind), `WRAPPED:${label} JSON raw`);
    assert.ok(registerForbiddenHits(decoded).some((h) => h.kind === kind && h.path), `WRAPPED:${label} JSON decoded`);
    assert.ok(registerForbiddenHits(registerWithNotes({ [sample]: "x" })).some((h) => h.kind === kind && h.level === "STRUCTURED_KEY"), `WRAPPED:${label} JSON structured key`);
  }
});

test("S1-R5 F-05: English uses of dig and telnet and benign URLs still pass", () => {
  for (const benign of ["dig into the evidence", "telnet is not exposed", "https://example.com", "see https://example.org/usr/share/doc", "http://example.org/proc/x", "a dig at the design", "src/usr/x"]) {
    assert.deepEqual(reportForbiddenHits(benign, "probe"), [], `BENIGN:${benign} markdown`);
    assert.deepEqual(registerForbiddenHits(renderedWith(benign)), [], `BENIGN:${benign} JSON`);
    assert.deepEqual(registerForbiddenHits(registerWithNotes({ [benign]: "x" })), [], `BENIGN:${benign} JSON key`);
  }
});

// ──────── I-01 … I-05 ─────────────────────────────────────────────────────────

// S1-FA-04: the regex scan that stood here is gone. Whether a test asserts is now
// observed by the assertion ledger while it runs (see the end of this file), and the
// ledger itself is proven on fixtures below.

test("S1-R5 I-02: an open review finding changes the closure text and turns the gate red", () => {
  assert.deepEqual(reviewClosureViolations(), [], "the committed table has no open finding");
  assert.match(renderReviewClosure(REGISTER), /No review finding is OPEN\./);
  const target = REVIEW_CLOSURE[2][0];
  const one = REVIEW_CLOSURE.map((r) => (r[0] === target ? [r[0], r[1], "OPEN", r[3], r[4]] : r));
  assert.deepEqual(reviewClosureViolations(one).map((v) => v.id), [target], "REVIEW_GATE:the gate sees the open finding");
  const text = renderReviewClosure(REGISTER, one);
  assert.equal(/No review finding is OPEN/.test(text), false, "REVIEW_TEXT:the sentence is derived, not typed");
  assert.ok(text.includes(`1 review finding is OPEN: ${target}.`), "REVIEW_TEXT:the open finding is named");
  const two = REVIEW_CLOSURE.map((r, i) => (i < 2 ? [r[0], r[1], "IN_PROGRESS", r[3], r[4]] : r));
  assert.ok(renderReviewClosure(REGISTER, two).includes(`2 review findings are OPEN: ${REVIEW_CLOSURE[0][0]}, ${REVIEW_CLOSURE[1][0]}.`));
  for (const s of REVIEW_CLOSED_STATUSES) assert.ok(REVIEW_CLOSURE.some((r) => r[2] === s), `${s} is a status the table uses`);
});

test("S1-R5 I-03: a missing register exits 1 and prints no absolute path and no stack trace", () => {
  withMirror(({ dir, run }) => {
    run();
    rmSync(join(dir, "docs", "security", "s1-risk-register.json"));
    const p = spawnSync(process.execPath, [join(dir, "scripts", "security", "s1", "risk-register-check.mjs"), "check"], { encoding: "utf8", timeout: 120000 });
    assert.equal(p.status, EXIT.MISSING_FILE, `MISSING:expected 1 got ${p.status}`);
    assert.equal(p.stderr.includes(dir), false, `MISSING:PATH the workspace path is printed: ${p.stderr.trim()}`);
    assert.deepEqual(reportForbiddenHits(p.stderr, "stderr"), [], `MISSING:FORBIDDEN ${p.stderr.trim()}`);
    assert.equal(/\n\s+at /.test(p.stderr), false, "MISSING:STACK no stack trace");
    assert.match(p.stderr, /missing docs\/security\/s1-risk-register\.json/, "the logical name is still given");
  });
});

test("S1-FA-03: a register that is not JSON prints a fixed logical message, never the parser's quotation of it", () => {
  withMirror(({ run }) => {
    for (const lead of ["C:\\Users\\John Smith\\m\\docs\\security\\s1-risk-register.json", "/home/John Smith/register.json", "\\\\server\\share name\\register.json"]) {
      const r = run({ registerText: `${lead} is not JSON` });
      assert.equal(r.code, EXIT.INTERNAL_ERROR, `FIXED_MESSAGE:${lead} expected 70, got ${r.code}`);
      assert.match(r.err, /internal error: docs\/security\/s1-risk-register\.json is not readable JSON/, `FIXED_MESSAGE:${lead} ${r.err.trim()}`);
      for (const fragment of ["John", "Smith", "Users", "server", "share", "home"]) {
        assert.equal(r.err.includes(fragment), false, `FIXED_MESSAGE:LEAK ${fragment} in ${r.err.trim()}`);
      }
      assert.equal(/\n\s+at /.test(r.err), false, "no stack trace");
    }
  });
});

test("S1-R5 I-03: absolute Windows and Unix paths are redacted from a message", () => {
  for (const [input, leak] of [
    ["ENOENT: open 'C:\\Users\\operator\\x.json'", "operator"],
    ["ENOENT: open 'D:/work/hermes/x.json'", "work"],
    ["read \\\\server\\share\\x", "server"],
    ["ENOENT: open '/home/operator/x.json'", "operator"],
    ["at /var/lib/app/x.mjs", "lib/app"],
    ["(/tmp/s1-x/y)", "s1-x"],
  ]) {
    const out = redactPaths(input);
    assert.equal(out.includes(leak), false, `REDACT_UNIT:${input} -> ${out}`);
    assert.deepEqual(reportForbiddenHits(out, "message"), [], `REDACT_UNIT:${input} -> ${out}`);
  }
  assert.equal(redactPaths("exit 25 at the gate"), "exit 25 at the gate", "text without a path is unchanged");
  assert.equal(redactPaths("docs/security/s1-risk-register.json"), "docs/security/s1-risk-register.json", "a repository-relative path is kept");
});

test("S1-R5 I-04: leading underscores do not hide a credential name", () => {
  for (const n of ["_SECRET", "_AUTH_SECRET", "__SMTP_PASS", "_jwtSecret"]) {
    assert.ok(isSensitiveKeyName(n), `UNDERSCORE:${n} is sensitive`);
    for (const form of [`${n}=${UNSAFE_VALUE}`, `${n}: ${UNSAFE_VALUE}`, `"${n}": "${UNSAFE_VALUE}"`]) {
      assert.ok(assignedSecretHits(form).length > 0, `UNDERSCORE:${form} must fail`);
    }
    const reg = clone();
    riskIn(reg, "R-04").credentials = { [n]: UNSAFE_VALUE };
    assert.ok(registerSecretHits(render(reg)).some((h) => h.level === "STRUCTURED" && h.key === n), `UNDERSCORE:${n} as a register property`);
  }
  for (const n of ["_PATH", "_", "__", "_AUTH_SECRET_FILE"]) {
    assert.equal(isSensitiveKeyName(n), false, `UNDERSCORE_NEGATIVE:${n}`);
    assert.deepEqual(assignedSecretHits(`${n}=${UNSAFE_VALUE}`), [], `UNDERSCORE_NEGATIVE:${n}=…`);
  }
});

test("S1-R5 I-05: credentials in URI userinfo fail for every scheme; credential-free and placeholder URIs pass", () => {
  for (const scheme of ["valkey", "valkeys", "memcached", "ldap", "ldaps", "http", "https"]) {
    for (const uri of [`${scheme}://user:s3cr3tvalue@host.internal`, `${scheme}://:s3cr3tvalue@host.internal:1234/x`]) {
      assert.ok(secretShapeHits(uri, "probe").some((h) => h.kind === "CONNECTION_STRING_WITH_CREDENTIAL"), `URI:${uri} must fail`);
      assert.ok(registerSecretHits(renderedWith(uri)).some((h) => h.kind === "CONNECTION_STRING_WITH_CREDENTIAL"), `URI:${uri} in the register`);
    }
    for (const uri of [`${scheme}://host.internal:1234/x`, `${scheme}://user@host.internal`, `${scheme}://:REDACTED@host`, `${scheme}://:<redacted>@host`, `${scheme}://:\${SERVICE_PASSWORD}@host`, `${scheme}://user:SET@host`]) {
      assert.deepEqual(secretShapeHits(uri, "probe"), [], `URI_NEGATIVE:${uri} must pass`);
    }
  }
  assert.deepEqual(secretShapeHits("https://example.com", "probe"), [], "URI_NEGATIVE:https://example.com");
});

// ──────── the RAW level: what only the raw text carries ──────────────────────

/** The register text with a duplicated property: JSON.parse keeps the LAST, so the first exists only in the raw text. */
function withShadowedProperty(value) {
  const anchor = '"residualRisk": "';
  assert.ok(RAW.includes(anchor));
  return RAW.replace(anchor, () => `${anchor}${value}", ${anchor}`);
}

test("the RAW register level catches an assignment that only a duplicated JSON key carries", () => {
  const text = withShadowedProperty("AUTH_SECRET=s3cr3tvaluethatislong");
  assert.equal(JSON.stringify(JSON.parse(text)).includes("s3cr3tvaluethatislong"), false, "the parsed register no longer carries it");
  const hits = registerSecretHits(text);
  assert.ok(hits.some((h) => h.kind === "ASSIGNED_SECRET_VALUE" && h.level === "RAW"), `RAW_ONLY:ASSIGNED ${JSON.stringify(hits.map((h) => [h.kind, h.level]))}`);
});

test("S1-R5 M15: a token shape that only a duplicated JSON key carries is caught at the RAW level", () => {
  const token = `AKIA${"Q".repeat(16)}`;
  const text = withShadowedProperty(token);
  assert.equal(JSON.stringify(JSON.parse(text)).includes(token), false, "the parsed register no longer carries it");
  const hits = registerSecretHits(text);
  assert.ok(hits.some((h) => h.kind === "AWS_ACCESS_KEY_ID" && h.level === "RAW"), `RAW_ONLY:SHAPE ${JSON.stringify(hits.map((h) => [h.kind, h.level]))}`);
});

// ════════ the final review's five findings (S1-FA-01 … 05) and observations I1 … I4 ═══════

// ──────── S1-FA-01 / I2: digits, dots and compact names ───────────────────────

const DIGIT_SUFFIXED_NAMES = ["AUTH_SECRET2", "AUTH_SECRET22", "PASSWORD1", "TOKEN2", "DB_PASSWORD2", "API_KEY2", "apiKey2", "jwtSecret3", "SMTP_PASS2026", "smtpPass2026"];

/** Every syntax the review named, for one key and one value. */
const keyForms = (n, v) => [
  ["env", `${n}=${v}`],
  ["env, quoted", `${n}="${v}"`],
  ["YAML", `  ${n}: ${v}`],
  ["YAML, quoted", `  ${n}: '${v}'`],
  ["JSON pair", `"${n}": "${v}"`],
  ["Markdown table", `| ${n}=${v} |`],
];

test("S1-FA-01: a credential name with digits glued to its family fails in every syntax and at every register level", () => {
  for (const n of DIGIT_SUFFIXED_NAMES) {
    assert.ok(isSensitiveKeyName(n), `DIGITS:${n} must be sensitive`);
    for (const [form, text] of keyForms(n, UNSAFE_VALUE)) assert.ok(assignedSecretHits(text).length > 0, `DIGITS:${n} as ${form}`);
    assert.ok(registerSecretHits(renderedWith(`${n}=${UNSAFE_VALUE}`)).some((h) => h.level === "DECODED"), `DIGITS:${n} inside a JSON value`);
    const reg = clone();
    riskIn(reg, "R-04").credentials = { [n]: UNSAFE_VALUE };
    assert.ok(registerSecretHits(render(reg)).some((h) => h.level === "STRUCTURED" && h.key === n), `DIGITS:${n} as a JSON property`);
    assert.ok(registerSecretHits(registerWithNotes({ [`${n}=${UNSAFE_VALUE}`]: "x" })).some((h) => h.level === "STRUCTURED_KEY"), `DIGITS:${n} inside a JSON property name`);
  }
  assert.deepEqual(sensitiveKeySegments("SMTP_PASS2026"), ["smtp", "pass"], "DIGITS:the digits are split off the segment, the segment is not split off the name");
});

test("S1-FA-01: digits never make an ordinary word a credential name", () => {
  for (const n of ["VERSION2", "PASSPORT2", "COMPASS2", "TOKENIZER2", "KEYBOARD2", "SECRETARY2", "PASSWORD_HASH2", "HTTP2_PORT", "S3_BUCKET", "R2", "STEP_2"]) {
    assert.equal(isSensitiveKeyName(n), false, `DIGITS_NEGATIVE:${n}`);
    for (const [form, text] of keyForms(n, "real-value-here")) assert.deepEqual(assignedSecretHits(text), [], `DIGITS_NEGATIVE:${n} as ${form}`);
  }
});

test("S1-FA I2: dotted and compact credential names fail; words that merely contain a family do not", () => {
  for (const n of ["jwt.secret.legacy", "auth.secret.live", "db.password.prod", "JWTSECRET", "DBPASSWORD", "APIKEY2"]) {
    assert.ok(isSensitiveKeyName(n), `COMPACT:${n} must be sensitive`);
    for (const [form, text] of keyForms(n, UNSAFE_VALUE)) assert.ok(assignedSecretHits(text).length > 0, `COMPACT:${n} as ${form}`);
    const reg = clone();
    riskIn(reg, "R-04").credentials = { [n]: UNSAFE_VALUE };
    assert.ok(registerSecretHits(render(reg)).some((h) => h.level === "STRUCTURED" && h.key === n), `COMPACT:${n} as a JSON property`);
  }
  for (const n of ["passport", "tokenizer", "compass", "bypass", "overpass", "secretary", "keyboard", "db.host.prod", "config.version", "api.version"]) {
    assert.equal(isSensitiveKeyName(n), false, `COMPACT_NEGATIVE:${n}`);
    assert.deepEqual(assignedSecretHits(`${n}: real-value-here`), [], `COMPACT_NEGATIVE:${n}`);
  }
  assert.ok(!COMPACT_SENSITIVE_FAMILIES.includes("pass") && !COMPACT_SENSITIVE_FAMILIES.includes("pwd"), "COMPACT:pass and pwd are never compact families (compass, bypass)");
});

// ──────── S1-FA-02: no silent stop at any depth ───────────────────────────────

/** A value nested `depth` objects deep: the outermost object is depth 0 of this value. */
function nestObjects(depth, leaf) {
  let v = leaf;
  for (let i = 0; i < depth; i += 1) v = { n: v };
  return v;
}

/** The same, through arrays, with an object at the bottom. */
function nestArrays(depth, leaf) {
  let v = leaf;
  for (let i = 0; i < depth; i += 1) v = [v];
  return v;
}

test("S1-FA-02: a secret or a command nested 60, 64, 65 and 128 levels deep is a real finding, with its path", () => {
  const secretKey = `AUTH_SECRET=${UNSAFE_VALUE}`;
  const command = "nmap -sS 10.0.0.1";
  for (const d of [60, 64, 65, 128]) {
    const keyText = registerWithNotes(nestObjects(d, { [secretKey]: "x" }));
    const keyHit = registerSecretHits(keyText).find((h) => h.level === "STRUCTURED_KEY");
    assert.ok(keyHit, `DEPTH:${d} a secret property name is found`);
    assert.equal(keyHit.path.split('["n"]').length - 1, d, `DEPTH:${d} the path names every level`);
    const valueText = registerWithNotes(nestObjects(d, secretKey));
    assert.ok(registerSecretHits(valueText).some((h) => h.level === "DECODED"), `DEPTH:${d} a secret value is found`);
    assert.ok(registerForbiddenHits(registerWithNotes(nestObjects(d, command))).some((h) => h.kind === "SCANNER_OR_PROBE_COMMAND"), `DEPTH:${d} a command value is found`);
    assert.ok(registerForbiddenHits(registerWithNotes(nestObjects(d, { [command]: "x" }))).some((h) => h.level === "STRUCTURED_KEY"), `DEPTH:${d} a command property name is found`);
    for (const t of [keyText, valueText]) assert.deepEqual(registerStructureViolations(JSON.parse(t)), [], `DEPTH:${d} is inside the budget`);
  }
});

test("S1-FA-02: an object inside arrays at depth is walked, and the walk stops only at the budget, loudly", () => {
  const walked = [];
  assert.equal(walkJsonKeys(nestArrays(100, { AUTH_SECRET: "x" }), (p, k) => walked.push([p, k])), null, "DEPTH_ARRAY:the walk completes");
  assert.equal(walked.length, 1, "DEPTH_ARRAY:the key at the bottom is visited");
  assert.equal(walked[0][0], `$${"[0]".repeat(100)}["AUTH_SECRET"]`, "DEPTH_ARRAY:its path names every array level");
  assert.ok(registerSecretHits(registerWithNotes(nestArrays(100, { [`AUTH_SECRET=${UNSAFE_VALUE}`]: "x" }))).some((h) => h.level === "STRUCTURED_KEY"), "DEPTH_ARRAY:the register gate finds it");
  // the boundary: the key's own node at exactly the budget is visited; one level more is a violation
  const max = STRUCTURE_LIMITS.maxDepth;
  const atLimit = [];
  assert.equal(walkJsonKeys(nestObjects(max - 1, { k: "x" }), (p, k) => atLimit.push(k)), null, "BUDGET:the deepest permitted level is walked");
  assert.deepEqual(atLimit.slice(-1), ["k"], "BUDGET:and its key is visited");
  const over = walkJsonKeys(nestObjects(max, { k: "x" }), () => {});
  assert.equal(over?.why, "STRUCTURE_LIMIT_EXCEEDED", "BUDGET:one level past the budget is a violation, not a silent stop");
  assert.equal(over.limit, "depth");
  assert.equal(walkJsonStrings(nestObjects(max + 1, "leaf"), () => {})?.why, "STRUCTURE_LIMIT_EXCEEDED", "BUDGET:the value walk reports the same violation");
  // the node budget
  const many = Array(STRUCTURE_LIMITS.maxNodes).fill(0);
  assert.equal(walkJsonKeys(many, () => {})?.limit, "nodes", "BUDGET:one node past the node budget is a violation");
  assert.equal(walkJsonKeys(many.slice(1), () => {}), null, "BUDGET:exactly the node budget is walked");
});

test("S1-FA-02: past the budget every scanner reports STRUCTURE_LIMIT_EXCEEDED — up to the deepest register JSON.parse accepts", () => {
  const overText = registerWithNotes(nestObjects(STRUCTURE_LIMITS.maxDepth, { [`AUTH_SECRET=${UNSAFE_VALUE}`]: "x" }));
  for (const [label, hits] of [["secret", registerSecretHits(overText)], ["forbidden", registerForbiddenHits(overText)]]) {
    assert.ok(hits.some((h) => h.kind === "STRUCTURE_LIMIT_EXCEEDED"), `STRUCTURE:${label} reports the limit`);
  }
  assert.equal(registerStructureViolations(JSON.parse(overText))[0]?.why, "STRUCTURE_LIMIT_EXCEEDED", "STRUCTURE:the structure gate sees it");
  const deepest = `${"[".repeat(1000000)}${"]".repeat(1000000)}`;
  assert.doesNotThrow(() => JSON.parse(deepest), "the environment's parser accepts a million levels");
  assert.ok(registerSecretHits(deepest).some((h) => h.kind === "STRUCTURE_LIMIT_EXCEEDED"), "STRUCTURE:a million levels is a finding, not a stack overflow");
  assert.ok(registerForbiddenHits(deepest).some((h) => h.kind === "STRUCTURE_LIMIT_EXCEEDED"), "STRUCTURE:forbidden scan too");
  assert.equal(registerStructureViolations(JSON.parse(deepest)).length, 1, "STRUCTURE:the gate refuses it");
});

test("S1-FA-02: a deep but healthy structure under the budget passes, right up to the boundary", () => {
  // the notes value sits at depth 3 of the register, so 253 more levels put its leaf exactly at the budget
  for (const d of [200, STRUCTURE_LIMITS.maxDepth - 3]) {
    const text = registerWithNotes(nestObjects(d, "plain words, nothing forbidden"));
    assert.deepEqual(registerSecretHits(text), [], `STRUCTURE_NEGATIVE:${d} secret`);
    assert.deepEqual(registerForbiddenHits(text), [], `STRUCTURE_NEGATIVE:${d} forbidden`);
    assert.deepEqual(registerStructureViolations(JSON.parse(text)), [], `STRUCTURE_NEGATIVE:${d} gate`);
  }
  const arrays = registerWithNotes(nestArrays(200, { harmless: "value" }));
  assert.deepEqual(registerSecretHits(arrays), [], "STRUCTURE_NEGATIVE:arrays");
  assert.deepEqual(registerStructureViolations(JSON.parse(registerWithNotes(nestObjects(STRUCTURE_LIMITS.maxDepth - 2, "x")))).length, 1, "STRUCTURE_NEGATIVE:one more level is over");
});

test("S1-FA-02 wiring: a register past the structure budget stops runGates with exit 27 before any other gate", () => {
  const reg = withRisk("R-04", (r) => { r.notes = nestObjects(STRUCTURE_LIMITS.maxDepth, "x"); });
  wiring("STRUCTURE_LIMIT", { reg, registerText: render(reg) });
});

test("S1-FA-02: the command line finds a secret 128 levels deep, and refuses a register past the budget with exit 27", () => {
  withMirror(({ run }) => {
    const deep = withRisk("R-04", (r) => { r.notes = nestObjects(128, { [`AUTH_SECRET=${UNSAFE_VALUE}`]: "x" }); });
    const r1 = run({ registerText: render(deep), reportText: regenerated(deep) });
    assert.equal(r1.code, EXIT.SECRET_IN_DELIVERABLE, `DEPTH_CLI:expected 22 got ${r1.code} ${r1.err.split("\n")[0]}`);
    const over = withRisk("R-04", (r) => { r.notes = nestObjects(300, "x"); });
    const r2 = run({ registerText: render(over), reportText: regenerated(over) });
    assert.equal(r2.code, EXIT.STRUCTURE_LIMIT, `DEPTH_CLI:expected 27 got ${r2.code} ${r2.err.split("\n")[0]}`);
    assert.match(r2.err, /STRUCTURE_LIMIT_EXCEEDED/);
    const r3 = run({ registerText: `${"[".repeat(1000000)}${"]".repeat(1000000)}` });
    assert.equal(r3.code, EXIT.STRUCTURE_LIMIT, `DEPTH_CLI:a million levels expected 27 got ${r3.code}`);
    assert.equal(/\n\s+at /.test(r2.err + r3.err), false, "no stack trace");
  });
});

// ──────── S1-FA-03: no fragment of a path survives ────────────────────────────

const REDACTION_VECTORS = [
  // [label, message, fragments that must not survive, text that must survive]
  ["Windows path with a space, quoted, with prefix and suffix", "ENOENT: no such file, open 'C:\\Users\\John Smith\\m\\docs\\security\\s1-risk-register.json' (errno -4058)", ["John", "Smith", "Users", "docs", "s1-risk-register"], ["ENOENT: no such file, open", "(errno -4058)"]],
  ["Windows path with a space, unquoted", "cannot read C:\\Users\\John Smith\\m\\docs\\security\\s1-risk-register.json", ["John", "Smith", "Users", "docs"], ["cannot read"]],
  ["Windows path in double quotes", 'open "C:\\Program Files\\Hermes App\\x.json" failed', ["Program", "Files", "Hermes", "App"], ["open", "failed"]],
  ["UNC path with a space, unquoted", "read \\\\srv01\\Share Name\\Mary Ann\\x.json", ["srv01", "Share", "Name", "Mary", "Ann"], ["read"]],
  ["UNC path, quoted", "open '\\\\srv01\\Share Name\\x.json' (code 2)", ["srv01", "Share", "Name"], ["open", "(code 2)"]],
  ["POSIX path with a space, unquoted", "at /home/John Smith/project/x.mjs", ["John", "Smith", "project"], ["at"]],
  ["POSIX path, single-quoted", "open '/var/lib/Mary Ann/x.json' (code 2)", ["Mary", "Ann", "lib"], ["open", "(code 2)"]],
  ["a user name of several words", "C:\\Users\\Ana María de la Cruz\\x", ["Ana", "María", "Cruz"], []],
  ["Unicode", "open '/home/Jürgen Groß/x.json' failed", ["Jürgen", "Groß"], ["open", "failed"]],
  ["two paths in one message", "copy 'C:\\Users\\John Smith\\a' to '/home/Mary Ann/b' failed", ["John", "Smith", "Mary", "Ann"], ["copy", " to ", "failed"]],
  ["curly quotes", "open \u201CC:\\Users\\John Smith\\x.json\u201D failed", ["John", "Smith"], ["open", "failed"]],
  ["a file URI", "load file:///C:/Users/John Smith/x.json", ["John", "Smith", "Users"], ["load"]],
];

test("S1-FA-03: a path with spaces is redacted whole — quoted, unquoted, UNC, POSIX, Unicode, several in one message", () => {
  for (const [label, msg, leaks, kept] of REDACTION_VECTORS) {
    const out = redactPaths(msg);
    for (const l of leaks) assert.equal(out.includes(l), false, `REDACT:${label} leaks ${l}: ${out}`);
    for (const k of kept) assert.ok(out.includes(k), `REDACT_KEPT:${label} lost ${k}: ${out}`);
    assert.match(out, /<path>/, `REDACT:${label} the path is replaced, not dropped`);
    assert.deepEqual(reportForbiddenHits(out, "message"), [], `REDACT:${label} ${out}`);
  }
  // the review's own vector: nothing of it survives, not only the part before the space
  const brief = formatInternalError(new Error("C:\\Users\\John Smith\\m\\docs\\security\\s1-risk-register.json"));
  const briefBody = brief.replace("[s1-risk-register] internal error: ", "");
  for (const l of ["C:", "Users", "John", "Smith", "\\m\\", "docs", "security", "s1-risk-register"]) assert.equal(briefBody.includes(l), false, `REDACT:BRIEF leaks ${l}: ${brief}`);
  for (const t of ["exit 25 at the gate", "docs/security/s1-risk-register.json", "read and/or write", "3/4 of the risks"]) assert.equal(redactPaths(t), t, `REDACT_NEGATIVE:${t}`);
  assert.equal(formatInternalError(new Error("first line\n    at C:\\x\\frame.mjs:1:1")).includes("frame"), false, "REDACT:STACK only the first line is printed");
});

test("S1-FA-03: the real command line prints an internal error with every path redacted and no stack trace", () => {
  withMirror(({ dir }) => {
    const cli = join(dir, "scripts", "security", "s1", "risk-register-check.mjs");
    for (const [label, msg, leaks, kept] of REDACTION_VECTORS) {
      // fault injection in the temporary mirror only: the first serialisation throws this message
      const fault = join(dir, "fault-injection.mjs");
      writeFileSync(fault, `const message = ${JSON.stringify(`${msg}\n    at C:\\Users\\John Smith\\frame.mjs:1:1`)};\nJSON.stringify = () => { throw new Error(message); };\n`, "utf8");
      const p = spawnSync(process.execPath, ["--import", pathToFileURL(fault).href, cli, "check"], { encoding: "utf8", timeout: 120000 });
      assert.equal(p.status, EXIT.INTERNAL_ERROR, `CLI_REDACT:${label} expected 70 got ${p.status} ${p.stderr.trim()}`);
      const body = p.stderr.replace("[s1-risk-register] internal error: ", "");
      for (const l of leaks) assert.equal(body.includes(l), false, `CLI_REDACT:${label} leaks ${l}: ${p.stderr.trim()}`);
      for (const k of kept) assert.ok(p.stderr.includes(k), `CLI_REDACT_KEPT:${label} lost ${k}: ${p.stderr.trim()}`);
      assert.equal(p.stderr.includes("frame"), false, `CLI_REDACT:${label} no stack frame`);
      assert.equal(p.stderr.trim().split("\n").length, 1, `CLI_REDACT:${label} one line: ${p.stderr.trim()}`);
    }
  });
});

test("S1-FA-03: an unreadable Phase 99 source document is a logical finding, not a quotation of its bytes", () => {
  withMirror(({ dir, run }) => {
    writeFileSync(join(dir, "docs", "security", "phase99-findings.json"), "C:\\Users\\John Smith\\x.json is not JSON", "utf8");
    const r = run();
    assert.equal(r.code, EXIT.FINDING_UNIVERSE, `P99_UNREADABLE:expected 18 got ${r.code} ${r.err.split("\n")[0]}`);
    assert.match(r.err, /UNPARSEABLE_SOURCE_DOCUMENT:docs\/security\/phase99-findings\.json/);
    for (const l of ["John", "Smith", "Users"]) assert.equal(r.err.includes(l), false, `P99_UNREADABLE:leaks ${l}`);
  });
});

// ──────── S1-FA-04 / I4: the assertion ledger, proven on fixtures ─────────────

/** A fixture test file that uses the ledger exactly as this file does. */
function ledgerFixture(checkerUrl) {
  return [
    'import { test as nodeTest } from "node:test";',
    'import baseAssert from "node:assert/strict";',
    `import { createAssertionLedger } from ${JSON.stringify(checkerUrl)};`,
    "const ledger = createAssertionLedger(nodeTest, baseAssert);",
    "const { test, assert } = ledger;",
    "const helperThatReturns = () => 1;",
    'test("F00 asserts", () => { assert.ok(true); });',
    'test("F01 no assertion before a helper that asserts", () => { const x = 1; return x; });',
    "function laterHelper() { assert.ok(true); }",
    'test("F02 assert only in a comment", () => {',
    "  // assert.ok(true);",
    "});",
    'test("F03 assert only in a string", () => { const s = "assert.ok(true)"; return s; });',
    'test("F04 a function callback with an assertion", function () { assert.equal(1, 1); });',
    "test(`F05 a template-literal name with an assertion`, () => { assert.ok(true); });",
    'test("F06 an async callback that asserts after an await", async () => { await null; assert.ok(true); });',
    'test("F07 a nested helper without a real assertion", () => { helperThatReturns(); });',
    'test("F08 a real assertion through a helper", () => { laterHelper(); });',
    'test("F09 an async callback without an assertion", async () => { await null; });',
    'test("F10 a function callback without an assertion", function () {});',
    "test(`F11 a template-literal name without an assertion`, () => {});",
    'test("F12 a direct assert() call", () => { assert(true); });',
    'test("F13 a timer that asserts after its test has ended", () => { setTimeout(() => assert.ok(true), 20); assert.ok(true); });',
    'test("F14 a silent test running while another test\'s timer asserts", async () => { await new Promise((r) => setTimeout(r, 120)); });',
    'test("F99 reconcile", () => {',
    "  assert.equal(new Set(ledger.registered).size, ledger.registered.length);",
    "  assert.deepEqual(ledger.registered.filter((n) => !ledger.executed.has(n)), []);",
    "  assert.equal(ledger.executed.size, ledger.registered.length);",
    "});",
    "",
  ].join("\n");
}

const LEDGER_EXPECTED = {
  "F00 asserts": "ok",
  "F01 no assertion before a helper that asserts": "not ok",
  "F02 assert only in a comment": "not ok",
  "F03 assert only in a string": "not ok",
  "F04 a function callback with an assertion": "ok",
  "F05 a template-literal name with an assertion": "ok",
  "F06 an async callback that asserts after an await": "ok",
  "F07 a nested helper without a real assertion": "not ok",
  "F08 a real assertion through a helper": "ok",
  "F09 an async callback without an assertion": "not ok",
  "F10 a function callback without an assertion": "not ok",
  "F11 a template-literal name without an assertion": "not ok",
  "F12 a direct assert() call": "ok",
  "F13 a timer that asserts after its test has ended": "ok",
  "F14 a silent test running while another test's timer asserts": "not ok",
  "F99 reconcile": "ok",
};

test("S1-FA-04: the ledger fails exactly the tests that run no assertion, whatever their source text looks like", () => {
  const dir = mkdtempSync(join(tmpdir(), "s1-ledger-"));
  try {
    const fixture = join(dir, "ledger.fixture.mjs");
    writeFileSync(fixture, ledgerFixture(pathToFileURL(join(REPO_ROOT, "scripts", "security", "s1", "risk-register-check.mjs")).href), "utf8");
    // run as a top-level test runner: this process's child-runner context must not leak into the fixture's
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const p = spawnSync(process.execPath, ["--test", "--test-reporter=tap", fixture], { encoding: "utf8", timeout: 120000, env });
    const { tests } = parseTapResults(`${p.stdout}\n${p.stderr}`);
    for (const [name, want] of Object.entries(LEDGER_EXPECTED)) {
      const got = tests[name]?.state ?? "NOT RUN";
      assert.equal(got, want, `LEDGER:${name} expected ${want} got ${got}`);
      if (want === "not ok") assert.match(tests[name].text, /ASSERTIONLESS:/, `LEDGER:${name} fails for being assertionless, not for another reason`);
    }
    assert.equal(Object.keys(tests).length, Object.keys(LEDGER_EXPECTED).length, "LEDGER:every fixture ran");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ──────── S1-FA-05 / I1: system paths and probes, independent of the wrapper ──

const SYSTEM_PATH_SAMPLES = [
  "{/etc/passwd}", "</proc/x>", ",/usr/x", ";/var/log/x", "!/etc/passwd", "?/proc/x", "\\/etc/passwd", "`/usr/x`",
  "\u201C/etc/passwd\u201D", "\u2018/proc/x\u2019", "\u00AB/etc/passwd\u00BB", "\u2014/etc/passwd", "\u2013/usr/x", "_)/usr/x",
  "cat</etc/passwd", "path;/var/log/x", "file:///etc/passwd", "file://localhost/etc/passwd", "*/etc/passwd*", "_/proc/x_",
  "/opt/app/x", "/srv/data", "/var/lib/x",
];

test("S1-FA-05: a system path is found whatever wraps it — prose, code span, table cell, emphasis, and every JSON level", () => {
  for (const sample of SYSTEM_PATH_SAMPLES) {
    for (const [where, text] of [["prose", `See ${sample} here.`], ["code span", `See \`${sample}\` here.`], ["table cell", `| a | ${sample} |`], ["emphasis", `**${sample}**`]]) {
      assert.ok(reportForbiddenHits(text, "md").some((h) => h.kind === "UNIX_SYSTEM_ABSOLUTE_PATH"), `SYSPATH:${sample} in ${where}`);
    }
    const decoded = renderedWith(sample);
    assert.ok(registerForbiddenHits(decoded).some((h) => h.kind === "UNIX_SYSTEM_ABSOLUTE_PATH" && h.path), `SYSPATH:${sample} JSON decoded`);
    assert.ok(registerForbiddenHits(registerWithNotes({ [sample]: "x" })).some((h) => h.kind === "UNIX_SYSTEM_ABSOLUTE_PATH" && h.level === "STRUCTURED_KEY"), `SYSPATH:${sample} JSON structured key`);
  }
  assert.ok(reportForbiddenHits(renderedWith("{/etc/passwd}"), "raw").some((h) => h.kind === "UNIX_SYSTEM_ABSOLUTE_PATH"), "SYSPATH:JSON raw text");
});

test("S1-FA-05: URLs, relative paths and words that are not system paths pass", () => {
  for (const benign of ["https://example.com", "https://example.org/usr/share/doc", "http://example.org/proc/x", "src/usr/x", "the proc and usr words", "and/or", "3/4 of the risks", "/etcetera/x", "/usr-local/x", "a/etc/b", "docs/security/x.md", "procedure/usr", "the /usr directory is mentioned without a file"]) {
    assert.deepEqual(reportForbiddenHits(benign, "md").filter((h) => h.kind === "UNIX_SYSTEM_ABSOLUTE_PATH"), [], `SYSPATH_NEGATIVE:${benign}`);
    assert.deepEqual(registerForbiddenHits(renderedWith(benign)).filter((h) => h.kind === "UNIX_SYSTEM_ABSOLUTE_PATH"), [], `SYSPATH_NEGATIVE:${benign} JSON`);
  }
});

const PROBE_COMMANDS = [
  "nikto -h https://origin.example", "nikto.pl -host origin.example", "sqlmap -u https://x.example/?id=1", "sqlmap --batch",
  "sslscan origin.example", "sslscan --no-colour 10.0.0.1", "hydra -l admin -P list.txt 10.0.0.1", "ncat -lvnp 4444", "ncat 10.0.0.5 5432",
  "ss -tlnp", "ss -s",
];

test("S1-FA I1: nikto, sqlmap, sslscan, hydra, ncat and ss in command position fail in Markdown and at every JSON level", () => {
  for (const c of PROBE_COMMANDS) {
    const kind = "SCANNER_OR_PROBE_COMMAND_EXTENDED";
    assert.ok(reportForbiddenHits(`Run: ${c}`, "md").some((h) => h.kind === kind), `PROBE:${c} markdown`);
    assert.ok(reportForbiddenHits(`| \`${c}\` |`, "md").some((h) => h.kind === kind), `PROBE:${c} code span in a table`);
    assert.ok(registerForbiddenHits(renderedWith(c)).some((h) => h.kind === kind && h.path), `PROBE:${c} JSON decoded`);
    assert.ok(registerForbiddenHits(registerWithNotes({ [c]: "x" })).some((h) => h.kind === kind && h.level === "STRUCTURED_KEY"), `PROBE:${c} JSON key`);
  }
});

test("S1-FA I1: prose that names the same tools passes", () => {
  for (const prose of ["nikto was not run against the edge", "sqlmap is not part of the toolchain", "an sslscan of the origin was not performed", "the hydra pattern of many heads", "ncat is the netcat of the nmap project", "the ss family of socket tools", "a class -based design", "boss -level access"]) {
    assert.deepEqual(reportForbiddenHits(prose, "md"), [], `PROBE_NEGATIVE:${prose}`);
    assert.deepEqual(registerForbiddenHits(renderedWith(prose)), [], `PROBE_NEGATIVE:${prose} JSON`);
  }
});

// ──────── I3: what the command line reports when two gates see one value ──────

test("S1-FA I3: a credential URI in the register is evidence for both gates, and the command line reports the earlier one", () => {
  const uri = "postgres://hermes:s3cr3tvalue@db.internal:5432/app";
  const text = renderedWith(uri);
  assert.ok(registerSecretHits(text).some((h) => h.kind === "CONNECTION_STRING_WITH_CREDENTIAL"), "URI_EVIDENCE:the secret detector sees the credential");
  assert.ok(forbiddenContent(JSON.parse(text)).some((h) => h.kind === "ABSOLUTE_PATH"), "URI_EVIDENCE:the older register rule sees the scheme separator");
  const got = runGates(JSON.parse(text), REPORT, REPO_ROOT, { registerText: text });
  assert.equal(got?.code, EXIT.FORBIDDEN_IN_REGISTER, `URI_EVIDENCE:the earlier gate (11) is the exit, expected 11 got ${got?.code}`);
});

// ──────── the last test: the ledger's reconciliation (S1-FA-04 / I4) ───────────
//
// Registered before every other test runs, executed after all of them: the names this
// file registered must be exactly the names that ran, each through the ledger, each
// with at least one assertion. It replaces a threshold ("more than 150 tests"). Under
// a name filter (the mutation campaign) it is filtered out with the rest, so it gates
// full runs only — which is what it is for.
test("S1-FA-04 / I4: every test this file registers ran under the ledger and made at least one assertion", () => {
  const names = ledger.registered;
  assert.equal(new Set(names).size, names.length, "RECONCILE:test names are unique, so a name is an identity");
  for (const n of ledger.executed.keys()) assert.ok(names.includes(n), `RECONCILE:ran without being registered: ${n}`);
  // a name filter runs a subset by design; the count reconciliation is for an unfiltered run
  const filtered = process.execArgv.some((a) => /^--test-(?:name-pattern|skip-pattern)=|^--test-only$/.test(a));
  if (filtered) return;
  const missing = names.filter((n) => !ledger.executed.has(n));
  assert.deepEqual(missing, [], `RECONCILE:registered but never run: ${missing.join(" | ")}`);
  assert.equal(ledger.executed.size, names.length, "RECONCILE:discovered and executed counts match");
  const silent = [...ledger.executed.values()].filter((r) => r.name !== names[names.length - 1] && r.count === 0);
  assert.deepEqual(silent.map((r) => r.name), [], "RECONCILE:no finished test is assertionless");
});
