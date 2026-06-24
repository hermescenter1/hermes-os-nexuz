import { NextResponse }       from "next/server";
import type { NextRequest }    from "next/server";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";
import { getComplianceStats, getAllLegalDocuments, getPrivacyRequests } from "@/lib/compliance/db";

async function resolveAdmin(req: NextRequest) {
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!at) return null;
  const payload = await verifyAccessToken(at);
  if (!payload?.sub) return null;
  if (!["admin", "superadmin"].includes(payload.role as string)) return null;
  const db = await getPrisma();
  if (!db) return null;
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
  const ctx = await resolveAdmin(req);
  if (!ctx) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const [stats, documents, pendingRequests] = await Promise.all([
    getComplianceStats(ctx.orgId),
    getAllLegalDocuments(ctx.orgId),
    getPrivacyRequests({ organizationId: ctx.orgId, status: "PENDING", take: 5 }),
  ]);

  return NextResponse.json({ stats, documents, pendingRequests });
}
