import { NextResponse }               from "next/server";
import { z }                          from "zod";
import { getCurrentUser }              from "@/lib/auth/session";
import { can }                        from "@/lib/auth/roles";
import { getFolders, createFolder }   from "@/lib/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  name:        z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  parentId:    z.string().optional().nullable(),
  path:        z.string().optional(),
  color:       z.string().optional().nullable(),
  icon:        z.string().optional().nullable(),
  isPublic:    z.boolean().optional(),
});

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const folders = await getFolders();
  return NextResponse.json(folders);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const folder = await createFolder({ ...parsed.data, createdBy: user.id });
  if (!folder) return NextResponse.json({ error: "mock mode — no persistence" }, { status: 202 });
  return NextResponse.json(folder, { status: 201 });
}
