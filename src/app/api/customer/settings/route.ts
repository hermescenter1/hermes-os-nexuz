import { NextRequest, NextResponse } from "next/server";
import { z }                        from "zod";
import { getCurrentUser }           from "@/lib/auth/session";
import { can }                      from "@/lib/auth/roles";
import { getAccountForUser, getPreference, upsertPreference, logActivity } from "@/lib/customer-portal/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "dashboard")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const account = await getAccountForUser(user.id);
  if (!account) return NextResponse.json({ preference: null, noAccount: true });

  const preference = await getPreference(account.id);
  return NextResponse.json({ preference });
}

const settingsSchema = z.object({
  language:           z.string().length(2).optional(),
  timezone:           z.string().max(50).optional(),
  emailNotifications: z.boolean().optional(),
  ticketUpdates:      z.boolean().optional(),
  projectUpdates:     z.boolean().optional(),
  documentAlerts:     z.boolean().optional(),
  marketingEmails:    z.boolean().optional(),
}).strict();

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "dashboard")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const account = await getAccountForUser(user.id);
  if (!account) return NextResponse.json({ error: "no_account" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const preference = await upsertPreference(account.id, user.id, parsed.data);

  await logActivity({
    accountId:   account.id,
    userId:      user.id,
    eventType:   "customer_settings_updated",
    description: "Portal settings updated",
    metadata:    parsed.data as Record<string, unknown>,
  });

  return NextResponse.json({ preference });
}
