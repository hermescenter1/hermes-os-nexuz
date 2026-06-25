import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser }           from "@/lib/auth/session";
import { can }                      from "@/lib/auth/roles";
import { getAccountForUser, getDocuments, logActivity } from "@/lib/customer-portal/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "dashboard")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const account = await getAccountForUser(user.id);
  if (!account) return NextResponse.json({ documents: [], noAccount: true });

  const category = req.nextUrl.searchParams.get("category") ?? undefined;
  const documents = await getDocuments(account.id, category);

  await logActivity({
    accountId: account.id,
    userId:    user.id,
    eventType: "customer_document_view",
    description: "Viewed document library",
  });

  return NextResponse.json({ documents });
}
