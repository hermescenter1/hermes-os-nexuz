import { NextResponse }                from "next/server";
import { z }                           from "zod";
import { getCurrentUser }               from "@/lib/auth/session";
import { can }                         from "@/lib/auth/roles";
import { getRevisions, createRevision } from "@/lib/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  documentId:   z.string(),
  revisionType: z.enum(["MAJOR", "MINOR", "PATCH"]).optional(),
  changeNotes:  z.string().max(2000).optional().nullable(),
  filePath:     z.string().optional().nullable(),
  fileSize:     z.number().optional().nullable(),
  checksum:     z.string().optional().nullable(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url        = new URL(req.url);
  const documentId = url.searchParams.get("documentId") ?? undefined;
  const revisions  = await getRevisions(documentId);
  return NextResponse.json(revisions);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const rev = await createRevision({ ...parsed.data, revisionNumber: "1.0.0", createdBy: user.id });
  if (!rev) return NextResponse.json({ error: "mock mode — no persistence" }, { status: 202 });
  return NextResponse.json(rev, { status: 201 });
}
