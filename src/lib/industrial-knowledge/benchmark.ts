// PHASE 101 — deterministic before/after benchmark.
//
// WHAT IS COMPARED
//   BEFORE — `analyzeIndustrialFault`, the existing keyword/rule Brain, fed the
//            same operator-voice narrative a human would type.
//   AFTER  — `diagnose`, the Phase 101 structural engine, fed the scenario's
//            observations against the engineering corpus.
//
// HONESTY OF THE COMPARISON
// Only ONE metric is genuinely comparable between the two engines: whether the
// correct SUBSYSTEM was identified. The corpus-grounded metrics — evidence
// recall, root-cause ranking against a fault-mode id, provenance correctness —
// are not measurable on the baseline at all, because the baseline emits prose
// and has no notion of a corpus node. They are reported for the structural
// engine and explicitly marked as not applicable to the baseline. Presenting
// them as a baseline score of zero would be a rigged comparison dressed up as
// an improvement.
//
// The baseline's subsystem mapping is deliberately GENEROUS: each of its
// coarse domains maps to a SET of acceptable subsystems, and a hit on any
// member counts as correct. An unfavourable mapping would manufacture the
// result this benchmark exists to measure.
//
// DETERMINISM
// No clock, no randomness, no network, no provider call. Metrics are ratios of
// integer counts, so a run is reproducible and a regression is unambiguous.

import { analyzeIndustrialFault } from "@/lib/industrial-brain/analyzer";
import type { IndustrialDomain } from "@/lib/industrial-brain/types";
import { diagnose, type DiagnosticResult } from "./diagnostics";
import type { KnowledgeIndex } from "./graph";
import { isReviewOnly, type FaultScenario, type ReferenceSystem, type Subsystem } from "./types";

/* ── Baseline domain → subsystem ──────────────────────────────────────────── */

const BASELINE_SUBSYSTEMS: Record<IndustrialDomain, readonly Subsystem[]> = {
  PLC: ["PLC_LOGIC", "RECIPE_CONFIG"],
  SCADA: ["SCADA"],
  HMI: ["HMI"],
  MOTOR: ["DRIVE", "MECHANICAL"],
  VFD: ["DRIVE"],
  SENSOR: ["FIELD_DEVICE"],
  NETWORK: ["NETWORK", "TELEMETRY"],
  MECHANICAL: ["MECHANICAL", "UPSTREAM_DOWNSTREAM"],
  ELECTRICAL: ["DRIVE", "FIELD_DEVICE"],
  MAINTENANCE: ["MECHANICAL", "PROCESS"],
  UNKNOWN: [],
};

/**
 * Render a scenario the way an operator would report it.
 *
 * The baseline reads prose, so it is given prose: the narrative plus the
 * observed states in plain words. Withholding the observations would starve it
 * of information the structural engine receives.
 */
export function narrativeFor(
  system: ReferenceSystem,
  scenario: FaultScenario,
  index: KnowledgeIndex,
): string {
  const lines = [scenario.narrative.en];
  for (const observation of scenario.observations) {
    const node = index.nodes.get(observation.nodeId);
    if (!node) continue;
    const detail = observation.detail ? ` (${observation.detail})` : "";
    lines.push(`${node.label.en}: ${observation.state}${detail}`);
  }
  return lines.join(". ");
}

/* ── Outcomes ─────────────────────────────────────────────────────────────── */

export interface BaselineOutcome {
  domain: IndustrialDomain;
  subsystemCorrect: boolean;
  /** The baseline emits prose causes; counted only for transparency. */
  causeCount: number;
}

export interface StructuralOutcome {
  subsystemCorrect: boolean;
  top1Correct: boolean;
  top3Correct: boolean;
  /** Fraction of ground-truth supporting nodes the engine actually cited. */
  evidenceRecall: number;
  /** Fraction of expected-missing nodes the engine reported as missing. */
  missingEvidenceRecall: number;
  /** Fraction of expected safe actions the engine recommended. */
  safeActionRecall: number;
  /** Citations that resolve to no corpus node. Must be 0. */
  unsupportedClaims: number;
  /** Recommendations that are not review-safe. Must be 0. */
  unsafeRecommendations: number;
  /** Every citation carries complete, checksum-matching provenance. */
  provenanceComplete: boolean;
  /** TRUE when escalation was required and the engine said so. */
  escalationCorrect: boolean;
  confidence: number;
}

export interface ScenarioOutcome {
  systemId: string;
  scenarioId: string;
  faultClass: string;
  subsystem: Subsystem;
  baseline: BaselineOutcome;
  structural: StructuralOutcome;
}

export interface BenchmarkReport {
  scenarios: number;
  baseline: {
    subsystemAccuracy: number;
    /** Stated explicitly so a reader cannot mistake absence for failure. */
    corpusMetrics: "NOT_APPLICABLE — baseline emits prose and cites no corpus node";
  };
  structural: {
    subsystemAccuracy: number;
    rootCauseTop1: number;
    rootCauseTop3: number;
    evidenceRecall: number;
    missingEvidenceRecall: number;
    safeActionRecall: number;
    unsupportedClaimRate: number;
    unsafeRecommendationRate: number;
    provenanceCorrectness: number;
    escalationAccuracy: number;
    meanConfidence: number;
  };
  byFaultClass: Record<string, { scenarios: number; top1: number }>;
  outcomes: ScenarioOutcome[];
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const ratio = (hit: number, total: number): number =>
  total === 0 ? 1 : Math.round((hit / total) * 1000) / 1000;

function recall(expected: readonly string[], actual: ReadonlySet<string>): number {
  if (expected.length === 0) return 1;
  const hit = expected.filter((id) => actual.has(id)).length;
  return ratio(hit, expected.length);
}

/**
 * Provenance is complete when every cited node exists, names its project, and
 * carries the checksum of the system it belongs to. A citation whose checksum
 * disagreed with its system would mean the corpus and the answer came from
 * different revisions — silent staleness, which is worse than an error.
 */
function provenanceComplete(result: DiagnosticResult, index: KnowledgeIndex): boolean {
  for (const nodeId of result.citations) {
    const node = index.nodes.get(nodeId);
    if (!node) return false;
    const system = index.systems.get(node.provenance.projectId);
    if (!system) return false;
    if (node.provenance.checksum !== system.checksum) return false;
    if (!node.provenance.sourceId || !node.provenance.subsystem) return false;
  }
  return true;
}

/**
 * A recommendation is unsafe when it is not a SAFE_ACTION node, or when it
 * touches a safety-classified object without being flagged review-only.
 */
function countUnsafeRecommendations(result: DiagnosticResult, index: KnowledgeIndex): number {
  let unsafe = 0;
  for (const action of result.safeVerificationActions) {
    const node = index.nodes.get(action.nodeId);
    if (!node || node.kind !== "SAFE_ACTION") {
      unsafe += 1;
      continue;
    }
    if (isReviewOnly(node.provenance.safetyClass) && !action.reviewOnly) unsafe += 1;
  }
  return unsafe;
}

/* ── Runner ───────────────────────────────────────────────────────────────── */

export function runScenario(
  index: KnowledgeIndex,
  system: ReferenceSystem,
  scenario: FaultScenario,
): ScenarioOutcome {
  const truth = scenario.groundTruth;

  /* BEFORE */
  const baselineAnalysis = analyzeIndustrialFault({
    problemTitle: scenario.title.en,
    observedSymptoms: narrativeFor(system, scenario, index),
    locale: "en",
  });
  const acceptable = BASELINE_SUBSYSTEMS[baselineAnalysis.classification.domain] ?? [];
  const baseline: BaselineOutcome = {
    domain: baselineAnalysis.classification.domain,
    subsystemCorrect: acceptable.includes(truth.subsystem),
    causeCount: baselineAnalysis.likelyCauses.length,
  };

  /* AFTER */
  const result = diagnose(index, { observations: scenario.observations, locale: "en" });
  const citedSet = new Set(result.citations);
  const supportingSet = new Set(result.supportingEvidence.map((c) => c.nodeId));
  const missingSet = new Set(result.missingEvidence.map((c) => c.nodeId));
  const actionSet = new Set(result.safeVerificationActions.map((a) => a.nodeId));
  const top3 = result.hypotheses.slice(0, 3).map((h) => h.faultModeId);

  const structural: StructuralOutcome = {
    subsystemCorrect: result.hypotheses[0]?.subsystem === truth.subsystem,
    top1Correct: result.hypotheses[0]?.faultModeId === truth.faultModeId,
    top3Correct: top3.includes(truth.faultModeId),
    // Supporting evidence is credited whether it was named as support or simply
    // cited: the metric asks whether the engine SURFACED the right evidence.
    evidenceRecall: recall(truth.supportingNodeIds, new Set([...supportingSet, ...citedSet])),
    missingEvidenceRecall: recall(truth.expectedMissingNodeIds, missingSet),
    safeActionRecall: recall(truth.expectedSafeActionIds, actionSet),
    unsupportedClaims: result.citations.filter((id) => !index.nodes.has(id)).length,
    unsafeRecommendations: countUnsafeRecommendations(result, index),
    provenanceComplete: provenanceComplete(result, index),
    escalationCorrect: truth.requiresEscalation
      ? result.escalationConditions.length > 0
      : true,
    confidence: result.confidence,
  };

  return {
    systemId: system.id,
    scenarioId: scenario.id,
    faultClass: truth.faultClass,
    subsystem: truth.subsystem,
    baseline,
    structural,
  };
}

export function runBenchmark(
  index: KnowledgeIndex,
  systems: readonly ReferenceSystem[],
): BenchmarkReport {
  const outcomes: ScenarioOutcome[] = [];
  for (const system of systems) {
    for (const scenario of system.scenarios) {
      outcomes.push(runScenario(index, system, scenario));
    }
  }

  const n = outcomes.length;
  const mean = (pick: (o: ScenarioOutcome) => number): number =>
    n === 0 ? 0 : Math.round((outcomes.reduce((sum, o) => sum + pick(o), 0) / n) * 1000) / 1000;
  const rate = (pred: (o: ScenarioOutcome) => boolean): number =>
    ratio(outcomes.filter(pred).length, n);

  const byFaultClass: Record<string, { scenarios: number; top1: number }> = {};
  for (const outcome of outcomes) {
    const entry = byFaultClass[outcome.faultClass] ?? { scenarios: 0, top1: 0 };
    entry.scenarios += 1;
    if (outcome.structural.top1Correct) entry.top1 += 1;
    byFaultClass[outcome.faultClass] = entry;
  }

  const totalCitations = outcomes.reduce((sum, o) => sum + o.structural.unsupportedClaims, 0);
  const totalUnsafe = outcomes.reduce((sum, o) => sum + o.structural.unsafeRecommendations, 0);

  return {
    scenarios: n,
    baseline: {
      subsystemAccuracy: rate((o) => o.baseline.subsystemCorrect),
      corpusMetrics: "NOT_APPLICABLE — baseline emits prose and cites no corpus node",
    },
    structural: {
      subsystemAccuracy: rate((o) => o.structural.subsystemCorrect),
      rootCauseTop1: rate((o) => o.structural.top1Correct),
      rootCauseTop3: rate((o) => o.structural.top3Correct),
      evidenceRecall: mean((o) => o.structural.evidenceRecall),
      missingEvidenceRecall: mean((o) => o.structural.missingEvidenceRecall),
      safeActionRecall: mean((o) => o.structural.safeActionRecall),
      unsupportedClaimRate: ratio(totalCitations, Math.max(n, 1)),
      unsafeRecommendationRate: ratio(totalUnsafe, Math.max(n, 1)),
      provenanceCorrectness: rate((o) => o.structural.provenanceComplete),
      escalationAccuracy: rate((o) => o.structural.escalationCorrect),
      meanConfidence: mean((o) => o.structural.confidence),
    },
    byFaultClass,
    outcomes,
  };
}
