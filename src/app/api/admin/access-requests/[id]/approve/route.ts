import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser }            from "@/lib/auth/session";
import { can }                       from "@/lib/auth/roles";
import {
  createAccessInvite,
  isInvitableRole,
  DEFAULT_INVITE_ROLE,
} from "@/lib/auth/access-invite";

export const dynamic = "force-dynamic";

/**
 * Phase 81C: approve an AUTH_ACCESS_REQUEST lead. Creates a single-use,
 * expiring invite and returns the invite link exactly once — the token is
 * stored only as a hash, so it cannot be shown again. No User is created
 * here; that happens when the invite is accepted.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user)                    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin")) return NextResponse.json({ error: "forbidden" },   { status: 403 });

  const { id } = await params;

  // Role is admin-chosen from the non-privileged allowlist; an unknown or
  // privileged value is refused rather than silently downgraded
  let role = DEFAULT_INVITE_ROLE;
  try {
    const body = await req.json().catch(() => ({})) as { role?: unknown };
    if (body.role !== undefined) {
      if (!isInvitableRole(body.role)) {
        return NextResponse.json({ error: "invalid_role" }, { status: 400 });
      }
      role = body.role;
    }
  } catch {
    /* empty body is fine — default role applies */
  }

  const result = await createAccessInvite(id, user.id, role);

  if (!result.ok) {
    const status =
      result.error === "not-found"          ? 404 :
      result.error === "db-unavailable"     ? 503 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  const base   = (process.env.APP_URL || req.nextUrl.origin).replace(/\/+$/, "");
  const locale = result.leadLocale === "fa" ? "fa" : "en";
  const inviteUrl = `${base}/${locale}/auth/accept-invite?token=${result.plainToken}`;

  return NextResponse.json({
    ok:        true,
    inviteUrl,
    role,
    expiresAt: result.expiresAt.toISOString(),
  });
}
