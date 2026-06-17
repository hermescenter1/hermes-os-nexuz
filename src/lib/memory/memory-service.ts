/**
 * Engineering Memory service (Phase 18A/18B).
 *
 * Phase 18A: storage + retrieval (CRUD, feedback).
 * Phase 18B: ranking and search — `rankEngineeringMemories`,
 *   `searchEngineeringMemories`, `getSimilarMemories`.
 *
 * Thin coordination layer: no Brain reasoning, no embeddings, no learning.
 * Phase 18C will add confidence scoring and learning loop on top of this.
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
} from "@/lib/storage/types";
import { rankMemories, type MemoryMatch, type SearchOptions } from "./memory-retrieval";

export type { MemoryMatch, SearchOptions };

export const VALID_OUTCOMES: readonly MemoryOutcome[] = [
  "unknown",
  "success",
  "partial",
  "failed",
];

export function isValidOutcome(v: unknown): v is MemoryOutcome {
  return typeof v === "string" && (VALID_OUTCOMES as string[]).includes(v);
}

export type MemoryWithFeedback = StoredMemory & {
  feedback: StoredMemoryFeedback[];
};

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

// ---- Phase 18B: retrieval + ranking ----------------------------------------

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

/**
 * Fetches all stored memories, ranks them against the query, and returns the
 * top results. Never throws — an empty list is returned on any repo failure.
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
  return rankMemories(query, memories, options);
}

/**
 * Convenience wrapper for the common "find similar memories for this query"
 * pattern.  `domain` provides a 30-point score boost for exact domain
 * matches; it does not hard-filter results, so cross-domain matches with
 * strong keyword overlap can still appear.
 */
export async function getSimilarMemories(
  query: string,
  domain?: string,
  limit?: number
): Promise<MemoryMatch[]> {
  return searchEngineeringMemories(query, { domain, limit });
}
