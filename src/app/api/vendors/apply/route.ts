import { NextResponse }               from "next/server";
import { z }                          from "zod";
import { createOnboardingRequest }    from "@/lib/vendors/db";
import { cookies }                    from "next/headers";

export const dynamic = "force-dynamic";

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

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
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

  const jar       = await cookies();
  const sessionId = jar.get("hermes_session")?.value ?? undefined;

  const result = await createOnboardingRequest(parsed.data, sessionId);
  if (!result) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: result.id }, { status: 201 });
}
