import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { listUnassignedPrivacyRequests } from "@/lib/compliance/db";
import { requirePlatformSuperadmin }  from "@/lib/compliance/authz";

/**
 * Platform TRIAGE queue — privacy requests submitted by the public that have no
 * organization yet (organizationId == null).
 *
 * SECURITY (Phase 97) — reserved for the strict platform boundary
 * (`requirePlatformSuperadmin`). A tenant administrator can NEVER reach this
 * queue: their reads are always pinned to a concrete org id, so an unassigned
 * request is invisible to every tenant. Only closed-enum / identifier fields are
 * projected — never the request's free-text description, email, IP or UA.
 */
export async function GET(req: NextRequest) {
  const platform = await requirePlatformSuperadmin(req, "compliance.privacy_request.triage_list");
  if (!platform.ok) {
    return NextResponse.json({ error: platform.error, code: platform.code }, { status: platform.status });
  }
  const rows = await listUnassignedPrivacyRequests();
  const requests = rows.map((r) => ({
    id:          r.id,
    requestType: r.requestType,
    status:      r.status,
    locale:      r.locale,
    createdAt:   r.createdAt,
  }));
  return NextResponse.json({ requests, total: requests.length });
}
