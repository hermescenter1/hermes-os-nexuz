/**
 * Auth event → email handlers.
 *
 * This module must be imported once at server startup (instrumentation.node.ts)
 * so handlers are registered before any auth events can be emitted.
 *
 * Guards against double-registration across Next.js hot-reloads via a
 * globalThis flag.
 */

import { logger } from "@/lib/logger";
import { authEmitter } from "./emitter";
import { getEmailService } from "@/lib/email/service";
import { verificationEmailHtml, verificationEmailText } from "@/lib/email/templates/verification";
import { passwordResetEmailHtml, passwordResetEmailText } from "@/lib/email/templates/password-reset";
import { welcomeEmailHtml, welcomeEmailText } from "@/lib/email/templates/welcome";
import { VERIFICATION_TOKEN_TTL, PASSWORD_RESET_TTL } from "@/lib/auth/config";
import type {
  UserRegisteredEvent,
  PasswordResetRequestedEvent,
  EmailVerifiedEvent,
} from "./types";

const VERIFICATION_HOURS = VERIFICATION_TOKEN_TTL / 3600;
const RESET_HOURS        = PASSWORD_RESET_TTL / 3600;

// ─── Guard against double-registration ───────────────────────────────────────

const g = globalThis as unknown as { __hermesAuthHandlersInit?: boolean };
if (g.__hermesAuthHandlersInit) {
  // Already registered — skip to avoid duplicating listeners on hot-reload
} else {
  g.__hermesAuthHandlersInit = true;

  // ── user.registered → send verification email ─────────────────────────────

  authEmitter.on<UserRegisteredEvent>("user.registered", (event) => {
    void (async () => {
      try {
        const link = `${event.baseUrl}/auth/verify-email?token=${encodeURIComponent(event.verificationToken)}`;
        await getEmailService().send({
          to:      event.email,
          subject: "Verify your Hermes OS email address",
          html: verificationEmailHtml({
            name:             event.name,
            verificationLink: link,
            expiresInHours:   VERIFICATION_HOURS,
          }),
          text: verificationEmailText({
            name:             event.name,
            verificationLink: link,
            expiresInHours:   VERIFICATION_HOURS,
          }),
        });
        logger.info("[auth.event] Verification email dispatched.", { userId: event.userId });
      } catch (err) {
        logger.error("[auth.event] user.registered handler failed.", {
          error:  err instanceof Error ? err.message : String(err),
          userId: event.userId,
        });
      }
    })();
  });

  // ── user.password_reset_requested → send reset email ─────────────────────

  authEmitter.on<PasswordResetRequestedEvent>("user.password_reset_requested", (event) => {
    void (async () => {
      try {
        const link = `${event.baseUrl}/auth/reset-password?token=${encodeURIComponent(event.resetToken)}`;
        await getEmailService().send({
          to:      event.email,
          subject: "Reset your Hermes OS password",
          html: passwordResetEmailHtml({
            name:           event.name,
            resetLink:      link,
            expiresInHours: RESET_HOURS,
          }),
          text: passwordResetEmailText({
            name:           event.name,
            resetLink:      link,
            expiresInHours: RESET_HOURS,
          }),
        });
        logger.info("[auth.event] Password reset email dispatched.", { userId: event.userId });
      } catch (err) {
        logger.error("[auth.event] user.password_reset_requested handler failed.", {
          error:  err instanceof Error ? err.message : String(err),
          userId: event.userId,
        });
      }
    })();
  });

  // ── user.email_verified → send welcome email ──────────────────────────────

  authEmitter.on<EmailVerifiedEvent>("user.email_verified", (event) => {
    void (async () => {
      try {
        await getEmailService().send({
          to:      event.email,
          subject: "Welcome to Hermes OS",
          html:    welcomeEmailHtml({ name: event.name }),
          text:    welcomeEmailText({ name: event.name }),
        });
        logger.info("[auth.event] Welcome email dispatched.", { userId: event.userId });
      } catch (err) {
        logger.error("[auth.event] user.email_verified handler failed.", {
          error:  err instanceof Error ? err.message : String(err),
          userId: event.userId,
        });
      }
    })();
  });

  logger.info("[auth.event] Auth event handlers registered.");
}
