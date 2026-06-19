/**
 * Email verification service (Phase 28).
 * Server-side only.
 */

import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/lib/audit/audit-service";

export type VerifyResult =
  | { ok: true }
  | { ok: false; error: "invalid-token" | "expired" | "already-used" | "db-unavailable" };

export async function verifyEmail(token: string): Promise<VerifyResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  try {
    const vtModel = (db as Record<string, unknown>).verificationToken as {
      findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
      update:     (a: unknown) => Promise<unknown>;
    };
    const userModel = (db as Record<string, unknown>).user as {
      update: (a: unknown) => Promise<unknown>;
    };

    const vt = await vtModel.findUnique({ where: { token } });

    if (!vt)                          return { ok: false, error: "invalid-token" };
    if (vt.usedAt)                    return { ok: false, error: "already-used" };
    if (new Date(vt.expiresAt as string) < new Date()) return { ok: false, error: "expired" };

    await vtModel.update({
      where: { token },
      data:  { usedAt: new Date() },
    });

    await userModel.update({
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

    return { ok: true };
  } catch (err) {
    console.error("[verification] error:", err);
    return { ok: false, error: "db-unavailable" };
  }
}
