import { NextResponse } from "next/server";
import { z }            from "zod";
import { registerSchema }              from "@/lib/auth/password-policy";
import { registerUser }                from "@/lib/auth/registration";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!await checkRateLimit("register", ip)) {
    return NextResponse.json(
      { error: "Too many registrations. Please try again later.",
        retryAfterSeconds: retryAfter("register", ip) },
      { status: 429 },
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { name, email, password } = parsed.data;

  const origin  = req.headers.get("origin") ?? "";
  const locale  = req.headers.get("accept-language")?.startsWith("fa") ? "fa" : "en";
  const baseUrl = `${origin}/${locale}`;

  const result = await registerUser(name, email, password, baseUrl);

  if (!result.ok) {
    if (result.error === "email-taken") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    if (result.error === "db-unavailable") {
      return NextResponse.json({ error: "Service unavailable. Please try again." }, { status: 503 });
    }
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, message: "Account created. Please check your email to verify your account." },
    { status: 201 },
  );
}

// Keep z import used
void z.string;
