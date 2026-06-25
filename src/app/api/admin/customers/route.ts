import { NextRequest, NextResponse } from "next/server";
import { z }                        from "zod";
import { getCurrentUser }           from "@/lib/auth/session";
import { adminListAccounts }        from "@/lib/customer-portal/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const take   = Math.min(Number(req.nextUrl.searchParams.get("take") ?? "100"), 500);
  const skip   = Number(req.nextUrl.searchParams.get("skip") ?? "0");

  const accounts = await adminListAccounts({ status, take, skip });
  return NextResponse.json({ accounts });
}

const createSchema = z.object({
  organizationId: z.string().min(1),
  displayName:    z.string().min(1).max(200),
  industry:       z.string().max(100).optional(),
  region:         z.string().max(100).optional(),
  tier:           z.enum(["STANDARD", "PROFESSIONAL", "ENTERPRISE"]).default("STANDARD"),
  csManagerId:    z.string().optional().nullable(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { getPrisma } = await import("@/lib/db/prisma");
  const db = await getPrisma();
  if (!db) return NextResponse.json({ error: "db_unavailable" }, { status: 503 });

  try {
    const account = await (db as Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>>)
      .customerAccount.create({
        data: {
          organizationId: parsed.data.organizationId,
          displayName:    parsed.data.displayName,
          industry:       parsed.data.industry ?? null,
          region:         parsed.data.region ?? null,
          tier:           parsed.data.tier,
          csManagerId:    parsed.data.csManagerId ?? null,
          updatedAt:      new Date(),
        },
      } as unknown);
    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "create_failed";
    if (msg.includes("Unique")) return NextResponse.json({ error: "organization_already_has_account" }, { status: 409 });
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
}
