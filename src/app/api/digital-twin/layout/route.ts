import { NextRequest, NextResponse }          from "next/server";
import { requirePlatformAuth }               from "@/lib/api/auth";
import { requireOrgActor }                   from "@/lib/org/context";
import { requirePermission }                 from "@/lib/org/rbac";
import { listLayouts, createLayout }         from "@/lib/digital-twin/layout";
import { recordAuditEvent, DT_AUDIT }        from "@/lib/audit/audit-service";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_digital_twin");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const siteId  = req.nextUrl.searchParams.get("siteId") ?? undefined;
  const layouts = await listLayouts(ctx.orgId, siteId);
  return NextResponse.json({ layouts });
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "manage_digital_twin");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const body = await req.json().catch(() => ({}));
  const { siteId, name, layoutData } = body as Record<string, unknown>;
  if (!siteId || typeof siteId !== "string") return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  if (!name   || typeof name   !== "string") return NextResponse.json({ error: "name is required"   }, { status: 400 });

  const layout = await createLayout({
    organizationId: ctx.orgId,
    siteId:   siteId as string,
    name:     name   as string,
    layoutData: layoutData as Record<string, unknown> | undefined,
  });
  if (!layout) return NextResponse.json({ error: "Failed to create layout" }, { status: 503 });

  recordAuditEvent({
    action:     DT_AUDIT.LAYOUT_UPDATED,
    entityType: "digital_twin",
    userId:     ctx.userId ?? undefined,
    entityId:   layout.id,
    metadata:   { name, siteId, organizationId: ctx.orgId },
  });
  return NextResponse.json({ layout }, { status: 201 });
}
