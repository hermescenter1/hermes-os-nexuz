import { NextRequest, NextResponse } from "next/server";
import { z }                        from "zod";
import { getCurrentUser }           from "@/lib/auth/session";
import { adminGetAccount, adminUpdateAccount } from "@/lib/customer-portal/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const account = await adminGetAccount(id);
  if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ account });
}

const patchSchema = z.object({
  displayName:  z.string().min(1).max(200).optional(),
  industry:     z.string().max(100).optional(),
  region:       z.string().max(100).optional(),
  tier:         z.enum(["STANDARD", "PROFESSIONAL", "ENTERPRISE"]).optional(),
  csManagerId:  z.string().optional().nullable(),
  status:       z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
  notes:        z.string().max(5000).optional(),
  healthScore:  z.number().min(0).max(100).optional(),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const account = await adminUpdateAccount(id, parsed.data);
  if (!account) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  return NextResponse.json({ account });
}
