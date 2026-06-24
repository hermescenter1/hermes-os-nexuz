import { NextResponse }          from "next/server";
import type { NextRequest }       from "next/server";
import { verifyAccessToken }      from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }    from "@/lib/auth/config";
import { getPrisma }              from "@/lib/db/prisma";
import {
  createPrivacyRequest,
  getPrivacyRequests,
} from "@/lib/compliance/db";
import type { PrivacyRequestType } from "@/lib/compliance/types";

const VALID_TYPES: PrivacyRequestType[] = [
  "DATA_EXPORT", "DATA_DELETION", "CONSENT_WITHDRAWAL",
  "ACCESS_REQUEST", "CORRECTION_REQUEST",
];

async function resolveAdmin(req: NextRequest) {
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!at) return null;
  const payload = await verifyAccessToken(at);
  if (!payload?.sub) return null;
  if (!["admin", "superadmin"].includes(payload.role as string)) return null;
  const db = await getPrisma();
  if (!db) return null;
  const memberModel = (db as Record<string, unknown>).organizationMember as {
    findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  };
  const member = await memberModel.findFirst({
    where: { userId: payload.sub, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  return member ? { userId: payload.sub, orgId: String(member.organizationId) } : null;
}

export async function GET(req: NextRequest) {
  const ctx = await resolveAdmin(req);
  if (!ctx) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const requests = await getPrivacyRequests({ organizationId: ctx.orgId });
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

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
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
