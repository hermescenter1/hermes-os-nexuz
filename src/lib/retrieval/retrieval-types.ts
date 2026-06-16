import type { BrainDomainId } from "@/lib/services/types";
import type { EngineeringCase } from "@/lib/industrial/cases";
import type { KnowledgeLib } from "@/lib/industrial/knowledge";

/**
 * Hybrid Retrieval types (Phase 10).
 *
 * The retrieval engine scores cases and knowledge libraries against the
 * query's classification signals, ranks them by evidence, and derives a
 * non-fixed confidence band. It is a pure, deterministic layer over the
 * existing pipeline outputs — no LLM, no network.
 */

export type ConfidenceBand = "low" | "medium" | "high";

/** A component breakdown of an evidence score, for transparency. */
export interface ScoreBreakdown {
  label: string; // component name, e.g. "domain", "vendor"
  points: number;
}

export interface ScoredCase {
  kind: "case";
  id: string;
  vendor: string;
  domain: BrainDomainId;
  score: number; // 0..100
  breakdown: ScoreBreakdown[];
}

export interface ScoredKnowledge {
  kind: "knowledge";
  id: string;
  vendor?: string;
  domain: string;
  score: number; // 0..100
  breakdown: ScoreBreakdown[];
}

export type ScoredEvidence = ScoredCase | ScoredKnowledge;

export interface RetrievalInput {
  text: string; // raw question (normalized internally)
  domains: BrainDomainId[]; // detected domains (ranked)
  vendors: string[]; // detected vendor ids
  /** Phase 11B-A: optional PostgreSQL-published records merged with the
   *  static corpus for this call. Omitted ⇒ static-only, unchanged behavior. */
  extraCases?: EngineeringCase[];
  extraKnowledge?: KnowledgeLib[];
}

export interface RetrievalResult {
  /** top 3 cases by evidence score, highest first */
  topCases: ScoredCase[];
  /** top 3 knowledge libraries by evidence score, highest first */
  topKnowledge: ScoredKnowledge[];
  /** merged ranking (cases + knowledge), highest first, for the UI card */
  ranking: ScoredEvidence[];
  /** non-fixed confidence in 0..1, plus its band */
  confidence: number;
  confidenceBand: ConfidenceBand;
}
