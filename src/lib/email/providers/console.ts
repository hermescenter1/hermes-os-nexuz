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

    // PHASE 90: the body is NEVER logged. Verification and password-reset
    // mails carry single-use tokens in their links, and this provider is the
    // fallback whenever no real provider is configured — including production
    // misconfiguration — so logging the body would write live credentials to
    // stdout and any log aggregator. The buffered copy above still holds the
    // full text for local development; read it via listMockEmails() (exposed
    // through the dev-only mock-mailbox surface), not from the log stream.
    logger.info("[email:console] Development mode — email NOT delivered.", {
      to:        payload.to,
      subject:   payload.subject,
      bodyChars: payload.text.length,
      hint:      "Body withheld from logs; use the mock mailbox to read it.",
    });

    return Promise.resolve({ sent: false, provider: "console" });
  }
}

export function listMockEmails(): BufferedEmail[] {
  return emailBuffer().slice(0, 20);
}
