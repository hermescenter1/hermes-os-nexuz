import { NextResponse }   from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can }            from "@/lib/auth/roles";
import { getAuditLog }    from "@/lib/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url        = new URL(req.url);
  const documentId = url.searchParams.get("documentId") ?? undefined;
  const log = await getAuditLog(documentId);
  return NextResponse.json(log);
}
