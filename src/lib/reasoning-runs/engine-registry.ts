/**
 * PHASE 112 — Engine version registry.
 *
 * Maps (engineId, engineVersion) → a registered replay executor. It FAILS
 * CLOSED: an unregistered id/version returns null, which the replay service
 * turns into ENGINE_VERSION_UNAVAILABLE. There is NO dynamic import from
 * caller-controlled text and NO remote code loading — the map is a static,
 * in-process table, so future engine versions coexist without rewriting old
 * records, and an attacker cannot name their way to arbitrary code.
 */
import type { ReasoningEngine } from "./types";
import {
  IndustrialBrainEngine,
  INDUSTRIAL_BRAIN_ENGINE_ID,
  INDUSTRIAL_BRAIN_ENGINE_VERSION,
} from "./engine-industrial-brain";

function keyOf(engineId: string, engineVersion: string): string {
  return `${engineId}@${engineVersion}`;
}

/** Static registry — every entry is a concrete, in-repo engine instance. */
const REGISTRY: ReadonlyMap<string, ReasoningEngine> = new Map<string, ReasoningEngine>([
  [keyOf(INDUSTRIAL_BRAIN_ENGINE_ID, INDUSTRIAL_BRAIN_ENGINE_VERSION), new IndustrialBrainEngine()],
]);

/** The current default engine used to create new runs. */
export function currentEngine(): ReasoningEngine {
  const engine = resolveEngine(INDUSTRIAL_BRAIN_ENGINE_ID, INDUSTRIAL_BRAIN_ENGINE_VERSION);
  if (!engine) {
    // Unreachable unless the registry is misconfigured; fail loud at startup.
    throw new Error("Phase112: current Industrial Brain engine is not registered");
  }
  return engine;
}

/** Resolve a registered engine, or null when the exact version is unavailable. */
export function resolveEngine(engineId: string, engineVersion: string): ReasoningEngine | null {
  return REGISTRY.get(keyOf(engineId, engineVersion)) ?? null;
}

/** Whether an exact engine id/version is registered (replay-capable). */
export function isEngineRegistered(engineId: string, engineVersion: string): boolean {
  return REGISTRY.has(keyOf(engineId, engineVersion));
}
