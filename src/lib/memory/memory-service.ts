/**
 * Engineering Memory service (Phase 18A).
 *
 * Thin coordination layer over `memoryRepository()` and `feedbackRepository()`.
 * Validates input, enforces the outcome enum, and keeps the memory's `outcome`
 * field in sync with the latest feedback so callers can filter without joining.
 *
 * No Brain reasoning, no scoring, no learning — purely storage + retrieval.
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
