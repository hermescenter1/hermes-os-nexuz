import { NextResponse }               from "next/server";
import type { NextRequest }            from "next/server";
import { z }                          from "zod";
import { createOnboardingRequest }    from "@/lib/vendors/db";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import {
  resolveClientIp,
  isJsonContentType,
  readBoundedTextBody,
  securityError,
} from "@/lib/security/request-guards";

export const dynamic = "force-dynamic";

/**
 * PHASE 99 SECURITY — this anonymous endpoint had none of the abuse controls its
 * direct analogue `POST /api/careers/apply` already carried: no rate limit, no
 * media-type check and no bounded body, while accepting two 3000-character
 * description fields per insert. It also read the raw `hermes_session`
 * authentication cookie and persisted it on the onboarding row, putting a live
 * session credential at rest next to applicant contact details.
 */
const APPLY_ACTION = "vendor-apply";
const MAX_BODY_BYTES = 32 * 1024;

const VENDOR_TYPES = [
  "TECHNOLOGY_PROVIDER",
  "SYSTEM_INTEGRATOR",
  "SERVICE_PROVIDER",
  "MANUFACTURER",
  "DISTRIBUTOR",
  "CONSULTANT",
  "TRAINING_PROVIDER",
] as const;

const Schema = z.object({
  companyNameEn:       z.string().min(2).max(200),
  companyNameFa:       z.string().max(200).optional(),
  websiteUrl:          z.string().url().optional().or(z.literal("").transform(() => undefined)),
  headquartersCity:    z.string().max(100).optional(),
  headquartersCountry: z.string().max(100).optional(),
  foundedYear:         z.number().int().min(1900).max(2100).optional(),
  employeeCount:       z.string().optional(),
  contactNameEn:       z.string().min(2).max(200),
  contactNameFa:       z.string().max(200).optional(),
  contactEmail:        z.string().email(),
  contactPhone:        z.string().max(30).optional(),
  contactTitle:        z.string().max(100).optional(),
  vendorType:          z.enum(VENDOR_TYPES),
  categorySlug:        z.string().optional(),
  servicesOffered:     z.array(z.string()).default([]),
  industrialExpertise: z.array(z.string()).default([]),
  regionsServed:       z.array(z.string()).default([]),
  certifications:      z.array(z.string()).default([]),
  companyDescEn:       z.string().max(3000).optional(),
  companyDescFa:       z.string().max(3000).optional(),
  privacyAccepted:     z.boolean().refine((v) => v, { message: "Privacy policy must be accepted" }),
  termsAccepted:       z.boolean().refine((v) => v, { message: "Terms must be accepted" }),
  gdprAccepted:        z.boolean().refine((v) => v, { message: "GDPR consent required" }),
});

export async function POST(req: NextRequest) {
  const ip = resolveClientIp(req);
  if (!(await checkRateLimit(APPLY_ACTION, ip))) {
    return securityError({ error: "Too many applications. Please try again later." }, 429, {
      "Retry-After": String(retryAfter(APPLY_ACTION, ip)),
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
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(read.text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  // The authentication session token is NEVER persisted here. It bought no
  // linkage a support workflow could not get from the contact email, and storing
  // a live credential at rest is a disclosure waiting to happen.
  const result = await createOnboardingRequest(parsed.data, undefined);
  if (!result) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: result.id }, { status: 201 });
}
