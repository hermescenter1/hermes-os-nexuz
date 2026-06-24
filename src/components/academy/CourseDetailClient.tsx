"use client";

import { useState, useEffect, useCallback } from "react";
import { Link }                              from "@/i18n/navigation";

interface LessonRow { id: string; title: string; lessonType: string; durationMinutes: number; orderIndex: number; content: string | null; videoUrl: string | null; resourceUrl: string | null; resourceName?: string | null; isFree: boolean; moduleId: string; }
interface ModuleRow  { id: string; title: string; description: string | null; orderIndex: number; lessons: LessonRow[]; }
interface CourseData { id: string; title: string; description: string; category: string; level: string; estimatedHours: number; certificateEnabled: boolean; instructorName: string | null; instructorBio: string | null; }
interface QuizRow    { id: string; title: string; passingScore: number; timeLimitMinutes: number | null; }
interface ProgressData {
  enrolled: boolean;
  enrollment?: { id: string; status: string; progressPercent: number };
  completedLessonIds: string[];
  totalLessons: number;
  doneLessons: number;
  progressPercent: number;
  certificate?: { id: string; verificationToken: string; certificateNumber: string } | null;
}

const TYPE_ICON: Record<string, string> = { text: "📄", video: "▶", pdf: "📎" };
const LEVEL_CLS: Record<string, string> = { beginner: "text-signal", intermediate: "text-amber-300", advanced: "text-danger" };

export function CourseDetailClient({ courseId }: { courseId: string }) {
  const [course,   setCourse]   = useState<CourseData | null>(null);
  const [modules,  setModules]  = useState<ModuleRow[]>([]);
  const [quizzes,  setQuizzes]  = useState<QuizRow[]>([]);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [activeLesson, setActiveLesson] = useState<LessonRow | null>(null);
  const [marking,  setMarking]  = useState(false);
  const [expandedMod, setExpandedMod] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [courseRes, progressRes] = await Promise.all([
      fetch(`/api/academy/courses/${courseId}`).then((r) => r.json()),
      fetch(`/api/academy/courses/${courseId}/progress`).then((r) => r.json()),
    ]);
    const cr = courseRes as { course?: CourseData; modules?: ModuleRow[]; quizzes?: QuizRow[] };
    const pr = progressRes as ProgressData;
    if (cr.course) { setCourse(cr.course); setModules(cr.modules ?? []); setQuizzes(cr.quizzes ?? []); }
    setProgress(pr);
    setLoading(false);
    // Auto-expand first module
    if ((cr.modules ?? []).length > 0) setExpandedMod((cr.modules ?? [])[0].id);
  }, [courseId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function enroll() {
    setEnrolling(true);
    const res = await fetch(`/api/academy/courses/${courseId}/enroll`, { method: "POST" });
    const data = await res.json() as { enrollment?: unknown };
    if (data.enrollment) await fetchData();
    setEnrolling(false);
  }

  async function markComplete(lesson: LessonRow) {
    if (!progress?.enrollment) return;
    setMarking(true);
    const res = await fetch("/api/academy/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, lessonId: lesson.id }),
    });
    const data = await res.json() as { progressPercent?: number; certificate?: unknown };
    await fetchData();
    setMarking(false);
    if (data.certificate) {
      // Certificate issued — show notification
      alert("🎓 Congratulations! Your certificate has been issued.");
    }
  }

  if (loading) return <div className="py-20 text-center text-muted text-sm">Loading…</div>;
  if (!course) return (
    <div className="py-20 text-center">
      <p className="text-muted text-sm mb-4">Course not found.</p>
      <Link href="/academy" className="text-signal text-sm hover:underline">← Back to Courses</Link>
    </div>
  );

  const completedIds = new Set(progress?.completedLessonIds ?? []);
  const isEnrolled   = progress?.enrolled ?? false;
  const cert         = progress?.certificate;

  return (
    <div>
      <div className="mb-4">
        <Link href="/academy" className="text-xs text-muted hover:text-ink font-mono transition-colors">← All Courses</Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left: Lesson viewer or course info */}
        <div className="lg:col-span-2 space-y-5">
          {activeLesson ? (
            <LessonViewer
              lesson={activeLesson}
              isComplete={completedIds.has(activeLesson.id)}
              isEnrolled={isEnrolled}
              marking={marking}
              onMarkComplete={() => markComplete(activeLesson)}
              onClose={() => setActiveLesson(null)}
            />
          ) : (
            <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
              <div>
                <p className={`font-mono text-[10px] uppercase tracking-widest mb-1 ${LEVEL_CLS[course.level] ?? "text-muted"}`}>
                  {course.category} · {course.level}
                </p>
                <h1 className="font-mono text-xl font-bold text-ink">{course.title}</h1>
              </div>
              <p className="text-sm text-ink/80 leading-relaxed">{course.description}</p>
              {course.instructorName && (
                <div className="rounded-lg bg-bg p-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-signal/20 flex items-center justify-center text-signal text-xs font-bold shrink-0">
                    {course.instructorName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs font-mono text-ink">{course.instructorName}</p>
                    {course.instructorBio && <p className="text-xs text-muted mt-0.5">{course.instructorBio}</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Module tree */}
          <div className="space-y-3">
            {modules.map((mod) => (
              <div key={mod.id} className="rounded-xl border border-line bg-surface overflow-hidden">
                <button
                  onClick={() => setExpandedMod(expandedMod === mod.id ? null : mod.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-bg/50 transition-colors"
                >
                  <span className="font-mono text-sm font-semibold text-ink">{mod.title}</span>
                  <span className="text-muted text-xs">{expandedMod === mod.id ? "▲" : "▼"}</span>
                </button>
                {expandedMod === mod.id && (
                  <div className="border-t border-line divide-y divide-line">
                    {mod.lessons.map((lesson) => {
                      const done = completedIds.has(lesson.id);
                      return (
                        <button
                          key={lesson.id}
                          onClick={() => isEnrolled || lesson.isFree ? setActiveLesson(lesson) : undefined}
                          className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                            isEnrolled || lesson.isFree
                              ? "hover:bg-bg/50 cursor-pointer"
                              : "opacity-50 cursor-not-allowed"
                          } ${activeLesson?.id === lesson.id ? "bg-signal/5" : ""}`}
                        >
                          <span className="shrink-0 text-sm">
                            {done ? "✓" : TYPE_ICON[lesson.lessonType] ?? "📄"}
                          </span>
                          <span className={`flex-1 text-xs font-mono ${done ? "text-signal" : "text-ink"}`}>
                            {lesson.title}
                          </span>
                          {lesson.durationMinutes > 0 && (
                            <span className="text-[10px] text-muted shrink-0">{lesson.durationMinutes}m</span>
                          )}
                          {lesson.isFree && !isEnrolled && (
                            <span className="text-[9px] font-mono text-signal border border-signal/30 rounded px-1">FREE</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-5 space-y-4 sticky top-6">
            {/* Progress */}
            {isEnrolled && (
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                  <span className="text-muted">Progress</span>
                  <span className="text-ink">{progress?.progressPercent ?? 0}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-line">
                  <div
                    className="h-1.5 rounded-full bg-signal transition-all"
                    style={{ width: `${progress?.progressPercent ?? 0}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted font-mono">
                  {progress?.doneLessons ?? 0} / {progress?.totalLessons ?? 0} lessons
                </p>
              </div>
            )}

            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted font-mono">Duration</span><span>{course.estimatedHours}h</span></div>
              <div className="flex justify-between"><span className="text-muted font-mono">Level</span><span className="capitalize">{course.level}</span></div>
              <div className="flex justify-between"><span className="text-muted font-mono">Modules</span><span>{modules.length}</span></div>
              <div className="flex justify-between"><span className="text-muted font-mono">Lessons</span><span>{progress?.totalLessons ?? 0}</span></div>
              {quizzes.length > 0 && (
                <div className="flex justify-between"><span className="text-muted font-mono">Quizzes</span><span>{quizzes.length}</span></div>
              )}
              <div className="flex justify-between">
                <span className="text-muted font-mono">Certificate</span>
                <span className={course.certificateEnabled ? "text-signal" : "text-muted"}>{course.certificateEnabled ? "Yes" : "No"}</span>
              </div>
            </div>

            {!isEnrolled ? (
              <button
                onClick={enroll}
                disabled={enrolling}
                className="w-full rounded-lg bg-signal py-2.5 text-sm font-mono font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50"
              >
                {enrolling ? "Enrolling…" : "Enroll Now — Free"}
              </button>
            ) : cert ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-signal/30 bg-signal/5 p-3 text-center">
                  <p className="text-signal text-xs font-mono">🎓 Certificate Earned</p>
                  <p className="text-[10px] text-muted mt-0.5">{cert.certificateNumber}</p>
                </div>
                <Link
                  href={`/academy/certificate/${cert.verificationToken}`}
                  className="block text-center text-xs text-signal hover:underline font-mono"
                >
                  View Certificate →
                </Link>
              </div>
            ) : (
              <p className="text-[10px] text-center text-muted font-mono">
                {progress?.enrollment?.status === "completed" ? "Course complete" : "Complete all lessons to earn certificate"}
              </p>
            )}
          </div>

          {quizzes.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-4 space-y-2">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted/70">Quizzes</h3>
              {quizzes.map((q) => (
                <div key={q.id} className="rounded-lg bg-bg p-3 flex items-center justify-between">
                  <span className="text-xs text-ink font-mono">{q.title}</span>
                  <span className="text-[10px] text-muted">Pass: {q.passingScore}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonViewer({
  lesson, isComplete, isEnrolled, marking, onMarkComplete, onClose,
}: {
  lesson: LessonRow;
  isComplete: boolean;
  isEnrolled: boolean;
  marking: boolean;
  onMarkComplete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <h2 className="font-mono text-sm font-semibold text-ink">{lesson.title}</h2>
        <button onClick={onClose} className="text-muted hover:text-ink text-xs font-mono transition-colors">✕ Close</button>
      </div>
      <div className="p-6 space-y-4">
        {lesson.lessonType === "video" && lesson.videoUrl && (
          <div className="aspect-video rounded-lg overflow-hidden bg-bg border border-line">
            <iframe src={lesson.videoUrl} className="w-full h-full" allowFullScreen title={lesson.title} />
          </div>
        )}
        {lesson.content && (
          <div className="text-sm text-ink/80 leading-relaxed whitespace-pre-wrap">{lesson.content}</div>
        )}
        {lesson.resourceUrl && (
          <a
            href={lesson.resourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-line bg-bg p-3 text-xs text-ice hover:border-ice/40 transition-colors"
          >
            <span>📎</span>
            <span>{lesson.resourceName ?? "Download Resource"}</span>
          </a>
        )}
        {isEnrolled && (
          <button
            onClick={onMarkComplete}
            disabled={isComplete || marking}
            className={`w-full rounded-lg py-2.5 text-sm font-mono font-semibold transition-colors ${
              isComplete
                ? "bg-signal/10 text-signal cursor-default"
                : "bg-signal text-bg hover:bg-signal/90 disabled:opacity-50"
            }`}
          >
            {isComplete ? "✓ Lesson Complete" : marking ? "Marking…" : "Mark as Complete"}
          </button>
        )}
      </div>
    </div>
  );
}
