import { NextResponse } from "next/server";

/**
 * Phase 81A: public unrestricted self-registration is disabled.
 * Account creation now happens only after an access request (see
 * /api/auth/access-request) is reviewed and approved by an admin —
 * no active User is ever created from a public POST here.
 * The response is intentionally generic and does not confirm or
 * deny anything about the request itself.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Public registration is not available. Please request access." },
    { status: 403 },
  );
}
