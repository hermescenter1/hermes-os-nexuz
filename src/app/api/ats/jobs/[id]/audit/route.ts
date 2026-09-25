import type { NextRequest } from "next/server";
import { requireAtsActor } from "@/lib/ats/rbac";
import { listPositionAudit } from "@/lib/ats/positions/service";
import { correlationOf, readResponse, refusal } from "@/lib/ats/positions/http";

/**
 * ATS-M1 — the audit history of one position (ATS_VIEW), newest first,
 * bounded. Read-only: nothing on this surface can edit or remove an audit row.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAtsActor(req, "ATS_VIEW");
  if (!actor.ok) return actor.response;
  const correlationId = correlationOf(req);
  const { id } = await params;

  const take = Number(new URL(req.url).searchParams.get("take") ?? "50");
  const entries = await listPositionAudit(actor.ctx.orgId, id, Number.isFinite(take) ? take : 50);
  if (entries === null) return refusal("STORE_UNAVAILABLE", correlationId);
  if (entries === "NOT_FOUND") return refusal("NOT_FOUND", correlationId);
  return readResponse({ entries }, correlationId);
}
