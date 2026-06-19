/**
 * POST /api/invitations/respond — Accept or reject an invitation by token.
 *
 * This is the ONE route outside org-scope auth.
 * The user must be authenticated (have a valid JWT) but is NOT yet a member.
 * Gate: token matches + authenticated user email matches invitation email.
 */

import { NextRequest, NextResponse }   from "next/server";
import { getUserIdFromRequest }         from "@/lib/org/context";
import { acceptInvitation, rejectInvitation, getUserEmail } from "@/lib/org/invitations";

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { token, action } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }
  if (action !== "accept" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'accept' or 'reject'" }, { status: 400 });
  }

  const userEmail = await getUserEmail(userId);
  if (!userEmail) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (action === "accept") {
    const out = await acceptInvitation(token, userEmail, userId);
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
    return NextResponse.json({ ok: true, orgId: out.orgId });
  } else {
    const out = await rejectInvitation(token, userEmail, userId);
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 422 });
    return NextResponse.json({ ok: true });
  }
}
