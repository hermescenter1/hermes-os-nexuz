import { NextResponse } from "next/server";
import { resetPasswordSchema }        from "@/lib/auth/password-policy";
import { completePasswordReset }      from "@/lib/auth/password-reset";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { resolveClientIp, readBoundedJson, SMALL_JSON_BODY_BYTES }            from "@/lib/security/request-guards";

export async function POST(req: Request) {
  // Phase 93: throttle on the spoof-resistant X-Real-IP (resolveClientIp), not
  // the client-appendable left-most X-Forwarded-For which would let an attacker
  // rotate the header to bypass the reset-password throttle.
  const ip = resolveClientIp(req);
  if (!await checkRateLimit("reset-password", ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later.",
        retryAfterSeconds: retryAfter("reset-password", ip) },
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

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const result = await completePasswordReset(parsed.data.token, parsed.data.password);

  if (!result.ok) {
    const messages: Record<string, string> = {
      "invalid-token":  "Invalid or expired reset link.",
      "expired":        "This reset link has expired. Please request a new one.",
      "already-used":   "This reset link has already been used.",
      "db-unavailable": "Service unavailable. Please try again.",
    };
    return NextResponse.json(
      { error: messages[result.error] ?? "Password reset failed." },
      { status: result.error === "db-unavailable" ? 503 : 400 }
    );
  }

  return NextResponse.json({ ok: true, message: "Password reset successfully. You may now sign in." });
}
