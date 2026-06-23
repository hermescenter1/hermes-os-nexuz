/**
 * System event → notification handlers.
 *
 * Must be imported once at server startup (instrumentation.node.ts).
 * Guards against double-registration across Next.js hot-reloads via a
 * globalThis flag.
 *
 * Rule: Notification system is PRIMARY, email is SECONDARY.
 *   - Notifications are always created first.
 *   - Email failures never prevent notification creation.
 *   - Notification creation failures are logged, never re-thrown.
 */

import { logger } from "@/lib/logger";
import { authEmitter } from "@/lib/events/auth/emitter";
import { systemEmitter } from "./emitter";
import { getNotificationService } from "@/lib/notifications/service";
import type {
  UserRegisteredEvent,
  PasswordResetRequestedEvent,
  EmailVerifiedEvent,
} from "@/lib/events/auth/types";
import type {
  LoginSuccessEvent,
  LoginFailedEvent,
  SystemAlertEvent,
  EmailSentEvent,
  EmailFailedEvent,
} from "./types";

// ─── Guard against double-registration ───────────────────────────────────────

const g = globalThis as unknown as { __hermesNotificationHandlersInit?: boolean };
if (g.__hermesNotificationHandlersInit) {
  // Already registered — skip to avoid duplicating listeners on hot-reload
} else {
  g.__hermesNotificationHandlersInit = true;

  const svc = getNotificationService();

  // ── AUTH EVENTS (subscribed from existing authEmitter) ────────────────────

  authEmitter.on<UserRegisteredEvent>("user.registered", (event) => {
    void svc.create({
      userId:  event.userId,
      type:    "success",
      title:   "Welcome to Hermes OS",
      message: "Your account has been created. Please verify your email to get started.",
      metadata: { email: event.email },
    });
    logger.info("[notifications] user.registered notification queued.", { userId: event.userId });
  });

  authEmitter.on<EmailVerifiedEvent>("user.email_verified", (event) => {
    void svc.create({
      userId:  event.userId,
      type:    "success",
      title:   "Email Verified",
      message: "Your email address has been verified. You now have full access to Hermes OS.",
      metadata: { email: event.email },
    });
    logger.info("[notifications] user.email_verified notification queued.", { userId: event.userId });
  });

  authEmitter.on<PasswordResetRequestedEvent>("user.password_reset_requested", (event) => {
    void svc.create({
      userId:  event.userId,
      type:    "warning",
      title:   "Password Reset Requested",
      message: "A password reset link has been sent to your email address. If you did not request this, please secure your account.",
      metadata: { email: event.email },
    });
    logger.info("[notifications] user.password_reset_requested notification queued.", { userId: event.userId });
  });

  // ── SYSTEM EVENTS ─────────────────────────────────────────────────────────

  systemEmitter.on<LoginSuccessEvent>("login.success", (event) => {
    void svc.create({
      userId:  event.userId,
      type:    "security",
      title:   "New Sign-In",
      message: `You signed in to your Hermes OS account${event.ip ? ` from ${event.ip}` : ""}.`,
      metadata: { email: event.email, ip: event.ip },
    });
  });

  systemEmitter.on<LoginFailedEvent>("login.failed", (event) => {
    void svc.create({
      userId:  event.userId,
      type:    "security",
      title:   "Failed Sign-In Attempt",
      message: `A failed sign-in attempt was detected on your account${event.ip ? ` from ${event.ip}` : ""}.`,
      metadata: { email: event.email, ip: event.ip },
    });
  });

  systemEmitter.on<SystemAlertEvent>("system.alert", (event) => {
    if (!event.userId) return;
    const type = event.severity === "error" ? "error"
      : event.severity === "warning" ? "warning"
      : "info";
    void svc.create({
      userId:  event.userId,
      type,
      title:   event.title,
      message: event.message,
    });
  });

  systemEmitter.on<EmailSentEvent>("email.sent", (event) => {
    if (!event.userId) return;
    void svc.create({
      userId:  event.userId,
      type:    "info",
      title:   "Email Sent",
      message: `An email was successfully sent to ${event.to}.`,
      metadata: { to: event.to, subject: event.subject },
    });
  });

  systemEmitter.on<EmailFailedEvent>("email.failed", (event) => {
    if (!event.userId) return;
    void svc.create({
      userId:  event.userId,
      type:    "warning",
      title:   "Email Delivery Failed",
      message: `We were unable to deliver an email to ${event.to}. Please check your email address.`,
      metadata: { to: event.to, subject: event.subject, error: event.error },
    });
  });

  logger.info("[notifications] Notification event handlers registered.");
}
