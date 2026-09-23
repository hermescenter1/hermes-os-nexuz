import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAtsActor } from "@/lib/ats/rbac";
import { applyRoleProfileToJob, listJobCriteria } from "@/lib/ats/criteria";
import { ROLE_CODES } from "@/lib/ats/review/catalog";
import { resolveRequestId } from "@/lib/logger/correlation";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * ATS-S1 — a job's scorecard criteria.
 *
 *   GET   list the criteria of the caller's own job          (ATS_VIEW)
 *   POST  apply one of the five role profiles to the job     (ATS_MANAGE)
 *
 * Tenancy is enforced in the service: the job must belong to the caller's
 * organization, and a miss is 404 either way.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAtsActor(req, "ATS_VIEW");
  if (!actor.ok) return actor.response;
  const { id } = await params;
  const rows = await listJobCriteria(actor.ctx.orgId, id);
  if (rows === null) {
    return NextResponse.json({ error: "The request could not be completed." }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json({ criteria: rows, total: rows.length }, { headers: NO_STORE });
}

const bodySchema = z.object({ roleCode: z.enum(ROLE_CODES as unknown as [string, ...string[]]) }).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAtsActor(req, "ATS_MANAGE");
  if (!actor.ok) return actor.response;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: NO_STORE });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid role profile" }, { status: 400, headers: NO_STORE });

  const result = await applyRoleProfileToJob({
    organizationId: actor.ctx.orgId,
    jobId: id,
    roleCode: parsed.data.roleCode,
    actor: { userId: actor.ctx.userId, role: actor.ctx.role },
    correlationId: resolveRequestId(req),
  });
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "INVALID_INPUT" ? 400 : result.code === "STORE_UNAVAILABLE" ? 503 : 500;
    const error = result.code === "NOT_FOUND" ? "Job not found" : result.code === "INVALID_INPUT" ? "invalid role profile" : "The request could not be completed.";
    return NextResponse.json({ error }, { status, headers: NO_STORE });
  }
  return NextResponse.json(result, { status: 200, headers: NO_STORE });
}
