import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth/service";
import { signSession } from "@/lib/auth/crypto";
import { SESSION_COOKIE, isAuthConfigured } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";

/**
 * /api/auth — credentials login/logout + session check (Phase 12A).
 * Never crashes when auth is unconfigured: returns authConfigured:false so the
 * UI can show a setup-required state instead of failing.
 */

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ authConfigured: isAuthConfigured(), user });
}

export async function POST(req: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "auth-not-configured", authConfigured: false },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "login");

  if (action === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  }

  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }

  const user = await authenticate(email, password);
  if (!user) {
    await recordAuditEvent({
      action: AUDIT_ACTIONS.LOGIN_FAILURE,
      entityType: "auth",
      metadata: { email },
    });
    return NextResponse.json({ error: "invalid-credentials" }, { status: 401 });
  }

  await recordAuditEvent({
    userId: user.id,
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    entityType: "auth",
    entityId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  const token = signSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    iat: Date.now(),
  });

  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return res;
}
