import { logger } from "@/lib/logger";
import type { EmailPayload, EmailProvider, EmailSendResult } from "./types";

interface BufferedEmail {
  to:      string;
  subject: string;
  text:    string;
  sentAt:  string;
}

function emailBuffer(): BufferedEmail[] {
  const g = globalThis as unknown as { __hermesEmails?: BufferedEmail[] };
  g.__hermesEmails ??= [];
  return g.__hermesEmails;
}

export class ConsoleProvider implements EmailProvider {
  readonly name = "console";

  send(payload: EmailPayload): Promise<EmailSendResult> {
    const buf = emailBuffer();
    buf.unshift({
      to:      payload.to,
      subject: payload.subject,
      text:    payload.text,
      sentAt:  new Date().toISOString(),
    });
    if (buf.length > 100) buf.length = 100;

    logger.info("[email:console] Development mode — email NOT delivered. Copy the link below.", {
      to:      payload.to,
      subject: payload.subject,
      body:    payload.text,
    });

    return Promise.resolve({ sent: false, provider: "console" });
  }
}

export function listMockEmails(): BufferedEmail[] {
  return emailBuffer().slice(0, 20);
}
