import { NextResponse }        from "next/server";
import type { NextRequest }     from "next/server";
import { verifyAccessToken }    from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }  from "@/lib/auth/config";
import { getPrisma }            from "@/lib/db/prisma";
import {
  getEnrollment,
  getLessonProgress,
  getCourseLessons,
  getCourseQuizzes,
  hasPassed,
  getCertificateByEnrollment,
} from "@/lib/academy/db";

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveUser(req);
  if (!ctx) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id: courseId } = await params;
  const enrollment = await getEnrollment(courseId, ctx.userId);
  if (!enrollment) return NextResponse.json({ enrolled: false, progress: [] });

  const [progress, lessons, quizzes] = await Promise.all([
    getLessonProgress(enrollment.id),
    getCourseLessons(courseId),
    getCourseQuizzes(courseId),
  ]);

  const completedLessonIds = new Set(
    (progress ?? []).filter((p) => p.completedAt).map((p) => p.lessonId)
  );

  const totalLessons = (lessons ?? []).length;
  const doneLessons  = (lessons ?? []).filter((l) => completedLessonIds.has(l.id)).length;

  // Check quiz pass status
  const quizPassed = await Promise.all(
    (quizzes ?? []).map(async (q) => ({
      quizId: q.id,
      passed: await hasPassed(q.id, enrollment.id),
    }))
  );

  const allQuizzesPassed = quizPassed.every((q) => q.passed);
  const certificate = await getCertificateByEnrollment(enrollment.id);

  return NextResponse.json({
    enrolled: true,
    enrollment,
    progress: progress ?? [],
    completedLessonIds: [...completedLessonIds],
    totalLessons,
    doneLessons,
    progressPercent: totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0,
    quizPassed: quizPassed,
    allQuizzesPassed,
    certificate: certificate ?? null,
  });
}
