/**
 * User registration service.
 * Server-side only.
 *
 * Email is dispatched asynchronously via the auth event system — a failure to
 * deliver the verification email never blocks or fails the registration itself.
 */

import { getPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { hashArgon2 } from "./argon2-wrapper";
import { generateVerificationToken } from "./jwt-server";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { VERIFICATION_TOKEN_TTL } from "./config";
import { authEmitter } from "@/lib/events/auth/emitter";

export type RegisterResult =
  | { ok: true;  userId: string }
  | { ok: false; error: "email-taken" | "db-unavailable" | "unknown" };

export async function registerUser(
  name:     string,
  email:    string,
  password: string,
  baseUrl:  string,
): Promise<RegisterResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  try {
    const userModel = (db as Record<string, unknown>).user as {
      findUnique: (a: unknown) => Promise<unknown>;
      create:     (a: unknown) => Promise<Record<string, unknown>>;
    };
    const vtModel = (db as Record<string, unknown>).verificationToken as {
      create: (a: unknown) => Promise<unknown>;
    };

    const existing = await userModel.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return { ok: false, error: "email-taken" };

    const passwordHash = await hashArgon2(password);

    const user = await userModel.create({
      data: {
        name,
        email:         email.toLowerCase(),
        passwordHash,
        role:          "customer",
        emailVerified: false,
      },
    });

    const userId = String(user.id);

    const token     = generateVerificationToken();
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL * 1000);
    await vtModel.create({ data: { userId, token, expiresAt } });

    // Emit event — handler sends the email asynchronously (non-blocking)
    authEmitter.dispatch({
      type:              "user.registered",
      userId,
      email,
      name,
      verificationToken: token,
      baseUrl,
    });

    await recordAuditEvent({
      userId,
      action:     "auth.register",
      entityType: "user",
      entityId:   userId,
      metadata:   { email, name },
    });

    return { ok: true, userId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      return { ok: false, error: "email-taken" };
    }
    logger.error("[registration] error", { error: String(err) });
    return { ok: false, error: "unknown" };
  }
}
