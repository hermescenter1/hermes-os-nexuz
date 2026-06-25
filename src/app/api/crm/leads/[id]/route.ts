import { NextRequest, NextResponse }   from "next/server";
import { z }                           from "zod";
import { getCurrentUser }              from "@/lib/auth/session";
import { can }                         from "@/lib/auth/roles";
import { getLeadById, updateLead }     from "@/lib/crm/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateLeadSchema = z.object({
  status: z.enum(["NEW","CONTACTED","QUALIFIED","PROPOSAL","NEGOTIATION","CONVERTED","LOST"]).optional(),
  score:  z.number().int().min(0).max(100).optional(),
  notes:  z.string().max(2000).optional().nullable(),
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const lead   = await getLeadById(id);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ lead });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id }  = await params;
  const body    = await req.json().catch(() => ({}));
  const parsed  = UpdateLeadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const lead = await updateLead(id, parsed.data);
  if (!lead) return NextResponse.json({ error: "not found or update failed" }, { status: 404 });
  return NextResponse.json({ lead });
}
