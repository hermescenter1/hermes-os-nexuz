/**
 * Email verification service.
 * Server-side only.
 */

import { getPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { authEmitter } from "@/lib/events/auth/emitter";

export type VerifyResult =
  | { ok: true }
  | { ok: false; error: "invalid-token" | "expired" | "already-used" | "db-unavailable" };

export async function verifyEmail(token: string, locale?: string): Promise<VerifyResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  try {
    const vtModel = (db as Record<string, unknown>).verificationToken as {
      findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
      update:     (a: unknown) => Promise<unknown>;
    };
    const userModel = (db as Record<string, unknown>).user as {
      findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
      update:     (a: unknown) => Promise<Record<string, unknown>>;
    };

    const vt = await vtModel.findUnique({ where: { token } });

    if (!vt)                                               return { ok: false, error: "invalid-token" };
    if (vt.usedAt)                                         return { ok: false, error: "already-used" };
    if (new Date(vt.expiresAt as string) < new Date())     return { ok: false, error: "expired" };

    await vtModel.update({ where: { token }, data: { usedAt: new Date() } });

    const user = await userModel.update({
      where: { id: String(vt.userId) },
      data:  { emailVerified: true, emailVerifiedAt: new Date() },
    });

    await recordAuditEvent({
      userId:     String(vt.userId),
      action:     "auth.email_verified",
      entityType: "user",
      entityId:   String(vt.userId),
      metadata:   {},
    });

    // Emit event — handler sends welcome email asynchronously (non-blocking)
    authEmitter.dispatch({
      type:   "user.email_verified",
      userId: String(vt.userId),
      email:  String(user.email),
      name:   String(user.name),
      locale,
    });

    return { ok: true };
  } catch (err) {
    logger.error("[verification] error", { error: String(err) });
    return { ok: false, error: "db-unavailable" };
  }
}
