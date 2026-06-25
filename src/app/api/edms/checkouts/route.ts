import { NextResponse }                          from "next/server";
import { z }                                     from "zod";
import { getCurrentUser }                         from "@/lib/auth/session";
import { can }                                   from "@/lib/auth/roles";
import { getCheckouts, checkoutDocument, checkinDocument, createAuditEntry } from "@/lib/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CheckoutSchema = z.object({
  documentId:  z.string(),
  action:      z.enum(["checkout", "checkin"]),
  checkoutId:  z.string().optional(),
  notes:       z.string().max(1000).optional().nullable(),
});

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const checkouts = await getCheckouts();
  return NextResponse.json(checkouts);
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { documentId, action, checkoutId } = parsed.data;

  if (action === "checkout") {
    const result = await checkoutDocument(documentId, user.id);
    await createAuditEntry({ documentId, userId: user.id, action: "CHECKOUT", details: "Document checked out" });
    return NextResponse.json(result ?? { checked: true });
  } else {
    if (!checkoutId) return NextResponse.json({ error: "checkoutId required for checkin" }, { status: 400 });
    const result = await checkinDocument(checkoutId);
    await createAuditEntry({ documentId, userId: user.id, action: "CHECKIN", details: "Document checked in" });
    return NextResponse.json({ checked: result });
  }
}
