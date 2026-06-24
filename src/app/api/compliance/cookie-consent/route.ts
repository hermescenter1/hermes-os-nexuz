import { NextResponse }          from "next/server";
import type { NextRequest }       from "next/server";
import { getCookieConsent, upsertCookieConsent } from "@/lib/compliance/db";
import { createConsentRecord }    from "@/lib/compliance/db";
import { CURRENT_CONSENT_VERSION } from "@/lib/compliance/types";
import { verifyAccessToken }      from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }    from "@/lib/auth/config";

function getSessionId(req: NextRequest): string {
  return req.cookies.get("hermes_session")?.value ?? `anon_${Date.now()}`;
}

function getClientIp(req: NextRequest): string | undefined {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    undefined
  );
}

export async function GET(req: NextRequest) {
  const sessionId = getSessionId(req);
  const consent   = await getCookieConsent(sessionId);
  if (!consent) {
    return NextResponse.json({
      consent: null,
      defaults: { necessary: true, analytics: false, marketing: false, preferences: false },
    });
  }
  return NextResponse.json({ consent });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    necessary?:   boolean;
    analytics?:   boolean;
    marketing?:   boolean;
    preferences?: boolean;
    sessionId?:   string;
  };

  const sessionId = body.sessionId ?? getSessionId(req);
  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const locale    = req.headers.get("accept-language")?.split(",")[0]?.substring(0, 2) ?? "en";

  // Resolve user from JWT (optional — public route, auth not required)
  let userId: string | undefined;
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (at) {
    const payload = await verifyAccessToken(at);
    if (payload?.sub) userId = payload.sub;
  }

  const preferences = {
    necessary:   true, // always true
    analytics:   body.analytics   ?? false,
    marketing:   body.marketing   ?? false,
    preferences: body.preferences ?? false,
  };

  const [consent] = await Promise.all([
    upsertCookieConsent({ sessionId, userId, preferences, ipAddress, userAgent, locale, consentVersion: CURRENT_CONSENT_VERSION }),
    // Log each category as a ConsentRecord
    createConsentRecord({ userId, consentType: "cookie_analytics",   granted: preferences.analytics,   locale, ipAddress, userAgent }),
    createConsentRecord({ userId, consentType: "cookie_marketing",   granted: preferences.marketing,   locale, ipAddress, userAgent }),
    createConsentRecord({ userId, consentType: "cookie_preferences", granted: preferences.preferences, locale, ipAddress, userAgent }),
  ]);

  const response = NextResponse.json({ consent, preferences, saved: !!consent });
  // Set session cookie if not present
  response.cookies.set("hermes_session", sessionId, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    maxAge:   60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
    path:     "/",
  });
  return response;
}
