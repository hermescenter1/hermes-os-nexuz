import type { BrainDomainId } from "@/lib/services/types";
import type { EngineeringCase } from "@/lib/industrial/cases";
import type { KnowledgeLib } from "@/lib/industrial/knowledge";
import type { RagSearchResult } from "@/lib/rag/types";

/**
 * Hybrid Retrieval types (Phase 10; Phase 14B prepares the vector-search
 * seam, additive only).
 *
 * The retrieval engine scores cases and knowledge libraries against the
 * query's classification signals, ranks them by evidence, and derives a
 * non-fixed confidence band. It is a pure, deterministic layer over the
 * existing pipeline outputs — no LLM, no network.
 *
 * Phase 14B note: `vectorMatches` on `RetrievalInput`/`RetrievalResult` is a
 * pass-through seam, not an integration — `runRetrieval()` does not call
 * `runRagPipeline()` itself and does not fuse vector scores into
 * `ranking`/`confidence`. A caller that already has `RagSearchResult[]`
 * (from a future `/api/brain` call to `runRagPipeline()`) can hand them
 * through; omitting the field keeps every existing caller byte-for-byte
 * unchanged. `@/lib/rag/types` has zero imports of its own (a leaf module),
 * so this type-only import introduces no runtime/circular dependency.
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
  /** Phase 14B: optional pre-computed vector evidence (e.g. the `results`
   *  of a `runRagPipeline()` call made by the caller). Omitted ⇒
   *  keyword-only, byte-for-byte identical to pre-Phase-14B behavior. */
  vectorMatches?: RagSearchResult[];
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
  /** Phase 14B: "hybrid" only when the input supplied non-empty
   *  `vectorMatches`; "keyword" (the only possible value before Phase 14B)
   *  otherwise. Mirrors `rag-types.ts`'s `RetrievalResult.strategy` naming
   *  for conceptual consistency, without importing that type. */
  strategy: "keyword" | "hybrid";
  /** Phase 14B: pass-through of the input's `vectorMatches`, present only
   *  when supplied and non-empty — no fusion/reranking against the
   *  keyword evidence above yet; that integration is a later phase. */
  vectorMatches?: RagSearchResult[];
}
