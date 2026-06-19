/**
 * PATCH  /api/organizations/[orgId]/members/[memberId] — Change role or status
 * DELETE /api/organizations/[orgId]/members/[memberId] — Remove member
 */

import { NextRequest, NextResponse }           from "next/server";
import { requireOrgActor }                     from "@/lib/org/context";
import { requirePermission, assignableRoles }  from "@/lib/org/rbac";
import { changeMemberRole, changeMemberStatus, removeMember } from "@/lib/org/members";
import type { OrgRole, MemberStatus }           from "@/lib/org/types";

type Params = { params: Promise<{ orgId: string; memberId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { orgId, memberId } = await params;
  const result = await requireOrgActor(req, orgId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ctx } = result;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  if (body.role !== undefined) {
    const perm = requirePermission(ctx.role, "change_role");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

    const allowed = assignableRoles(ctx.role);
    if (!allowed.includes(body.role as OrgRole)) {
      return NextResponse.json({ error: "You cannot assign this role" }, { status: 403 });
    }

    const out = await changeMemberRole({
      organizationId: orgId,
      memberId,
      newRole:        body.role as OrgRole,
      actorUserId:    ctx.userId,
    });
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
    return NextResponse.json({ member: out.member });
  }

  if (body.status !== undefined) {
    const perm = requirePermission(ctx.role, "change_status");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

    const out = await changeMemberStatus({
      organizationId: orgId,
      memberId,
      newStatus:      body.status as MemberStatus,
      actorUserId:    ctx.userId,
    });
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
    return NextResponse.json({ member: out.member });
  }

  return NextResponse.json({ error: "Provide role or status to update" }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { orgId, memberId } = await params;
  const result = await requireOrgActor(req, orgId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ctx } = result;

  const perm = requirePermission(ctx.role, "remove_member");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const out = await removeMember({ organizationId: orgId, memberId, actorUserId: ctx.userId });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
