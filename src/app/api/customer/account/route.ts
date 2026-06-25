import { NextRequest, NextResponse } from "next/server";
import { z }                        from "zod";
import { getCurrentUser }           from "@/lib/auth/session";
import { can }                      from "@/lib/auth/roles";
import { getAccountForUser, getContacts } from "@/lib/customer-portal/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "dashboard")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const account = await getAccountForUser(user.id);
  if (!account) return NextResponse.json({ account: null, noAccount: true });

  const contacts = await getContacts(account.id);
  return NextResponse.json({ account, contacts });
}

const patchSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  industry:    z.string().max(100).optional(),
  region:      z.string().max(100).optional(),
}).strict();

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const account = await getAccountForUser(user.id);
  if (!account) return NextResponse.json({ error: "account_not_found" }, { status: 404 });

  const { adminUpdateAccount } = await import("@/lib/customer-portal/db");
  const updated = await adminUpdateAccount(account.id, parsed.data);
  return NextResponse.json({ account: updated });
}
