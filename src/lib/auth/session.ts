import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./config";
import { verifySession } from "./crypto";
import { isPayloadSessionActive } from "./session-store";
import type { Role } from "./roles";
import { isRole } from "./roles";

/**
 * Server-side session reader (Phase 12A). Use in server components and route
 * handlers to get the current user. Returns null when there is no valid
 * session — callers decide whether that means "public" or "redirect to login".
 */

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = verifySession(token);
  if (!payload) return null;
  // PHASE 91 — this cookie is the sole auth gate on ~130 API routes (via
  // requireAuthoring and direct can(role, …) checks). It now carries the opaque
  // session id (`sid`); enforce revocation here too, or a logout / admin-suspend
  // / password-reset would leave the legacy cookie fully valid until its 30-day
  // ceiling on every one of those routes. Legacy cookies without a sid are
  // allowed unchanged (no DB hit — see isPayloadSessionActive).
  if (!(await isPayloadSessionActive(payload))) return null;
  return {
    id: payload.userId,
    email: payload.email,
    name: payload.name,
    role: isRole(payload.role) ? payload.role : "viewer",
  };
}
