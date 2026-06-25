import { NextResponse }                                     from "next/server";
import { z }                                               from "zod";
import { getCurrentUser }                                   from "@/lib/auth/session";
import { can }                                             from "@/lib/auth/roles";
import { getDocuments, createDocument, createAuditEntry }  from "@/lib/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOC_TYPES = ["ENGINEERING_DRAWING","PID","ELECTRICAL_DRAWING","PLC_PROGRAM","SCADA_PROJECT","COMMISSIONING_REPORT","INSPECTION_REPORT","FAT","SAT","MANUAL","PROCEDURE","WORK_INSTRUCTION","CERTIFICATE","VENDOR_DATASHEET","CONTRACT","QUOTATION","INVOICE","OTHER"] as const;

const CreateSchema = z.object({
  title:        z.string().min(1).max(500),
  description:  z.string().max(2000).optional().nullable(),
  documentType: z.enum(DOC_TYPES).optional(),
  folderId:     z.string().optional().nullable(),
  categoryId:   z.string().optional().nullable(),
  templateId:   z.string().optional().nullable(),
  language:     z.string().optional(),
  keywords:     z.array(z.string()).optional(),
  erpProjectId: z.string().optional().nullable(),
  vendorId:     z.string().optional().nullable(),
  siteId:       z.string().optional().nullable(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url        = new URL(req.url);
  const status     = url.searchParams.get("status")     ?? undefined;
  const folderId   = url.searchParams.get("folderId")   ?? undefined;
  const categoryId = url.searchParams.get("categoryId") ?? undefined;

  const docs = await getDocuments({ status, folderId, categoryId });
  return NextResponse.json(docs);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const doc = await createDocument({
    ...parsed.data,
    createdBy: user.id,
    keywords: parsed.data.keywords ?? [],
  });
  if (doc) {
    await createAuditEntry({
      documentId: doc.id,
      userId:     user.id,
      action:     "CREATE",
      details:    `Document created: ${doc.title}`,
    });
  }
  if (!doc) return NextResponse.json({ error: "mock mode — no persistence" }, { status: 202 });
  return NextResponse.json(doc, { status: 201 });
}
