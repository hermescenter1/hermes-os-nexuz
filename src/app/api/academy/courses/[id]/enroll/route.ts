import { NextResponse }       from "next/server";
import type { NextRequest }    from "next/server";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";
import { getCourseById, getEnrollment, enrollUser } from "@/lib/academy/db";

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveUser(req);
  if (!ctx) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id: courseId } = await params;

  const course = await getCourseById(courseId);
  if (!course || !course.isPublished) {
    return NextResponse.json({ error: "Course not found or not available" }, { status: 404 });
  }

  // Check if already enrolled
  const existing = await getEnrollment(courseId, ctx.userId);
  if (existing) {
    return NextResponse.json({ enrollment: existing, alreadyEnrolled: true });
  }

  const enrollment = await enrollUser({
    courseId,
    organizationId: ctx.orgId,
    userId:         ctx.userId,
    source:         "self",
  });

  if (!enrollment) {
    return NextResponse.json({ error: "Enrollment failed" }, { status: 500 });
  }

  return NextResponse.json({ enrollment }, { status: 201 });
}
