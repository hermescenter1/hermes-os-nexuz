/**
 * Engineering Memory Retrieval Engine (Phase 18B/18C).
 *
 * Pure deterministic scoring — no embeddings, no LLM, no network calls.
 * Identical input always yields identical output (modulo the `now` param,
 * which defaults to new Date() and can be overridden in tests).
 *
 * Phase 18B score breakdown (max 100):
 *   Domain match     0–30  exact match when a domain filter is provided
 *   Keyword overlap  0–40  query-token coverage over memory text + ref IDs
 *   Confidence       0–15  stored confidence as a quality signal
 *   Outcome weight   0–10  success(10) > partial(7) > unknown(3) > failed(0)
 *   Recency boost    0–5   ≤7d(5), ≤30d(3), ≤90d(1), older(0)
 *
 * Phase 18C additions (scoreLearned / rankMemoriesWithFeedback):
 *   Same five components, but when feedback is available:
 *   - Confidence uses computeMemoryConfidence (feedback-adjusted)
 *   - Outcome uses computeOutcomeScore (averaged over all feedback entries)
 *   - Final score is multiplied by computeLearningWeight (0.30–1.50)
 *
 * When a memory has no feedback, scoreLearned produces exactly the same result
 * as scoreMemory — Phase 18B behaviour is fully preserved.
 */

import type { StoredMemory, MemoryOutcome, MemoryWithFeedback } from "@/lib/storage/types";
import {
  computeOutcomeScore,
  computeMemoryConfidence,
  computeLearningWeight,
} from "./memory-learning";

// ---- Public types --------------------------------------------------------

export interface MemoryMatch {
  id: string;
  query: string;
  domain: string;
  summary: string;
  confidence: number;
  outcome: MemoryOutcome;
  score: number;
  /** Codes that explain what contributed to the score. Never raw errors. */
  reasons: string[];
}

export interface SearchOptions {
  domain?: string;
  limit?: number;
}

// Re-export for convenience — callers that already import from here don't need to change.
export type { MemoryWithFeedback };

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
  { maxDays: 7,  pts: 5 },
  { maxDays: 30, pts: 3 },
  { maxDays: 90, pts: 1 },
];

// ---- Text utilities (self-contained) -------------------------------------

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

// ---- Extracted scoring sub-functions (shared by Phase 18B + 18C) --------

function domainScore(
  memory: StoredMemory,
  filterDomain?: string
): { pts: number; reasons: string[] } {
  if (filterDomain && memory.domain === filterDomain) {
    return { pts: WEIGHTS.DOMAIN, reasons: ["domain_match"] };
  }
  return { pts: 0, reasons: [] };
}

function keywordScore(
  searchQuery: string,
  memory: StoredMemory
): { pts: number; reasons: string[] } {
  const queryTokens = tokenize(searchQuery);
  if (queryTokens.length === 0) return { pts: 0, reasons: [] };

  const baseNorm = normalize(`${memory.query} ${memory.analysisSummary}`);
  const refNorm  = normalize(
    `${memory.relatedCaseIds.join(" ")} ${memory.relatedDocumentIds.join(" ")}`
  );
  const fullNorm = `${baseNorm} ${refNorm}`;

  let matched = 0;
  let refOnly = 0;
  for (const t of queryTokens) {
    if (inText(t, fullNorm)) {
      matched++;
      if (!inText(t, baseNorm) && inText(t, refNorm)) refOnly++;
    }
  }

  const pts = Math.round((matched / queryTokens.length) * WEIGHTS.KEYWORD);
  const reasons: string[] = [];
  if (pts > 0) reasons.push("keyword_overlap");
  if (refOnly > 0) reasons.push("reference_match");
  return { pts, reasons };
}

function recencyScore(
  createdAt: string,
  now: Date
): { pts: number; reasons: string[] } {
  const ageDays =
    (now.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  for (const tier of RECENCY_TIERS) {
    if (ageDays <= tier.maxDays) {
      return { pts: tier.pts, reasons: ["recent"] };
    }
  }
  return { pts: 0, reasons: [] };
}

// ---- Phase 18B scoring (plain StoredMemory, no feedback) -----------------

/**
 * Scores one memory against a search query without feedback data.
 * @param now  Pass a fixed Date in tests to make recency deterministic.
 */
export function scoreMemory(
  searchQuery: string,
  memory: StoredMemory,
  filterDomain?: string,
  now = new Date()
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  const d = domainScore(memory, filterDomain);
  reasons.push(...d.reasons);

  const k = keywordScore(searchQuery, memory);
  reasons.push(...k.reasons);

  const clampedConf = Math.max(0, Math.min(100, memory.confidence));
  const confPts = Math.round((clampedConf / 100) * WEIGHTS.CONFIDENCE);
  if (clampedConf >= 70) reasons.push("high_confidence");

  const outcomePts = OUTCOME_SCORES[memory.outcome] ?? OUTCOME_SCORES.unknown;
  if (memory.outcome === "success") reasons.push("outcome_success");
  else if (memory.outcome === "partial") reasons.push("outcome_partial");
  else if (memory.outcome === "failed") reasons.push("outcome_failed");

  const r = recencyScore(memory.createdAt, now);
  reasons.push(...r.reasons);

  return {
    score: Math.min(d.pts + k.pts + confPts + outcomePts + r.pts, 100),
    reasons,
  };
}

/** Rank plain memories (Phase 18B — no feedback). */
export function rankMemories(
  searchQuery: string,
  memories: StoredMemory[],
  options: SearchOptions = {},
  now = new Date()
): MemoryMatch[] {
  const { domain: filterDomain, limit } = options;

  const scored: MemoryMatch[] = memories.map((m) => {
    const { score, reasons } = scoreMemory(searchQuery, m, filterDomain, now);
    return { id: m.id, query: m.query, domain: m.domain, summary: m.analysisSummary,
             confidence: m.confidence, outcome: m.outcome, score, reasons };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const tA = memories.find((m) => m.id === a.id)?.createdAt ?? "";
    const tB = memories.find((m) => m.id === b.id)?.createdAt ?? "";
    return tB.localeCompare(tA);
  });

  return limit && limit > 0 ? scored.slice(0, limit) : scored;
}

// ---- Phase 18C scoring (MemoryWithFeedback, learning-adjusted) -----------

/**
 * Scores a memory that has its feedback history loaded.
 *
 * When `memory.feedback` is empty the result is identical to `scoreMemory`.
 * When feedback is present the three learning signals kick in:
 *   - Confidence: feedback-adjusted via computeMemoryConfidence
 *   - Outcome: averaged over all feedback via computeOutcomeScore
 *   - Final score multiplied by computeLearningWeight (0.30–1.50)
 *
 * @param now  Pass a fixed Date in tests.
 */
export function scoreLearned(
  searchQuery: string,
  memory: MemoryWithFeedback,
  filterDomain?: string,
  now = new Date()
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  // 1. Domain (unchanged)
  const d = domainScore(memory, filterDomain);
  reasons.push(...d.reasons);

  // 2. Keyword overlap (unchanged)
  const k = keywordScore(searchQuery, memory);
  reasons.push(...k.reasons);

  // 3. Learned confidence (feedback-adjusted when feedback exists)
  const learnedConf = computeMemoryConfidence(memory);
  const confPts = Math.round((Math.max(0, Math.min(100, learnedConf)) / 100) * WEIGHTS.CONFIDENCE);
  if (learnedConf >= 70) reasons.push("high_confidence");

  // 4. Outcome score: aggregate feedback when available, else stored outcome
  let outcomePts: number;
  if (memory.feedback.length > 0) {
    outcomePts = computeOutcomeScore(memory.feedback);
    const successes = memory.feedback.filter((f) => f.outcome === "success").length;
    const failures  = memory.feedback.filter((f) => f.outcome === "failed").length;
    if (successes > 0) reasons.push("feedback_success");
    if (failures  > 0) reasons.push("feedback_failed");
  } else {
    outcomePts = OUTCOME_SCORES[memory.outcome] ?? OUTCOME_SCORES.unknown;
    if (memory.outcome === "success") reasons.push("outcome_success");
    else if (memory.outcome === "partial") reasons.push("outcome_partial");
    else if (memory.outcome === "failed") reasons.push("outcome_failed");
  }

  // 5. Recency (unchanged)
  const r = recencyScore(memory.createdAt, now);
  reasons.push(...r.reasons);

  // 6. Learning weight — multiplicative, clamped to [0.30, 1.50]
  const weight = computeLearningWeight(memory);
  if (weight > 1.0) reasons.push("learning_boost");
  else if (weight < 1.0) reasons.push("learning_penalty");

  const rawScore = d.pts + k.pts + confPts + outcomePts + r.pts;
  const score = Math.min(Math.round(rawScore * weight), 100);

  return { score, reasons };
}

/**
 * Ranks memories that have their feedback loaded, using the learning-aware
 * scorer. Falls back to identical behaviour as `rankMemories` when a memory
 * has no feedback.
 *
 * @param now  Pass a fixed Date in tests.
 */
export function rankMemoriesWithFeedback(
  searchQuery: string,
  memories: MemoryWithFeedback[],
  options: SearchOptions = {},
  now = new Date()
): MemoryMatch[] {
  const { domain: filterDomain, limit } = options;

  const scored: MemoryMatch[] = memories.map((m) => {
    const { score, reasons } = scoreLearned(searchQuery, m, filterDomain, now);
    return { id: m.id, query: m.query, domain: m.domain, summary: m.analysisSummary,
             confidence: m.confidence, outcome: m.outcome, score, reasons };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const tA = memories.find((m) => m.id === a.id)?.createdAt ?? "";
    const tB = memories.find((m) => m.id === b.id)?.createdAt ?? "";
    return tB.localeCompare(tA);
  });

  return limit && limit > 0 ? scored.slice(0, limit) : scored;
}
