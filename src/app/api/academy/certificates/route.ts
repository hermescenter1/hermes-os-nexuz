import { NextResponse }       from "next/server";
import type { NextRequest }    from "next/server";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";
import { getUserCertificates, getCourseById } from "@/lib/academy/db";

async function resolveUser(req: NextRequest) {
  const db = await getPrisma();
  if (!db) return null;
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!at) return null;
  const payload = await verifyAccessToken(at);
  if (!payload?.sub) return null;
  const memberModel = (db as Record<string, unknown>).organizationMember as {
    findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  };
  const row = await memberModel.findFirst({
    where: { userId: payload.sub, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  return row ? { userId: payload.sub, orgId: String(row.organizationId) } : null;
}

export async function GET(req: NextRequest) {
  const ctx = await resolveUser(req);
  if (!ctx) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const certs = await getUserCertificates(ctx.userId, ctx.orgId);
  if (!certs) return NextResponse.json({ certificates: [], total: 0 });

  // Enrich with course title
  const enriched = await Promise.all(
    certs.map(async (cert) => {
      const course = await getCourseById(cert.courseId);
      return { ...cert, courseTitle: course?.title ?? "Unknown Course" };
    })
  );

  return NextResponse.json({ certificates: enriched, total: enriched.length });
}
