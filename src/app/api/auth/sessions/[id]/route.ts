/**
 * DELETE /api/auth/sessions/[id] — revoke one of the caller's own sessions.
 *
 * PHASE 91. `id` is the opaque session id from GET /api/auth/sessions. Revocation
 * is owner-scoped in the data layer: a session that does not belong to the caller
 * yields a 404, so this endpoint can neither revoke nor confirm the existence of
 * another user's session. Revocation is enforced on that session's next protected
 * request (its sid-bound access token stops resolving).
 */

import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestSession } from "@/lib/auth/request-session";
import { revokeSession } from "@/lib/auth/session-store";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { resolveRequestId } from "@/lib/logger/correlation";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await resolveRequestSession(req);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Session id required" }, { status: 400 });

  const revoked = await revokeSession(session.userId, id);
  if (!revoked) {
    // Not found OR not owned by the caller — indistinguishable on purpose.
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await recordAuditEvent({
    userId:        session.userId,
    action:        "auth.sessions.revoke",
    entityType:    "session",
    entityId:      id,
    outcome:       "success",
    correlationId: resolveRequestId(req),
    metadata:      { self: id === session.sid },
  });

  return NextResponse.json({ ok: true });
}
