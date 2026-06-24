"use client";

import { useState, useEffect } from "react";
import { Link }                 from "@/i18n/navigation";

interface EnrollmentRow {
  id: string;
  status: string;
  progressPercent: number;
  completedAt: string | null;
}

interface CourseRow {
  id: string;
  title: string;
  description: string;
  category: string;
  level: string;
  estimatedHours: number;
  instructorName: string | null;
  enrollment: EnrollmentRow | null;
}

const LEVEL_BADGE: Record<string, string> = {
  beginner:     "bg-signal/10 text-signal",
  intermediate: "bg-amber-400/10 text-amber-300",
  advanced:     "bg-danger/10 text-danger",
};

const STATUS_COLOR: Record<string, string> = {
  active:    "text-amber-300",
  completed: "text-signal",
  paused:    "text-muted",
};

export function MyLearningClient() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    fetch("/api/academy/courses")
      .then((r) => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      })
      .then((d: { courses?: CourseRow[] }) => {
        setCourses((d.courses ?? []).filter((c) => c.enrollment !== null));
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-signal border-t-transparent" />
        <p className="mt-3 text-sm text-muted">Loading your courses…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-danger/30 bg-surface px-6 py-10 text-center">
        <p className="text-sm text-danger">Failed to load your learning data. Please refresh.</p>
      </div>
    );
  }

  const active    = courses.filter((c) => c.enrollment?.status === "active");
  const completed = courses.filter((c) => c.enrollment?.status === "completed");

  if (courses.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center space-y-3">
        <div className="text-4xl opacity-30">📚</div>
        <p className="font-mono text-sm font-semibold text-ink">No courses enrolled yet</p>
        <p className="text-xs text-muted max-w-xs mx-auto leading-relaxed">
          Browse the <Link href="/academy" className="text-signal hover:underline">Courses tab</Link> to find and enroll in your first course.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* KPI strip */}
      <div className="global-ops-strip">
        <div className="global-ops-cell">
          <span className="kpi-label">ENROLLED</span>
          <span className="intel-kpi-value">{courses.length}</span>
        </div>
        <div className="global-ops-cell">
          <span className="kpi-label">IN PROGRESS</span>
          <span className="intel-kpi-value text-amber-400">{active.length}</span>
        </div>
        <div className="global-ops-cell">
          <span className="kpi-label">COMPLETED</span>
          <span className="intel-kpi-value text-signal">{completed.length}</span>
        </div>
        <div className="global-ops-cell">
          <span className="kpi-label">COMPLETION RATE</span>
          <span className="intel-kpi-value">
            {courses.length > 0 ? Math.round((completed.length / courses.length) * 100) : 0}%
          </span>
        </div>
      </div>

      {active.length > 0 && (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70 mb-4">In Progress</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((c) => <LearningCard key={c.id} course={c} />)}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70 mb-4">Completed</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {completed.map((c) => <LearningCard key={c.id} course={c} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function LearningCard({ course }: { course: CourseRow }) {
  const enrollment = course.enrollment!;
  const lvlCls     = LEVEL_BADGE[course.level] ?? "bg-surface text-muted";
  const statusCls  = STATUS_COLOR[enrollment.status] ?? "text-muted";

  return (
    <Link
      href={`/academy/course/${course.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 transition hover:border-signal/40"
    >
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1">{course.category}</p>
        <h3 className="font-mono text-sm font-semibold text-ink group-hover:text-signal transition-colors leading-snug">
          {course.title}
        </h3>
        {course.instructorName && (
          <p className="mt-0.5 text-[10px] text-muted">{course.instructorName}</p>
        )}
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-[10px] font-mono mb-1">
          <span className={statusCls}>{enrollment.status === "completed" ? "Completed" : "In Progress"}</span>
          <span className="text-muted">{enrollment.progressPercent}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-line">
          <div
            className={`h-1.5 rounded-full transition-all ${enrollment.status === "completed" ? "bg-signal" : "bg-amber-400"}`}
            style={{ width: `${enrollment.progressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between">
        <span className={`rounded-md px-2 py-0.5 text-[9px] font-mono uppercase tracking-wide ${lvlCls}`}>
          {course.level}
        </span>
        <span className="text-[10px] font-mono text-signal group-hover:underline">
          {enrollment.status === "completed" ? "Review →" : "Continue →"}
        </span>
      </div>
    </Link>
  );
}
