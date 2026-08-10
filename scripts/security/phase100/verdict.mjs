/**
 * PHASE 100 — verdict assembly.
 *
 * Pure functions over a gate ledger: aggregation, the blocker matrix, the
 * official output block, and the self-contradiction checks. Separated from
 * `scripts/ci/phase100-ga-closure-eval.mjs` so the release verdict itself can be
 * tested directly — including the states this repository cannot currently reach,
 * such as "every gate PASS". A verdict rule that can only be exercised by
 * shipping real evidence is a verdict rule nobody has ever tested.
 *
 * No I/O, no clock, no process exit.
 */

/** Groups whose members are required to be PASS before GA. */
export const REQUIRED_GROUPS = [
  "IMPLEMENTATION",
  "INTERNAL_READINESS",
  "EXTERNAL_SECURITY",
  "PILOT_ACCEPTANCE",
  "LEGAL_PRIVACY",
  "LIVE_MODEL_EVALUATION",
  "BACKUP_OPERATIONAL",
  "COMMERCIAL_OWNER",
  "OPENBAO_PRODUCTION_PREREQUISITES",
  "GA_AUTHORIZATION",
];

/**
 * Reported for continuity but NOT required: these are Phase 99 aggregates whose
 * constituents Phase 100 already counts individually. Counting them again would
 * double-count the same fact and relabel an absence as a failure.
 */
export const INFORMATIONAL_GROUP = "PHASE99_AGGREGATE";

/**
 * Gates this repository owns outright. A failure here is an engineering
 * failure, not a pending decision, and it fails the build.
 */
export const REPOSITORY_OWNED_GATES = [
  "FINDING_REGISTER",
  "CRITICAL_FINDINGS_ZERO",
  "HIGH_FINDINGS_RESOLVED",
  "OPEN_RELEASE_BLOCKING_FINDINGS_ZERO",
];

/** An append-only, duplicate-rejecting gate ledger with a stable order. */
export function createLedger() {
  const ledger = [];
  const gateIndex = new Map();

  function record(name, group, state, reason = null, errors = [], evidenceSupplied = false) {
    if (gateIndex.has(name)) throw new Error(`duplicate gate '${name}'`);
    const entry = { name, group, state, reason: reason ?? null, errors: errors.slice(0, 6), evidenceSupplied };
    ledger.push(entry);
    gateIndex.set(name, entry);
    return entry;
  }

  return { ledger, gateIndex, record };
}

/** FAIL wins over BLOCKED wins over PASS. Deterministic and order-independent. */
export function aggregate(ledger, group) {
  const members = ledger.filter((g) => g.group === group);
  if (members.length === 0) return "BLOCKED";
  if (members.some((g) => g.state === "FAIL")) return "FAIL";
  if (members.some((g) => g.state !== "PASS")) return "BLOCKED";
  return "PASS";
}

/**
 * Assemble the official Phase 100 verdict from a ledger.
 *
 * @param {{name: string, group: string, state: string, reason: string|null, errors: string[], evidenceSupplied: boolean}[]} ledger
 */
export function assembleVerdict(ledger) {
  const gateIndex = new Map(ledger.map((g) => [g.name, g]));
  const stateOf = (name) => gateIndex.get(name)?.state ?? "BLOCKED";

  // Required gates keep ledger order, so the blocker matrix is stable across
  // runs and diffable between commits.
  const requiredGates = ledger.filter((g) => g.group !== INFORMATIONAL_GROUP);
  const blockers = requiredGates.filter((g) => g.state !== "PASS");
  const releaseBlockerCount = blockers.length;

  const gaReleaseReady = releaseBlockerCount === 0;
  const anyFail = requiredGates.some((g) => g.state === "FAIL");
  const closure = gaReleaseReady ? "PASS" : anyFail ? "FAIL" : "BLOCKED";

  const groups = Object.fromEntries(REQUIRED_GROUPS.map((g) => [g, aggregate(ledger, g)]));

  const officialOutputs = {
    PHASE100_IMPLEMENTATION: stateOf("PHASE100_IMPLEMENTATION"),
    PHASE100_INTERNAL_TECHNICAL_READINESS: stateOf("PHASE100_INTERNAL_TECHNICAL_READINESS"),
    EXTERNAL_SECURITY_GATES: groups.EXTERNAL_SECURITY,
    PILOT_ACCEPTANCE_GATES: groups.PILOT_ACCEPTANCE,
    LEGAL_PRIVACY_GATES: groups.LEGAL_PRIVACY,
    LIVE_MODEL_EVALUATION_GATE: groups.LIVE_MODEL_EVALUATION,
    BACKUP_OPERATIONAL_GATE: groups.BACKUP_OPERATIONAL,
    COMMERCIAL_OWNER_GATE: groups.COMMERCIAL_OWNER,
    OPENBAO_PRODUCTION_PREREQUISITES: groups.OPENBAO_PRODUCTION_PREREQUISITES,
    GA_RELEASE_AUTHORIZATION: groups.GA_AUTHORIZATION,
    RELEASE_BLOCKER_COUNT: releaseBlockerCount,
    GA_RELEASE_READY: gaReleaseReady ? "YES" : "NO",
    PHASE100_CLOSURE: closure,
  };

  // A GA-ready verdict beside a non-zero blocker count would be a contradiction
  // in the evaluator itself. Assert it rather than trusting the arithmetic.
  const contradictions = [];
  if (officialOutputs.GA_RELEASE_READY === "YES" && releaseBlockerCount > 0) {
    contradictions.push("GA_RELEASE_READY=YES while RELEASE_BLOCKER_COUNT>0");
  }
  if (officialOutputs.PHASE100_CLOSURE === "PASS" && officialOutputs.GA_RELEASE_READY !== "YES") {
    contradictions.push("PHASE100_CLOSURE=PASS while GA_RELEASE_READY is not YES");
  }
  if (gaReleaseReady && officialOutputs.PHASE100_INTERNAL_TECHNICAL_READINESS !== "PASS") {
    contradictions.push("GA_RELEASE_READY=YES while internal technical readiness is not PASS");
  }
  if (gaReleaseReady && officialOutputs.PHASE100_IMPLEMENTATION !== "PASS") {
    contradictions.push("GA_RELEASE_READY=YES while the Phase 100 implementation self-check is not PASS");
  }
  for (const g of blockers) {
    if (g.state === "PASS") contradictions.push(`${g.name} counted as a blocker while PASS`);
  }

  return { requiredGates, blockers, releaseBlockerCount, gaReleaseReady, closure, groups, officialOutputs, contradictions };
}

/**
 * Which conditions fail the BUILD, as opposed to merely blocking the RELEASE.
 *
 * BLOCKED is the expected state while genuine evidence is absent and must not
 * fail CI — otherwise the only way to get a green pipeline would be to weaken
 * the gate. What does fail: a broken closure mechanism, an unjudgeable
 * readiness verdict, a repository-owned engineering gate, evidence that WAS
 * supplied and did not validate, and any self-contradiction.
 */
export function evaluatorFailures(ledger, contradictions = []) {
  const gateIndex = new Map(ledger.map((g) => [g.name, g]));
  const failures = [];

  // Every IMPLEMENTATION gate is a repository-owned fact about the closure
  // mechanism itself — the self-check, the evidence lifecycle, the source
  // classification, the attribution proof. None of them can be pending on an
  // owner, so anything short of PASS is a broken mechanism and fails the build.
  for (const g of ledger) {
    if (g.group === "IMPLEMENTATION" && g.state !== "PASS") failures.push(g.name);
  }
  if (!gateIndex.has("PHASE100_IMPLEMENTATION")) failures.push("PHASE100_IMPLEMENTATION");
  if (gateIndex.get("PHASE100_INTERNAL_TECHNICAL_READINESS")?.state === "FAIL") {
    failures.push("PHASE100_INTERNAL_TECHNICAL_READINESS");
  }
  for (const name of REPOSITORY_OWNED_GATES) {
    if (gateIndex.get(name)?.state === "FAIL") failures.push(name);
  }
  for (const g of ledger) {
    if (g.group === INFORMATIONAL_GROUP || g.group === "IMPLEMENTATION" || g.group === "INTERNAL_READINESS") continue;
    if (REPOSITORY_OWNED_GATES.includes(g.name)) continue;
    // Evidence that was actually supplied and did not validate is a real
    // problem, not a pending decision.
    if (g.state === "FAIL" && g.evidenceSupplied) failures.push(g.name);
  }

  return [...failures, ...contradictions];
}
