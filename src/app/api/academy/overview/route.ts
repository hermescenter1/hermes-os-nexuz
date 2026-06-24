import { NextResponse }         from "next/server";
import type { NextRequest }      from "next/server";
import { getAuthRole }           from "@/lib/auth/rbac-server";
import { getAcademyStats, getPublishedCourses } from "@/lib/academy/db";
import { getPrisma }             from "@/lib/db/prisma";
import { verifyAccessToken }     from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }   from "@/lib/auth/config";

async function resolveOrgId(req: NextRequest): Promise<string | null> {
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
  return row ? String(row.organizationId) : null;
}

export async function GET(req: NextRequest) {
  const role = await getAuthRole(req);
  if (!role) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const orgId = await resolveOrgId(req);
  if (!orgId) {
    return NextResponse.json({ stats: null, featuredCourses: [] });
  }

  const [stats, featured] = await Promise.all([
    getAcademyStats(orgId),
    getPublishedCourses({ organizationId: orgId, featured: true }),
  ]);

  return NextResponse.json({ stats, featuredCourses: featured ?? [] });
}
