/**
 * Password reset service.
 * Server-side only.
 *
 * Email is dispatched asynchronously via the auth event system — a failure to
 * deliver the reset email never breaks the initiation flow.
 */

import { getPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { generateResetToken, hashResetToken } from "./jwt-server";
import { hashArgon2 } from "./argon2-wrapper";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { PASSWORD_RESET_TTL } from "./config";
import { authEmitter } from "@/lib/events/auth/emitter";

// ── Initiate reset ───────────────────────────────────────────────────────────

/** Always returns void — never reveals whether the email exists (prevents enumeration). */
export async function initiatePasswordReset(
  email:   string,
  baseUrl: string,
): Promise<void> {
  const db = await getPrisma();
  if (!db) return;

  try {
    const userModel = (db as Record<string, unknown>).user as {
      findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
    };
    const prtModel = (db as Record<string, unknown>).passwordResetToken as {
      create: (a: unknown) => Promise<unknown>;
    };

    const user = await userModel.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return; // silent — prevent email enumeration

    const plainToken = generateResetToken();
    const tokenHash  = hashResetToken(plainToken);
    const expiresAt  = new Date(Date.now() + PASSWORD_RESET_TTL * 1000);

    await prtModel.create({
      data: { userId: String(user.id), tokenHash, expiresAt },
    });

    // Emit event — handler sends the email asynchronously (non-blocking)
    authEmitter.dispatch({
      type:       "user.password_reset_requested",
      userId:     String(user.id),
      email,
      name:       String(user.name),
      resetToken: plainToken,
      baseUrl,
    });

    await recordAuditEvent({
      userId:     String(user.id),
      action:     "auth.password_reset_requested",
      entityType: "user",
      entityId:   String(user.id),
      metadata:   { email },
    });
  } catch (err) {
    logger.error("[password-reset] initiate error", { error: String(err) });
  }
}

// ── Complete reset ───────────────────────────────────────────────────────────

export type ResetResult =
  | { ok: true }
  | { ok: false; error: "invalid-token" | "expired" | "already-used" | "db-unavailable" };

export async function completePasswordReset(
  plainToken:  string,
  newPassword: string,
): Promise<ResetResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  try {
    const tokenHash = hashResetToken(plainToken);

    const prtModel = (db as Record<string, unknown>).passwordResetToken as {
      findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
      update:     (a: unknown) => Promise<unknown>;
    };
    const userModel = (db as Record<string, unknown>).user as {
      update: (a: unknown) => Promise<unknown>;
    };

    const prt = await prtModel.findUnique({ where: { tokenHash } });

    if (!prt)                                               return { ok: false, error: "invalid-token" };
    if (prt.usedAt)                                         return { ok: false, error: "already-used" };
    if (new Date(prt.expiresAt as string) < new Date())     return { ok: false, error: "expired" };

    const passwordHash = await hashArgon2(newPassword);

    await prtModel.update({ where: { tokenHash }, data: { usedAt: new Date() } });
    await userModel.update({
      where: { id: String(prt.userId) },
      data:  { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    });

    await recordAuditEvent({
      userId:     String(prt.userId),
      action:     "auth.password_reset_completed",
      entityType: "user",
      entityId:   String(prt.userId),
      metadata:   {},
    });

    return { ok: true };
  } catch (err) {
    logger.error("[password-reset] complete error", { error: String(err) });
    return { ok: false, error: "db-unavailable" };
  }
}
