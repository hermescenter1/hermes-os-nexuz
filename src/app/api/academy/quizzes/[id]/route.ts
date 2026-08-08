import { NextResponse }     from "next/server";
import type { NextRequest }  from "next/server";
import { getAuthRole }       from "@/lib/auth/rbac-server";
import { getQuizById, getQuizQuestions, getCourseById } from "@/lib/academy/db";
import { resolveAcademyScope, canSeeUnpublishedAcademyContent } from "@/lib/academy/request-scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // PHASE 99 SECURITY — assessment content was served with no authentication,
  // no tenant predicate and no published check, so an anonymous caller holding a
  // quiz id could read another tenant's unpublished exam: every question, the
  // passing score, the attempt limit and the time limit. `correctAnswers` was
  // already stripped, which is necessary but not sufficient. The quiz inherits
  // its visibility from its course, so resolve that and apply the course's own
  // tenant + published predicates. 404 throughout — never confirm existence.
  const role = await getAuthRole(req);
  if (!role) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const scope = await resolveAcademyScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const { id } = await params;

  const quiz = await getQuizById(id);
  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }
  const course = await getCourseById(quiz.courseId);
  if (!course || course.organizationId !== scope.orgId) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }
  if (!course.isPublished && !canSeeUnpublishedAcademyContent(role)) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const questions = await getQuizQuestions(id);

  // SECURITY: Strip correctAnswers before sending to client
  const safeQuestions = (questions ?? []).map((q) => ({
    id:           q.id,
    questionText: q.questionText,
    questionType: q.questionType,
    options:      q.options,
    points:       q.points,
    orderIndex:   q.orderIndex,
    // correctAnswers intentionally omitted
  }));

  return NextResponse.json({
    quiz: {
      id:               quiz.id,
      title:            quiz.title,
      description:      quiz.description,
      passingScore:     quiz.passingScore,
      timeLimitMinutes: quiz.timeLimitMinutes,
      maxAttempts:      quiz.maxAttempts,
      shuffleQuestions: quiz.shuffleQuestions,
    },
    questions: safeQuestions,
  });
}
