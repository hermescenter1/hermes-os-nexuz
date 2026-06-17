/**
 * Engineering Memory service (Phase 18A/18B/18C).
 *
 * Phase 18A: storage + retrieval (CRUD, feedback).
 * Phase 18B: ranking and search — `rankEngineeringMemories`,
 *   `searchEngineeringMemories`, `getSimilarMemories`.
 * Phase 18C: learning loop — `searchEngineeringMemories` now loads feedback
 *   per memory and passes it to `rankMemoriesWithFeedback` so scores are
 *   feedback-adjusted via the learning engine functions.
 *
 * Thin coordination layer: no Brain reasoning, no embeddings.
 */

import {
  memoryRepository,
  feedbackRepository,
  type MemoryCreate,
  type FeedbackCreate,
} from "@/lib/storage/memory-repository";
import type {
  StoredMemory,
  StoredMemoryFeedback,
  MemoryOutcome,
  MemoryWithFeedback,
} from "@/lib/storage/types";
import {
  rankMemories,
  rankMemoriesWithFeedback,
  type MemoryMatch,
  type SearchOptions,
} from "./memory-retrieval";

export type { MemoryMatch, SearchOptions, MemoryWithFeedback };

export const VALID_OUTCOMES: readonly MemoryOutcome[] = [
  "unknown",
  "success",
  "partial",
  "failed",
];

export function isValidOutcome(v: unknown): v is MemoryOutcome {
  return typeof v === "string" && (VALID_OUTCOMES as string[]).includes(v);
}

export async function createEngineeringMemory(
  input: MemoryCreate
): Promise<StoredMemory> {
  return memoryRepository().create(input);
}

export async function listEngineeringMemories(
  limit = 50
): Promise<StoredMemory[]> {
  const all = await memoryRepository().list();
  return limit > 0 ? all.slice(0, limit) : all;
}

export async function getEngineeringMemory(
  id: string
): Promise<MemoryWithFeedback | null> {
  const memory = await memoryRepository().get(id);
  if (!memory) return null;
  const feedback = await feedbackRepository().listByMemoryId(id);
  return { ...memory, feedback };
}

/** Adds feedback to an existing memory and mirrors the outcome onto the
 *  parent record for convenient filtering. Returns null when the memory
 *  does not exist (caller maps this to 404). */
export async function addMemoryFeedback(
  memoryId: string,
  input: FeedbackCreate
): Promise<StoredMemoryFeedback | null> {
  const exists = await memoryRepository().get(memoryId);
  if (!exists) return null;
  const feedback = await feedbackRepository().create(input);
  // Mirror outcome onto the memory so GET /api/memory can filter by outcome
  // without loading all feedback rows.
  await memoryRepository().update(memoryId, { outcome: input.outcome });
  return feedback;
}

// ---- Phase 18B: plain ranking (no feedback) --------------------------------

/**
 * Pure synchronous ranking: scores and sorts the provided memories against
 * the search query. No I/O — safe to call in tests with hand-crafted records.
 */
export function rankEngineeringMemories(
  query: string,
  memories: StoredMemory[],
  options?: SearchOptions
): MemoryMatch[] {
  return rankMemories(query, memories, options);
}

// ---- Phase 18C: feedback-aware search ---------------------------------------

/**
 * Fetches all stored memories, loads each memory's feedback history, then
 * ranks using the learning-aware scorer (`rankMemoriesWithFeedback`).
 *
 * Scores are feedback-adjusted:
 *   - Confidence shifts ±20 pts based on resolved vs failed ratio
 *   - Outcome score is averaged across all feedback entries
 *   - Final score is multiplied by a learning weight (0.30–1.50)
 *
 * When a memory has no feedback, the result is identical to Phase 18B.
 * Never throws — returns [] on any repo failure.
 */
export async function searchEngineeringMemories(
  query: string,
  options: SearchOptions = {}
): Promise<MemoryMatch[]> {
  let memories: StoredMemory[] = [];
  try {
    memories = await memoryRepository().list();
  } catch {
    return [];
  }

  // Phase 18C: load feedback for all memories in parallel, fall back to empty
  // on any per-memory error so a single corrupt feedback row doesn't break search.
  const memoriesWithFeedback: MemoryWithFeedback[] = await Promise.all(
    memories.map(async (m): Promise<MemoryWithFeedback> => {
      try {
        const feedback = await feedbackRepository().listByMemoryId(m.id);
        return { ...m, feedback };
      } catch {
        return { ...m, feedback: [] };
      }
    })
  );

  return rankMemoriesWithFeedback(query, memoriesWithFeedback, options);
}

/**
 * Convenience wrapper for the common "find similar memories for this query"
 * pattern.  `domain` provides a 30-point score boost for exact domain
 * matches; it does not hard-filter results.
 */
export async function getSimilarMemories(
  query: string,
  domain?: string,
  limit?: number
): Promise<MemoryMatch[]> {
  return searchEngineeringMemories(query, { domain, limit });
}
