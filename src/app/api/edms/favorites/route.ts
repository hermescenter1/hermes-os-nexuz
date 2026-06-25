import { NextResponse }                     from "next/server";
import { z }                                from "zod";
import { getCurrentUser }                    from "@/lib/auth/session";
import { can }                              from "@/lib/auth/roles";
import { getFavorites, toggleFavorite }     from "@/lib/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ToggleSchema = z.object({
  documentId: z.string(),
});

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const favorites = await getFavorites(user.id);
  return NextResponse.json(favorites);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = ToggleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await toggleFavorite(parsed.data.documentId, user.id);
  return NextResponse.json(result);
}
