import { NextResponse }        from "next/server";
import type { NextRequest }     from "next/server";
import { getAuthRole }          from "@/lib/auth/rbac-server";
import {
  getCourseById,
  getEnrollment,
  getLessonProgress,
  getCourseLessons,
  getCourseQuizzes,
  hasPassed,
  getCertificateByEnrollment,
} from "@/lib/academy/db";
import { resolveAcademyScope } from "@/lib/academy/request-scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // PHASE 99 SECURITY — the enrollment lookup below is keyed on (courseId,
  // userId) only, with no organization predicate anywhere in the handler, so a
  // caller holding a foreign course id read that course's lesson and quiz set
  // straight back out of getCourseLessons()/getCourseQuizzes() as soon as an
  // enrollment row existed for the pair — which is exactly the row the sibling
  // enroll endpoint used to let a foreign tenant create. Bind the course to the
  // caller's organization first, and answer 404 for both an unknown and a
  // foreign id so the two cases stay indistinguishable.
  const role = await getAuthRole(req);
  if (!role) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const scope = await resolveAcademyScope(req);
  if (!scope) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const { id: courseId } = await params;

  const course = await getCourseById(courseId);
  if (!course || course.organizationId !== scope.orgId) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const enrollment = await getEnrollment(courseId, scope.userId);
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
