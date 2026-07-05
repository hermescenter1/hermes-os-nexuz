import { NextResponse }        from "next/server";
import { getCurrentUser }      from "@/lib/auth/session";
import { can }                 from "@/lib/auth/roles";
import { rejectAccessRequest } from "@/lib/auth/access-invite";

export const dynamic = "force-dynamic";

/**
 * Phase 81C: reject an AUTH_ACCESS_REQUEST lead. Marks the lead REJECTED and
 * revokes any invite still pending for it — a rejected request can no longer
 * mint an account.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user)                    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin")) return NextResponse.json({ error: "forbidden" },   { status: 403 });

  const { id } = await params;
  const result = await rejectAccessRequest(id, user.id);

  if (!result.ok) {
    const status =
      result.error === "not-found"      ? 404 :
      result.error === "db-unavailable" ? 503 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
