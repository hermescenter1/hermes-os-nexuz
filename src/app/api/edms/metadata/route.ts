import { NextResponse }                   from "next/server";
import { z }                              from "zod";
import { getCurrentUser }                  from "@/lib/auth/session";
import { can }                            from "@/lib/auth/roles";
import { getMetadata, upsertMetadata }    from "@/lib/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpsertSchema = z.object({
  documentId: z.string(),
  entries:    z.record(z.string(), z.string()),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url        = new URL(req.url);
  const documentId = url.searchParams.get("documentId") ?? undefined;
  const meta       = await getMetadata(documentId);
  return NextResponse.json(meta);
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const results = await Promise.all(
    Object.entries(parsed.data.entries).map(([key, value]) =>
      upsertMetadata(parsed.data.documentId, key, value)
    )
  );
  return NextResponse.json(results);
}
