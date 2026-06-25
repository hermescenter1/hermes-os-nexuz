import { NextRequest, NextResponse } from "next/server";
import { z }                        from "zod";
import { getCurrentUser }           from "@/lib/auth/session";
import { can }                      from "@/lib/auth/roles";
import { getAccountForUser, getTickets, createTicket, logActivity } from "@/lib/customer-portal/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "dashboard")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const account = await getAccountForUser(user.id);
  if (!account) return NextResponse.json({ tickets: [], noAccount: true });

  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const tickets = await getTickets(account.id, status);
  return NextResponse.json({ tickets });
}

const createSchema = z.object({
  title:       z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  priority:    z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  category:    z.string().max(50).default("GENERAL"),
  projectId:   z.string().optional().nullable(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "dashboard")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const account = await getAccountForUser(user.id);
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const ticket = await createTicket({
    accountId:       account.id,
    projectId:       parsed.data.projectId ?? null,
    createdByUserId: user.id,
    title:           parsed.data.title,
    descriptionEn:   parsed.data.description,
    priority:        parsed.data.priority,
    category:        parsed.data.category,
  });

  if (!ticket) return NextResponse.json({ error: "create_failed" }, { status: 500 });

  await logActivity({
    accountId:   account.id,
    userId:      user.id,
    eventType:   "customer_support_ticket_created",
    description: `Support ticket created: ${parsed.data.title}`,
    metadata:    { ticketId: ticket.id, priority: parsed.data.priority },
  });

  return NextResponse.json({ ticket }, { status: 201 });
}
