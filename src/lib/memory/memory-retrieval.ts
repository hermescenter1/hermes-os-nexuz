/**
 * Engineering Memory Retrieval Engine (Phase 18B).
 *
 * Pure deterministic scoring — no embeddings, no LLM, no network calls.
 * Identical input always yields identical output (modulo the `now` param,
 * which defaults to new Date() and can be overridden in tests).
 *
 * Score breakdown (max 100):
 *   Domain match     0–30  exact match when a domain filter is provided
 *   Keyword overlap  0–40  query-token coverage over memory text + ref IDs
 *   Confidence       0–15  stored confidence as a quality signal
 *   Outcome weight   0–10  success(10) > partial(7) > unknown(3) > failed(0)
 *   Recency boost    0–5   ≤7d(5), ≤30d(3), ≤90d(1), older(0)
 *
 * Keyword search covers: memory.query + memory.analysisSummary + the tokens
 * inside any relatedCaseIds / relatedDocumentIds strings (many case IDs
 * contain meaningful words like "vfd", "overcurrent", "profinet").
 */

import type { StoredMemory, MemoryOutcome } from "@/lib/storage/types";

// ---- Public types --------------------------------------------------------

export interface MemoryMatch {
  id: string;
  query: string;
  domain: string;
  summary: string;
  confidence: number;
  outcome: MemoryOutcome;
  score: number;
  /** Codes that explain what contributed to the score — useful for UI hints
   *  and transparent ranking. Never raw error messages or internal state. */
  reasons: string[];
}

export interface SearchOptions {
  domain?: string;
  limit?: number;
}

// ---- Weights (named constants for readability + testability) -------------

export const WEIGHTS = {
  DOMAIN: 30,
  KEYWORD: 40,
  CONFIDENCE: 15,
  OUTCOME: 10,
  RECENCY: 5,
} as const;

export const OUTCOME_SCORES: Record<MemoryOutcome, number> = {
  success: 10,
  partial: 7,
  unknown: 3,
  failed: 0,
};

export const RECENCY_TIERS: Array<{ maxDays: number; pts: number }> = [
  { maxDays: 7, pts: 5 },
  { maxDays: 30, pts: 3 },
  { maxDays: 90, pts: 1 },
];

// ---- Text utilities (self-contained — no external imports) ---------------

const STOP = new Set([
  "the", "and", "for", "with", "not", "from", "that", "this", "into",
  "are", "was", "has", "have", "been", "out", "off", "per", "due",
  "our", "how", "why", "what", "when", "can", "does", "will", "all",
  "any", "but", "yet", "its", "after", "then", "them",
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/‌/g, "")
    // Persian/Arabic-Indic digits → ASCII so fault codes match bilingually
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

function stem(t: string): string {
  return t.replace(/(ment|tion|sion|ings?|ed|es|s)$/u, "");
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

function inText(token: string, normalizedText: string): boolean {
  if (normalizedText.includes(token)) return true;
  const st = stem(token);
  return st.length >= 3 && normalizedText.includes(st);
}

// ---- Core scoring function -----------------------------------------------

/**
 * Scores one memory against a search query.
 *
 * @param now  Pass a fixed Date in tests to make recency deterministic.
 */
export function scoreMemory(
  searchQuery: string,
  memory: StoredMemory,
  filterDomain?: string,
  now = new Date()
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  // 1. Domain match (0–30)
  let domainPts = 0;
  if (filterDomain && memory.domain === filterDomain) {
    domainPts = WEIGHTS.DOMAIN;
    reasons.push("domain_match");
  }

  // 2. Keyword overlap (0–40)
  //    Search in: query + summary + reference ID strings.
  //    Many case/doc IDs contain meaningful words (e.g. "case-vfd-overcurrent").
  const queryTokens = tokenize(searchQuery);
  let keywordPts = 0;
  let refOnlyMatches = 0;

  if (queryTokens.length > 0) {
    const baseNorm = normalize(`${memory.query} ${memory.analysisSummary}`);
    const refNorm = normalize(
      `${memory.relatedCaseIds.join(" ")} ${memory.relatedDocumentIds.join(" ")}`
    );
    const fullNorm = `${baseNorm} ${refNorm}`;

    let matched = 0;
    for (const t of queryTokens) {
      if (inText(t, fullNorm)) {
        matched++;
        if (!inText(t, baseNorm) && inText(t, refNorm)) refOnlyMatches++;
      }
    }

    const ratio = matched / queryTokens.length;
    keywordPts = Math.round(ratio * WEIGHTS.KEYWORD);
    if (keywordPts > 0) reasons.push("keyword_overlap");
    if (refOnlyMatches > 0) reasons.push("reference_match");
  }

  // 3. Confidence contribution (0–15)
  const clampedConf = Math.max(0, Math.min(100, memory.confidence));
  const confPts = Math.round((clampedConf / 100) * WEIGHTS.CONFIDENCE);
  if (clampedConf >= 70) reasons.push("high_confidence");

  // 4. Outcome weight (0–10)
  const outcomePts = OUTCOME_SCORES[memory.outcome] ?? OUTCOME_SCORES.unknown;
  if (memory.outcome === "success") reasons.push("outcome_success");
  else if (memory.outcome === "partial") reasons.push("outcome_partial");
  else if (memory.outcome === "failed") reasons.push("outcome_failed");

  // 5. Recency boost (0–5)
  const ageDays =
    (now.getTime() - new Date(memory.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  let recencyPts = 0;
  for (const tier of RECENCY_TIERS) {
    if (ageDays <= tier.maxDays) {
      recencyPts = tier.pts;
      break;
    }
  }
  if (recencyPts > 0) reasons.push("recent");

  const score = Math.min(
    domainPts + keywordPts + confPts + outcomePts + recencyPts,
    100
  );

  return { score, reasons };
}

// ---- Ranking function ----------------------------------------------------

/**
 * Scores every memory against `searchQuery`, sorts by score descending
 * (then newest-first as tiebreaker), and applies the optional limit.
 *
 * @param now  Pass a fixed Date in tests for deterministic recency scoring.
 */
export function rankMemories(
  searchQuery: string,
  memories: StoredMemory[],
  options: SearchOptions = {},
  now = new Date()
): MemoryMatch[] {
  const { domain: filterDomain, limit } = options;

  const scored: MemoryMatch[] = memories.map((m) => {
    const { score, reasons } = scoreMemory(searchQuery, m, filterDomain, now);
    return {
      id: m.id,
      query: m.query,
      domain: m.domain,
      summary: m.analysisSummary,
      confidence: m.confidence,
      outcome: m.outcome,
      score,
      reasons,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tiebreaker: prefer more recently created memories
    const tA = memories.find((m) => m.id === a.id)?.createdAt ?? "";
    const tB = memories.find((m) => m.id === b.id)?.createdAt ?? "";
    return tB.localeCompare(tA);
  });

  return limit && limit > 0 ? scored.slice(0, limit) : scored;
}
