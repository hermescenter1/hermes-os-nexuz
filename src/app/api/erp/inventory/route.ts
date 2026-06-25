import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getInventory } from "@/lib/erp/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  sku:          z.string().min(1).max(100),
  name:         z.string().min(1).max(300),
  category:     z.string().max(100).optional().nullable(),
  description:  z.string().max(1000).optional().nullable(),
  quantity:     z.number().int().min(0).optional(),
  reorderLevel: z.number().int().min(0).optional(),
  unitCost:     z.number().positive().optional().nullable(),
  location:     z.string().max(200).optional().nullable(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url      = new URL(req.url);
  const category = url.searchParams.get("category") ?? undefined;
  const items = await getInventory(category);
  return NextResponse.json(items);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Persist via Prisma not available in mock mode — return 202
  return NextResponse.json({ error: "Could not persist — mock mode" }, { status: 202 });
}
