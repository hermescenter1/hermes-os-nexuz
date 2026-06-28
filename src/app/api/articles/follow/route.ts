import { NextResponse }    from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { authorHandle?: string };
  if (!body.authorHandle) return NextResponse.json({ error: "authorHandle required" }, { status: 400 });
  return NextResponse.json({ following: true, handle: body.authorHandle });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get("authorHandle");
  if (!handle) return NextResponse.json({ error: "authorHandle required" }, { status: 400 });
  return NextResponse.json({ unfollowed: true, handle });
}
