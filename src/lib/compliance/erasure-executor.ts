/**
 * Phase 97 Part H — erasure execution preflight + SYNTHETIC test adapter.
 *
 * This module ships NO production executor. Production erasure execution is disabled
 * by default (COMPLIANCE_ERASURE_EXECUTION_ENABLED=false) and the API returns
 * ERASURE_EXECUTION_DISABLED without touching the job. What lives here is:
 *   - runErasurePreflight: immediately-before-action revalidation that fails closed
 *     (ERASURE_PLAN_STALE) if any material condition changed after approval — it
 *     never relies solely on the approval-time evaluation;
 *   - applyErasurePlanSynthetic: an in-memory adapter used ONLY by tests to prove
 *     the disabled gate, idempotency (no double action) and plan semantics. It never
 *     imports Prisma or touches any real record.
 */
import { ERASURE_REGISTRY_VERSION } from "./erasure-targets";
import { isErasureExecutionEnabled } from "./erasure-lifecycle";
import type { ErasurePlan } from "./erasure-planner";

export type ErasurePreflightCode =
  | "OK"
  | "ERASURE_EXECUTION_DISABLED"
  | "ERASURE_NOT_APPROVED"
  | "ERASURE_BINDING_INVALID"
  | "ERASURE_IDEMPOTENCY_MISSING"
  | "ERASURE_REGISTRY_MISMATCH"
  | "ERASURE_PLAN_STALE";

/**
 * Revalidate immediately before every action. `recomputedPlanHash` MUST be produced
 * from the CURRENT authoritative inputs (current holds, retention policies, target
 * records) so a change after approval is detected as ERASURE_PLAN_STALE. Fail-closed
 * on every material discrepancy; a destructive action never proceeds otherwise.
 */
export function runErasurePreflight(params: {
  lifecycle:           string;
  executionEnabled:    boolean;
  approvedPlanHash:    string | null;
  approvedPlanVersion: number | null;
  recomputedPlanHash:  string;
  recomputedPlanVersion: number;
  bindingOk:           boolean;      // parent/org/subject binding still holds
  executionIdempotencyKey: string | null;
  registryVersion:     string;
}): { ok: boolean; code: ErasurePreflightCode } {
  if (!params.executionEnabled) return { ok: false, code: "ERASURE_EXECUTION_DISABLED" };
  if (!(params.lifecycle === "APPROVED" || params.lifecycle === "EXECUTION_PENDING")) return { ok: false, code: "ERASURE_NOT_APPROVED" };
  if (!params.bindingOk) return { ok: false, code: "ERASURE_BINDING_INVALID" };
  if (!params.executionIdempotencyKey) return { ok: false, code: "ERASURE_IDEMPOTENCY_MISSING" };
  if (params.registryVersion !== ERASURE_REGISTRY_VERSION) return { ok: false, code: "ERASURE_REGISTRY_MISMATCH" };
  if (!params.approvedPlanHash
    || params.recomputedPlanHash !== params.approvedPlanHash
    || params.approvedPlanVersion !== params.recomputedPlanVersion) {
    return { ok: false, code: "ERASURE_PLAN_STALE" };
  }
  return { ok: true, code: "OK" };
}

/** Whether execution may proceed from the API — always false unless the env flag is
 *  explicitly enabled. Re-exported for the route so the gate is single-sourced. */
export function erasureExecutionGate(env: Record<string, string | undefined> = process.env): { enabled: boolean } {
  return { enabled: isErasureExecutionEnabled(env) };
}

// ── SYNTHETIC in-memory adapter (tests only — never touches a real record) ────────

export interface SyntheticErasureStore {
  deleted:     Set<string>;
  anonymised:  Set<string>;
  appliedKeys: Set<string>;
}
export function createSyntheticErasureStore(): SyntheticErasureStore {
  return { deleted: new Set(), anonymised: new Set(), appliedKeys: new Set() };
}

/**
 * Apply an APPROVED plan to a synthetic store, keyed by executionIdempotencyKey. A
 * repeated key performs NOTHING (idempotent) — DUPLICATE_ERASURE_ACTION=0. Only
 * DELETE/ANONYMISE planned actions act; every non-destructive classification is a
 * no-op. This adapter exists solely to exercise the semantics in tests.
 */
export function applyErasurePlanSynthetic(
  plan: ErasurePlan,
  store: SyntheticErasureStore,
  executionIdempotencyKey: string,
): { performed: number; skippedIdempotent: boolean } {
  if (store.appliedKeys.has(executionIdempotencyKey)) return { performed: 0, skippedIdempotent: true };
  let performed = 0;
  for (const it of plan.items) {
    const key = `${it.target}:${it.recordId}`;
    if (it.plannedAction === "DELETE") { store.deleted.add(key); performed += 1; }
    else if (it.plannedAction === "ANONYMISE") { store.anonymised.add(key); performed += 1; }
  }
  store.appliedKeys.add(executionIdempotencyKey);
  return { performed, skippedIdempotent: false };
}
