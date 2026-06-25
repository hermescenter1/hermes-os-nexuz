import { NextResponse }                     from "next/server";
import { getCurrentUser }                   from "@/lib/auth/session";
import { can }                              from "@/lib/auth/roles";
import { adminApproveOnboardingRequest }    from "@/lib/vendors/db";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user)                    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin")) return NextResponse.json({ error: "forbidden" },   { status: 403 });

  const { id } = await params;
  const result = await adminApproveOnboardingRequest(id, user.id ?? "admin");

  if (!result) return NextResponse.json({ error: "approval_failed" }, { status: 500 });

  return NextResponse.json({ success: true, vendorId: result.vendorId });
}
