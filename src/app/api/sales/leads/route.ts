import { NextRequest, NextResponse } from "next/server";
import { z }                         from "zod";
import { createHash }                from "crypto";
import { getPrisma }                 from "@/lib/db/prisma";

// ── Simple in-memory rate limiter (per hashed IP, fixed window) ──────────────
// Not suitable for multi-instance; acceptable for early sales traffic.
const _rl = new Map<string, { count: number; resetAt: number }>();
const RL_MAX    = 5;
const RL_WINDOW = 10 * 60 * 1000; // 10 minutes

function checkRateLimit(ipHash: string): boolean {
  const now = Date.now();
  const entry = _rl.get(ipHash);
  if (!entry || entry.resetAt < now) {
    _rl.set(ipHash, { count: 1, resetAt: now + RL_WINDOW });
    return true;
  }
  if (entry.count >= RL_MAX) return false;
  entry.count++;
  return true;
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const LeadSchema = z.object({
  fullName:      z.string().trim().min(2).max(100),
  email:         z.string().trim().email().max(200).transform(v => v.toLowerCase()),
  phone:         z.string().trim().max(30).optional().or(z.literal("")),
  company:       z.string().trim().max(150).optional().or(z.literal("")),
  roleTitle:     z.string().trim().max(100).optional().or(z.literal("")),
  country:       z.string().trim().max(80).optional().or(z.literal("")),
  industry:      z.string().trim().max(80).optional().or(z.literal("")),
  companySize:   z.string().trim().max(30).optional().or(z.literal("")),
  interest:      z.string().trim().max(80).optional().or(z.literal("")),
  useCase:       z.string().trim().max(2000).optional().or(z.literal("")),
  preferredDemo: z.string().trim().max(100).optional().or(z.literal("")),
  message:       z.string().trim().max(1000).optional().or(z.literal("")),
  locale:        z.string().trim().max(5).optional(),
  _gotcha:       z.string().max(0).optional(), // honeypot — must be empty
});

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // IP hash for rate limiting only — never stored in plain text
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
           ?? req.headers.get("x-real-ip")
           ?? "unknown";
  const ipHash = createHash("sha256").update(ip + process.env.JWT_ACCESS_SECRET).digest("hex").slice(0, 16);

  if (!checkRateLimit(ipHash)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { ok: false, error: first?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Honeypot check — bots fill hidden fields
  if (data._gotcha && data._gotcha.length > 0) {
    // Pretend success so bots don't know they were caught
    return NextResponse.json({ ok: true, message: "Demo request received." });
  }

  const prisma = await getPrisma();
  if (!prisma) {
    console.error("[api/sales/leads] DB unavailable");
    return NextResponse.json({ ok: false, error: "Service temporarily unavailable." }, { status: 503 });
  }

  try {
    await (prisma as never as {
      salesLead: { create: (a: unknown) => Promise<unknown> };
    }).salesLead.create({
      data: {
        fullName:      data.fullName,
        email:         data.email,
        phone:         data.phone || null,
        company:       data.company || null,
        roleTitle:     data.roleTitle || null,
        country:       data.country || null,
        industry:      data.industry || null,
        companySize:   data.companySize || null,
        interest:      data.interest || null,
        useCase:       data.useCase || null,
        preferredDemo: data.preferredDemo || null,
        message:       data.message || null,
        source:        "WEBSITE",
        locale:        data.locale ?? null,
        status:        "NEW",
        ipHash,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/sales/leads] DB write error:", msg);
    return NextResponse.json({ ok: false, error: "Service temporarily unavailable." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Demo request received." });
}
