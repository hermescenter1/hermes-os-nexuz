/**
 * GET  /api/organizations/[orgId]/invitations — List invitations (no tokens)
 * POST /api/organizations/[orgId]/invitations — Send invitation
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgActor }             from "@/lib/org/context";
import { requirePermission }           from "@/lib/org/rbac";
import { listInvitations, inviteMember } from "@/lib/org/invitations";
import type { OrgRole }                from "@/lib/org/types";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  const result = await requireOrgActor(req, orgId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

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

  const out = await inviteMember({
    organizationId: orgId,
    email:          body.email,
    role:           (body.role as OrgRole) ?? "ENGINEER",
    invitedById:    ctx.userId,
  });

  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
  return NextResponse.json({ invitation: out.invitation }, { status: 201 });
}
