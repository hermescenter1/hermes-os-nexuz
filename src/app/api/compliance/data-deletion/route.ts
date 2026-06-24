import { NextResponse }              from "next/server";
import type { NextRequest }           from "next/server";
import { verifyAccessToken }          from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }        from "@/lib/auth/config";
import { createDataDeletionRequest }  from "@/lib/compliance/db";

export async function POST(req: NextRequest) {
  const body      = await req.json() as { email?: string; reason?: string; locale?: string };
  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;

  let userId: string | undefined;
  let email  = body.email?.toLowerCase().trim();

  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (at) {
    const payload = await verifyAccessToken(at);
    if (payload?.sub) {
      userId = payload.sub;
      email  = email ?? (payload as unknown as Record<string, unknown>).email as string;
    }
  }

  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const request = await createDataDeletionRequest({
    userId:  userId ?? null,
    email,
    reason:  body.reason,
    locale:  body.locale ?? "en",
    ipAddress,
  });

  if (!request) return NextResponse.json({ error: "Failed to submit deletion request" }, { status: 500 });

  return NextResponse.json({
    request,
    message: "Your data deletion request has been received. We will process it within 30 days after identity verification.",
  });
}
