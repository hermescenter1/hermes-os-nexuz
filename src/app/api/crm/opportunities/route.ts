import { NextRequest, NextResponse }           from "next/server";
import { z }                                   from "zod";
import { getCurrentUser }                      from "@/lib/auth/session";
import { can }                                 from "@/lib/auth/roles";
import { getOpportunities, createOpportunity } from "@/lib/crm/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateOpportunitySchema = z.object({
  title:             z.string().min(1).max(200),
  value:             z.number().min(0),
  probability:       z.number().int().min(0).max(100).default(0),
  stage:             z.enum(["DISCOVERY","QUALIFICATION","PROPOSAL","TECHNICAL_REVIEW","COMMERCIAL_REVIEW","NEGOTIATION","WON","LOST"]).default("DISCOVERY"),
  accountId:         z.string().optional().nullable(),
  leadId:            z.string().optional().nullable(),
  expectedCloseDate: z.string().datetime().optional().nullable(),
  notes:             z.string().max(2000).optional().nullable(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const stage = req.nextUrl.searchParams.get("stage") ?? undefined;
  const opps  = await getOpportunities(stage);
  return NextResponse.json({ opportunities: opps });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateOpportunitySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const opp = await createOpportunity({ ...parsed.data, ownerId: user.id });
  return NextResponse.json({ opportunity: opp }, { status: opp ? 201 : 200 });
}
