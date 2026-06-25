import { NextRequest, NextResponse } from "next/server";
import { z }                        from "zod";
import { getCurrentUser }           from "@/lib/auth/session";
import { can }                      from "@/lib/auth/roles";
import { getAccountForUser, getTicketById, createMessage, logActivity } from "@/lib/customer-portal/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const msgSchema = z.object({
  body:       z.string().min(1).max(10000),
  isInternal: z.boolean().optional().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "dashboard")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const account = await getAccountForUser(user.id);
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 404 });

  const ticket = await getTicketById(account.id, id);
  if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = msgSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Only admins can post internal notes
  const isAdmin = user.role === "admin" || user.role === "superadmin";
  const isInternal = isAdmin && (parsed.data.isInternal ?? false);

  const msg = await createMessage({
    ticketId:   id,
    authorId:   user.id,
    authorName: user.name,
    authorRole: user.role,
    body:       parsed.data.body,
    isInternal,
  });

  if (!msg) return NextResponse.json({ error: "create_failed" }, { status: 500 });

  await logActivity({
    accountId:   account.id,
    userId:      user.id,
    eventType:   "customer_support_message_sent",
    description: `Message added to ticket: ${ticket.title}`,
    metadata:    { ticketId: id },
  });

  return NextResponse.json({ message: msg }, { status: 201 });
}
