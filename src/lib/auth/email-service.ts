/**
 * Auth email facade.
 *
 * Thin wrapper over the new EmailService infrastructure.
 * Kept for backward compatibility — prefer emitting auth events via
 * authEmitter in normal auth flows (see src/lib/events/auth/).
 */

export { listMockEmails } from "@/lib/email/providers/console";
export type { EmailSendResult } from "@/lib/email/service";

import { getEmailService } from "@/lib/email/service";
import { verificationEmailHtml, verificationEmailText } from "@/lib/email/templates/verification";
import { passwordResetEmailHtml, passwordResetEmailText } from "@/lib/email/templates/password-reset";
import { verificationEmailSubject, passwordResetEmailSubject } from "@/lib/email/templates/email-locale";
import { VERIFICATION_TOKEN_TTL, PASSWORD_RESET_TTL } from "./config";

const VERIFICATION_HOURS = VERIFICATION_TOKEN_TTL / 3600;
const RESET_HOURS        = PASSWORD_RESET_TTL / 3600;

export async function sendVerificationEmail(
  to:      string,
  name:    string,
  token:   string,
  baseUrl: string,
  locale?: string,
) {
  const link = `${baseUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
  return getEmailService().send({
    to,
    subject: verificationEmailSubject(locale),
    html: verificationEmailHtml({ name, verificationLink: link, expiresInHours: VERIFICATION_HOURS, locale }),
    text: verificationEmailText({ name, verificationLink: link, expiresInHours: VERIFICATION_HOURS, locale }),
  });
}

export async function sendPasswordResetEmail(
  to:      string,
  name:    string,
  token:   string,
  baseUrl: string,
  locale?: string,
) {
  const link = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
  return getEmailService().send({
    to,
    subject: passwordResetEmailSubject(locale),
    html: passwordResetEmailHtml({ name, resetLink: link, expiresInHours: RESET_HOURS, locale }),
    text: passwordResetEmailText({ name, resetLink: link, expiresInHours: RESET_HOURS, locale }),
  });
}
