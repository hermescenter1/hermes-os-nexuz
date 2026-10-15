import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAtsActor, atsCan } from "@/lib/ats/rbac";
import { correlationOf, refusal } from "@/lib/ats/positions/http";
import { REQUEST_ID_HEADER } from "@/lib/logger/correlation";
import { getCandidateDetail } from "@/lib/ats/dashboard";

/**
 * ATS go-live — one candidate's detail for the recruiter page and the erase
 * modal. ATS_VIEW, tenant-scoped.
 *
 * Returns the candidate (or its erased state), the linked counts WITHOUT any
 * personal content, and the recruitment-audit trail. An unknown or
 * cross-tenant candidate is the same 404; a store fault is a controlled 503.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAtsActor(req, "ATS_VIEW");
  if (!actor.ok) return actor.response;

  const correlationId = correlationOf(req);
  const { id } = await params;
  const detail = await getCandidateDetail(actor.ctx.orgId, id);
  if (detail === null) return refusal("NOT_FOUND", correlationId);

  // The UI shows the erase action only to a caller who could actually run it;
  // the erase route re-enforces ATS_ADMIN regardless.
  const canErase = atsCan(actor.ctx.role, "ATS_ADMIN");
  return NextResponse.json({ ...detail, canErase }, { headers: { ...NO_STORE, [REQUEST_ID_HEADER]: correlationId } });
}
