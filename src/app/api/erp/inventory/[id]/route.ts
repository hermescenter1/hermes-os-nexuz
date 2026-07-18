import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { getInventoryById, updateInventory } from "@/lib/erp/db";
import { onInventoryLow } from "@/lib/erp/triggers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  quantity:     z.number().int().min(0).optional(),
  reserved:     z.number().int().min(0).optional(),
  reorderLevel: z.number().int().min(0).optional(),
  location:     z.string().max(200).optional().nullable(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const item   = await getInventoryById(id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body   = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await updateInventory(id, parsed.data);
  if (!updated) return NextResponse.json({ error: "not found or no db" }, { status: 404 });

  if (updated.quantity <= updated.reorderLevel) {
    onInventoryLow(updated.id, updated.sku, updated.quantity, updated.reorderLevel);
  }
  return NextResponse.json(updated);
}
