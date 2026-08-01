/**
 * Resolve the current request's authenticated session (Phase 91). Server-only.
 *
 * Used by the self-service session-management routes. Returns the caller's user
 * id and the opaque id (`sid`) of the session they authenticated with, or null
 * when there is no valid, still-active session. A revoked session resolves to
 * null here too, so a revoked caller cannot enumerate or revoke sessions.
 */

import type { NextRequest } from "next/server";
import { verifyAccessToken } from "./jwt";
import { ACCESS_TOKEN_COOKIE } from "./config";
import { isPayloadSessionActive } from "./session-store";

export interface RequestSession {
  userId: string;
  /** null for legacy tokens issued before session binding. */
  sid: string | null;
}

export async function resolveRequestSession(req: NextRequest): Promise<RequestSession | null> {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyAccessToken(token);
  if (!payload?.sub) return null;
  if (!(await isPayloadSessionActive(payload))) return null;

  return { userId: payload.sub, sid: payload.sid ?? null };
}
