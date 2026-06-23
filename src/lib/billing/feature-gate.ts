/**
 * Feature gating utilities (Phase 48C).
 *
 * Provides two primitives for enforcing SaaS plan limits in API routes:
 *
 *   gateFeature(orgId, "industrial_gateway")  → throws if not in plan
 *   gateMetric(orgId, "ai_requests", 1)       → throws if limit exceeded
 *
 * Usage in route handlers:
 *
 *   import { gateMetric, FeatureLimitError } from "@/lib/billing/feature-gate";
 *
 *   try {
 *     await gateMetric(ctx.orgId, "ai_requests");
 *   } catch (err) {
 *     if (err instanceof FeatureLimitError) {
 *       return NextResponse.json({ error: err.message }, { status: 429 });
 *     }
 *     throw err;
 *   }
 *
 * Architecture rule: enforcement is ALWAYS server-side. Never trust the client
 * to report its own plan. The gate reads from the DB on every call.
 */

import { getPlanLimitReport } from "./limit-check";
import { recordUsage }        from "./usage";
import type { PlanLimits }    from "./types";

// ─── Error types ─────────────────────────────────────────────────────────────

export class FeatureLimitError extends Error {
  readonly name       = "FeatureLimitError";
  readonly statusCode = 429;
  constructor(
    public readonly metric:    string,
    public readonly limit:     number,
    public readonly used:      number,
  ) {
    super(
      `Plan limit reached for "${metric}": ${used} used of ${limit === -1 ? "∞" : limit} allowed this period.`,
    );
  }
}

export class FeatureAccessError extends Error {
  readonly name       = "FeatureAccessError";
  readonly statusCode = 403;
  constructor(public readonly feature: string) {
    super(`Your current plan does not include access to: ${feature}.`);
  }
}

// ─── Boolean feature gate ─────────────────────────────────────────────────────

type BooleanFeature = keyof Pick<
  PlanLimits,
  "industrial_gateway" | "multi_agent" | "api_access" | "priority_support"
>;

/**
 * Throws FeatureAccessError if the org's active plan does not include
 * the requested boolean feature flag.
 * No-op if the org has no active plan (graceful degradation).
 */
export async function gateFeature(
  organizationId: string,
  feature:        BooleanFeature,
): Promise<void> {
  const report = await getPlanLimitReport(organizationId);
  if (!report.hasActivePlan) return; // open access when no plan exists
  if (!report.access[feature]) throw new FeatureAccessError(feature);
}

// ─── Numeric metric gate ──────────────────────────────────────────────────────

/**
 * Throws FeatureLimitError if recording `increment` more units of `metric`
 * would exceed the org's plan limit.
 *
 * Works for any metric string — known metrics are checked against the plan;
 * unknown metrics (not in the plan's limit schema) are allowed unconditionally.
 *
 * No-op if the org has no active plan.
 */
export async function gateMetric(
  organizationId: string,
  metric:         string,
  increment       = 1,
): Promise<void> {
  const report = await getPlanLimitReport(organizationId);
  if (!report.hasActivePlan) return;

  const status = report.statuses.find((s) => s.metric === metric);
  if (!status)              return; // metric not gated in this plan
  if (status.unlimited)     return; // unlimited

  if (status.used + increment > status.limit) {
    throw new FeatureLimitError(metric, status.limit, status.used);
  }
}

// ─── Combined gate + record ───────────────────────────────────────────────────

/**
 * Gate and record a metered metric in one call.
 *
 * Throws FeatureLimitError if the limit would be exceeded.
 * On success, records the usage increment in the DB (best-effort, never throws).
 *
 * Use this on any metered API endpoint so limits are enforced AND usage is
 * automatically tracked in the same operation.
 *
 *   await gateAndRecord(orgId, "api_calls", 1, userId);
 */
export async function gateAndRecord(
  organizationId: string,
  metric:         string,
  increment       = 1,
  userId?:        string,
): Promise<void> {
  await gateMetric(organizationId, metric, increment);
  void recordUsage(organizationId, metric, increment, userId);
}

// ─── Convenience response builder ────────────────────────────────────────────

/** Converts a gate error into a JSON NextResponse-compatible object. */
export function gateDenied(
  err: FeatureLimitError | FeatureAccessError,
): { error: string; code: string; statusCode: number } {
  return {
    error:      err.message,
    code:       err instanceof FeatureLimitError ? "limit_exceeded" : "feature_not_available",
    statusCode: err.statusCode,
  };
}
