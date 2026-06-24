import { NextResponse }     from "next/server";
import { getQuizById, getQuizQuestions } from "@/lib/academy/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [quiz, questions] = await Promise.all([
    getQuizById(id),
    getQuizQuestions(id),
  ]);

  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

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
