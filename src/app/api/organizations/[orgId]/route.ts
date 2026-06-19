/**
 * GET  /api/organizations/[orgId] — Fetch org profile
 * PATCH /api/organizations/[orgId] — Update org profile
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgActor }             from "@/lib/org/context";
import { requirePermission }           from "@/lib/org/rbac";
import { getOrganizationById, updateOrganization } from "@/lib/org/organizations";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  const result = await requireOrgActor(req, orgId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const org = await getOrganizationById(orgId);
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  return NextResponse.json({ organization: org });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  const result = await requireOrgActor(req, orgId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ctx } = result;

  const perm = requirePermission(ctx.role, "update_org");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const updated = await updateOrganization(orgId, {
    name:        typeof body.name        === "string" ? body.name        : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    website:     typeof body.website     === "string" ? body.website     : undefined,
    logoUrl:     typeof body.logoUrl     === "string" ? body.logoUrl     : undefined,
    settings:    typeof body.settings    === "object" && body.settings !== null
                   ? (body.settings as Record<string, unknown>) : undefined,
    actorUserId: ctx.userId,
  });

  if (!updated.ok) return NextResponse.json({ error: updated.error }, { status: 422 });
  return NextResponse.json({ organization: updated.org });
}
