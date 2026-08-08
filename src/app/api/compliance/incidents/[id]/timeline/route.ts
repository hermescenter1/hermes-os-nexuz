import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { requireComplianceOrgScope }  from "@/lib/compliance/authz";
import { getIncidentForOrg, getIncidentTimelineForOrg } from "@/lib/compliance/incident-db";
import { toIncidentEventDto }          from "@/lib/compliance/incident-schema";

/**
 * The append-only incident timeline / evidence trail (identifiers + closed event
 * codes + actor attribution + timestamps + optional evidence hashes only). Read-only;
 * events are immutable at the database (append-only trigger).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireComplianceOrgScope(req, "view_compliance_incidents", "compliance.incident.timeline");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const { id } = await params;
  const row = await getIncidentForOrg(id, scope.organizationId);
  if (!row) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  const events = await getIncidentTimelineForOrg(id, scope.organizationId);
  return NextResponse.json({ timeline: events.map(toIncidentEventDto) });
}
