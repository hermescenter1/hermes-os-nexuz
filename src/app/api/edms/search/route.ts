import { NextResponse }    from "next/server";
import { getCurrentUser }  from "@/lib/auth/session";
import { can }             from "@/lib/auth/roles";
import { searchDocuments } from "@/lib/document/service";
import type { EdmsDocumentStatus, EdmsDocumentType } from "@/lib/document/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url      = new URL(req.url);
  const q        = url.searchParams.get("q")          ?? undefined;
  const status   = url.searchParams.get("status")     ?? undefined;
  const type     = url.searchParams.get("type")       ?? undefined;
  const folderId = url.searchParams.get("folderId")   ?? undefined;
  const tag      = url.searchParams.get("tag")        ?? undefined;
  const page     = Number(url.searchParams.get("page")     ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");

  const result = await searchDocuments({
    q,
    status:   status as EdmsDocumentStatus | undefined,
    type:     type   as EdmsDocumentType   | undefined,
    folderId,
    tag,
    page,
    pageSize,
  });
  return NextResponse.json(result);
}
