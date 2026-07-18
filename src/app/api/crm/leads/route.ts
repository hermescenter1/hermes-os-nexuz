import { NextRequest, NextResponse }  from "next/server";
import { z }                          from "zod";
import { getCurrentUser }             from "@/lib/auth/session";
import { can }                        from "@/lib/auth/roles";
import { getLeads, createLead }       from "@/lib/crm/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateLeadSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  email:     z.string().email(),
  phone:     z.string().max(50).optional().nullable(),
  company:   z.string().max(200).optional().nullable(),
  jobTitle:  z.string().max(200).optional().nullable(),
  source:    z.enum(["WEBSITE","LINKEDIN","REFERRAL","VENDOR","ACADEMY","ATS","MANUAL"]).default("MANUAL"),
  notes:     z.string().max(2000).optional().nullable(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const leads  = await getLeads(status);
  return NextResponse.json({ leads });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const lead = await createLead({ ...parsed.data, ownerId: user.id });
  return NextResponse.json({ lead }, { status: lead ? 201 : 200 });
}
