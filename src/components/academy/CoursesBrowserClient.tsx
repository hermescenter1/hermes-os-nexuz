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
  isFeatured: boolean;
  instructorName: string | null;
  tags: unknown;
  enrollment: EnrollmentRow | null;
}

const LEVEL_BADGE: Record<string, string> = {
  beginner:     "bg-signal/10 text-signal",
  intermediate: "bg-amber-400/10 text-amber-300",
  advanced:     "bg-danger/10 text-danger",
};

const CAT_COLORS: Record<string, string> = {
  industrial:  "text-signal",
  automation:  "text-ice",
  software:    "text-purple-300",
  safety:      "text-amber-300",
  compliance:  "text-pink-300",
  onboarding:  "text-emerald-300",
  general:     "text-muted",
};

export function CoursesBrowserClient() {
  const [courses, setCourses]   = useState<CourseRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel]       = useState("");

  function load() {
    const p = new URLSearchParams();
    if (search)   p.set("search", search);
    if (category) p.set("category", category);
    if (level)    p.set("level", level);
    setLoading(true);
    fetch(`/api/academy/courses?${p}`)
      .then((r) => r.json())
      .then((d: { courses?: CourseRow[] }) => { setCourses(d.courses ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, [search, category, level]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = [...new Set(courses.map((c) => c.category))].sort();

  const enrolled   = courses.filter((c) => c.enrollment);
  const unenrolled = courses.filter((c) => !c.enrollment);

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search courses…"
          className="flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-signal"
        />
        <select
          value={category} onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal sm:w-48"
        >
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <select
          value={level} onChange={(e) => setLevel(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal sm:w-40"
        >
          <option value="">All Levels</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>

      {/* KPI strip */}
      <div className="global-ops-strip mb-8">
        <div className="global-ops-cell">
          <span className="kpi-label">AVAILABLE COURSES</span>
          <span className="intel-kpi-value">{courses.length}</span>
        </div>
        <div className="global-ops-cell">
          <span className="kpi-label">ENROLLED</span>
          <span className="intel-kpi-value text-signal">{enrolled.length}</span>
        </div>
        <div className="global-ops-cell">
          <span className="kpi-label">COMPLETED</span>
          <span className="intel-kpi-value text-emerald-400">
            {enrolled.filter((c) => c.enrollment?.status === "completed").length}
          </span>
        </div>
        <div className="global-ops-cell">
          <span className="kpi-label">IN PROGRESS</span>
          <span className="intel-kpi-value text-amber-400">
            {enrolled.filter((c) => c.enrollment?.status === "active").length}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted text-sm">Loading courses…</div>
      ) : courses.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <p className="text-muted text-sm">No courses available yet.</p>
          <p className="text-xs text-muted/60">Admins can create courses via the Admin tab.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {enrolled.length > 0 && (
            <section>
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70 mb-4">Continue Learning</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {enrolled.map((c) => <CourseCard key={c.id} course={c} />)}
              </div>
            </section>
          )}
          {unenrolled.length > 0 && (
            <section>
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70 mb-4">
                {enrolled.length > 0 ? "Browse More Courses" : "All Courses"}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {unenrolled.map((c) => <CourseCard key={c.id} course={c} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course }: { course: CourseRow }) {
  const lvlCls = LEVEL_BADGE[course.level] ?? "bg-surface text-muted";
  const catCls = CAT_COLORS[course.category] ?? "text-muted";
  const tags   = Array.isArray(course.tags) ? (course.tags as string[]) : [];
  const enrollment = course.enrollment;

  return (
    <Link
      href={`/academy/course/${course.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 transition hover:border-signal/40"
    >
      {course.isFeatured && (
        <span className="inline-flex w-fit items-center gap-1 rounded-md bg-hermes-gold/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-hermes-gold">
          ★ Featured
        </span>
      )}

      <div>
        <p className={`font-mono text-[10px] uppercase tracking-widest mb-1 ${catCls}`}>{course.category}</p>
        <h3 className="font-mono text-sm font-semibold text-ink group-hover:text-signal transition-colors leading-snug">
          {course.title}
        </h3>
        <p className="mt-1.5 text-xs text-muted line-clamp-2 leading-relaxed">{course.description}</p>
      </div>

      {enrollment && (
        <div>
          <div className="flex items-center justify-between text-[10px] font-mono text-muted mb-1">
            <span>{enrollment.status === "completed" ? "Completed" : "In Progress"}</span>
            <span>{enrollment.progressPercent}%</span>
          </div>
          <div className="h-1 w-full rounded-full bg-line">
            <div
              className="h-1 rounded-full bg-signal transition-all"
              style={{ width: `${enrollment.progressPercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between">
        <span className={`rounded-md px-2 py-0.5 text-[9px] font-mono uppercase tracking-wide ${lvlCls}`}>
          {course.level}
        </span>
        <span className="text-[10px] text-muted font-mono">
          {course.estimatedHours}h
        </span>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-md bg-bg px-1.5 py-0.5 text-[9px] font-mono text-muted border border-line">{t}</span>
          ))}
        </div>
      )}
    </Link>
  );
}
