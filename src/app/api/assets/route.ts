import { NextResponse }   from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can }            from "@/lib/auth/roles";
import {
  createRegistryAsset,
  getAssets,
  isAssetNumberConflictError,
} from "@/lib/assets/db";
import { AssetCreateSchema } from "@/lib/assets/validation";
import { readOrRefuse, refusalResponse, validationResponse } from "@/lib/data-access/route-refusal";
import { requireWriteScope, type AssetRegistryWriteScope } from "@/lib/data-access/write-guard";
import { recordAuditEvent, INDUSTRIAL_AUDIT } from "@/lib/audit/audit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

/*
 * PHASE 110-A2.1 — the same shared mapping the CMMS reads use.
 *
 * These four assets reads had the identical gap: the layer can refuse now, and
 * an unmapped refusal reaches the caller as the framework's error page with no
 * `code` and the wrong status. `readOrRefuse` is the one place that mapping
 * lives; it rethrows anything it does not recognise, so a genuine programming
 * error still reaches the error boundary.
 */
  const { searchParams } = new URL(request.url);
  return readOrRefuse(() =>
    getAssets({
      type:        searchParams.get("type")        ?? undefined,
      status:      searchParams.get("status")      ?? undefined,
      criticality: searchParams.get("criticality") ?? undefined,
      locationId:  searchParams.get("locationId")  ?? undefined,
      search:      searchParams.get("search")      ?? undefined,
    }),
  );
}

export async function POST(request: Request): Promise<NextResponse> {
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
  const parsed = AssetCreateSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed.error);

  let asset;
  try {
    asset = await createRegistryAsset(verified, parsed.data);
  } catch (error) {
    if (isAssetNumberConflictError(error)) {
      return NextResponse.json(
        { error: "asset_number_conflict", code: error.code },
        { status: 409 },
      );
    }
    return refusalResponse(error);
  }

  void recordAuditEvent({
    action: INDUSTRIAL_AUDIT.ASSET_CREATED,
    entityType: "registry_asset",
    userId: user.id,
    entityId: asset.id,
    metadata: {
      organizationId: verified.organizationId,
      siteId: asset.siteId,
      assetType: asset.assetType,
    },
  });

  return NextResponse.json({ asset }, { status: 201 });
}
