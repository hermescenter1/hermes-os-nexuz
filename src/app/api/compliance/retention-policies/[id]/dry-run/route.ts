import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { z }                          from "zod";
import {
  getRetentionPolicyForOrg,
  listActiveLegalHoldsForOrg,
} from "@/lib/compliance/db";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import {
  buildRetentionDryRunReport,
  type HoldLike,
  type HoldTarget,
  type RetentionPolicyLike,
} from "@/lib/compliance/retention-engine";

/**
 * DRY-RUN retention planner (Phase 97 Part E).
 *
 * SECURITY / SAFETY — read-only and non-destructive. It evaluates a caller-
 * supplied candidate set (a what-if planning input) against the policy and the
 * organization's ACTIVE legal holds and returns an aggregate report. It NEVER
 * deletes or anonymises anything, and a record under an active hold can never be
 * reported ELIGIBLE for a destructive action (LEGAL_HOLD_PROTECTED_DELETION=0).
 * Only `view_compliance` is required — planning is not a mutation.
 */

const candidateSchema = z.object({
  triggerAt:            z.string().datetime(),
  subjectId:            z.string().max(200).optional(),
  resourceType:         z.string().max(200).optional(),
  resourceId:           z.string().max(200).optional(),
  processingActivityId: z.string().max(200).optional(),
  incidentId:           z.string().max(200).optional(),
  timestamp:            z.string().datetime().optional(),
});
const bodySchema = z.object({
  records: z.array(candidateSchema).max(500),
  now:     z.string().datetime().optional(),
}).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_compliance", "compliance.retention_policy.dry_run");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid dry-run input", code: "INVALID_INPUT" }, { status: 400 });

  const policy = await getRetentionPolicyForOrg(id, scope.organizationId);
  if (!policy) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  // Active holds are read within the caller's organization only.
  const holdRows = await listActiveLegalHoldsForOrg(scope.organizationId);
  const holds: HoldLike[] = holdRows.map((h) => ({
    organizationId: h.organizationId,
    scopeType: h.scopeType,
    status: h.status,
    subjectId: h.subjectId,
    resourceType: h.resourceType,
    resourceId: h.resourceId,
    processingActivityId: h.processingActivityId,
    incidentId: h.incidentId,
    rangeStart: h.rangeStart,
    rangeEnd: h.rangeEnd,
  }));

  const records = parsed.data.records.map((r) => {
    const target: HoldTarget = {
      organizationId: scope.organizationId, // targets are scoped to the caller's org
      subjectId: r.subjectId ?? null,
      resourceType: r.resourceType ?? null,
      resourceId: r.resourceId ?? null,
      processingActivityId: r.processingActivityId ?? null,
      incidentId: r.incidentId ?? null,
      timestamp: r.timestamp ? new Date(r.timestamp) : null,
    };
    return { triggerAt: new Date(r.triggerAt), target };
  });

  const now = parsed.data.now ? new Date(parsed.data.now) : new Date();
  const report = buildRetentionDryRunReport(policy as unknown as RetentionPolicyLike, records, holds, now);

  return NextResponse.json({ dryRun: true, policyId: id, report });
}
