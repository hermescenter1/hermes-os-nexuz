/**
 * Privileged-operation reauthentication (Phase 91). Server-only.
 *
 * Genuinely destructive actions require the actor to re-prove possession of their
 * password in the SAME request, even though they already hold a valid session.
 * This bounds the blast radius of a hijacked-but-idle session or an unlocked
 * workstation. It is NOT a second factor — it is a step-up on the factor we have.
 *
 * Failures return a single stable code with no distinction between "wrong
 * password", "no password supplied", and "unknown account", so the endpoint
 * cannot be used as an account/credential oracle.
 */

import { getPrisma } from "@/lib/db/prisma";
import { verifyArgon2, isArgon2Hash } from "./argon2-wrapper";
import { verifyPassword } from "./crypto";

export type ReauthResult =
  | { ok: true }
  | { ok: false; status: number; code: "REAUTH_REQUIRED" | "REAUTH_UNAVAILABLE" };

/**
 * Verify that `providedPassword` matches the current password of `userId`.
 * @returns ok:true only on a positive match; otherwise a stable, non-revealing failure.
 */
export async function requireRecentAuth(
  userId:           string,
  providedPassword: unknown,
): Promise<ReauthResult> {
  if (typeof providedPassword !== "string" || providedPassword.length === 0) {
    return { ok: false, status: 401, code: "REAUTH_REQUIRED" };
  }

  const db = await getPrisma();
  if (!db) return { ok: false, status: 503, code: "REAUTH_UNAVAILABLE" };

  try {
    const userModel = (db as Record<string, unknown>).user as {
      findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
    };
    const user = await userModel.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) return { ok: false, status: 401, code: "REAUTH_REQUIRED" };

    const stored = String(user.passwordHash);
    const ok = isArgon2Hash(stored)
      ? await verifyArgon2(stored, providedPassword)
      : verifyPassword(providedPassword, stored);

    return ok ? { ok: true } : { ok: false, status: 401, code: "REAUTH_REQUIRED" };
  } catch {
    return { ok: false, status: 503, code: "REAUTH_UNAVAILABLE" };
  }
}
