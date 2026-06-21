/**
 * Email service (Phase 28 + launch fix).
 * Dispatches to the provider selected by EMAIL_PROVIDER env var.
 *
 * Providers:
 *   console (default) — logs the email to stdout; no real delivery.
 *   smtp              — delivers via SMTP using SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS.
 *
 * The returned EmailSendResult.sent flag is ALWAYS truthful — callers must
 * communicate the actual delivery state to the user rather than claiming
 * success when none occurred.
 */

import nodemailer from "nodemailer";
import { logger } from "@/lib/logger";

export interface EmailMessage {
  to:      string;
  subject: string;
  html:    string;
  text:    string;
  sentAt:  string;
}

export type EmailSendMode =
  | "console"
  | "smtp"
  | "smtp-unconfigured"
  | "smtp-error";

export interface EmailSendResult {
  sent: boolean;
  mode: EmailSendMode;
}

function emailBuffer(): EmailMessage[] {
  const g = globalThis as unknown as { __hermesEmails?: EmailMessage[] };
  g.__hermesEmails ??= [];
  return g.__hermesEmails;
}

function getProvider(): string {
  return (process.env.EMAIL_PROVIDER ?? "console").toLowerCase().trim();
}

// ─── Console provider ────────────────────────────────────────────────────────

function sendViaConsole(msg: EmailMessage): EmailSendResult {
  const buf = emailBuffer();
  buf.unshift(msg);
  if (buf.length > 100) buf.length = 100;

  // Emit the link at INFO level so developers can copy it from stdout without
  // needing access to the mailbox.  NEVER pretend this was delivered.
  logger.info(
    "[email:console] Development mode — email NOT delivered. Copy the link below.",
    { to: msg.to, subject: msg.subject, body: msg.text },
  );

  return { sent: false, mode: "console" };
}

// ─── SMTP provider ───────────────────────────────────────────────────────────

async function sendViaSMTP(msg: EmailMessage): Promise<EmailSendResult> {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM ?? "noreply@example.com";

  if (!host || !user || !pass) {
    logger.warn("[email:smtp] SMTP not fully configured — SMTP_HOST, SMTP_USER, SMTP_PASS are all required.", {
      hasHost: !!host,
      hasUser: !!user,
      hasPass: !!pass,
    });
    return { sent: false, mode: "smtp-unconfigured" };
  }

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { type: "LOGIN", user, pass },
      connectionTimeout: 15_000,
      greetingTimeout:   10_000,
    });

    await transport.sendMail({
      from,
      to:      msg.to,
      subject: msg.subject,
      text:    msg.text,
      html:    msg.html,
    });

    logger.info("[email:smtp] Sent.", { to: msg.to, subject: msg.subject });
    return { sent: true, mode: "smtp" };
  } catch (err) {
    logger.error("[email:smtp] Send failed.", { error: String(err), to: msg.to });
    return { sent: false, mode: "smtp-error" };
  }
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

async function send(msg: EmailMessage): Promise<EmailSendResult> {
  const provider = getProvider();
  if (provider === "smtp") return sendViaSMTP(msg);
  return sendViaConsole(msg);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function sendVerificationEmail(
  to:      string,
  name:    string,
  token:   string,
  baseUrl: string,
): Promise<EmailSendResult> {
  const link = `${baseUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
  return send({
    to,
    subject: "Verify your Hermes OS email",
    text: `Hi ${name},\n\nVerify your email:\n${link}\n\nThis link expires in 24 hours.\n`,
    html: `<p>Hi ${name},</p><p>Verify your email: <a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
    sentAt: new Date().toISOString(),
  });
}

export async function sendPasswordResetEmail(
  to:      string,
  name:    string,
  token:   string,
  baseUrl: string,
): Promise<EmailSendResult> {
  const link = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
  return send({
    to,
    subject: "Reset your Hermes OS password",
    text: `Hi ${name},\n\nReset your password:\n${link}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.\n`,
    html: `<p>Hi ${name},</p><p>Reset your password: <a href="${link}">${link}</a></p><p>Expires in 1 hour.</p>`,
    sentAt: new Date().toISOString(),
  });
}

/** List recent console-buffered emails (for admin debug). */
export function listMockEmails(): EmailMessage[] {
  return emailBuffer().slice(0, 20);
}
