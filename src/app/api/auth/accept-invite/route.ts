import { NextResponse } from "next/server";
import { z }            from "zod";
import { passwordSchema }             from "@/lib/auth/password-policy";
import { acceptAccessInvite }         from "@/lib/auth/access-invite";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";

/**
 * Phase 81C: accept an admin-issued access invite. The only public path that
 * creates a User — gated on a single-use, expiring, hash-stored token, and the
 * role is fixed by the invite (non-privileged allowlist), never by the caller.
 * Invalid, expired, used, and already-registered cases all return the same
 * generic code so nothing about accounts or invites can be enumerated.
 */

const AcceptInviteSchema = z
  .object({
    token:           z.string().min(16).max(200),
    password:        passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!await checkRateLimit("accept-invite", ip)) {
    return NextResponse.json(
      { ok: false, code: "rate-limited", error: "Too many attempts. Please try again later.",
        retryAfterSeconds: retryAfter("accept-invite", ip) },
      { status: 429 }
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, code: "invalid-input", error: "Invalid request body." }, { status: 400 }); }

  const parsed = AcceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    // Password-policy feedback is fine to return; nothing here reveals
    // anything about the invite or any account
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { ok: false, code: "invalid-input", error: first?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const result = await acceptAccessInvite(parsed.data.token, parsed.data.password);

  if (!result.ok) {
    if (result.error === "db-unavailable") {
      return NextResponse.json(
        { ok: false, code: "unavailable", error: "Service temporarily unavailable." },
        { status: 503 }
      );
    }
    // One generic message for missing / expired / used / revoked / email-taken
    return NextResponse.json(
      { ok: false, code: "invalid-invite", error: "Invite expired or invalid." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, message: "Account created. You can now sign in." });
}
