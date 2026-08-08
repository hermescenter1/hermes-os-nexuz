import { NextResponse } from "next/server";
import { z }            from "zod";
import { verifyEmail }  from "@/lib/auth/verification";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { resolveClientIp, readBoundedJson, SMALL_JSON_BODY_BYTES }            from "@/lib/security/request-guards";

const schema = z.object({ token: z.string().min(1, "Token required") });

export async function POST(req: Request) {
  // Phase 93: throttle on the spoof-resistant X-Real-IP (resolveClientIp), not
  // the client-appendable left-most X-Forwarded-For which would let an attacker
  // rotate the header to bypass the verify-email throttle.
  const ip = resolveClientIp(req);
  if (!await checkRateLimit("verify-email", ip)) {
    return NextResponse.json(
      { error: "Too many attempts.", retryAfterSeconds: retryAfter("verify-email", ip) },
      { status: 429 }
    );
  }

  // PHASE 99 — bounded read. A rate limit alone does not stop a permitted
  // request from carrying an arbitrarily large body into the JSON parser, so
  // this anonymous credential endpoint now has an explicit byte ceiling.
  const read = await readBoundedJson(req, SMALL_JSON_BODY_BYTES);
  if (read.status === "too_large") return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  if (read.status === "invalid") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const body: unknown = read.value;

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Token is required" }, { status: 422 });
  }

  const localeMatch = /(?:^|;\s*)NEXT_LOCALE=(fa|en|de)(?:;|$)/.exec(req.headers.get("cookie") ?? "");
  const result = await verifyEmail(parsed.data.token, localeMatch?.[1]);

  if (!result.ok) {
    const messages: Record<string, string> = {
      "invalid-token": "Invalid verification link.",
      "expired":       "This verification link has expired. Please request a new one.",
      "already-used":  "This link has already been used.",
      "db-unavailable":"Service unavailable. Please try again.",
    };
    return NextResponse.json(
      { error: messages[result.error] ?? "Verification failed." },
      { status: result.error === "db-unavailable" ? 503 : 400 }
    );
  }

  return NextResponse.json({ ok: true, message: "Email verified successfully." });
}
