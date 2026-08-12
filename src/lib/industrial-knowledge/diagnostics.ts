// PHASE 101 — structural, provenance-preserving diagnostic reasoning.
//
// WHAT MAKES THIS DIFFERENT FROM THE KEYWORD ENGINE
// The existing Brain matches words in a question against rules and cases. This
// engine matches OBSERVED PLANT STATE against the engineering structure of the
// system those observations came from. "Conveyor 4 will not start" is not
// answered by recognising the words "will not start"; it is answered by walking
// start request → mode → sequence state → permissives → interlocks → drive
// ready → drive fault → feedback → sensors → alarms, and reporting which links
// in that chain were actually observed, which contradict the hypothesis, and
// which are simply missing.
//
// EVERY CLAIM IS CITED
// The engine can only ever name corpus nodes. An observation about a node the
// corpus does not contain is reported as unresolved, never silently dropped and
// never absorbed into a conclusion. That is what makes the unsupported-claim
// rate measurable rather than aspirational: a citation either resolves or it is
// a defect.
//
// MISSING EVIDENCE STAYS MISSING
// A hypothesis is scored on the declared evidence that was actually supplied.
// Evidence that was not supplied lowers confidence and is listed by name — the
// engine never assumes a value for it, and never treats silence as agreement.
//
// SAFETY
// Recommendations are verification steps addressed to a qualified human being.
// Anything touching a safety-classified object is marked review-only and drives
// an escalation condition. The engine emits no control action, and there is no
// code path by which one of its outputs reaches a device.

import {
  DIAGNOSTIC_RELATIONS,
  evidenceFor,
  reachableFaultModes,
  safeActionsFor,
  shortestChain,
  type KnowledgeIndex,
} from "./graph";
import {
  isReviewOnly,
  localized,
  type KnowledgeLocale,
  type KnowledgeNode,
  type Observation,
  type ObservationState,
  type Subsystem,
} from "./types";

export const DIAGNOSTIC_ENGINE_VERSION = "phase101-structural-1.0.0";

/* ── Request / response ───────────────────────────────────────────────────── */

export interface DiagnosticRequest {
  observations: Observation[];
  locale?: KnowledgeLocale;
  /** Maximum hypotheses to return. Defaults to 5. */
  maxHypotheses?: number;
}

export interface EvidenceCitation {
  nodeId: string;
  label: string;
  kind: string;
  /** Present when the citation refers to something actually observed. */
  state?: ObservationState;
  detail?: string;
  /** The engineering layer this evidence sits in, for cross-layer display. */
  domain: string;
  subsystem: string;
  projectId: string;
  sourceId: string;
  safetyClass: string;
}

export interface EvidenceChain {
  /** The node the chain reaches. */
  nodeId: string;
  /** Edge ids walked, in order — an engineer can audit this hop by hop. */
  edgeIds: string[];
}

export interface Hypothesis {
  faultModeId: string;
  label: string;
  faultClass: string;
  subsystem: Subsystem;
  /** Integer ranking score. Higher is stronger. */
  score: number;
  /** 0..1, derived only from declared-evidence coverage. */
  confidence: number;
  supporting: EvidenceCitation[];
  contradicting: EvidenceCitation[];
  missing: EvidenceCitation[];
  chains: EvidenceChain[];
  /** TRUE when this hypothesis touches a safety-classified object. */
  reviewOnly: boolean;
}

export interface SafeActionRecommendation {
  nodeId: string;
  label: string;
  /** The hypotheses this action would help distinguish. */
  verifies: string[];
  reviewOnly: boolean;
}

export interface DiagnosticResult {
  engineVersion: string;
  /** Everything the caller supplied that resolved to a corpus object. */
  observedFacts: EvidenceCitation[];
  /**
   * Observation node ids that do not exist in the corpus. Reported, never
   * reasoned from — an engine that quietly ignored these would be inventing
   * the completeness of its own input.
   */
  unresolvedObservations: string[];
  supportingEvidence: EvidenceCitation[];
  contradictoryEvidence: EvidenceCitation[];
  missingEvidence: EvidenceCitation[];
  hypotheses: Hypothesis[];
  /** Confidence of the leading hypothesis, or 0 when there is none. */
  confidence: number;
  safeVerificationActions: SafeActionRecommendation[];
  escalationConditions: string[];
  /** Every corpus node id this result names. */
  citations: string[];
}

/* ── Notability ───────────────────────────────────────────────────────────── */

/**
 * Whether an observation is a reason to start reasoning.
 *
 * A plant reports far more state than is diagnostically interesting. Treating
 * every healthy signal as a starting point would make the candidate set the
 * whole corpus and the ranking meaningless, so the entry points are the states
 * that a competent engineer would actually react to.
 */
export function isNotable(node: KnowledgeNode, state: ObservationState): boolean {
  if (state === "ABNORMAL" || state === "STALE") return true;
  if (state === "TRUE" && (node.kind === "ALARM" || node.kind === "INTERLOCK")) return true;
  if (state === "FALSE" && node.kind === "PERMISSIVE") return true;
  return false;
}

/** Whether an observation actively argues AGAINST a hypothesis. */
function contradicts(state: ObservationState): boolean {
  return state === "NORMAL";
}

/* ── Causal precedence ────────────────────────────────────────────────────── */

/** Relations through which one engineering object constrains another. */
const CONSTRAINT_RELATIONS = new Set<string>(["BLOCKS", "GATES"]);

/**
 * Decide whether hypothesis `downstream` is a CONSEQUENCE of hypothesis
 * `upstream` rather than an independent explanation.
 *
 * A sequence that times out because a downstream machine is unavailable is a
 * real fault and a real observation — but it is the symptom, not the cause. The
 * corpus already records why: the blockage explains an interlock, and that
 * interlock BLOCKS the very step whose timeout is the other hypothesis'
 * evidence. Walking that one constraint edge (optionally followed by the alarm
 * it raises) separates cause from consequence structurally, instead of by
 * ranking whichever symptom happened to be observed most loudly.
 *
 * Bounded to two hops on purpose: a longer walk would start relating objects
 * that merely share a subsystem, and a precedence claim needs to be as
 * auditable as the evidence it reorders.
 */
function isConsequenceOf(
  index: KnowledgeIndex,
  upstreamExplains: readonly string[],
  downstreamSupport: ReadonlySet<string>,
): boolean {
  for (const explainedId of upstreamExplains) {
    for (const edge of index.out.get(explainedId) ?? []) {
      if (!CONSTRAINT_RELATIONS.has(edge.relation)) continue;
      if (downstreamSupport.has(edge.target)) return true;
      // …or the constrained object raises the alarm that is the evidence.
      for (const raised of index.out.get(edge.target) ?? []) {
        if (raised.relation === "RAISES" && downstreamSupport.has(raised.target)) return true;
      }
    }
  }
  return false;
}

/** Nodes a fault mode declares it explains. */
function explainedBy(index: KnowledgeIndex, faultModeId: string): string[] {
  return (index.out.get(faultModeId) ?? [])
    .filter((e) => e.relation === "EXPLAINS")
    .map((e) => e.target);
}

/* ── Citations ────────────────────────────────────────────────────────────── */

function cite(
  node: KnowledgeNode,
  locale: KnowledgeLocale,
  observation?: Observation,
): EvidenceCitation {
  return {
    nodeId: node.id,
    label: localized(node.label, locale),
    kind: node.kind,
    ...(observation ? { state: observation.state } : {}),
    ...(observation?.detail ? { detail: observation.detail } : {}),
    domain: node.provenance.domain,
    subsystem: node.provenance.subsystem,
    projectId: node.provenance.projectId,
    sourceId: node.provenance.sourceId,
    safetyClass: node.provenance.safetyClass,
  };
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/* ── Engine ───────────────────────────────────────────────────────────────── */

/**
 * Diagnose a set of plant observations against the engineering corpus.
 *
 * Pure and deterministic: no clock, no randomness, no network, no provider
 * call. The same observations always produce the same result, which is what
 * lets the Phase 101 benchmark compare engines honestly and what lets a
 * reasoning trace be reproduced long after the shift it came from.
 */
export function diagnose(index: KnowledgeIndex, request: DiagnosticRequest): DiagnosticResult {
  const locale = request.locale ?? "en";
  const maxHypotheses = request.maxHypotheses ?? 5;

  /* 1 — resolve observations, keeping unresolved ones visible */
  const observed = new Map<string, Observation>();
  const unresolvedObservations: string[] = [];
  const observedFacts: EvidenceCitation[] = [];

  for (const observation of request.observations) {
    const node = index.nodes.get(observation.nodeId);
    if (!node) {
      unresolvedObservations.push(observation.nodeId);
      continue;
    }
    observed.set(node.id, observation);
    observedFacts.push(cite(node, locale, observation));
  }
  observedFacts.sort((a, b) => byString(a.nodeId, b.nodeId));
  unresolvedObservations.sort(byString);

  /* 2 — entry points: the observations worth reasoning from */
  const entryPoints: string[] = [];
  for (const [nodeId, observation] of observed) {
    const node = index.nodes.get(nodeId);
    if (node && isNotable(node, observation.state)) entryPoints.push(nodeId);
  }
  entryPoints.sort(byString);

  /* 3 — candidate fault modes reachable from those entry points */
  const candidates = reachableFaultModes(index, entryPoints, 3);

  /* 4 — score each candidate against its DECLARED evidence */
  const hypotheses: Hypothesis[] = candidates.map((candidate) => {
    const declared = evidenceFor(index, candidate.node.id);

    const supporting: EvidenceCitation[] = [];
    const contradicting: EvidenceCitation[] = [];
    const missing: EvidenceCitation[] = [];

    for (const evidenceNode of declared) {
      const observation = observed.get(evidenceNode.id);
      if (!observation || observation.state === "ABSENT") {
        missing.push(cite(evidenceNode, locale, observation));
        continue;
      }
      if (contradicts(observation.state)) {
        contradicting.push(cite(evidenceNode, locale, observation));
        continue;
      }
      supporting.push(cite(evidenceNode, locale, observation));
    }

    // Ranking weights, chosen so that DECLARED-EVIDENCE COVERAGE dominates.
    // Two fault modes are usually reachable from the same alarm; what separates
    // them is how much of the evidence each one predicts was actually seen, and
    // whether anything was seen that it predicts should NOT be.
    const score =
      supporting.length * 4 -
      contradicting.length * 3 +
      candidate.reachedFrom.length * 2 -
      candidate.depth;

    const denominator = declared.length;
    const rawConfidence =
      denominator === 0 ? 0 : (supporting.length - contradicting.length) / denominator;
    const confidence = Math.min(Math.max(rawConfidence, 0), 1);

    const chains: EvidenceChain[] = candidate.reachedFrom
      .map((originId) => {
        const edges = shortestChain(index, originId, candidate.node.id, 3);
        return edges ? { nodeId: originId, edgeIds: edges.map((e) => e.id) } : null;
      })
      .filter((c): c is EvidenceChain => c !== null);

    const reviewOnly =
      isReviewOnly(candidate.node.provenance.safetyClass) ||
      declared.some((n) => isReviewOnly(n.provenance.safetyClass));

    return {
      faultModeId: candidate.node.id,
      label: localized(candidate.node.label, locale),
      faultClass: candidate.node.attributes.faultClass ?? "UNKNOWN",
      subsystem: (candidate.node.attributes.subsystem ?? "PLC_LOGIC") as Subsystem,
      score,
      confidence,
      supporting,
      contradicting,
      missing,
      chains,
      reviewOnly,
    };
  });

  /* 4b — demote hypotheses that the corpus shows to be consequences of another
   *      candidate. Without this the most VISIBLE fault wins, and the most
   *      visible fault is usually the last one in the causal chain. */
  const CONSEQUENCE_PENALTY = 6;
  const explainsByHypothesis = new Map<string, string[]>(
    hypotheses.map((h) => [h.faultModeId, explainedBy(index, h.faultModeId)]),
  );
  const supportByHypothesis = new Map<string, Set<string>>(
    hypotheses.map((h) => [h.faultModeId, new Set(h.supporting.map((c) => c.nodeId))]),
  );

  for (const downstream of hypotheses) {
    const downstreamSupport = supportByHypothesis.get(downstream.faultModeId)!;
    for (const upstream of hypotheses) {
      if (upstream.faultModeId === downstream.faultModeId) continue;
      const forward = isConsequenceOf(
        index,
        explainsByHypothesis.get(upstream.faultModeId)!,
        downstreamSupport,
      );
      if (!forward) continue;
      // Only demote when the relationship is one-directional. A mutual
      // constraint says the two faults are entangled, not that one caused the
      // other, and quietly picking a winner there would be a guess.
      const reverse = isConsequenceOf(
        index,
        explainsByHypothesis.get(downstream.faultModeId)!,
        supportByHypothesis.get(upstream.faultModeId)!,
      );
      if (reverse) continue;
      downstream.score -= CONSEQUENCE_PENALTY;
      break;
    }
  }

  hypotheses.sort(
    (a, b) => b.score - a.score || b.confidence - a.confidence || byString(a.faultModeId, b.faultModeId),
  );
  const ranked = hypotheses.slice(0, maxHypotheses);

  /* 5 — aggregate evidence views across the surviving hypotheses */
  const dedupe = (items: EvidenceCitation[]): EvidenceCitation[] => {
    const seen = new Map<string, EvidenceCitation>();
    for (const item of items) if (!seen.has(item.nodeId)) seen.set(item.nodeId, item);
    return [...seen.values()].sort((a, b) => byString(a.nodeId, b.nodeId));
  };

  const supportingEvidence = dedupe(ranked.flatMap((h) => h.supporting));
  const contradictoryEvidence = dedupe(ranked.flatMap((h) => h.contradicting));
  const missingEvidence = dedupe(ranked.flatMap((h) => h.missing));

  /* 6 — safe verification actions, attributed to what they distinguish */
  const actionMap = new Map<string, SafeActionRecommendation>();
  for (const hypothesis of ranked) {
    for (const action of safeActionsFor(index, hypothesis.faultModeId)) {
      const existing = actionMap.get(action.id);
      if (existing) {
        existing.verifies.push(hypothesis.faultModeId);
        continue;
      }
      actionMap.set(action.id, {
        nodeId: action.id,
        label: localized(action.label, locale),
        verifies: [hypothesis.faultModeId],
        reviewOnly: isReviewOnly(action.provenance.safetyClass),
      });
    }
  }
  const safeVerificationActions = [...actionMap.values()].sort((a, b) =>
    byString(a.nodeId, b.nodeId),
  );

  /* 7 — escalation conditions, stated as engineering facts */
  const escalationConditions: string[] = [];
  const safetyObservations = [...observed.entries()].filter(([nodeId]) => {
    const node = index.nodes.get(nodeId);
    return node ? isReviewOnly(node.provenance.safetyClass) : false;
  });
  if (safetyObservations.length > 0) {
    escalationConditions.push(
      "A safety-classified object is part of this picture; any action touching it is review-only and requires a qualified safety engineer.",
    );
  }
  if (ranked.some((h) => h.reviewOnly)) {
    escalationConditions.push(
      "At least one ranked hypothesis involves a safety-related object; confirm with the responsible engineer before intervening.",
    );
  }
  if (ranked.length === 0) {
    escalationConditions.push(
      "No corpus fault mode is reachable from the supplied observations; the evidence set is too small or the affected subsystem is not modelled.",
    );
  } else if (ranked[0].confidence < 0.5) {
    escalationConditions.push(
      "The leading hypothesis is supported by less than half of its declared evidence; collect the missing evidence before acting.",
    );
  }

  /* 8 — citation set */
  const citations = [
    ...new Set([
      ...observedFacts.map((c) => c.nodeId),
      ...ranked.map((h) => h.faultModeId),
      ...supportingEvidence.map((c) => c.nodeId),
      ...contradictoryEvidence.map((c) => c.nodeId),
      ...missingEvidence.map((c) => c.nodeId),
      ...safeVerificationActions.map((a) => a.nodeId),
    ]),
  ].sort(byString);

  return {
    engineVersion: DIAGNOSTIC_ENGINE_VERSION,
    observedFacts,
    unresolvedObservations,
    supportingEvidence,
    contradictoryEvidence,
    missingEvidence,
    hypotheses: ranked,
    confidence: ranked[0]?.confidence ?? 0,
    safeVerificationActions,
    escalationConditions,
    citations,
  };
}

/**
 * Trace the diagnostic chain the phase brief names explicitly, for one piece of
 * equipment: start request → mode → sequence → permissives → interlocks →
 * drive → feedback → sensors → alarms.
 *
 * This is the cross-layer view: it reports the engineering objects that stand
 * between an operator's "it will not start" and the physical process, so the
 * gaps in an evidence set are visible before any hypothesis is offered.
 */
export function startChainFor(index: KnowledgeIndex, equipmentId: string): KnowledgeNode[] {
  const root = index.nodes.get(equipmentId);
  if (!root) return [];

  const reached = [
    root,
    ...index.edges
      .filter((e) => e.source === equipmentId || e.target === equipmentId)
      .map((e) => index.nodes.get(e.source === equipmentId ? e.target : e.source))
      .filter((n): n is KnowledgeNode => Boolean(n)),
  ];

  const RELEVANT = new Set([
    "TAG",
    "PERMISSIVE",
    "INTERLOCK",
    "SEQUENCE",
    "STATE",
    "ALARM",
    "IO_POINT",
    "SCADA_TAG",
    "HMI_OBJECT",
  ]);

  const expanded = new Map<string, KnowledgeNode>();
  for (const node of reached) expanded.set(node.id, node);
  for (const node of reached) {
    for (const edge of index.out.get(node.id) ?? []) {
      if (!DIAGNOSTIC_RELATIONS.includes(edge.relation)) continue;
      const target = index.nodes.get(edge.target);
      if (target && RELEVANT.has(target.kind)) expanded.set(target.id, target);
    }
    for (const edge of index.in.get(node.id) ?? []) {
      if (!DIAGNOSTIC_RELATIONS.includes(edge.relation)) continue;
      const source = index.nodes.get(edge.source);
      if (source && RELEVANT.has(source.kind)) expanded.set(source.id, source);
    }
  }

  return [...expanded.values()].sort((a, b) => byString(a.kind, b.kind) || byString(a.id, b.id));
}
