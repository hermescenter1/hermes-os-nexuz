import { logger } from "@/lib/logger";
import { ConsoleProvider } from "./providers/console";
import { ResendProvider } from "./providers/resend";
import type { EmailPayload, EmailProvider, EmailSendResult } from "./providers/types";

export type { EmailPayload, EmailSendResult };

const MAX_RETRIES  = 3;
const BASE_DELAY   = 1_000; // ms — doubles each retry: 1s, 2s, 4s

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPrimaryProvider(): EmailProvider {
  const name = (process.env.EMAIL_PROVIDER ?? "console").toLowerCase().trim();
  logger.info("[email] Provider selected.", { provider: name });

  if (name === "resend") {
    try {
      return new ResendProvider();
    } catch (err) {
      logger.warn("[email] Resend initialisation failed — falling back to console.", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return new ConsoleProvider();
}

async function sendWithRetry(
  provider: EmailProvider,
  payload: EmailPayload,
): Promise<EmailSendResult> {
  let lastResult: EmailSendResult = { sent: false, provider: provider.name };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = BASE_DELAY * Math.pow(2, attempt - 1);
      logger.info("[email] Retrying send.", {
        attempt:     attempt + 1,
        maxAttempts: MAX_RETRIES,
        provider:    provider.name,
        delayMs,
      });
      await sleep(delayMs);
    }

    lastResult = await provider.send(payload);
    if (lastResult.sent) return lastResult;
  }

  return lastResult;
}

class EmailService {
  private primary:  EmailProvider;
  private fallback: ConsoleProvider;

  constructor() {
    this.primary  = buildPrimaryProvider();
    this.fallback = new ConsoleProvider();
  }

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    try {
      const result = await sendWithRetry(this.primary, payload);
      if (result.sent) return result;

      if (this.primary.name !== "console") {
        logger.warn("[email] Primary provider exhausted — using console fallback.", {
          primary: this.primary.name,
          to:      payload.to,
          subject: payload.subject,
        });
        return this.fallback.send(payload);
      }

      logger.error("[email.failed] All delivery attempts failed.", {
        provider: this.primary.name,
        to:       payload.to,
      });
      return result;
    } catch (err) {
      logger.error("[email.failed] EmailService caught unexpected error.", {
        error: err instanceof Error ? err.message : String(err),
      });
      return { sent: false, provider: "error", error: String(err) };
    }
  }
}

// Module-level singleton — survives Next.js module caching
let _instance: EmailService | null = null;

export function getEmailService(): EmailService {
  _instance ??= new EmailService();
  return _instance;
}
