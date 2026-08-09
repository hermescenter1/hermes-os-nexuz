import { NextResponse }       from "next/server";
import type { NextRequest }    from "next/server";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";
import {
  markLessonComplete,
  getEnrollment,
  getCourseLessons,
  getLessonProgress,
  getCourseQuizzes,
  hasPassed,
  issueCertificate,
  getCourseById,
  getLessonById,
  updateEnrollmentProgress,
} from "@/lib/academy/db";

async function resolveUser(req: NextRequest) {
  const db = await getPrisma();
  if (!db) return null;
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!at) return null;
  const payload = await verifyAccessToken(at);
  if (!payload) return null;
  const memberModel = (db as Record<string, unknown>).organizationMember as {
    findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  };
  const row = await memberModel.findFirst({
    where: { userId: payload.sub, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  return row ? { userId: payload.sub, orgId: String(row.organizationId), userName: payload.name } : null;
}

export async function POST(req: NextRequest) {
  const ctx = await resolveUser(req);
  if (!ctx) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json() as {
    courseId:         string;
    lessonId:         string;
    timeSpentSeconds?: number;
  };

  if (!body.courseId || !body.lessonId) {
    return NextResponse.json({ error: "courseId and lessonId are required" }, { status: 400 });
  }

  // PHASE 99 SECURITY — the enrollment lookup below is keyed on (courseId,
  // userId) only and carries no organization predicate, so a caller who held an
  // enrollment row against a foreign course — the row the sibling enroll
  // endpoint used to let a foreign tenant create — drove progress against that
  // course and read its title back out through the certificate issued a few
  // lines down. Bind the course to the caller's organization before anything
  // else touches it, and answer 404 for both an unknown and a foreign id so the
  // two cases stay indistinguishable. The course is resolved once here and
  // reused by the certificate branch, which used to re-read it.
  const course = await getCourseById(body.courseId);
  if (!course || course.organizationId !== ctx.orgId) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  // The lesson was never checked against the course either, so any lesson id at
  // all — including one belonging to another course or another tenant — could
  // be written into this caller's progress. It never inflated the completion
  // count, which is computed from the course's own lesson set, but it did write
  // an unrelated foreign identifier into a tenant-owned row. Bind it here.
  const lesson = await getLessonById(body.lessonId);
  if (!lesson || lesson.courseId !== body.courseId) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const enrollment = await getEnrollment(body.courseId, ctx.userId);
  if (!enrollment) {
    return NextResponse.json({ error: "Not enrolled in this course" }, { status: 403 });
  }

  const progress = await markLessonComplete({
    enrollmentId:     enrollment.id,
    lessonId:         body.lessonId,
    organizationId:   ctx.orgId,
    userId:           ctx.userId,
    timeSpentSeconds: body.timeSpentSeconds,
  });

  if (!progress) {
    return NextResponse.json({ error: "Failed to record progress" }, { status: 500 });
  }

  // Compute new overall progress
  const [lessons, allProgress] = await Promise.all([
    getCourseLessons(body.courseId),
    getLessonProgress(enrollment.id),
  ]);

  const completedIds = new Set(
    (allProgress ?? []).filter((p) => p.completedAt).map((p) => p.lessonId)
  );
  const total   = (lessons ?? []).length;
  const done    = (lessons ?? []).filter((l) => completedIds.has(l.id)).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const allLessonsDone = total > 0 && done === total;
  let certificate = null;

  if (allLessonsDone) {
    // Check if all quizzes are passed
    const quizzes = await getCourseQuizzes(body.courseId) ?? [];
    const allQuizzesPassed = quizzes.length === 0 ||
      (await Promise.all(quizzes.map((q) => hasPassed(q.id, enrollment.id)))).every(Boolean);

    if (allQuizzesPassed) {
      await updateEnrollmentProgress(enrollment.id, 100, true);
      if (course.certificateEnabled) {
        certificate = await issueCertificate({
          organizationId: ctx.orgId,
          courseId:       body.courseId,
          userId:         ctx.userId,
          enrollmentId:   enrollment.id,
          courseTitle:    course.title,
          userName:       ctx.userName,
        });
      }
    } else {
      await updateEnrollmentProgress(enrollment.id, percent);
    }
  } else {
    await updateEnrollmentProgress(enrollment.id, percent);
  }

  return NextResponse.json({
    progress,
    progressPercent:  percent,
    totalLessons:     total,
    doneLessons:      done,
    courseCompleted:  allLessonsDone,
    certificate,
  });
}
