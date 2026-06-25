import { NextResponse }             from "next/server";
import { z }                        from "zod";
import { getCurrentUser }            from "@/lib/auth/session";
import { can }                      from "@/lib/auth/roles";
import { getShares, createShare }   from "@/lib/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  documentId:  z.string(),
  sharedWith:  z.string(),
  shareType:   z.enum(["view", "edit", "comment"]).optional(),
  expiresAt:   z.string().optional().nullable(),
  accessKey:   z.string().optional().nullable(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url        = new URL(req.url);
  const documentId = url.searchParams.get("documentId") ?? undefined;
  const shares     = await getShares(documentId);
  return NextResponse.json(shares);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const share = await createShare({ ...parsed.data, sharedBy: user.id });
  if (!share) return NextResponse.json({ error: "mock mode — no persistence" }, { status: 202 });
  return NextResponse.json(share, { status: 201 });
}
