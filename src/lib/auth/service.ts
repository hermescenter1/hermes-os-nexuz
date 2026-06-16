/**
 * Auth service (Phase 12A).
 *
 * Resolves users for login. In session mode the only user is the seeded admin
 * from env (plus any registered in-process during the session). In database
 * mode it also looks up the Prisma `User` table, degrading to the seed/session
 * if the client is unavailable.
 *
 * This is intentionally minimal: a credentials layer sufficient for RBAC on
 * the authoring surfaces, with no external auth dependency.
 */

import { getPrisma } from "@/lib/db/prisma";
import { adminSeed } from "./config";
import { hashPassword, verifyPassword } from "./crypto";
import type { Role } from "./roles";
import { isRole } from "./roles";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface StoredUser extends AuthUser {
  passwordHash: string;
}

/** In-process user store (session mode). Seeded lazily from env. */
function sessionUsers(): Map<string, StoredUser> {
  const g = globalThis as unknown as { __hermesUsers?: Map<string, StoredUser> };
  if (!g.__hermesUsers) {
    g.__hermesUsers = new Map();
    const seed = adminSeed();
    if (seed) {
      const email = seed.email.toLowerCase();
      g.__hermesUsers.set(email, {
        id: "admin-seed",
        name: seed.name,
        email,
        role: "admin",
        passwordHash: hashPassword(seed.password),
      });
    }
  }
  return g.__hermesUsers;
}

async function dbUserByEmail(email: string): Promise<StoredUser | null> {
  const db = await getPrisma();
  if (!db) return null;
  try {
    const model = (db as Record<string, unknown>).user as {
      findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
    };
    const r = await model.findUnique({ where: { email: email.toLowerCase() } });
    if (!r) return null;
    return {
      id: String(r.id),
      name: String(r.name ?? ""),
      email: String(r.email ?? ""),
      role: isRole(r.role) ? r.role : "viewer",
      passwordHash: String(r.passwordHash ?? ""),
    };
  } catch {
    return null;
  }
}

/** Verify credentials; returns the user (without hash) on success. */
export async function authenticate(
  email: string,
  password: string
): Promise<AuthUser | null> {
  const key = email.trim().toLowerCase();

  // Database user takes precedence when present.
  const dbUser = await dbUserByEmail(key);
  if (dbUser && verifyPassword(password, dbUser.passwordHash)) {
    const { passwordHash: _omit, ...safe } = dbUser;
    void _omit;
    return safe;
  }

  // Session/seeded admin.
  const local = sessionUsers().get(key);
  if (local && verifyPassword(password, local.passwordHash)) {
    const { passwordHash: _omit, ...safe } = local;
    void _omit;
    return safe;
  }

  return null;
}
