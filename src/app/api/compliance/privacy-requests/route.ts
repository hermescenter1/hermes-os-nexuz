import { NextResponse }          from "next/server";
import type { NextRequest }       from "next/server";
import { verifyAccessToken }      from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }    from "@/lib/auth/config";
import {
  createPrivacyRequest,
  getPrivacyRequests,
} from "@/lib/compliance/db";
import { requireComplianceOrgScope } from "@/lib/compliance/authz";
import type { PrivacyRequestType } from "@/lib/compliance/types";
import { resolveClientIp }          from "@/lib/security/request-guards";

const VALID_TYPES: PrivacyRequestType[] = [
  "DATA_EXPORT", "DATA_DELETION", "CONSENT_WITHDRAWAL",
  "ACCESS_REQUEST", "CORRECTION_REQUEST", "RESTRICTION", "OBJECTION", "OTHER",
];

/**
 * List the caller's organization's privacy requests.
 *
 * SECURITY (Phase 97) — replaces the legacy `resolveAdmin` helper (which trusted
 * the JWT role claim and picked an arbitrary first org for a multi-org admin)
 * with the authoritative `requireComplianceOrgScope`: the org is derived
 * server-side, a multi-org actor fails closed (409) instead of leaking an
 * arbitrary tenant, and `view_compliance` is enforced. UNASSIGNED requests
 * (organizationId == null) are never returned here — they live in the platform
 * triage queue and require the platform boundary.
 */
export async function GET(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "view_compliance", "compliance.privacy_request.list");
  if (!scope.ok) {
    return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  }
  const requests = await getPrivacyRequests({ organizationId: scope.organizationId });
  return NextResponse.json({ requests, total: requests.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    requestType:  string;
    email:        string;
    description?: string;
    locale?:      string;
  };

  if (!body.email || !body.requestType) {
    return NextResponse.json({ error: "email and requestType are required" }, { status: 400 });
  }
  if (!VALID_TYPES.includes(body.requestType as PrivacyRequestType)) {
    return NextResponse.json({ error: "Invalid requestType" }, { status: 400 });
  }

  // PHASE 99.6 (P99-INT-020) — this IP is persisted as compliance EVIDENCE
  // (consent proof / privacy-request provenance). The left-most X-Forwarded-For
  // entry is client-controlled because nginx APPENDS to XFF, so a caller could
  // choose the address recorded against their own consent or erasure request,
  // making the evidence forgeable. resolveClientIp reads only X-Real-IP, which
  // the proxy overwrites with the real peer. "unknown" is stored as absent
  // rather than as a literal, so a missing value is never mistaken for a fact.
  const resolvedIp = resolveClientIp(req);
  const ipAddress  = resolvedIp === "unknown" ? undefined : resolvedIp;
  const userAgent = req.headers.get("user-agent") ?? undefined;

  // Resolve userId if authenticated
  let userId: string | undefined;
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (at) {
    const payload = await verifyAccessToken(at);
    if (payload?.sub) userId = payload.sub;
  }

  const request = await createPrivacyRequest({
    userId:      userId ?? null,
    requestType: body.requestType as PrivacyRequestType,
    email:       body.email.toLowerCase().trim(),
    description: body.description,
    locale:      body.locale ?? "en",
    ipAddress,
    userAgent,
  });

  if (!request) return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });

  return NextResponse.json({
    request,
    message: "Your privacy request has been received. We will process it within 30 days.",
  });
}
