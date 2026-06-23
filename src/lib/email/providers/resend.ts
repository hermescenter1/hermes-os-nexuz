import { Resend } from "resend";
import { logger } from "@/lib/logger";
import type { EmailPayload, EmailProvider, EmailSendResult } from "./types";

export class ResendProvider implements EmailProvider {
  readonly name = "resend";
  private client: Resend;
  private from:   string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is required for the Resend email provider");
    this.client = new Resend(apiKey);
    this.from   = process.env.EMAIL_FROM ?? "Hermes OS <noreply@hermesos.dev>";
  }

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    try {
      const { data, error } = await this.client.emails.send({
        from:    this.from,
        to:      payload.to,
        subject: payload.subject,
        html:    payload.html,
        text:    payload.text,
      });

      if (error) {
        logger.error("[email:resend] API returned error.", {
          errorName: error.name,
          to:        payload.to,
          subject:   payload.subject,
        });
        return { sent: false, provider: "resend", error: error.name };
      }

      logger.info("[email.sent] Email delivered via Resend.", {
        to:        payload.to,
        subject:   payload.subject,
        messageId: data?.id,
      });
      return { sent: true, provider: "resend", messageId: data?.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[email.failed] Resend request threw.", { error: msg, to: payload.to });
      return { sent: false, provider: "resend", error: msg };
    }
  }
}
