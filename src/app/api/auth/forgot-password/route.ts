import { NextResponse } from "next/server";
import { forgotPasswordSchema }       from "@/lib/auth/password-policy";
import { initiatePasswordReset }       from "@/lib/auth/password-reset";
import { checkRateLimit, retryAfter }  from "@/lib/auth/rate-limiter";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!await checkRateLimit("forgot-password", ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later.",
        retryAfterSeconds: retryAfter("forgot-password", ip) },
      { status: 429 }
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 422 });
  }

  const origin  = req.headers.get("origin") ?? "";
  const locale  = req.headers.get("accept-language")?.startsWith("fa") ? "fa" : "en";
  const baseUrl = `${origin}/${locale}`;

  // Always returns void — no email enumeration
  await initiatePasswordReset(parsed.data.email, baseUrl);

  return NextResponse.json({
    ok:      true,
    message: "If an account exists with that email, a reset link has been sent.",
  });
}
