import { NextResponse } from "next/server";
import { z }            from "zod";
import { verifyEmail }  from "@/lib/auth/verification";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";

const schema = z.object({ token: z.string().min(1, "Token required") });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit("verify-email", ip)) {
    return NextResponse.json(
      { error: "Too many attempts.", retryAfterSeconds: retryAfter("verify-email", ip) },
      { status: 429 }
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Token is required" }, { status: 422 });
  }

  const result = await verifyEmail(parsed.data.token);

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
