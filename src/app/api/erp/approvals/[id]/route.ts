import { NextResponse } from "next/server";
import { z }            from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can }           from "@/lib/auth/roles";
import { updateApproval } from "@/lib/erp/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  status:   z.enum(["APPROVED","REJECTED","CANCELLED"]),
  decision: z.string().max(1000).optional().nullable(),
});

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

  const updated = await updateApproval(id, { ...parsed.data, decidedBy: user.id });
  if (!updated) return NextResponse.json({ error: "not found or no db" }, { status: 404 });
  return NextResponse.json(updated);
}
