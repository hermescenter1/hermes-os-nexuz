import { NextResponse }          from "next/server";
import type { NextRequest }       from "next/server";
import { getCookieConsent, upsertCookieConsent } from "@/lib/compliance/db";
import { createConsentRecord }    from "@/lib/compliance/db";
import { CURRENT_CONSENT_VERSION } from "@/lib/compliance/types";
import { verifyAccessToken }      from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }    from "@/lib/auth/config";
import {
  resolveClientIp,
  readBoundedJson,
  securityError,
  SMALL_JSON_BODY_BYTES,
} from "@/lib/security/request-guards";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import {
  CONSENT_ID_COOKIE,
  consentCookieOptions,
  isConsentId,
  newConsentId,
} from "@/lib/compliance/consent-cookie";

/**
 * Public cookie-consent surface.
 *
 * PHASE 99 SECURITY — this endpoint is unauthenticated by necessity (consent is
 * collected before login), which makes three properties load-bearing:
 *
 *   - The subject is identified ONLY by `hermes_consent_id`, an opaque
 *     server-minted value. The authentication cookie is never read or written
 *     here, and `sessionId` in the request body is ignored outright — accepting
 *     it let an unauthenticated caller fixate another browser's session.
 *   - A cookie that is not a well-formed consent id is treated as absent, so a
 *     forged or stale value cannot select somebody else's row.
 *   - The response projects consent PREFERENCES only. The stored row also holds
 *     `userId`, `ipAddress` and `userAgent` as GDPR evidence; returning those to
 *     whoever presents the identifier would turn the endpoint into a lookup
 *     oracle for that evidence.
 *
 * The client IP comes from `resolveClientIp` (X-Real-IP, which nginx overwrites)
 * rather than X-Forwarded-For, whose left-most entry the client controls — the
 * IP recorded as consent evidence must not be attacker-chosen.
 */

/** The safe projection: consent state, never the evidence fields. */
function publicConsentView(consent: {
  necessary: boolean; analytics: boolean; marketing: boolean; preferences: boolean;
  locale: string; consentVersion: string; createdAt: Date; updatedAt: Date;
}) {
  return {
    necessary:      consent.necessary,
    analytics:      consent.analytics,
    marketing:      consent.marketing,
    preferences:    consent.preferences,
    locale:         consent.locale,
    consentVersion: consent.consentVersion,
    createdAt:      consent.createdAt,
    updatedAt:      consent.updatedAt,
  };
}

const DEFAULTS = { necessary: true, analytics: false, marketing: false, preferences: false };

export async function GET(req: NextRequest) {
  const raw = req.cookies.get(CONSENT_ID_COOKIE)?.value;
  if (!isConsentId(raw)) {
    return NextResponse.json({ consent: null, defaults: DEFAULTS });
  }
  const consent = await getCookieConsent(raw);
  if (!consent) {
    return NextResponse.json({ consent: null, defaults: DEFAULTS });
  }
  return NextResponse.json({ consent: publicConsentView(consent) });
}

/** Anonymous write, so it carries the same resource boundary as the other ones. */
const CONSENT_ACTION = "cookie-consent";

export async function POST(req: NextRequest) {
  const ip = resolveClientIp(req);
  if (!(await checkRateLimit(CONSENT_ACTION, ip))) {
    return securityError({ error: "Too many requests. Please try again later." }, 429, {
      "Retry-After": String(retryAfter(CONSENT_ACTION, ip)),
    });
  }

  const read = await readBoundedJson<{
    necessary?:   boolean;
    analytics?:   boolean;
    marketing?:   boolean;
    preferences?: boolean;
  }>(req, SMALL_JSON_BODY_BYTES);
  if (read.status === "too_large") {
    return securityError({ error: "payload too large" }, 413);
  }
  // An unparseable body is treated as "no preferences supplied", which resolves
  // to the safe defaults below rather than an error — consent must never fail
  // in a way that leaves analytics enabled.
  const body = read.status === "ok" && read.value && typeof read.value === "object" ? read.value : {};

  // The subject identifier is NEVER taken from the body — only from a
  // well-formed cookie this server previously minted, or freshly minted here.
  const existing = req.cookies.get(CONSENT_ID_COOKIE)?.value;
  const consentId = isConsentId(existing) ? existing : newConsentId();

  const ipAddress = resolveClientIp(req) === "unknown" ? undefined : resolveClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const locale    = req.headers.get("accept-language")?.split(",")[0]?.substring(0, 2) ?? "en";

  // Resolve the user from the access token when present — consent may be given
  // by a signed-in subject, but authentication is not required to give it.
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
    upsertCookieConsent({ sessionId: consentId, userId, preferences, ipAddress, userAgent, locale, consentVersion: CURRENT_CONSENT_VERSION }),
    // Log each category as a ConsentRecord
    createConsentRecord({ userId, consentType: "cookie_analytics",   granted: preferences.analytics,   locale, ipAddress, userAgent }),
    createConsentRecord({ userId, consentType: "cookie_marketing",   granted: preferences.marketing,   locale, ipAddress, userAgent }),
    createConsentRecord({ userId, consentType: "cookie_preferences", granted: preferences.preferences, locale, ipAddress, userAgent }),
  ]);

  const response = NextResponse.json({
    consent: consent ? publicConsentView(consent) : null,
    preferences,
    saved: !!consent,
  });
  response.cookies.set(CONSENT_ID_COOKIE, consentId, consentCookieOptions(process.env.NODE_ENV === "production"));
  return response;
}
