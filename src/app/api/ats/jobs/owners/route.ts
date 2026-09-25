import type { NextRequest } from "next/server";
import { requireAtsActor } from "@/lib/ats/rbac";
import { listOwnerCandidates } from "@/lib/ats/positions/service";
import { correlationOf, readResponse, refusal } from "@/lib/ats/positions/http";

/**
 * ATS-M1 — ACTIVE members of the caller's organization, for the hiring-owner
 * picker (ATS_MANAGE). Member id, organization role and display name only —
 * no e-mail, no other organization's members. The choice is re-proven ACTIVE
 * in the same organization when a position is saved.
 */
export async function GET(req: NextRequest) {
  const actor = await requireAtsActor(req, "ATS_MANAGE");
  if (!actor.ok) return actor.response;
  const correlationId = correlationOf(req);
  const owners = await listOwnerCandidates(actor.ctx.orgId);
  if (!owners) return refusal("STORE_UNAVAILABLE", correlationId);
  return readResponse({ owners }, correlationId);
}
