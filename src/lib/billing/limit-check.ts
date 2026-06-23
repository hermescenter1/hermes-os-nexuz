/**
 * Plan limit enforcement (Phase 31).
 *
 * Compares current 30-day usage against the active plan's PlanLimits.
 * Numeric limits only (-1 = unlimited). Boolean access flags are
 * returned separately for feature-gating decisions.
 */

import { getSubscription } from "./subscriptions";
import { getPlanById }     from "./plans";
import { getUsageSummary } from "./usage";
import type { PlanLimits } from "./types";

export interface LimitStatus {
  metric:    string;
  used:      number;
  limit:     number;
  unlimited: boolean;
  exceeded:  boolean;
  pct:       number;  // 0–100
}

export interface PlanLimitReport {
  planName:    string | null;
  planSlug:    string | null;
  limits:      PlanLimits | null;
  usage:       Record<string, number>;
  statuses:    LimitStatus[];
  access: {
    industrial_gateway: boolean;
    multi_agent:        boolean;
    api_access:         boolean;
    priority_support:   boolean;
  };
  hasActivePlan: boolean;
}

const NUMERIC_METRICS = [
  "ai_requests",
  "projects",
  "members",
  "storage_gb",
  "api_calls",
  "emails_sent",
  "notifications_created",
] as const;

const DEFAULT_ACCESS = {
  industrial_gateway: false,
  multi_agent:        false,
  api_access:         false,
  priority_support:   false,
};

/** Fetch the full limit/usage report for an organization. */
export async function getPlanLimitReport(
  organizationId: string,
): Promise<PlanLimitReport> {
  const [sub, usage] = await Promise.all([
    getSubscription(organizationId),
    getUsageSummary(organizationId),
  ]);

  const plan = sub ? await getPlanById(sub.planId) : null;

  if (!plan) {
    return {
      planName:      null,
      planSlug:      null,
      limits:        null,
      usage,
      statuses:      [],
      access:        DEFAULT_ACCESS,
      hasActivePlan: false,
    };
  }

  const limits = plan.limits;

  const statuses: LimitStatus[] = NUMERIC_METRICS.map((metric) => {
    const limit     = limits[metric] as number;
    const used      = usage[metric] ?? 0;
    const unlimited = limit === -1;
    const exceeded  = !unlimited && used > limit;
    const pct       = unlimited || limit <= 0
      ? 0
      : Math.min(100, Math.round((used / limit) * 100));
    return { metric, used, limit, unlimited, exceeded, pct };
  });

  return {
    planName:  plan.name,
    planSlug:  plan.slug,
    limits,
    usage,
    statuses,
    access: {
      industrial_gateway: Boolean(limits.industrial_gateway),
      multi_agent:        Boolean(limits.multi_agent),
      api_access:         Boolean(limits.api_access),
      priority_support:   Boolean(limits.priority_support),
    },
    hasActivePlan: true,
  };
}

/**
 * Check whether recording `increment` more units of `metric` would
 * exceed the org's active plan limit.
 * Returns { allowed: true } or { allowed: false, limit, used }.
 */
export async function checkMetricAllowed(
  organizationId: string,
  metric:         "ai_requests" | "projects" | "members" | "storage_gb" | "api_calls" | "emails_sent" | "notifications_created",
  increment       = 1,
): Promise<{ allowed: boolean; limit: number; used: number }> {
  const report = await getPlanLimitReport(organizationId);
  if (!report.hasActivePlan) return { allowed: true, limit: -1, used: 0 };

  const status = report.statuses.find((s) => s.metric === metric);
  if (!status) return { allowed: true, limit: -1, used: 0 };
  if (status.unlimited) return { allowed: true, limit: -1, used: status.used };

  const allowed = status.used + increment <= status.limit;
  return { allowed, limit: status.limit, used: status.used };
}
