import { NextRequest, NextResponse }        from "next/server";
import { requirePlatformAuth }             from "@/lib/api/auth";
import { requireOrgActor }                 from "@/lib/org/context";
import { requirePermission }               from "@/lib/org/rbac";
import { listTagsForAsset, createTag }     from "@/lib/digital-twin/tags";
import { recordAuditEvent, DT_AUDIT }      from "@/lib/audit/audit-service";

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  const member = await requireOrgActor(req, ctx.orgId);
  if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
  const perm = requirePermission(member.ctx.role, "view_digital_twin");
  if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });

  const assetId = req.nextUrl.searchParams.get("assetId");
  if (!assetId) return NextResponse.json({ error: "assetId is required" }, { status: 400 });

  const tags = await listTagsForAsset(assetId, ctx.orgId);
  return NextResponse.json({ tags });
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
  const { assetId, tagName, tagPath, unit, dataType, description, metadata } = body as Record<string, unknown>;
  if (!assetId  || typeof assetId  !== "string") return NextResponse.json({ error: "assetId is required"  }, { status: 400 });
  if (!tagName  || typeof tagName  !== "string") return NextResponse.json({ error: "tagName is required"  }, { status: 400 });
  if (!tagPath  || typeof tagPath  !== "string") return NextResponse.json({ error: "tagPath is required"  }, { status: 400 });

  const tag = await createTag({
    organizationId: ctx.orgId,
    assetId:   assetId  as string,
    tagName:   tagName  as string,
    tagPath:   tagPath  as string,
    unit:        unit        as string | undefined,
    dataType:    dataType    as string | undefined,
    description: description as string | undefined,
    metadata:    metadata    as Record<string, unknown> | undefined,
  });
  if (!tag) return NextResponse.json({ error: "Failed to create tag (may be duplicate tagPath)" }, { status: 422 });

  recordAuditEvent({
    action:     DT_AUDIT.TAG_CREATED,
    entityType: "digital_twin",
    userId:     ctx.userId ?? undefined,
    entityId:   tag.id,
    metadata:   { assetId, tagPath, organizationId: ctx.orgId },
  });
  return NextResponse.json({ tag }, { status: 201 });
}
