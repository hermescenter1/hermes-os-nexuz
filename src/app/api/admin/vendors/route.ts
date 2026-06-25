import { NextResponse }                                  from "next/server";
import { getCurrentUser }                                from "@/lib/auth/session";
import { can }                                           from "@/lib/auth/roles";
import { adminListOnboardingRequests, adminListVendors } from "@/lib/vendors/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user)                   return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin")) return NextResponse.json({ error: "forbidden" },   { status: 403 });

  const q      = new URL(req.url).searchParams;
  const tab    = q.get("tab") ?? "pending";
  const skip   = Number(q.get("skip") ?? 0);
  const take   = Math.min(Number(q.get("take") ?? 50), 200);

  if (tab === "pending" || tab === "rejected") {
    const status   = tab === "pending" ? "PENDING" : "REJECTED";
    const requests = await adminListOnboardingRequests({ status, skip, take });
    return NextResponse.json({ requests: requests ?? [], tab });
  }

  const statusFilter = tab === "suspended" ? "SUSPENDED" : "APPROVED";
  const vendors      = await adminListVendors({ status: statusFilter, skip, take });
  return NextResponse.json({ vendors: vendors ?? [], tab });
}
