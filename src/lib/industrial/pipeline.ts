import { classify } from "./brain-core";
import { DOMAIN_LIBS } from "./knowledge";
import { detectVendors, type VendorId } from "./vendors";
import { matchCases, type CaseMatch } from "./cases";
import type { RootCauseAnalysis } from "./root-cause";
import { buildRankedRootCause } from "./cause-ranking";
import type { BrainDomainId, SafetyKind } from "@/lib/services/types";

/**
 * Multi-Step Reasoning Pipeline (Step 6).
 *
 *   Question → Domain Detection → Knowledge Retrieval (libraries + cases
 *   + vendor context) → Cause Analysis → Risk Analysis → Recommendation
 *   → Final Report
 *
 * Pure orchestration over existing pure functions — no I/O, no device
 * communication. Each stage records its duration so the trace can feed
 * the future learning loop. The LLM (when configured) consumes this
 * pipeline's output; it never replaces the deterministic stages.
 */

export interface PipelineStep {
  id:
    | "domainDetection"
    | "knowledgeRetrieval"
    | "causeAnalysis"
    | "rootCauseAnalysis"
    | "riskAnalysis"
    | "recommendation"
    | "finalReport";
  ms: number;
}

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export interface PipelineResult {
  domains: { id: BrainDomainId; score: number }[];
  libraries: string[];
  vendors: VendorId[];
  caseMatches: CaseMatch[];
  confidence: number;
  evidenceScore: number;
  safety: SafetyKind;
  riskLevel: RiskLevel;
  /** primary cause hypothesis source: best case id or top library id */
  causeSource: { kind: "case" | "library"; id: string };
  /** Step 8: case-driven root cause; undefined when no case matched */
  rootCause?: RootCauseAnalysis;
  /** Unknown layer: evidence insufficient for any classification */
  unknown: boolean;
  steps: PipelineStep[];
}

const URGENT = [
  "fire", "smoke", "burning", "burnt", "sparking", "arc flash", "shock", "injury",
  "آتش", "دود", "سوختگی", "بوی سوختگی", "جرقه", "برق گرفتگی", "جراحت",
];

function normalize(q: string): string {
  return q
    .toLowerCase()
    .replace(/\u064A/g, "\u06CC")
    .replace(/\u0643/g, "\u06A9")
    .replace(/\u200C/g, "");
}

export function runPipeline(
  question: string,
  locale: "fa" | "en" = "en"
): PipelineResult {
  const steps: PipelineStep[] = [];
  const t0 = () => Date.now();
  const text = normalize(question);

  // 1 — Domain Detection
  let t = t0();
  const cls = classify(question);
  steps.push({ id: "domainDetection", ms: Date.now() - t });

  // 2 — Knowledge Retrieval: libraries (from classification) + vendor
  //     context + engineering-case matching
  // Unknown layer: when the classifier found insufficient evidence,
  // retrieval is DISABLED unless a matched engineering case (hard keyword
  // evidence, vendor-boosted) rescues the classification — "sufficient
  // supporting evidence" includes case evidence.
  t = t0();
  const vendors = detectVendors(text);
  let unknown = Boolean(cls.unknown);
  let domains = cls.domains;
  let libraries = cls.libraries;
  let caseMatches = matchCases(
    text,
    domains.map((d) => d.id),
    vendors
  );
  let rescueScore = 0;
  if (unknown) {
    if (caseMatches.length > 0) {
      const primary = caseMatches[0];
      rescueScore = primary.score;
      domains = [{ id: primary.case.category, score: 1 }];
      libraries = [...DOMAIN_LIBS[primary.case.category]].slice(0, 4);
      unknown = false;
    } else {
      caseMatches = [];
      libraries = [];
    }
  }
  steps.push({ id: "knowledgeRetrieval", ms: Date.now() - t });

  // 3 — Cause Analysis: a vendor-matched case beats a generic library as
  //     the primary cause hypothesis
  t = t0();
  const causeSource: PipelineResult["causeSource"] =
    caseMatches.length > 0
      ? { kind: "case", id: caseMatches[0].case.id }
      : { kind: "library", id: libraries[0] ?? "troubleshooting" };
  steps.push({ id: "causeAnalysis", ms: Date.now() - t });

  // 4 — Root Cause Analysis (ranked): query analysis → candidate causes →
  //     case retrieval → evidence scoring → cause ranking. Case memory
  //     never directly determines the primary cause.
  t = t0();
  const rootCause = buildRankedRootCause({
    text: question,
    locale,
    domains: domains.map((d) => d.id),
    vendors,
    caseMatches,
  }).rootCause;
  steps.push({ id: "rootCauseAnalysis", ms: Date.now() - t });

  // 5 — Risk Analysis: safety class + urgency signals → risk level
  t = t0();
  let riskPoints = 0;
  if (cls.safety !== "general") riskPoints += 1;
  if (URGENT.some((u) => text.includes(u.replace(/\u200C/g, "").toLowerCase())))
    riskPoints += 2;
  if (domains[0]?.id === "cybersecurity") riskPoints += 1;
  const riskLevel: RiskLevel = unknown
    ? "unknown"
    : riskPoints >= 2
      ? "high"
      : riskPoints === 1
        ? "medium"
        : "low";
  steps.push({ id: "riskAnalysis", ms: Date.now() - t });

  // 5 — Recommendation: evidence scoring feeds confidence shaping; the
  //     concrete checks remain library/case-driven downstream
  t = t0();
  const caseBoost = Math.min(caseMatches.length * 0.15, 0.3);
  const vendorBoost = vendors.length > 0 ? 0.1 : 0;
  const vendorCaseBonus =
    vendors.length > 0 && caseMatches.length > 0 ? 0.05 : 0;
  let confidence: number;
  let evidenceScore: number;
  if (unknown) {
    // Unknown is always Low confidence; retrieval disabled, no evidence.
    confidence = 0.2;
    evidenceScore = 0;
  } else if (rescueScore > 0) {
    // case-rescued classification: confidence from match strength, capped
    confidence =
      Math.round(
        Math.min(0.55 + Math.min(rescueScore, 8) * 0.025 + vendorCaseBonus, 0.9) * 100
      ) / 100;
    evidenceScore =
      Math.round(Math.min(0.5 + caseBoost + vendorBoost, 0.95) * 100) / 100;
  } else {
    evidenceScore =
      Math.round(
        Math.min(cls.confidence * 0.6 + caseBoost + vendorBoost, 0.95) * 100
      ) / 100;
    confidence =
      Math.round(
        Math.min(cls.confidence + caseBoost / 3 + vendorCaseBonus, 0.9) * 100
      ) / 100;
  }
  steps.push({ id: "recommendation", ms: Date.now() - t });

  // 6 — Final Report (assembled by the API layer into BrainAnalysis)
  steps.push({ id: "finalReport", ms: 0 });

  return {
    domains,
    libraries,
    vendors,
    caseMatches,
    confidence,
    evidenceScore,
    safety: cls.safety,
    riskLevel,
    causeSource,
    rootCause,
    unknown,
    steps,
  };
}
