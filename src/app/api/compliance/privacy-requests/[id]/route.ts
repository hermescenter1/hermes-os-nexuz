import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { verifyAccessToken }          from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }        from "@/lib/auth/config";
import { updatePrivacyRequestStatus } from "@/lib/compliance/db";
import type { PrivacyRequestStatus }  from "@/lib/compliance/types";

const VALID_STATUSES: PrivacyRequestStatus[] = ["PENDING", "IN_REVIEW", "COMPLETED", "REJECTED"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!at) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const payload = await verifyAccessToken(at);
  if (!payload || !["admin", "superadmin"].includes(payload.role as string)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id }  = await params;
  const body    = await req.json() as { status: string; responseNote?: string };

  if (!VALID_STATUSES.includes(body.status as PrivacyRequestStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await updatePrivacyRequestStatus(
    id,
    body.status as PrivacyRequestStatus,
    payload.sub,
    body.responseNote,
  );
  if (!updated) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  return NextResponse.json({ request: updated });
}
