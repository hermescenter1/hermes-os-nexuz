import { NextResponse }    from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can }            from "@/lib/auth/roles";
import { getAccountForUser, getSubscription, logActivity } from "@/lib/customer-portal/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "dashboard")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const account = await getAccountForUser(user.id);
  if (!account) return NextResponse.json({ subscription: null, noAccount: true });

  const subscription = await getSubscription(account.id);

  await logActivity({
    accountId:   account.id,
    userId:      user.id,
    eventType:   "customer_subscription_view",
    description: "Viewed subscription details",
  });

  return NextResponse.json({ subscription });
}
