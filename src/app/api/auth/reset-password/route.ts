import { NextResponse } from "next/server";
import { resetPasswordSchema }        from "@/lib/auth/password-policy";
import { completePasswordReset }      from "@/lib/auth/password-reset";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit("reset-password", ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later.",
        retryAfterSeconds: retryAfter("reset-password", ip) },
      { status: 429 }
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

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
