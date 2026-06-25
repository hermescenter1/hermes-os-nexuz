import { NextResponse }             from "next/server";
import { getCurrentUser }           from "@/lib/auth/session";
import { getPrisma }                from "@/lib/db/prisma";
import { z }                        from "zod";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  websiteUrl:    z.string().url().optional().or(z.literal("")),
  contactEmail:  z.string().email().optional(),
  contactPhone:  z.string().max(30).optional(),
  descriptionEn: z.string().max(3000).optional(),
  descriptionFa: z.string().max(3000).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = await getPrisma();
  if (!db)   return NextResponse.json({ profile: null });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = await (db as any).vendorProfile.findFirst({
      where: { userId: user.id, deletedAt: null },
      include: {
        category:     true,
        capabilities: true,
        services:     { where: { isActive: true } },
        products:     { where: { isActive: true } },
        _count:       { select: { services: true, products: true } },
      },
    });
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ profile: null });
  }
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed" }, { status: 422 });
  }

  const db = await getPrisma();
  if (!db) return NextResponse.json({ error: "db_unavailable" }, { status: 503 });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).vendorProfile.updateMany({
      where: { userId: user.id, deletedAt: null },
      data:  parsed.data,
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
