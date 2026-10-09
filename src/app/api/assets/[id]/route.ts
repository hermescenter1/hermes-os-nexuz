import { NextResponse }    from "next/server";
import { getCurrentUser }  from "@/lib/auth/session";
import { can }             from "@/lib/auth/roles";
import {
  getAssetById,
  isAssetNumberConflictError,
  updateRegistryAsset,
} from "@/lib/assets/db";
import { AssetUpdateSchema } from "@/lib/assets/validation";
import { notFoundResponse, refusalResponse, validationResponse } from "@/lib/data-access/route-refusal";
import { requireWriteScope, type AssetRegistryWriteScope } from "@/lib/data-access/write-guard";
import { recordAuditEvent, INDUSTRIAL_AUDIT } from "@/lib/audit/audit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;

  /*
   * PHASE 110-A2.1 — a refusal is not a missing asset.
   *
   * `null` means "no such asset, or not this organization's", and that is a 404
   * on purpose: the two are one answer so the route cannot be used to discover
   * which ids exist elsewhere. A REFUSAL is a different thing — no tenant, no
   * database — and it now travels through the shared mapping instead of
   * escaping as an unhandled error.
   */
  let asset;
  try {
    asset = await getAssetById(id);
  } catch (err) {
    return refusalResponse(err);
  }
  if (!asset) return notFoundResponse();
  return NextResponse.json(asset);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let verified: AssetRegistryWriteScope;
  try {
    verified = await requireWriteScope(request, "manage_industrial");
  } catch (error) {
    return refusalResponse(error);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = AssetUpdateSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed.error);

  const { id } = await params;
  let asset;
  try {
    asset = await updateRegistryAsset(verified, id, parsed.data);
  } catch (error) {
    if (isAssetNumberConflictError(error)) {
      return NextResponse.json(
        { error: "asset_number_conflict", code: error.code },
        { status: 409 },
      );
    }
    return refusalResponse(error);
  }
  if (!asset) return notFoundResponse();

  void recordAuditEvent({
    action: INDUSTRIAL_AUDIT.ASSET_UPDATED,
    entityType: "registry_asset",
    userId: user.id,
    entityId: asset.id,
    metadata: {
      organizationId: verified.organizationId,
      siteId: asset.siteId,
      assetType: asset.assetType,
    },
  });

  return NextResponse.json({ asset });
}
