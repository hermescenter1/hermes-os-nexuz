export type CourseLevel        = "beginner" | "intermediate" | "advanced";
export type CourseCategory     = "industrial" | "automation" | "software" | "safety" | "compliance" | "onboarding" | "general";
export type EnrollmentType     = "open" | "invite_only";
export type LessonType         = "text" | "video" | "pdf";
export type QuestionType       = "single_choice" | "multiple_choice";
export type EnrollmentStatus   = "active" | "completed" | "dropped" | "expired";
export type EnrollmentSource   = "self" | "ats" | "cs" | "admin";

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  beginner:     "Beginner",
  intermediate: "Intermediate",
  advanced:     "Advanced",
};

export const CATEGORY_LABELS: Record<CourseCategory, string> = {
  industrial:  "Industrial",
  automation:  "Automation",
  software:    "Software",
  safety:      "Safety",
  compliance:  "Compliance",
  onboarding:  "Onboarding",
  general:     "General",
};

export const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active:    "In Progress",
  completed: "Completed",
  dropped:   "Dropped",
  expired:   "Expired",
};

// Shapes returned from the DB layer
export interface DbAcademyCourse {
  id: string;
  organizationId: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  level: string;
  estimatedHours: number;
  thumbnailUrl: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  enrollmentType: string;
  certificateEnabled: boolean;
  passingScore: number;
  instructorName: string | null;
  instructorBio: string | null;
  tags: unknown;
  targetAudience: unknown;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAcademyModule {
  id: string;
  courseId: string;
  organizationId: string;
  title: string;
  description: string | null;
  orderIndex: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAcademyLesson {
  id: string;
  moduleId: string;
  courseId: string;
  organizationId: string;
  title: string;
  content: string | null;
  lessonType: string;
  videoUrl: string | null;
  resourceUrl: string | null;
  resourceName: string | null;
  durationMinutes: number;
  orderIndex: number;
  isPublished: boolean;
  isFree: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAcademyQuiz {
  id: string;
  courseId: string;
  lessonId: string | null;
  organizationId: string;
  title: string;
  description: string | null;
  passingScore: number;
  timeLimitMinutes: number | null;
  maxAttempts: number | null;
  shuffleQuestions: boolean;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAcademyQuizQuestion {
  id: string;
  quizId: string;
  organizationId: string;
  questionText: string;
  questionType: string;
  options: unknown;
  correctAnswers: unknown;
  explanation: string | null;
  points: number;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAcademyEnrollment {
  id: string;
  courseId: string;
  organizationId: string;
  userId: string;
  candidateId: string | null;
  enrolledById: string | null;
  completedAt: Date | null;
  progressPercent: number;
  status: string;
  expiresAt: Date | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAcademyProgress {
  id: string;
  enrollmentId: string;
  lessonId: string;
  organizationId: string;
  userId: string;
  completedAt: Date | null;
  timeSpentSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAcademyCertificate {
  id: string;
  organizationId: string;
  courseId: string;
  userId: string;
  enrollmentId: string;
  certificateNumber: string;
  verificationToken: string;
  issuedAt: Date;
  expiresAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAcademyQuizAttempt {
  id: string;
  quizId: string;
  enrollmentId: string;
  userId: string;
  organizationId: string;
  answers: unknown;
  score: number;
  passed: boolean;
  startedAt: Date;
  completedAt: Date | null;
  timeSpentSeconds: number;
  attemptNumber: number;
  createdAt: Date;
  updatedAt: Date;
}
