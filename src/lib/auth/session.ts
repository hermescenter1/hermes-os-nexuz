import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./config";
import { verifySession } from "./crypto";
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
  return {
    id: payload.userId,
    email: payload.email,
    name: payload.name,
    role: isRole(payload.role) ? payload.role : "viewer",
  };
}
