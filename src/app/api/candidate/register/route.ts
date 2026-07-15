import { NextResponse }    from "next/server";
import { getPrisma }       from "@/lib/db/prisma";
import { hashArgon2 }      from "@/lib/auth/argon2-wrapper";
import { setAuthCookies }  from "@/lib/auth/token-session";
import { createCandidate } from "@/lib/ats/db";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import {
  resolveClientIp,
  isJsonContentType,
  readBoundedTextBody,
  securityError,
} from "@/lib/security/request-guards";

const REGISTER_ACTION = "candidate-register";
const MAX_BODY_BYTES = 16 * 1024;

interface RegisterBody {
  name:               string;
  email:              string;
  password:           string;
  phone?:             string;
  location?:          string;
  skills?:            string[];
  workAuthorization?: string;
}

export async function POST(req: Request) {
  // Phase 86C4B2B1D-SECURITY-8: public self-registration that creates a User
  // and an ATS candidate. Add IP rate limiting + Content-Type + bounded body
  // BEFORE any parse or write, to curb automated account/candidate spam.
  const ip = resolveClientIp(req);
  if (!(await checkRateLimit(REGISTER_ACTION, ip))) {
    return securityError({ error: "Too many registration attempts. Please try again later." }, 429, {
      "Retry-After": String(retryAfter(REGISTER_ACTION, ip)),
    });
  }
  if (!isJsonContentType(req)) {
    return securityError({ error: "unsupported media type" }, 415);
  }
  const read = await readBoundedTextBody(req, MAX_BODY_BYTES);
  if (read.status === "too_large") {
    return securityError({ error: "payload too large" }, 413);
  }
  if (read.status === "error") {
    return NextResponse.json({ error: "invalid request body" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  let body: RegisterBody;
  try {
    body = JSON.parse(read.text) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const { name, email, password } = body;

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "name, email, and password are required" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const db = await getPrisma();
  if (!db) {
    return NextResponse.json(
      { error: "Registration requires database mode" },
      { status: 503 }
    );
  }

  const userModel = (db as Record<string, unknown>).user as {
    findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
    create:     (a: unknown) => Promise<Record<string, unknown>>;
  };

  const normalEmail = email.toLowerCase().trim();

  const existing = await userModel.findUnique({ where: { email: normalEmail } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const passwordHash = await hashArgon2(password);

  const user = await userModel.create({
    data: {
      name,
      email:         normalEmail,
      passwordHash,
      role:          "candidate",
      emailVerified: false,
    },
  });

  const userId = String(user.id);

  const candidate = await createCandidate({
    userId,
    email:             normalEmail,
    name,
    phone:             body.phone,
    location:          body.location,
    skills:            body.skills,
    workAuthorization: body.workAuthorization,
  });

  // Issue tokens + set cookies so the candidate is immediately logged in
  await setAuthCookies(
    { id: userId, email: normalEmail, role: "candidate", name },
    false
  );

  return NextResponse.json(
    { ok: true, userId, candidateId: candidate?.id ?? null },
    { status: 201 }
  );
}
