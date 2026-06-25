import { NextResponse }                 from "next/server";
import { z }                            from "zod";
import { getCurrentUser }                from "@/lib/auth/session";
import { can }                          from "@/lib/auth/roles";
import { getComments, createComment }   from "@/lib/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  documentId:  z.string(),
  content:     z.string().min(1).max(5000),
  parentId:    z.string().optional().nullable(),
  isInternal:  z.boolean().optional(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url        = new URL(req.url);
  const documentId = url.searchParams.get("documentId") ?? undefined;
  const comments   = await getComments(documentId);
  return NextResponse.json(comments);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const comment = await createComment({ ...parsed.data, userId: user.id });
  if (!comment) return NextResponse.json({ error: "mock mode — no persistence" }, { status: 202 });
  return NextResponse.json(comment, { status: 201 });
}
