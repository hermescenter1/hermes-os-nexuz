import { NextResponse }             from "next/server";
import { getCurrentUser }           from "@/lib/auth/session";
import { can }                      from "@/lib/auth/roles";
import { adminUpdateVendorProfile } from "@/lib/vendors/db";
import { z }                        from "zod";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  nameEn:           z.string().min(1).optional(),
  nameFa:           z.string().optional(),
  websiteUrl:       z.string().url().optional().or(z.literal("")),
  status:           z.enum(["APPROVED", "SUSPENDED", "REJECTED"]).optional(),
  tier:             z.enum(["PREMIUM", "CERTIFIED", "STANDARD"]).optional(),
  isFeatured:       z.boolean().optional(),
  isVerified:       z.boolean().optional(),
  complianceStatus: z.enum(["PENDING", "COMPLIANT", "NON_COMPLIANT", "UNDER_REVIEW", "EXEMPT"]).optional(),
  descriptionEn:    z.string().max(3000).optional(),
  descriptionFa:    z.string().max(3000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user)                    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin")) return NextResponse.json({ error: "forbidden" },   { status: 403 });

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const ok = await adminUpdateVendorProfile(id, parsed.data as Record<string, unknown>);
  if (!ok) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  return NextResponse.json({ success: true });
}
