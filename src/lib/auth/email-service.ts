/**
 * Email service — mock provider (Phase 28).
 * Logs emails via structured logger and stores them in an in-process buffer.
 * Replace with a real provider (Resend, SendGrid, SES) by swapping this module.
 */

import { logger } from "@/lib/logger";

export interface EmailMessage {
  to:      string;
  subject: string;
  html:    string;
  text:    string;
  sentAt:  string;
}

const buffer: EmailMessage[] = [];

function emailBuffer(): EmailMessage[] {
  const g = globalThis as unknown as { __hermesEmails?: EmailMessage[] };
  g.__hermesEmails ??= [];
  return g.__hermesEmails;
}

async function send(msg: EmailMessage): Promise<void> {
  const buf = emailBuffer();
  buf.unshift(msg);
  if (buf.length > 100) buf.length = 100;

  logger.info("[email] Mock email (console mode — not delivered)", {
    to:      msg.to,
    subject: msg.subject,
    body:    msg.text,
  });
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
  baseUrl: string
): Promise<void> {
  const link = `${baseUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
  await send({
    to,
    subject: "Verify your Hermes OS email",
    text: `Hi ${name},\n\nVerify your email: ${link}\n\nThis link expires in 24 hours.\n`,
    html: `<p>Hi ${name},</p><p>Verify your email: <a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
    sentAt: new Date().toISOString(),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
  baseUrl: string
): Promise<void> {
  const link = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
  await send({
    to,
    subject: "Reset your Hermes OS password",
    text: `Hi ${name},\n\nReset your password: ${link}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.\n`,
    html: `<p>Hi ${name},</p><p>Reset your password: <a href="${link}">${link}</a></p><p>Expires in 1 hour.</p>`,
    sentAt: new Date().toISOString(),
  });
}

/** List recent mock emails (for admin debug). */
export function listMockEmails(): EmailMessage[] {
  return emailBuffer().slice(0, 20);
}

void buffer; // suppress unused warning (in-process only path)
