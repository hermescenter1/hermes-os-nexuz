/**
 * PATCH /api/organizations/[orgId]/departments/[deptId] — Update department
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgActor }             from "@/lib/org/context";
import { requirePermission }           from "@/lib/org/rbac";
import { updateDepartment }            from "@/lib/org/departments";

type Params = { params: Promise<{ orgId: string; deptId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { orgId, deptId } = await params;
  const result = await requireOrgActor(req, orgId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { ctx } = result;

  const perm = requirePermission(ctx.role, "manage_departments");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const out = await updateDepartment(deptId, orgId, {
    name:        typeof body.name        === "string" ? body.name        : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    managerId:   body.managerId === null
                   ? null
                   : typeof body.managerId === "string" ? body.managerId : undefined,
    actorUserId: ctx.userId,
  });

  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
  return NextResponse.json({ department: out.department });
}
