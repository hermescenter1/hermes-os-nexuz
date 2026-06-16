import { CASES } from "@/lib/industrial/cases";
import { KNOWLEDGE } from "@/lib/industrial/knowledge";
import { mergeCases, mergeKnowledge } from "@/lib/industrial/db-bridge";
import { scoreCase, scoreKnowledge } from "./evidence-score";
import {
  rankCases,
  rankKnowledge,
  mergeRanking,
  deriveConfidence,
  bandFor,
} from "./evidence-ranker";
import type { RetrievalInput, RetrievalResult } from "./retrieval-types";

/**
 * Hybrid Retrieval Engine (Phase 10).
 *
 * Query → (domains, vendors already detected) → score every case and every
 * knowledge library → rank by evidence → derive confidence. Pure and
 * deterministic. Candidates that score 0 are dropped so the ranking only
 * shows genuinely-supported evidence.
 */
export function runRetrieval(input: RetrievalInput): RetrievalResult {
  const { text, domains, vendors, extraCases, extraKnowledge } = input;

  // Phase 11B-A: merge static + PostgreSQL-published records once per call.
  // Reference-equal to the static arrays when extra* is omitted/empty.
  const casePool = mergeCases(CASES, extraCases);
  const knowledgePool = mergeKnowledge(KNOWLEDGE, extraKnowledge);

  const scoredCases = casePool.map((c) => scoreCase(c, text, domains, vendors)).filter(
    (s) => s.score > 0
  );
  const scoredKnowledge = knowledgePool.map((l) =>
    scoreKnowledge(l, text, domains, vendors)
  ).filter((s) => s.score > 0);

  const topCases = rankCases(scoredCases);
  const topKnowledge = rankKnowledge(scoredKnowledge);
  const ranking = mergeRanking(topCases, topKnowledge);

  const confidence = deriveConfidence(topCases, topKnowledge, vendors.length);
  const confidenceBand = bandFor(confidence);

  return { topCases, topKnowledge, ranking, confidence, confidenceBand };
}
