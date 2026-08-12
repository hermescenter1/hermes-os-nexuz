/**
 * PHASE 100 — the canonical GA closure evaluation.
 *
 * Every gate decision, the ledger, the verdict and the published summary are
 * produced HERE, by one function, so there is exactly one implementation of the
 * release decision. `scripts/ci/phase100-ga-closure-eval.mjs` is a thin shell
 * around it: it prints the ledger, serializes the summary this module built,
 * and maps failures to an exit code — nothing more.
 *
 * The defect this extraction removes: the integrity test suite proved its
 * blocker-arithmetic properties against the GENERATED summary artifact at the
 * repository root. That artifact is gitignored and only exists after an
 * evaluator run, so on a clean CI runner the suite failed with
 * MODULE_NOT_FOUND — and on a developer machine it silently proved its
 * properties against a STALE artifact from a previous run. Tests now call this
 * function and receive the same ledger and summary the CLI serializes, in
 * memory, with no artifact involved.
 *
 * Purity contract: no console output, no file writes, no process exit. The
 * function reads repository files, and it runs ONE offline child process (the
 * Phase 99 readiness evaluator, exactly as the CLI always has). It never
 * contacts Production, OpenBao, Stripe, a model provider or a customer, and it
 * never reads the summary artifact a previous run may have written.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { evaluatePhase99Closure } from "../phase99/closure-core.mjs";
import { resolveGate } from "../phase99/external-evidence.mjs";
import { RESOLVED_STATUSES } from "../phase99/finding-contract.mjs";
import {
  legalPrivacyGateInputs,
  liveModelEvaluationGateInput,
  backupOperationalGateInputs,
  commercialGateInputs,
  commercialCoherenceViolations,
  infrastructurePrerequisiteGateInputs,
  gaAuthorizationGateInput,
  validateResidualRiskAcceptance,
  isNonProductionFixture,
} from "./ga-evidence.mjs";
import {
  EVIDENCE_DOCUMENTS,
  EVIDENCE_ROOT_ENV,
  REPOSITORY_SOURCES,
  createEvidenceReader,
  evidenceRepositoryViolations,
  resolveEvidenceRoot,
} from "./evidence-root.mjs";
import { malformedReason, malformedGateError } from "./evidence-source.mjs";
import { attributeInternalReadiness, attributionViolations } from "./readiness-attribution.mjs";
import { createLedger, aggregate, assembleVerdict, evaluatorFailures, INFORMATIONAL_GROUP } from "./verdict.mjs";

/**
 * The pure summary builder. The CLI serializes exactly this object; tests
 * assert against exactly this object. Nothing else may construct the summary.
 */
export function buildClosureSummary({ ledger, verdict, evidenceMode, expectedCommitSha }) {
  return {
    phase: "100",
    schemaVersion: 1,
    kind: "OFFICIAL_GA_CLOSURE",
    expectedCommitSha,
    // The MODE only. Never the root path: in OWNER_CLOSURE it is an absolute
    // location on the owner's machine, and this summary is published as an artifact.
    evidenceMode,
    officialOutputs: verdict.officialOutputs,
    gates: Object.fromEntries(ledger.map((g) => [g.name, g.state])),
    reasons: Object.fromEntries(ledger.filter((g) => g.reason).map((g) => [g.name, g.reason])),
    groups: { ...verdict.groups, PHASE99_AGGREGATE: aggregate(ledger, "PHASE99_AGGREGATE") },
    releaseBlockerMatrix: verdict.blockers.map((b) => ({ gate: b.name, group: b.group, state: b.state, reason: b.reason })),
    gaReleaseReady: verdict.gaReleaseReady,
    phase100Closure: verdict.closure,
  };
}

/** The one serialization of the summary. Byte-for-byte what the CLI writes. */
export function serializeClosureSummary(summary) {
  return JSON.stringify(summary, null, 2) + "\n";
}

/** The commit every piece of evidence must be about. */
function expectedReleaseCommit(env, repoRoot) {
  const fromEnv = env.PHASE100_RELEASE_COMMIT ?? env.PHASE99_RELEASE_COMMIT;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/**
 * Evaluate the complete Phase 100 GA closure against the repository at
 * `repoRoot` and return the ledger, the verdict, the summary the CLI would
 * serialize, and the failures that would fail the build.
 *
 * @param {object} options
 * @param {string} options.repoRoot            absolute path of the repository
 * @param {NodeJS.ProcessEnv} [options.env]    environment (evidence root, release commit)
 * @param {number} [options.nowMs]             evaluation clock for freshness windows
 * @param {string|null} [options.expectedCommitSha]  overrides env/git commit resolution
 */
export function evaluatePhase100GaClosure({ repoRoot, env = process.env, nowMs = Date.now(), expectedCommitSha = null } = {}) {
  if (!repoRoot) throw new Error("evaluatePhase100GaClosure: repoRoot is required");
  const rel = (p) => join(repoRoot, ...p.split("/"));

  // ── Evidence lifecycle ──────────────────────────────────────────────────────
  //
  // Reading is a CLASSIFICATION, not a coercion. `readEvidenceSource` distinguishes
  // absent (BLOCKED, correct) from supplied-but-unusable (FAIL, fails the build),
  // and it never lets a directory, a device node, an oversized blob or a
  // `JSON.parse` message reach either the evaluator's control flow or its output.
  const evidenceRoot = resolveEvidenceRoot({ repoRoot, env });
  const reader = createEvidenceReader({ repoRoot, mode: evidenceRoot.mode, root: evidenceRoot.root });
  const { readDocument, readRepositorySource, readText: read, readJson } = reader;

  const expectedCommitShaResolved = expectedCommitSha ?? expectedReleaseCommit(env, repoRoot);

  // ── Gate ledger ─────────────────────────────────────────────────────────────
  //
  // Every gate is recorded once, in a stable order, with the reason it is not PASS
  // and the group it belongs to. Nothing is aggregated before it has been recorded
  // individually, so no blocker can hide behind another.

  const { ledger, gateIndex, record } = createLedger();

  /**
   * Resolve one evidence-backed gate through the shared Phase 99 contract.
   *
   * The shared `resolveGate` says "no external evidence supplied" when evidence is
   * absent, which is accurate for Phase 99 (where every blocked gate is external)
   * and misleading for Phase 100 (where pricing, key custody and backend
   * activation are the OWNER's decisions, not an outside party's). The state is
   * taken verbatim; only the wording is made accurate for the gate at hand.
   */
  function recordEvidenceGate(group, { gate, evidence, validator }) {
    const supplied = evidence !== null && evidence !== undefined;
    const resolved = resolveGate(evidence, validator);
    const reason = !supplied ? "no evidence recorded for this gate" : resolved.reason;
    return record(gate, group, resolved.state, reason, resolved.errors, supplied);
  }

  /**
   * Record every gate derived from one evidence document.
   *
   * A MALFORMED document fails ALL of its gates individually and identically. It
   * must never be reported as a set of unrelated absences: "no evidence recorded"
   * beside a file that exists on disk is the specific lie this phase removes, and
   * it is the difference between a BLOCKED build (expected) and a FAILED one
   * (someone supplied evidence that cannot be used).
   *
   * The recorded text carries the classification and the byte length only — never
   * a parser message, never a fragment of the file.
   */
  function recordDocumentGates(group, documentId, buildInputs) {
    const source = readDocument(documentId);
    const inputs = buildInputs(source.status === "VALID" ? source.document : null);
    for (const input of inputs) {
      if (source.status === "MALFORMED") {
        record(
          input.gate,
          group,
          "FAIL",
          malformedReason(documentId, source.classification),
          [malformedGateError(input.gate, documentId, source)],
          true,
        );
      } else {
        recordEvidenceGate(group, input);
      }
    }
  }

  // ── 1. Phase 100 implementation self-check ──────────────────────────────────
  //
  // "Is the closure MECHANISM built?" is a separate question from "may we ship?",
  // and it is the only one this repository can answer on its own.

  const REQUIRED_ARTIFACTS = [
    "scripts/security/phase99/closure-core.mjs",
    "scripts/security/phase100/ga-evidence.mjs",
    "scripts/security/phase100/evidence-source.mjs",
    "scripts/security/phase100/evidence-root.mjs",
    "scripts/security/phase100/readiness-attribution.mjs",
    "scripts/security/phase100/closure-evaluation.mjs",
    "scripts/ci/phase100-ga-closure-eval.mjs",
    ".github/workflows/phase100-ga-closure.yml",
    "docs/release/phase100-ga-closure-contract.md",
    "docs/release/phase100-evidence-schemas.md",
    "docs/release/phase100-existing-state-matrix.md",
  ];
  const EXAMPLE_DIR = "docs/release/phase100-evidence-examples";

  const implementationErrors = [];
  for (const artifact of REQUIRED_ARTIFACTS) {
    if (!existsSync(rel(artifact))) implementationErrors.push(`missing required Phase 100 artifact: ${artifact}`);
  }

  // The Phase 99 CLI must DELEGATE to the shared engine rather than carry a second
  // copy of the decision logic — a forked engine is how two evaluators start
  // disagreeing about whether a release may proceed.
  const phase99Cli = read("scripts/ci/phase99-closure-eval.mjs") ?? "";
  if (!phase99Cli.includes("closure-core.mjs")) {
    implementationErrors.push("scripts/ci/phase99-closure-eval.mjs no longer delegates to the shared closure engine");
  }

  // The Phase 100 CLI is held to the same rule about THIS module: the summary it
  // publishes must be the one this evaluation built, produced by the canonical
  // serializer — a CLI that assembles its own summary is a second verdict. Both
  // checks are structural (an import statement, the write call itself) so a
  // mention in a comment cannot satisfy them.
  const phase100Cli = read("scripts/ci/phase100-ga-closure-eval.mjs") ?? "";
  if (!/from "\.\.\/security\/phase100\/closure-evaluation\.mjs"/.test(phase100Cli)) {
    implementationErrors.push("scripts/ci/phase100-ga-closure-eval.mjs does not import the canonical closure evaluation");
  }
  if (!/writeFileSync\([^\n]*phase100-ga-closure\.json[^\n]*serializeClosureSummary\(/.test(phase100Cli)) {
    implementationErrors.push("scripts/ci/phase100-ga-closure-eval.mjs does not publish the summary through the canonical serializer");
  }

  // Every shipped example must be rejected by its own contract. If an example
  // could ever satisfy a gate, the repository would contain its own approval.
  let exampleCount = 0;
  if (!existsSync(rel(EXAMPLE_DIR))) {
    implementationErrors.push(`missing required Phase 100 example directory: ${EXAMPLE_DIR}`);
  } else {
    for (const file of readdirSync(rel(EXAMPLE_DIR)).sort()) {
      if (!file.endsWith(".json")) continue;
      exampleCount += 1;
      const doc = readJson(`${EXAMPLE_DIR}/${file}`);
      if (!doc) { implementationErrors.push(`${file}: not parseable JSON`); continue; }
      if (!isNonProductionFixture(doc)) {
        implementationErrors.push(`${file}: is not marked as a non-production fixture — an example must never be usable as evidence`);
      }
    }
    if (exampleCount === 0) implementationErrors.push(`${EXAMPLE_DIR} contains no example documents`);
  }

  record(
    "PHASE100_IMPLEMENTATION",
    "IMPLEMENTATION",
    implementationErrors.length === 0 ? "PASS" : "FAIL",
    implementationErrors.length === 0 ? `${exampleCount} example document(s), all rejected by contract` : "Phase 100 closure mechanism is incomplete",
    implementationErrors,
    true,
  );

  // ── 1b. Evidence lifecycle ──────────────────────────────────────────────────
  //
  // Four repository-owned facts about HOW evidence was read. They are gates rather
  // than assertions because they must appear in the published verdict: a run that
  // silently read a malformed file, or read evidence from a path that escaped its
  // root, would otherwise look identical to a clean run.

  record(
    "PHASE100_EVIDENCE_ROOT_LIFECYCLE",
    "IMPLEMENTATION",
    evidenceRoot.errors.length === 0 ? "PASS" : "FAIL",
    evidenceRoot.errors.length === 0
      ? `evidence mode ${evidenceRoot.mode}` +
        (evidenceRoot.mode === "CONTRACT_TEST"
          ? ` — no ${EVIDENCE_ROOT_ENV} configured, so the eight owner/external documents are looked for at their repository paths, where they are absent by design`
          : " — evidence root resolved outside the repository working tree")
      : `${EVIDENCE_ROOT_ENV} was set but could not be honoured safely`,
    evidenceRoot.errors,
    evidenceRoot.mode === "OWNER_CLOSURE",
  );

  const committedEvidence = evidenceRepositoryViolations({ repoRoot });
  record(
    "PHASE100_EVIDENCE_NOT_COMMITTED",
    "IMPLEMENTATION",
    committedEvidence.length === 0 ? "PASS" : "FAIL",
    committedEvidence.length === 0
      ? "no owner or external evidence document is committed to the repository"
      : "owner/external evidence is committed to a public tree",
    committedEvidence,
    true,
  );

  // Every registered evidence document, classified. ABSENT is expected; VALID is
  // judged by the gates below; MALFORMED is a build failure recorded here AND on
  // each gate the document feeds.
  const documentSources = Object.fromEntries(Object.keys(EVIDENCE_DOCUMENTS).map((id) => [id, readDocument(id)]));
  const malformedDocuments = Object.values(documentSources).filter((s) => s.status === "MALFORMED");
  record(
    "PHASE100_EVIDENCE_SOURCE_INTEGRITY",
    "IMPLEMENTATION",
    malformedDocuments.length === 0 ? "PASS" : "FAIL",
    malformedDocuments.length === 0
      ? `${Object.keys(documentSources).length} evidence document(s) classified: ` +
        `${Object.values(documentSources).filter((s) => s.status === "ABSENT").length} absent, ` +
        `${Object.values(documentSources).filter((s) => s.status === "VALID").length} valid`
      : `${malformedDocuments.length} supplied evidence document(s) cannot be read`,
    malformedDocuments.map((s) => malformedReason(s.documentId, s.classification)),
    malformedDocuments.length > 0,
  );

  // The inputs evidence is judged AGAINST. These always come from the repository,
  // and a malformed one is an engineering failure, not a pending decision.
  const repositorySourceErrors = [];
  for (const relPath of Object.keys(REPOSITORY_SOURCES)) {
    const source = readRepositorySource(relPath);
    if (source.status === "MALFORMED") {
      repositorySourceErrors.push(`${relPath}: SUPPLIED but ${source.classification} — no field of it was read`);
    }
  }
  record(
    "PHASE100_REPOSITORY_SOURCE_INTEGRITY",
    "IMPLEMENTATION",
    repositorySourceErrors.length === 0 ? "PASS" : "FAIL",
    repositorySourceErrors.length === 0
      ? "every repository-owned input is readable and correctly shaped"
      : "a repository-owned input could not be read",
    repositorySourceErrors,
    true,
  );

  // ── 2. Internal technical readiness (reuses the Phase 99 readiness evaluator) ─

  let readinessState = "UNAVAILABLE";
  let readinessBlockedOn = [];
  try {
    const out = execFileSync(process.execPath, [rel("scripts/ci/phase99-security-readiness-eval.mjs")], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...env },
    });
    readinessState = /RESULT phase99_readiness=(\S+)/.exec(out)?.[1] ?? "UNAVAILABLE";
    readinessBlockedOn = (/RESULT phase99_blocked_on_owner=(\S+)/.exec(out)?.[1] ?? "").split(",").filter(Boolean);
  } catch (err) {
    // A non-zero exit is the NORMAL state while owner groups are blocked; the
    // evaluator still printed its verdict on stdout.
    const out = String(err?.stdout ?? "");
    readinessState = /RESULT phase99_readiness=(\S+)/.exec(out)?.[1] ?? "UNAVAILABLE";
    readinessBlockedOn = (/RESULT phase99_blocked_on_owner=(\S+)/.exec(out)?.[1] ?? "").split(",").filter(Boolean);
  }

  // The readiness GATE is recorded after the Phase 99 gates below, because
  // attribution can only be decided once the gates that would inherit each
  // owner-blocked fact are actually in the ledger.

  // ── 3. Phase 99 closure gates (external security + pilot), reused verbatim ───

  const phase99 = evaluatePhase99Closure({
    readText: read,
    readJson,
    expectedCommitSha: expectedCommitShaResolved,
    nowMs,
  });

  const EXTERNAL_SECURITY_MEMBERS = [
    "INDEPENDENT_PENETRATION_TEST",
    "EXTERNAL_APPLICATION_SECURITY_REVIEW",
    "EXTERNAL_API_SECURITY_REVIEW",
    "FINDING_REGISTER",
    "CRITICAL_FINDINGS_ZERO",
    "HIGH_FINDINGS_RESOLVED",
  ];
  const PILOT_MEMBERS = [
    "PILOT_CUSTOMER_SELECTED",
    "PILOT_ACCEPTANCE",
    "PILOT_ACCEPTANCE_DECISION",
    "PILOT_UAT",
    "PILOT_WORKFLOW_VALIDATION",
    "PILOT_PERFORMANCE_OBSERVATION",
    "PILOT_INCIDENT_SIMULATION",
    "PILOT_ONBOARDING",
    "PILOT_SUPPORT_PROCESS",
    "INDUSTRIAL_ENGINEER_FEEDBACK",
  ];

  // A malformed attestation or pilot document reaches the shared Phase 99 engine
  // as `null`, which is correct FOR THAT ENGINE — Phase 100 has already classified
  // the same path. But `null` renders as BLOCKED, and a supplied-but-unusable
  // document is a FAIL. The classification therefore overrides the state here, on
  // exactly the gates that document feeds.
  const malformedGateOverride = new Map();
  for (const [documentId, source] of Object.entries(documentSources)) {
    if (source.status !== "MALFORMED") continue;
    for (const gate of EVIDENCE_DOCUMENTS[documentId].gates) malformedGateOverride.set(gate, source);
  }

  for (const ev of phase99.events) {
    const group = EXTERNAL_SECURITY_MEMBERS.includes(ev.name)
      ? "EXTERNAL_SECURITY"
      : PILOT_MEMBERS.includes(ev.name)
        ? "PILOT_ACCEPTANCE"
        : "PHASE99_AGGREGATE";

    const override = malformedGateOverride.get(ev.name);
    if (override) {
      record(
        ev.name,
        group,
        "FAIL",
        malformedReason(override.documentId, override.classification),
        [malformedGateError(ev.name, override.documentId, override)],
        true,
      );
      continue;
    }

    // INDUSTRIAL_ENGINEER_FEEDBACK's success state is RECORDED, not PASS.
    const state = ev.name === "INDUSTRIAL_ENGINEER_FEEDBACK" && ev.state === "RECORDED" ? "PASS" : ev.state;
    record(ev.name, group, state, ev.reason, ev.errors, ev.state !== "BLOCKED");
  }

  // Internal technical readiness, attributed. Every Phase 99 readiness group that
  // is blocked purely on an owner/pilot decision is counted ONCE, as the Phase 100
  // gate that already owns that decision — not a second time here under an
  // engineering label. An unrecognised blocked group keeps this gate BLOCKED and
  // names itself, so nothing can go uncounted.
  const attribution = attributeInternalReadiness({
    readinessState,
    blockedOn: readinessBlockedOn,
    gateStateOf: (gate) => gateIndex.get(gate)?.state ?? null,
  });
  record("PHASE100_INTERNAL_TECHNICAL_READINESS", "INTERNAL_READINESS", attribution.state, attribution.reason, attribution.errors, true);

  // `RELEASE_BLOCKERS_ZERO` is a Phase 99 AGGREGATE: it folds the missing pilot
  // acceptance into the finding-register blocker count and reports the sum as
  // FAIL. Phase 100 already reports the pilot absence as ten individually named
  // BLOCKED gates, so counting the aggregate again would both double-count the
  // same fact and mislabel an absence as a failure. The aggregate is therefore
  // reported for continuity but excluded from the Phase 100 required set, and the
  // part of it Phase 100 does NOT otherwise cover — findings explicitly flagged as
  // release blockers — is re-derived here as its own gate.
  const openBlockingFindings = phase99.registrySummary?.releaseBlockers ?? null;
  record(
    "OPEN_RELEASE_BLOCKING_FINDINGS_ZERO",
    "EXTERNAL_SECURITY",
    openBlockingFindings === null ? "FAIL" : openBlockingFindings === 0 ? "PASS" : "FAIL",
    openBlockingFindings === null
      ? "the finding register could not be summarised"
      : `OPEN_RELEASE_BLOCKING_FINDINGS=${openBlockingFindings}`,
    [],
    true,
  );

  // ── 4. Residual risk acceptance for unresolved lower-severity findings ───────
  //
  // Phase 99 requires a formal acceptance only for HIGH. A GA release must also
  // account for every unresolved MEDIUM/LOW/INFO finding — individually, so a
  // silent accumulation of "just a medium" cannot reach production unowned.

  const registryDoc = readJson("docs/security/phase99-findings.json");
  const residualAcceptances = readJson("docs/security/phase99-risk-acceptances.json")?.residualAcceptances ?? {};
  // Never coerce a non-array to an empty list: "no findings" and "the findings
  // could not be read" are different facts, and the register-integrity gate above
  // has already failed the build for the second one.
  const registryFindings = Array.isArray(registryDoc?.findings) ? registryDoc.findings : [];
  const unresolvedResidual = registryFindings.filter(
    (f) => ["MEDIUM", "LOW", "INFO"].includes(f?.severity) && !RESOLVED_STATUSES.includes(f?.status),
  );

  if (unresolvedResidual.length === 0) {
    record("RESIDUAL_FINDING_RISK_ACCEPTED", "EXTERNAL_SECURITY", "PASS", "no unresolved lower-severity finding", [], true);
  } else {
    const missing = [];
    const invalid = [];
    for (const f of unresolvedResidual) {
      const acc = residualAcceptances?.[f.findingId] ?? null;
      if (!acc) { missing.push(f.findingId); continue; }
      const v = validateResidualRiskAcceptance(acc, { nowMs, expectedFindingId: f.findingId });
      if (!v.ok) invalid.push(...v.errors.map((e) => `${f.findingId}: ${e}`));
    }
    const state = invalid.length > 0 ? "FAIL" : missing.length > 0 ? "BLOCKED" : "PASS";
    record(
      "RESIDUAL_FINDING_RISK_ACCEPTED",
      "EXTERNAL_SECURITY",
      state,
      state === "PASS"
        ? `${unresolvedResidual.length} unresolved lower-severity finding(s), all formally accepted`
        : `${unresolvedResidual.length} unresolved lower-severity finding(s); ${missing.length} without an owner acceptance`,
      invalid.length > 0 ? invalid : missing.map((id) => `${id}: no residual risk acceptance recorded`),
      Object.keys(residualAcceptances).length > 0,
    );
  }

  // ── 5. Legal and privacy ────────────────────────────────────────────────────

  const evidenceCtx = { expectedCommitSha: expectedCommitShaResolved, nowMs };

  recordDocumentGates("LEGAL_PRIVACY", "LEGAL_PRIVACY", (doc) => legalPrivacyGateInputs(doc, evidenceCtx));

  // ── 6. Live model evaluation ────────────────────────────────────────────────

  recordDocumentGates("LIVE_MODEL_EVALUATION", "LIVE_MODEL_EVALUATION", (doc) => [liveModelEvaluationGateInput(doc, evidenceCtx)]);

  // ── 7. Backup and disaster-recovery operations ──────────────────────────────

  recordDocumentGates("BACKUP_OPERATIONAL", "BACKUP_OPERATIONS", (doc) => backupOperationalGateInputs(doc, evidenceCtx));

  // ── 8. Commercial owner decisions ───────────────────────────────────────────

  recordDocumentGates("COMMERCIAL_OWNER", "COMMERCIAL_DECISIONS", (doc) => commercialGateInputs(doc, evidenceCtx));

  // Cross-field coherence. Each commercial section is validated on its own, so a
  // document can be built entirely from individually-valid sections that together
  // describe something impossible — billing ACTIVATED with no payment provider, a
  // LIVE provider beside DEFERRED billing, prices in a currency that is never
  // settled. Absence is not a contradiction and is already counted once by the
  // four gates above, so this gate PASSes on an absent document and can only ever
  // FAIL on a supplied one.
  const commercialSource = documentSources.COMMERCIAL_DECISIONS;
  const coherenceViolations =
    commercialSource.status === "VALID" ? commercialCoherenceViolations(commercialSource.document) : [];
  record(
    "PHASE100_COMMERCIAL_GA_COHERENCE",
    "COMMERCIAL_OWNER",
    coherenceViolations.length === 0 ? "PASS" : "FAIL",
    coherenceViolations.length === 0
      ? commercialSource.status === "VALID"
        ? "the commercial decision document is internally coherent for a paid GA"
        : "no commercial decision document to contradict itself"
      : "the commercial decision document contradicts itself",
    coherenceViolations,
    commercialSource.status !== "ABSENT",
  );

  // ── 9. OpenBao / production infrastructure prerequisites ────────────────────

  recordDocumentGates("OPENBAO_PRODUCTION_PREREQUISITES", "INFRASTRUCTURE_PREREQUISITES", (doc) =>
    infrastructurePrerequisiteGateInputs(doc, evidenceCtx),
  );

  // ── 10. Final GA authorization ──────────────────────────────────────────────

  recordDocumentGates("GA_AUTHORIZATION", "GA_AUTHORIZATION", (doc) => [gaAuthorizationGateInput(doc, evidenceCtx)]);

  // ── 11. Attribution self-check ──────────────────────────────────────────────
  //
  // The ledger is now complete, so the uniqueness properties it depends on can be
  // proven rather than assumed: no gate identity appears twice, no Phase 99
  // aggregate sits inside the counted set, and every fact attributed away from
  // internal readiness is still counted by the gate that inherited it.

  const attributionErrors = attributionViolations(ledger, INFORMATIONAL_GROUP, { attributedTo: attribution.attributedTo });
  record(
    "PHASE100_READINESS_ATTRIBUTION",
    "IMPLEMENTATION",
    attributionErrors.length === 0 ? "PASS" : "FAIL",
    attributionErrors.length === 0
      ? `${ledger.length} gate(s) recorded, each blocker attributed exactly once`
      : "a release blocker is counted twice or not at all",
    attributionErrors,
    true,
  );

  // ── Verdict ─────────────────────────────────────────────────────────────────

  const verdict = assembleVerdict(ledger);
  const summary = buildClosureSummary({
    ledger,
    verdict,
    evidenceMode: evidenceRoot.mode,
    expectedCommitSha: expectedCommitShaResolved,
  });
  const failures = evaluatorFailures(ledger, verdict.contradictions);

  return {
    ledger,
    evidenceRoot,
    documentSources,
    attribution,
    verdict,
    summary,
    failures,
    expectedCommitSha: expectedCommitShaResolved,
  };
}
