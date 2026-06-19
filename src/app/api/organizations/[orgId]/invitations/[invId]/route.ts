/**
 * DELETE /api/organizations/[orgId]/invitations/[invId] — Revoke invitation
 * PATCH  /api/organizations/[orgId]/invitations/[invId] — Resend invitation
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgActor }             from "@/lib/org/context";
import { requirePermission }           from "@/lib/org/rbac";
import { revokeInvitation, resendInvitation } from "@/lib/org/invitations";

type Params = { params: Promise<{ orgId: string; invId: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const { orgId, invId } = await params;
  const result = await requireOrgActor(req, orgId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ctx } = result;

  const perm = requirePermission(ctx.role, "revoke_invitation");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const out = await revokeInvitation(invId, orgId, ctx.userId);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { orgId, invId } = await params;
  const result = await requireOrgActor(req, orgId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ctx } = result;

  const perm = requirePermission(ctx.role, "invite_member");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const out = await resendInvitation(invId, orgId, ctx.userId);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
  return NextResponse.json({ invitation: out.invitation });
}
