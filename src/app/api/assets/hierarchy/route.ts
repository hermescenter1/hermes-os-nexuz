import { NextResponse }      from "next/server";
import { getCurrentUser }    from "@/lib/auth/session";
import { can }               from "@/lib/auth/roles";
import { getAssetHierarchy } from "@/lib/assets/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const data = await getAssetHierarchy();
  return NextResponse.json(data);
}
