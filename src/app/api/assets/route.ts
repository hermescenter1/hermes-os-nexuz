import { NextResponse }   from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can }            from "@/lib/auth/roles";
import { getAssets }      from "@/lib/assets/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const assets = await getAssets({
    type:        searchParams.get("type")        ?? undefined,
    status:      searchParams.get("status")      ?? undefined,
    criticality: searchParams.get("criticality") ?? undefined,
    locationId:  searchParams.get("locationId")  ?? undefined,
    search:      searchParams.get("search")      ?? undefined,
  });
  return NextResponse.json(assets);
}
