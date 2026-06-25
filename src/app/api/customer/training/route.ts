import { NextResponse }    from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can }            from "@/lib/auth/roles";
import { getTrainingForUser, getAccountForUser, logActivity } from "@/lib/customer-portal/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "dashboard")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [training, account] = await Promise.all([
    getTrainingForUser(user.id),
    getAccountForUser(user.id),
  ]);

  if (account) {
    await logActivity({
      accountId:   account.id,
      userId:      user.id,
      eventType:   "customer_training_view",
      description: "Viewed training portal",
    });
  }

  return NextResponse.json({ training });
}
