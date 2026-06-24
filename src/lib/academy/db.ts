/**
 * Academy database operations (Phase 60).
 * All functions follow the getPrisma() pattern.
 * Returns null/empty when DB unavailable — callers show empty state.
 * Quiz correctAnswers are NEVER returned to callers outside this module;
 * scoring is done internally in submitQuizAttempt().
 */

import { getPrisma }  from "@/lib/db/prisma";
import { randomUUID } from "node:crypto";
import type {
  DbAcademyCourse,
  DbAcademyModule,
  DbAcademyLesson,
  DbAcademyQuiz,
  DbAcademyQuizQuestion,
  DbAcademyEnrollment,
  DbAcademyProgress,
  DbAcademyCertificate,
  DbAcademyQuizAttempt,
} from "./types";

// ── Model cast helpers ────────────────────────────────────────────────────────

type CourseModel = {
  findMany:   (a: unknown) => Promise<DbAcademyCourse[]>;
  findUnique: (a: unknown) => Promise<DbAcademyCourse | null>;
  findFirst:  (a: unknown) => Promise<DbAcademyCourse | null>;
  create:     (a: unknown) => Promise<DbAcademyCourse>;
  update:     (a: unknown) => Promise<DbAcademyCourse>;
  count:      (a: unknown) => Promise<number>;
};
type ModuleModel = {
  findMany: (a: unknown) => Promise<DbAcademyModule[]>;
  create:   (a: unknown) => Promise<DbAcademyModule>;
  update:   (a: unknown) => Promise<DbAcademyModule>;
};
type LessonModel = {
  findMany: (a: unknown) => Promise<DbAcademyLesson[]>;
  findUnique: (a: unknown) => Promise<DbAcademyLesson | null>;
  create:   (a: unknown) => Promise<DbAcademyLesson>;
  count:    (a: unknown) => Promise<number>;
};
type QuizModel = {
  findMany:   (a: unknown) => Promise<DbAcademyQuiz[]>;
  findUnique: (a: unknown) => Promise<DbAcademyQuiz | null>;
  create:     (a: unknown) => Promise<DbAcademyQuiz>;
};
type QuestionModel = {
  findMany: (a: unknown) => Promise<DbAcademyQuizQuestion[]>;
  create:   (a: unknown) => Promise<DbAcademyQuizQuestion>;
  count:    (a: unknown) => Promise<number>;
};
type EnrollmentModel = {
  findMany:   (a: unknown) => Promise<DbAcademyEnrollment[]>;
  findUnique: (a: unknown) => Promise<DbAcademyEnrollment | null>;
  findFirst:  (a: unknown) => Promise<DbAcademyEnrollment | null>;
  create:     (a: unknown) => Promise<DbAcademyEnrollment>;
  update:     (a: unknown) => Promise<DbAcademyEnrollment>;
  count:      (a: unknown) => Promise<number>;
};
type ProgressModel = {
  findMany: (a: unknown) => Promise<DbAcademyProgress[]>;
  findFirst: (a: unknown) => Promise<DbAcademyProgress | null>;
  upsert:   (a: unknown) => Promise<DbAcademyProgress>;
  count:    (a: unknown) => Promise<number>;
};
type CertModel = {
  findMany:   (a: unknown) => Promise<DbAcademyCertificate[]>;
  findUnique: (a: unknown) => Promise<DbAcademyCertificate | null>;
  findFirst:  (a: unknown) => Promise<DbAcademyCertificate | null>;
  create:     (a: unknown) => Promise<DbAcademyCertificate>;
  count:      (a: unknown) => Promise<number>;
};
type AttemptModel = {
  findMany:  (a: unknown) => Promise<DbAcademyQuizAttempt[]>;
  findFirst: (a: unknown) => Promise<DbAcademyQuizAttempt | null>;
  create:    (a: unknown) => Promise<DbAcademyQuizAttempt>;
  count:     (a: unknown) => Promise<number>;
};

async function m() {
  const db = await getPrisma();
  if (!db) return null;
  const d = db as Record<string, unknown>;
  return {
    course:      d.academyCourse       as CourseModel,
    module:      d.academyModule       as ModuleModel,
    lesson:      d.academyLesson       as LessonModel,
    quiz:        d.academyQuiz         as QuizModel,
    question:    d.academyQuizQuestion as QuestionModel,
    enrollment:  d.academyEnrollment   as EnrollmentModel,
    progress:    d.academyProgress     as ProgressModel,
    cert:        d.academyCertificate  as CertModel,
    attempt:     d.academyQuizAttempt  as AttemptModel,
  };
}

// ── Courses ───────────────────────────────────────────────────────────────────

export async function getPublishedCourses(opts?: {
  organizationId?: string;
  category?: string;
  level?: string;
  search?: string;
  featured?: boolean;
}): Promise<DbAcademyCourse[] | null> {
  const db = await m();
  if (!db) return null;
  try {
    const rows = await db.course.findMany({
      where: {
        isPublished: true,
        deletedAt:   null,
        ...(opts?.organizationId ? { organizationId: opts.organizationId } : {}),
        ...(opts?.category ? { category: opts.category } : {}),
        ...(opts?.level    ? { level:    opts.level    } : {}),
        ...(opts?.featured ? { isFeatured: true }       : {}),
      },
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    });
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      return rows.filter(
        (c) => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
      );
    }
    return rows;
  } catch { return null; }
}

export async function getAllCourses(organizationId: string): Promise<DbAcademyCourse[] | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.course.findMany({
      where:   { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  } catch { return null; }
}

export async function getCourseById(id: string): Promise<DbAcademyCourse | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.course.findUnique({ where: { id, deletedAt: null } });
  } catch { return null; }
}

export async function createCourse(data: {
  organizationId: string;
  title: string;
  slug: string;
  description: string;
  category?: string;
  level?: string;
  estimatedHours?: number;
  instructorName?: string;
  certificateEnabled?: boolean;
  passingScore?: number;
  createdById?: string;
}): Promise<DbAcademyCourse | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.course.create({
      data: {
        id: randomUUID(),
        organizationId:    data.organizationId,
        title:             data.title,
        slug:              data.slug,
        description:       data.description,
        category:          data.category      ?? "general",
        level:             data.level         ?? "beginner",
        estimatedHours:    data.estimatedHours ?? 0,
        instructorName:    data.instructorName,
        certificateEnabled: data.certificateEnabled ?? true,
        passingScore:      data.passingScore   ?? 80,
        createdById:       data.createdById,
        isPublished:       false,
      },
    });
  } catch { return null; }
}

export async function updateCourse(
  id: string,
  data: Partial<{
    title: string; description: string; category: string; level: string;
    estimatedHours: number; isPublished: boolean; isFeatured: boolean;
    certificateEnabled: boolean; passingScore: number;
    instructorName: string; instructorBio: string; thumbnailUrl: string;
    enrollmentType: string;
  }>
): Promise<DbAcademyCourse | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.course.update({ where: { id }, data });
  } catch { return null; }
}

// ── Modules ───────────────────────────────────────────────────────────────────

export async function getCourseModules(courseId: string): Promise<DbAcademyModule[] | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.module.findMany({
      where:   { courseId, deletedAt: null, isPublished: true },
      orderBy: { orderIndex: "asc" },
    });
  } catch { return null; }
}

export async function createModule(data: {
  courseId: string;
  organizationId: string;
  title: string;
  description?: string;
  orderIndex?: number;
}): Promise<DbAcademyModule | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.module.create({
      data: {
        id: randomUUID(),
        courseId:      data.courseId,
        organizationId: data.organizationId,
        title:         data.title,
        description:   data.description,
        orderIndex:    data.orderIndex ?? 0,
      },
    });
  } catch { return null; }
}

// ── Lessons ───────────────────────────────────────────────────────────────────

export async function getCourseLessons(
  courseId: string,
  opts?: { includeFree?: boolean; enrollmentId?: string }
): Promise<DbAcademyLesson[] | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.lesson.findMany({
      where:   { courseId, deletedAt: null, isPublished: true },
      orderBy: { orderIndex: "asc" },
    });
  } catch { return null; }
}

export async function getLessonById(id: string): Promise<DbAcademyLesson | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.lesson.findUnique({ where: { id, deletedAt: null } });
  } catch { return null; }
}

export async function createLesson(data: {
  moduleId: string;
  courseId: string;
  organizationId: string;
  title: string;
  content?: string;
  lessonType?: string;
  videoUrl?: string;
  resourceUrl?: string;
  resourceName?: string;
  durationMinutes?: number;
  orderIndex?: number;
  isFree?: boolean;
}): Promise<DbAcademyLesson | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.lesson.create({
      data: {
        id: randomUUID(),
        moduleId:       data.moduleId,
        courseId:       data.courseId,
        organizationId: data.organizationId,
        title:          data.title,
        content:        data.content,
        lessonType:     data.lessonType    ?? "text",
        videoUrl:       data.videoUrl,
        resourceUrl:    data.resourceUrl,
        resourceName:   data.resourceName,
        durationMinutes: data.durationMinutes ?? 0,
        orderIndex:     data.orderIndex    ?? 0,
        isFree:         data.isFree        ?? false,
      },
    });
  } catch { return null; }
}

// ── Quizzes ───────────────────────────────────────────────────────────────────

export async function getCourseQuizzes(courseId: string): Promise<DbAcademyQuiz[] | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.quiz.findMany({
      where:   { courseId, deletedAt: null, isPublished: true },
      orderBy: { createdAt: "asc" },
    });
  } catch { return null; }
}

export async function getQuizById(id: string): Promise<DbAcademyQuiz | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.quiz.findUnique({ where: { id, deletedAt: null } });
  } catch { return null; }
}

export async function getQuizQuestions(quizId: string): Promise<DbAcademyQuizQuestion[] | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.question.findMany({
      where:   { quizId, deletedAt: null },
      orderBy: { orderIndex: "asc" },
    });
  } catch { return null; }
}

export async function createQuiz(data: {
  courseId: string;
  lessonId?: string;
  organizationId: string;
  title: string;
  description?: string;
  passingScore?: number;
  timeLimitMinutes?: number;
  maxAttempts?: number;
}): Promise<DbAcademyQuiz | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.quiz.create({
      data: {
        id: randomUUID(),
        courseId:       data.courseId,
        lessonId:       data.lessonId,
        organizationId: data.organizationId,
        title:          data.title,
        description:    data.description,
        passingScore:   data.passingScore   ?? 80,
        timeLimitMinutes: data.timeLimitMinutes,
        maxAttempts:    data.maxAttempts,
      },
    });
  } catch { return null; }
}

export async function createQuizQuestion(data: {
  quizId: string;
  organizationId: string;
  questionText: string;
  questionType?: string;
  options: string[];
  correctAnswers: number[];
  explanation?: string;
  points?: number;
  orderIndex?: number;
}): Promise<DbAcademyQuizQuestion | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.question.create({
      data: {
        id: randomUUID(),
        quizId:         data.quizId,
        organizationId: data.organizationId,
        questionText:   data.questionText,
        questionType:   data.questionType ?? "single_choice",
        options:        data.options,
        correctAnswers: data.correctAnswers,
        explanation:    data.explanation,
        points:         data.points     ?? 1,
        orderIndex:     data.orderIndex ?? 0,
      },
    });
  } catch { return null; }
}

// ── Enrollments ───────────────────────────────────────────────────────────────

export async function getEnrollment(
  courseId: string,
  userId: string
): Promise<DbAcademyEnrollment | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.enrollment.findFirst({
      where: { courseId, userId, deletedAt: null },
    });
  } catch { return null; }
}

export async function getUserEnrollments(
  userId: string,
  organizationId: string
): Promise<DbAcademyEnrollment[] | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.enrollment.findMany({
      where:   { userId, organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  } catch { return null; }
}

export async function getOrgEnrollments(
  organizationId: string,
  opts?: { courseId?: string; status?: string }
): Promise<DbAcademyEnrollment[] | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.enrollment.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(opts?.courseId ? { courseId: opts.courseId } : {}),
        ...(opts?.status   ? { status:   opts.status   } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  } catch { return null; }
}

export async function enrollUser(data: {
  courseId: string;
  organizationId: string;
  userId: string;
  candidateId?: string;
  enrolledById?: string;
  source?: string;
}): Promise<DbAcademyEnrollment | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.enrollment.create({
      data: {
        id: randomUUID(),
        courseId:       data.courseId,
        organizationId: data.organizationId,
        userId:         data.userId,
        candidateId:    data.candidateId,
        enrolledById:   data.enrolledById,
        source:         data.source ?? "self",
        status:         "active",
        progressPercent: 0,
      },
    });
  } catch {
    // Likely a unique constraint violation (already enrolled)
    return null;
  }
}

export async function updateEnrollmentProgress(
  enrollmentId: string,
  progressPercent: number,
  completed?: boolean
): Promise<DbAcademyEnrollment | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.enrollment.update({
      where: { id: enrollmentId },
      data:  {
        progressPercent,
        ...(completed ? { status: "completed", completedAt: new Date() } : {}),
      },
    });
  } catch { return null; }
}

// ── Progress ──────────────────────────────────────────────────────────────────

export async function getLessonProgress(
  enrollmentId: string
): Promise<DbAcademyProgress[] | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.progress.findMany({
      where:   { enrollmentId },
      orderBy: { createdAt: "asc" },
    });
  } catch { return null; }
}

export async function markLessonComplete(data: {
  enrollmentId:     string;
  lessonId:         string;
  organizationId:   string;
  userId:           string;
  timeSpentSeconds?: number;
}): Promise<DbAcademyProgress | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.progress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: data.enrollmentId, lessonId: data.lessonId } },
      create: {
        id: randomUUID(),
        enrollmentId:     data.enrollmentId,
        lessonId:         data.lessonId,
        organizationId:   data.organizationId,
        userId:           data.userId,
        completedAt:      new Date(),
        timeSpentSeconds: data.timeSpentSeconds ?? 0,
      },
      update: {
        completedAt:      new Date(),
        timeSpentSeconds: data.timeSpentSeconds ?? 0,
      },
    });
  } catch { return null; }
}

// ── Quiz Attempts ─────────────────────────────────────────────────────────────

/** Server-side scoring: returns { score, passed, explanations } */
export async function submitQuizAttempt(data: {
  quizId:          string;
  enrollmentId:    string;
  userId:          string;
  organizationId:  string;
  answers:         { questionId: string; selectedAnswers: number[] }[];
  timeSpentSeconds?: number;
}): Promise<{ attempt: DbAcademyQuizAttempt; score: number; passed: boolean; explanations: { questionId: string; correct: boolean; explanation: string | null }[] } | null> {
  const db = await m();
  if (!db) return null;
  try {
    const quiz = await db.quiz.findUnique({ where: { id: data.quizId } });
    if (!quiz) return null;

    const questions = await db.question.findMany({
      where:   { quizId: data.quizId, deletedAt: null },
      orderBy: { orderIndex: "asc" },
    });

    // Count previous attempts for this enrollment+quiz
    const prevCount = await db.attempt.count({
      where: { quizId: data.quizId, enrollmentId: data.enrollmentId },
    });

    // Score the answers
    let totalPoints = 0;
    let earnedPoints = 0;
    const explanations: { questionId: string; correct: boolean; explanation: string | null }[] = [];

    for (const q of questions) {
      const correctAnswers = Array.isArray(q.correctAnswers) ? (q.correctAnswers as number[]) : [];
      const answer = data.answers.find((a) => a.questionId === q.id);
      const selectedAnswers = answer?.selectedAnswers ?? [];

      totalPoints += q.points;
      const isCorrect =
        correctAnswers.length === selectedAnswers.length &&
        correctAnswers.every((ca) => selectedAnswers.includes(ca));

      if (isCorrect) earnedPoints += q.points;
      explanations.push({ questionId: q.id, correct: isCorrect, explanation: q.explanation });
    }

    const score  = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = score >= quiz.passingScore;

    const attempt = await db.attempt.create({
      data: {
        id: randomUUID(),
        quizId:          data.quizId,
        enrollmentId:    data.enrollmentId,
        userId:          data.userId,
        organizationId:  data.organizationId,
        answers:         data.answers,
        score,
        passed,
        completedAt:     new Date(),
        timeSpentSeconds: data.timeSpentSeconds ?? 0,
        attemptNumber:   prevCount + 1,
      },
    });

    return { attempt, score, passed, explanations };
  } catch { return null; }
}

export async function getQuizAttempts(
  quizId: string,
  enrollmentId: string
): Promise<DbAcademyQuizAttempt[] | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.attempt.findMany({
      where:   { quizId, enrollmentId },
      orderBy: { attemptNumber: "desc" },
    });
  } catch { return null; }
}

export async function hasPassed(
  quizId: string,
  enrollmentId: string
): Promise<boolean> {
  const db = await m();
  if (!db) return false;
  try {
    const best = await db.attempt.findFirst({
      where: { quizId, enrollmentId, passed: true },
    });
    return best !== null;
  } catch { return false; }
}

// ── Certificates ──────────────────────────────────────────────────────────────

export async function getUserCertificates(
  userId: string,
  organizationId: string
): Promise<DbAcademyCertificate[] | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.cert.findMany({
      where:   { userId, organizationId, deletedAt: null },
      orderBy: { issuedAt: "desc" },
    });
  } catch { return null; }
}

export async function getCertificateByToken(
  verificationToken: string
): Promise<DbAcademyCertificate | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.cert.findUnique({ where: { verificationToken, deletedAt: null } });
  } catch { return null; }
}

export async function getCertificateByEnrollment(
  enrollmentId: string
): Promise<DbAcademyCertificate | null> {
  const db = await m();
  if (!db) return null;
  try {
    return await db.cert.findUnique({ where: { enrollmentId } });
  } catch { return null; }
}

/** Issue a certificate. Call only after verifying course completion + quiz pass. */
export async function issueCertificate(data: {
  organizationId: string;
  courseId:       string;
  userId:         string;
  enrollmentId:   string;
  courseTitle:    string;
  userName:       string;
}): Promise<DbAcademyCertificate | null> {
  const db = await m();
  if (!db) return null;
  try {
    // Check not already issued
    const existing = await db.cert.findUnique({ where: { enrollmentId: data.enrollmentId } });
    if (existing) return existing;

    const certNum = `HRM-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const token   = randomUUID();

    return await db.cert.create({
      data: {
        id: randomUUID(),
        organizationId:    data.organizationId,
        courseId:          data.courseId,
        userId:            data.userId,
        enrollmentId:      data.enrollmentId,
        certificateNumber: certNum,
        verificationToken: token,
        issuedAt:          new Date(),
        metadata: {
          courseTitle: data.courseTitle,
          userName:    data.userName,
        },
      },
    });
  } catch { return null; }
}

// ── Dashboard stats ───────────────────────────────────────────────────────────

export interface AcademyStats {
  totalCourses:     number;
  publishedCourses: number;
  totalEnrollments: number;
  activeEnrollments: number;
  completedEnrollments: number;
  totalCertificates: number;
  completionRate:   number;
  certificationRate: number;
}

export async function getAcademyStats(
  organizationId: string
): Promise<AcademyStats | null> {
  const db = await m();
  if (!db) return null;
  try {
    const [total, published, enrolled, active, completed, certs] = await Promise.all([
      db.course.count({ where: { organizationId, deletedAt: null } }),
      db.course.count({ where: { organizationId, isPublished: true, deletedAt: null } }),
      db.enrollment.count({ where: { organizationId, deletedAt: null } }),
      db.enrollment.count({ where: { organizationId, status: "active", deletedAt: null } }),
      db.enrollment.count({ where: { organizationId, status: "completed", deletedAt: null } }),
      db.cert.count({ where: { organizationId, deletedAt: null } }),
    ]);
    const completionRate   = enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0;
    const certificationRate = enrolled > 0 ? Math.round((certs / enrolled) * 100)    : 0;
    return {
      totalCourses: total, publishedCourses: published,
      totalEnrollments: enrolled, activeEnrollments: active,
      completedEnrollments: completed, totalCertificates: certs,
      completionRate, certificationRate,
    };
  } catch { return null; }
}
