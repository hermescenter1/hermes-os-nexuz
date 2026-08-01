/**
 * RBAC helpers for API route protection (Phase 28).
 * Server-only — uses node:crypto via verifySession.
 * Do NOT import this from middleware.ts.
 */

import { NextResponse }          from "next/server";
import type { NextRequest }      from "next/server";
import { verifyAccessToken }     from "./jwt";
import { verifySession }         from "./crypto";
import { isPayloadSessionActive } from "./session-store";
import { ACCESS_TOKEN_COOKIE, SESSION_COOKIE } from "./config";
import { isRole, type Role }     from "./roles";

/**
 * Get the authenticated role from a server-side API request.
 *
 * PHASE 91 — for sid-bound credentials the referenced session must still be
 * active; a revoked session is skipped (falls through to the next credential,
 * then to null). Legacy credentials without a sid behave exactly as before.
 */
export async function getAuthRole(req: NextRequest): Promise<Role | null> {
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (at) {
    const payload = await verifyAccessToken(at);
    if (payload && isRole(payload.role) && (await isPayloadSessionActive(payload))) {
      return payload.role;
    }
  }
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (session) {
    const payload = verifySession(session);
    if (payload && isRole(payload.role) && (await isPayloadSessionActive(payload))) {
      return payload.role;
    }
  }
  return null;
}

type RouteHandler = (req: NextRequest) => Promise<NextResponse>;

/** HOF: wraps an API route handler with auth + optional role check. */
export function withAuth(
  handler:      RouteHandler,
  requiredRole?: Role | ((role: Role) => boolean)
): RouteHandler {
  return async (req: NextRequest): Promise<NextResponse> => {
    const role = await getAuthRole(req);

    if (!role) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (requiredRole) {
      const allowed =
        typeof requiredRole === "function"
          ? requiredRole(role)
          : role === requiredRole;
      if (!allowed) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
      }
    }

    return handler(req);
  };
}
