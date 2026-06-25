import { NextResponse }                         from "next/server";
import { z }                                    from "zod";
import { getCurrentUser }                        from "@/lib/auth/session";
import { can }                                  from "@/lib/auth/roles";
import { updateApproval, createAuditEntry }      from "@/lib/document/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  status:     z.enum(["APPROVED", "REJECTED"]),
  comment:    z.string().max(2000).optional().nullable(),
  documentId: z.string(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin"))
    return NextResponse.json({ error: "forbidden — admin only" }, { status: 403 });

  const { id } = await params;
  const body   = await req.json().catch(() => ({}));
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const approval = await updateApproval(id, {
    status:    parsed.data.status,
    comment:   parsed.data.comment,
    decidedBy: user.id,
    decidedAt: new Date().toISOString(),
  });

  if (approval) {
    await createAuditEntry({
      documentId: parsed.data.documentId,
      userId:     user.id,
      action:     parsed.data.status === "APPROVED" ? "APPROVE" : "REJECT",
      details:    `Approval ${parsed.data.status.toLowerCase()} by ${user.email ?? user.id}`,
    });
  }

  if (!approval) return NextResponse.json({ error: "not_found or mock mode" }, { status: 404 });
  return NextResponse.json(approval);
}
