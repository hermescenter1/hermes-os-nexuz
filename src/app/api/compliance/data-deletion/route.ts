import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { verifyAccessToken }          from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }        from "@/lib/auth/config";
import { createDataDeletionRequest }  from "@/lib/compliance/db";
import { resolveClientIp }          from "@/lib/security/request-guards";

export async function POST(req: NextRequest) {
  const body      = await req.json() as { email?: string; reason?: string; locale?: string };
  // PHASE 99.6 (P99-INT-020) — this IP is persisted as compliance EVIDENCE
  // (consent proof / privacy-request provenance). The left-most X-Forwarded-For
  // entry is client-controlled because nginx APPENDS to XFF, so a caller could
  // choose the address recorded against their own consent or erasure request,
  // making the evidence forgeable. resolveClientIp reads only X-Real-IP, which
  // the proxy overwrites with the real peer. "unknown" is stored as absent
  // rather than as a literal, so a missing value is never mistaken for a fact.
  const resolvedIp = resolveClientIp(req);
  const ipAddress  = resolvedIp === "unknown" ? undefined : resolvedIp;

  let userId: string | undefined;
  let email  = body.email?.toLowerCase().trim();

  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (at) {
    const payload = await verifyAccessToken(at);
    if (payload?.sub) {
      userId = payload.sub;
      email  = email ?? (payload as unknown as Record<string, unknown>).email as string;
    }
  }

  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const request = await createDataDeletionRequest({
    userId:  userId ?? null,
    email,
    reason:  body.reason,
    locale:  body.locale ?? "en",
    ipAddress,
  });

  if (!request) return NextResponse.json({ error: "Failed to submit deletion request" }, { status: 500 });

  return NextResponse.json({
    request,
    message: "Your data deletion request has been received. We will process it within 30 days after identity verification.",
  });
}
