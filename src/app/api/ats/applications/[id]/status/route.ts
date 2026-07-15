import { NextResponse }           from "next/server";
import { getAuthRole }            from "@/lib/auth/rbac-server";
import type { NextRequest }        from "next/server";
import { updateApplicationStatus, getApplicationById } from "@/lib/ats/db";
import { requireOrgActor }        from "@/lib/org/context";
import { verifyAccessToken }      from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }    from "@/lib/auth/config";

// Core roles permitted to manage ATS pipelines. "customer" (an external
// portal role) was previously — and wrongly — included (Phase SECURITY-8).
const ALLOWED_ROLES = new Set(["superadmin", "admin", "engineer"]);

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
  // Coarse role gate (superadmin/admin/engineer) — "customer" removed.
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;

  const application = await getApplicationById(id);
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Phase SECURITY-8: tenant isolation. getApplicationById is id-only, so the
  // caller must be verified as a member of the application's organization
  // before any mutation — otherwise any staff-role user of ANY org could
  // transition ANY application (cross-tenant IDOR). A non-member gets the same
  // 404 as a non-existent record (no existence disclosure).
  const actor = await requireOrgActor(req, application.organizationId);
  if ("error" in actor) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const body = await req.json() as { status: string; notes?: string };

  if (!body.status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const toStatus = body.status.toUpperCase();
  const validStatuses = Object.keys(VALID_TRANSITIONS);
  if (!validStatuses.includes(toStatus)) {
    return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
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
