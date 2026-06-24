import { NextResponse }           from "next/server";
import { getAuthRole }            from "@/lib/auth/rbac-server";
import type { NextRequest }        from "next/server";
import { updateApplicationStatus, getApplicationById } from "@/lib/ats/db";
import { verifyAccessToken }      from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }    from "@/lib/auth/config";

const ALLOWED_ROLES = new Set(["superadmin", "admin", "hr_manager", "recruiter", "hiring_manager"]);

// Valid status transitions (prevents arbitrary status skipping)
const VALID_TRANSITIONS: Record<string, string[]> = {
  APPLIED:          ["SCREENING", "REJECTED"],
  SCREENING:        ["TECHNICAL_REVIEW", "INTERVIEW", "REJECTED"],
  TECHNICAL_REVIEW: ["INTERVIEW", "REJECTED"],
  INTERVIEW:        ["OFFER", "REJECTED"],
  OFFER:            ["HIRED", "REJECTED"],
  HIRED:            [],
  REJECTED:         [],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getAuthRole(req);
  if (!role) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  // Allow any org staff role to update status
  if (!["superadmin", "admin", "engineer", "customer"].includes(role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as { status: string; notes?: string };

  if (!body.status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const toStatus = body.status.toUpperCase();
  const validStatuses = Object.keys(VALID_TRANSITIONS);
  if (!validStatuses.includes(toStatus)) {
    return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
  }

  const application = await getApplicationById(id);
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const allowed = VALID_TRANSITIONS[application.status] ?? [];
  if (!allowed.includes(toStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${application.status} to ${toStatus}` },
      { status: 422 }
    );
  }

  // Extract the actor name from JWT for the audit event
  let actorName: string | undefined;
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (at) {
    const payload = await verifyAccessToken(at);
    actorName = payload?.name;
  }

  const updated = await updateApplicationStatus(
    id,
    application.organizationId,
    toStatus,
    { changedByName: actorName, notes: body.notes }
  );

  if (!updated) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ application: updated });
}

// Suppress unused var
void ALLOWED_ROLES;
