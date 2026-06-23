/**
 * Billing tracking helpers.
 *
 * Thin wrappers over gateAndRecord for common metered operations.
 * Import and call at the start of any metered API route handler.
 *
 * All functions throw FeatureLimitError (statusCode 429) when the org's
 * plan limit is exceeded, or FeatureAccessError (statusCode 403) for
 * boolean feature gates.
 *
 * Usage example in an API route:
 *
 *   import { trackApiCall, FeatureLimitError } from "@/lib/utils/billing-track";
 *
 *   const ctx = await requireOrgContext(req);
 *   try {
 *     await trackApiCall(ctx.orgId, ctx.userId);
 *   } catch (err) {
 *     if (err instanceof FeatureLimitError) {
 *       return NextResponse.json(gateDenied(err), { status: 429 });
 *     }
 *     throw err;
 *   }
 */

export {
  FeatureLimitError,
  FeatureAccessError,
  gateFeature,
  gateMetric,
  gateAndRecord,
  gateDenied,
} from "@/lib/billing/feature-gate";

import { gateAndRecord } from "@/lib/billing/feature-gate";

/** Gate and record one `api_calls` unit for an org. */
export async function trackApiCall(
  organizationId: string,
  userId?:        string,
): Promise<void> {
  await gateAndRecord(organizationId, "api_calls", 1, userId);
}

/** Gate and record one `emails_sent` unit for an org. */
export async function trackEmailSent(
  organizationId: string,
  userId?:        string,
): Promise<void> {
  await gateAndRecord(organizationId, "emails_sent", 1, userId);
}

/** Gate and record one `ai_requests` unit for an org. */
export async function trackAiRequest(
  organizationId: string,
  userId?:        string,
): Promise<void> {
  await gateAndRecord(organizationId, "ai_requests", 1, userId);
}
