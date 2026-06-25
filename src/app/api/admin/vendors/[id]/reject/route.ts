import { NextResponse }                    from "next/server";
import { getCurrentUser }                  from "@/lib/auth/session";
import { can }                             from "@/lib/auth/roles";
import { adminRejectOnboardingRequest }    from "@/lib/vendors/db";
import { z }                               from "zod";

export const dynamic = "force-dynamic";

const Schema = z.object({
  reason: z.string().min(1).max(1000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user)                    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin")) return NextResponse.json({ error: "forbidden" },   { status: 403 });

  const { id } = await params;
  let reason = "Application did not meet current requirements.";
  try {
    const body = Schema.safeParse(await req.json());
    if (body.success && body.data.reason) reason = body.data.reason;
  } catch { /* use default reason */ }

  const ok = await adminRejectOnboardingRequest(id, user.id ?? "admin", reason);
  if (!ok) return NextResponse.json({ error: "rejection_failed" }, { status: 500 });

  return NextResponse.json({ success: true });
}
