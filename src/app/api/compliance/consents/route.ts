import { NextResponse }         from "next/server";
import type { NextRequest }      from "next/server";
import { verifyAccessToken }     from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }   from "@/lib/auth/config";
import {
  createConsentRecord,
  getUserConsentHistory,
  recordLegalAcceptance,
} from "@/lib/compliance/db";

export async function GET(req: NextRequest) {
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!at) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const payload = await verifyAccessToken(at);
  if (!payload?.sub) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const records = await getUserConsentHistory(payload.sub);
  return NextResponse.json({ records, total: records.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    consentType:      string;
    granted:          boolean;
    consentVersion?:  string;
    locale?:          string;
    legalDocumentId?: string;
    candidateId?:     string;
  };

  if (!body.consentType || typeof body.granted !== "boolean") {
    return NextResponse.json({ error: "consentType and granted are required" }, { status: 400 });
  }

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;

  // Resolve authenticated user (optional)
  let userId: string | undefined;
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (at) {
    const payload = await verifyAccessToken(at);
    if (payload?.sub) userId = payload.sub;
  }

  const [record] = await Promise.all([
    createConsentRecord({
      userId:         userId,
      candidateId:    body.candidateId ?? null,
      consentType:    body.consentType,
      consentVersion: body.consentVersion ?? "1.0",
      granted:        body.granted,
      locale:         body.locale ?? "en",
      ipAddress,
      userAgent,
    }),
    // If legalDocumentId provided, also record legal acceptance
    body.legalDocumentId && body.granted && userId
      ? recordLegalAcceptance({
          legalDocumentId: body.legalDocumentId,
          userId,
          candidateId:     body.candidateId ?? null,
          ipAddress,
          userAgent,
          locale:          body.locale ?? "en",
        })
      : Promise.resolve(null),
  ]);

  return NextResponse.json({ record, saved: !!record });
}
