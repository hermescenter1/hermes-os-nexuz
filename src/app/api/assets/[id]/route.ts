import { NextResponse }    from "next/server";
import { getCurrentUser }  from "@/lib/auth/session";
import { can }             from "@/lib/auth/roles";
import { getAssetById }    from "@/lib/assets/db";
import { notFoundResponse, refusalResponse } from "@/lib/data-access/route-refusal";

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
