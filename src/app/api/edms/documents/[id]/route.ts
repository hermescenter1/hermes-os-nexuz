import { NextResponse }                                                         from "next/server";
import { z }                                                                    from "zod";
import { getCurrentUser }                                                        from "@/lib/auth/session";
import { can }                                                                   from "@/lib/auth/roles";
import { getDocumentById, updateDocument, deleteDocument, createAuditEntry }     from "@/lib/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  title:        z.string().min(1).max(500).optional(),
  description:  z.string().max(2000).optional().nullable(),
  status:       z.enum(["DRAFT","REVIEW","APPROVED","REJECTED","ARCHIVED","OBSOLETE"]).optional(),
  folderId:     z.string().optional().nullable(),
  categoryId:   z.string().optional().nullable(),
  language:     z.string().optional(),
  keywords:     z.array(z.string()).optional(),
  isLocked:     z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const doc = await getDocumentById(id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body   = await req.json().catch(() => ({}));
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const doc = await updateDocument(id, parsed.data);
  if (doc) {
    await createAuditEntry({ documentId: id, userId: user.id, action: "UPDATE", details: "Document updated" });
  }
  if (!doc) return NextResponse.json({ error: "not_found or mock mode" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  await deleteDocument(id);
  await createAuditEntry({ documentId: id, userId: user.id, action: "DELETE", details: "Document deleted" });
  return NextResponse.json({ deleted: true });
}
