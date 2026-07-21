/**
 * GET  /api/organizations/[orgId]/invitations — List invitations (no tokens)
 * POST /api/organizations/[orgId]/invitations — Send invitation
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgActor }             from "@/lib/org/context";
import { requirePermission, assignableRoles } from "@/lib/org/rbac";
import { listInvitations, inviteMember } from "@/lib/org/invitations";
import type { OrgRole }                from "@/lib/org/types";
import { logAuthzDenial }              from "@/lib/logger/security-events";

const VALID_ORG_ROLES = new Set<OrgRole>([
  "OWNER", "ADMIN", "MANAGER", "ENGINEER", "VIEWER", "BILLING_ADMIN", "MEMBER",
]);

type Params = { params: Promise<{ orgId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  const result = await requireOrgActor(req, orgId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ctx } = result;

  // PHASE 90-93A: the invitation list exposes invitee email addresses and the
  // role each was offered — a roster of pending hires and privilege intent.
  // Membership alone is not enough: this now requires the SAME existing
  // permission that governs creating an invitation (invite_member =
  // OWNER/ADMIN/MANAGER), so a VIEWER or ENGINEER can no longer enumerate it.
  const perm = requirePermission(ctx.role, "invite_member");
  if (!perm.ok) {
    // The denial names the operation and the caller's role only — never an
    // invitee address, a token, or how many invitations exist.
    logAuthzDenial({
      operation: "org.invitations.list",
      reason: "insufficient_permission",
      userId: ctx.userId,
      orgId,
      role: ctx.role,
      resourceType: "OrganizationInvitation",
    });
    return NextResponse.json({ error: perm.error }, { status: perm.status });
  }

  const invitations = await listInvitations(orgId);
  return NextResponse.json({ invitations });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  const result = await requireOrgActor(req, orgId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ctx } = result;

  const perm = requirePermission(ctx.role, "invite_member");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.email || typeof body.email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  // Phase SECURITY-8 amendment: role-escalation clamp. Previously body.role was
  // stored verbatim, so an ADMIN could mint an OWNER invitation. An explicit
  // role must be a real OrgRole (400 otherwise) AND within the caller's
  // assignable set (403 otherwise) — the same clamp the member role-change
  // branch uses. This runs BEFORE inviteMember (no email / repository side
  // effect on rejection). An omitted role defaults to the low-privilege
  // ENGINEER, never a client-chosen elevated role.
  let invitedRole: OrgRole = "ENGINEER";
  if (body.role !== undefined) {
    const requested = body.role as OrgRole;
    if (typeof body.role !== "string" || !VALID_ORG_ROLES.has(requested)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (!assignableRoles(ctx.role).includes(requested)) {
      return NextResponse.json({ error: "You cannot assign this role" }, { status: 403 });
    }
    invitedRole = requested;
  }

  const out = await inviteMember({
    organizationId: orgId,
    email:          body.email,
    role:           invitedRole,
    invitedById:    ctx.userId,
  });

  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
  return NextResponse.json({ invitation: out.invitation }, { status: 201 });
}
