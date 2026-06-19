/**
 * GET  /api/organizations/[orgId]/departments — List departments
 * POST /api/organizations/[orgId]/departments — Create department
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgActor }             from "@/lib/org/context";
import { requirePermission }           from "@/lib/org/rbac";
import { listDepartments, createDepartment } from "@/lib/org/departments";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  const result = await requireOrgActor(req, orgId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const departments = await listDepartments(orgId);
  return NextResponse.json({ departments });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  const result = await requireOrgActor(req, orgId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ctx } = result;

  const perm = requirePermission(ctx.role, "manage_departments");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.type || typeof body.type !== "string") {
    return NextResponse.json({ error: "type is required" }, { status: 400 });
  }

  const out = await createDepartment({
    organizationId: orgId,
    name:           body.name,
    description:    typeof body.description === "string" ? body.description : undefined,
    type:           body.type,
    managerId:      typeof body.managerId   === "string" ? body.managerId   : undefined,
    actorUserId:    ctx.userId,
  });

  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
  return NextResponse.json({ department: out.department }, { status: 201 });
}
