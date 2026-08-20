import { NextResponse }       from "next/server";
import type { NextRequest }    from "next/server";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";
import {
  getEnrollment,
  getQuizById,
  getQuizAttempts,
  submitQuizAttempt,
  getCourseLessons,
  getLessonProgress,
  issueCertificate,
  getCourseById,
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveUser(req);
  if (!ctx) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id: quizId } = await params;
  const body = await req.json() as {
    enrollmentId:    string;
    answers:         { questionId: string; selectedAnswers: number[] }[];
    timeSpentSeconds?: number;
  };

  if (!body.enrollmentId || !body.answers) {
    return NextResponse.json({ error: "enrollmentId and answers are required" }, { status: 400 });
  }

  // PHASE 99 SECURITY — two defects of the same family as the enrol endpoint's.
  // The quiz was looked up by primary key with no tenant predicate, so a member
  // of org B holding a quiz id from org A was graded against another tenant's
  // exam and received `explanations` and `passingScore` back. And the
  // enrollment was taken verbatim from the request body: it was never bound to
  // the caller, so the attempt-limit read and the attempt row itself landed on
  // whatever enrollment the client named — another user's, another tenant's —
  // which also burned that enrollment's maxAttempts budget. The quiz inherits
  // its visibility from its course, so resolve that and apply the course's own
  // tenant predicate, then derive the enrollment from (course, caller) on the
  // server. 404 for a foreign or unknown quiz — never confirm existence.
  const quiz = await getQuizById(quizId);
  if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  const course = await getCourseById(quiz.courseId);
  if (!course || course.organizationId !== ctx.orgId) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  // The caller's own enrollment is the only one this handler may ever write to.
  // A body that names a different one is answered exactly like "not enrolled",
  // so the response cannot be used to probe other enrollment ids.
  const enrollment = await getEnrollment(quiz.courseId, ctx.userId);
  if (!enrollment || enrollment.id !== body.enrollmentId) {
    return NextResponse.json({ error: "Not enrolled in this course" }, { status: 403 });
  }

  // Check attempt limits
  if (quiz.maxAttempts) {
    const attempts = await getQuizAttempts(quizId, enrollment.id);
    if ((attempts ?? []).length >= quiz.maxAttempts) {
      return NextResponse.json({ error: "Maximum attempts reached" }, { status: 429 });
    }
  }

  const result = await submitQuizAttempt({
    quizId,
    enrollmentId:    enrollment.id,
    userId:          ctx.userId,
    organizationId:  ctx.orgId,
    answers:         body.answers,
    timeSpentSeconds: body.timeSpentSeconds,
  });

  if (!result) {
    return NextResponse.json({ error: "Failed to submit quiz" }, { status: 500 });
  }

  let certificate = null;

  // Auto-certify: if quiz passed, check if all lessons are also complete. The
  // enrollment and the course are the tenant-checked ones resolved above; both
  // used to be re-read here, the enrollment without ever comparing it with the
  // one the attempt was actually recorded against.
  if (result.passed) {
    const [lessons, progress] = await Promise.all([
      getCourseLessons(quiz.courseId),
      getLessonProgress(enrollment.id),
    ]);
    const completedIds = new Set((progress ?? []).filter((p) => p.completedAt).map((p) => p.lessonId));
    const allLessonsDone = (lessons ?? []).every((l) => completedIds.has(l.id));

    if (allLessonsDone) {
      await updateEnrollmentProgress(enrollment.id, 100, true);
      if (course.certificateEnabled) {
        certificate = await issueCertificate({
          organizationId: ctx.orgId,
          courseId:       quiz.courseId,
          userId:         ctx.userId,
          enrollmentId:   enrollment.id,
          courseTitle:    course.title,
          userName:       ctx.userName,
        });
      }
    }
  }

  return NextResponse.json({
    score:        result.score,
    passed:       result.passed,
    passingScore: quiz.passingScore,
    explanations: result.explanations,
    attemptNumber: result.attempt.attemptNumber,
    certificate,
  });
}
