import { NextRequest, NextResponse } from "next/server";
import { z }                         from "zod";
import { createHash }                from "crypto";
import { getPrisma }                 from "@/lib/db/prisma";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";

/**
 * Phase 81A: Secure Registration Gate.
 *
 * Public visitors on /auth/register submit an access request — this never
 * creates a User. Requests land in the existing SalesLead table (reused,
 * no schema change) tagged source="AUTH_ACCESS_REQUEST" and are reviewed
 * by an admin via /admin/leads. Account creation, if approved, happens
 * out of band — not from this endpoint.
 */

const AccessRequestSchema = z.object({
  fullName:  z.string().trim().min(2).max(100),
  email:     z.string().trim().email().max(200).transform((v) => v.toLowerCase()),
  company:   z.string().trim().max(150).optional().or(z.literal("")),
  roleTitle: z.string().trim().max(100).optional().or(z.literal("")),
  message:   z.string().trim().max(1000).optional().or(z.literal("")),
  locale:    z.string().trim().max(5).optional(),
  // Honeypot: real users leave this empty (hidden via CSS). No max(0) here —
  // that would fail schema validation before the honeypot branch below ever
  // runs, leaking a 400 to bots instead of a silent fake-success response.
  _gotcha: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
           ?? req.headers.get("x-real-ip")
           ?? "unknown";
  const ipHash = createHash("sha256").update(ip + process.env.JWT_ACCESS_SECRET).digest("hex").slice(0, 16);

  if (!await checkRateLimit("access-request", ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again later.",
        retryAfterSeconds: retryAfter("access-request", ip) },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const parsed = AccessRequestSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { ok: false, error: first?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Honeypot check — pretend success so bots don't know they were caught
  if (data._gotcha && data._gotcha.length > 0) {
    return NextResponse.json({ ok: true, message: "Request submitted. If accepted, we will contact you." });
  }

  const prisma = await getPrisma();
  if (!prisma) {
    console.error("[api/auth/access-request] DB unavailable");
    return NextResponse.json({ ok: false, error: "Service temporarily unavailable." }, { status: 503 });
  }

  const note = data.message
    ? `Registration / access request submitted via /auth/register.\n\n${data.message}`
    : "Registration / access request submitted via /auth/register.";

  try {
    await (prisma as never as {
      salesLead: { create: (a: unknown) => Promise<unknown> };
    }).salesLead.create({
      data: {
        fullName:  data.fullName,
        email:     data.email,
        company:   data.company || null,
        roleTitle: data.roleTitle || null,
        interest:  "Access Request",
        message:   note,
        source:    "AUTH_ACCESS_REQUEST",
        locale:    data.locale ?? null,
        status:    "NEW",
        ipHash,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/auth/access-request] DB write error:", msg);
    return NextResponse.json({ ok: false, error: "Service temporarily unavailable." }, { status: 500 });
  }

  // Generic response — never confirms or denies whether this email already
  // has an account, matching the same posture as the login/forgot-password flows.
  return NextResponse.json({
    ok:      true,
    message: "Request submitted. If accepted, we will contact you.",
  });
}
