import { createTransport } from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from "@/lib/logger";
import type {
  EmailPayload,
  EmailProvider,
  EmailSendResult,
} from "./types";

export class SmtpProvider implements EmailProvider {
  readonly name = "smtp";

  private transporter: Transporter;
  private from: string;
  private replyTo?: string;

  constructor() {
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT ?? "465");
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASSWORD;
    const secure =
      (process.env.SMTP_SECURE ?? "true").toLowerCase() === "true";

    if (!host) throw new Error("SMTP_HOST is required");
    if (!user) throw new Error("SMTP_USER is required");
    if (!password) throw new Error("SMTP_PASSWORD is required");

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("SMTP_PORT is invalid");
    }

    this.from =
      process.env.EMAIL_FROM ??
      "Hermes OS <noreply@hermesnovin.com>";

    this.replyTo =
      process.env.EMAIL_REPLY_TO?.trim() || undefined;

    this.transporter = createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass: password,
      },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: payload.to,
        replyTo: this.replyTo,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });

      logger.info("[email.sent] Email delivered via SMTP.", {
        to: payload.to,
        subject: payload.subject,
        messageId: info.messageId,
      });

      return {
        sent: true,
        provider: "smtp",
        messageId: info.messageId,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      logger.error("[email.failed] SMTP delivery failed.", {
        error: message,
        to: payload.to,
        subject: payload.subject,
      });

      return {
        sent: false,
        provider: "smtp",
        error: message,
      };
    }
  }
}
