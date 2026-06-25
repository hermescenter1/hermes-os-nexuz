import { NextRequest, NextResponse }              from "next/server";
import { z }                                      from "zod";
import { getCurrentUser }                         from "@/lib/auth/session";
import { can }                                    from "@/lib/auth/roles";
import { getOpportunityById, updateOpportunity }  from "@/lib/crm/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateOpportunitySchema = z.object({
  stage:       z.enum(["DISCOVERY","QUALIFICATION","PROPOSAL","TECHNICAL_REVIEW","COMMERCIAL_REVIEW","NEGOTIATION","WON","LOST"]).optional(),
  value:       z.number().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  notes:       z.string().max(2000).optional().nullable(),
  lostReason:  z.string().max(500).optional().nullable(),
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const opp    = await getOpportunityById(id);
  if (!opp) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ opportunity: opp });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id }  = await params;
  const body    = await req.json().catch(() => ({}));
  const parsed  = UpdateOpportunitySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const opp = await updateOpportunity(id, parsed.data);
  if (!opp) return NextResponse.json({ error: "not found or update failed" }, { status: 404 });
  return NextResponse.json({ opportunity: opp });
}
