"use client";

import { useState, useEffect } from "react";

interface CourseRow {
  id: string;
  title: string;
  category: string;
  level: string;
  isPublished: boolean;
  isArchived: boolean;
  estimatedHours: number;
  enrollmentCount?: number;
}

interface StatsData {
  totalCourses: number;
  publishedCourses: number;
  totalEnrollments: number;
  completedEnrollments: number;
  totalCertificates: number;
  completionRate: number;
  certificationRate: number;
}

const BLANK_COURSE = {
  title: "", description: "", category: "general", level: "beginner",
  estimatedHours: 1, instructorName: "", instructorBio: "",
  certificateEnabled: true, isFeatured: false,
};

export function AcademyAdminClient() {
  const [courses, setCourses]   = useState<CourseRow[]>([]);
  const [stats,   setStats]     = useState<StatsData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm]         = useState({ ...BLANK_COURSE });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [cr, or] = await Promise.all([
      fetch("/api/academy/courses?all=true").then((r) => r.json()),
      fetch("/api/academy/overview").then((r) => r.json()),
    ]);
    const c = cr as { courses?: CourseRow[] };
    const o = or as { stats?: StatsData };
    setCourses(c.courses ?? []);
    setStats(o.stats ?? null);
    setLoading(false);
  }

  async function createCourse() {
    setSaving(true); setError("");
    const res = await fetch("/api/academy/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json() as { course?: unknown; error?: string };
    if (res.ok) {
      setCreating(false);
      setForm({ ...BLANK_COURSE });
      await loadData();
    } else {
      setError(data.error ?? "Failed to create course");
    }
    setSaving(false);
  }

  async function togglePublish(id: string, isPublished: boolean) {
    await fetch(`/api/academy/courses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !isPublished }),
    });
    await loadData();
  }

  async function archiveCourse(id: string) {
    await fetch(`/api/academy/courses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: true }),
    });
    await loadData();
  }

  const field = (key: keyof typeof form, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="global-ops-strip">
          <div className="global-ops-cell">
            <span className="kpi-label">TOTAL COURSES</span>
            <span className="intel-kpi-value">{stats.totalCourses}</span>
          </div>
          <div className="global-ops-cell">
            <span className="kpi-label">PUBLISHED</span>
            <span className="intel-kpi-value text-signal">{stats.publishedCourses}</span>
          </div>
          <div className="global-ops-cell">
            <span className="kpi-label">TOTAL ENROLLMENTS</span>
            <span className="intel-kpi-value">{stats.totalEnrollments}</span>
          </div>
          <div className="global-ops-cell">
            <span className="kpi-label">COMPLETION RATE</span>
            <span className="intel-kpi-value text-emerald-400">{stats.completionRate}%</span>
          </div>
          <div className="global-ops-cell">
            <span className="kpi-label">CERTIFICATES ISSUED</span>
            <span className="intel-kpi-value text-amber-400">{stats.totalCertificates}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-sm uppercase tracking-widest text-muted/70">Course Management</h2>
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-lg bg-signal px-4 py-2 text-xs font-mono font-semibold text-bg hover:bg-signal/90 transition-colors"
        >
          {creating ? "✕ Cancel" : "+ New Course"}
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-xl border border-signal/30 bg-surface p-6 space-y-4">
          <h3 className="font-mono text-sm font-semibold text-ink">Create New Course</h3>
          {error && <p className="rounded-lg bg-danger/10 p-3 text-xs text-danger">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="kpi-label mb-1 block">COURSE TITLE *</label>
              <input
                value={form.title} onChange={(e) => field("title", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
                placeholder="e.g. Industrial Safety Fundamentals"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="kpi-label mb-1 block">DESCRIPTION</label>
              <textarea
                value={form.description} onChange={(e) => field("description", e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal resize-none"
                placeholder="What will students learn?"
              />
            </div>
            <div>
              <label className="kpi-label mb-1 block">CATEGORY</label>
              <select
                value={form.category} onChange={(e) => field("category", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
              >
                {["general","industrial","automation","software","safety","compliance","onboarding"].map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="kpi-label mb-1 block">LEVEL</label>
              <select
                value={form.level} onChange={(e) => field("level", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="kpi-label mb-1 block">ESTIMATED HOURS</label>
              <input
                type="number" min={1} max={200}
                value={form.estimatedHours}
                onChange={(e) => field("estimatedHours", parseInt(e.target.value) || 1)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
              />
            </div>
            <div>
              <label className="kpi-label mb-1 block">INSTRUCTOR NAME</label>
              <input
                value={form.instructorName} onChange={(e) => field("instructorName", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
                placeholder="e.g. Dr. Sara Ahmadi"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="kpi-label mb-1 block">INSTRUCTOR BIO</label>
              <input
                value={form.instructorBio} onChange={(e) => field("instructorBio", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
                placeholder="Short bio"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox" id="cert"
                checked={form.certificateEnabled}
                onChange={(e) => field("certificateEnabled", e.target.checked)}
                className="accent-signal"
              />
              <label htmlFor="cert" className="text-xs text-ink font-mono">Enable Certificate</label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox" id="featured"
                checked={form.isFeatured}
                onChange={(e) => field("isFeatured", e.target.checked)}
                className="accent-signal"
              />
              <label htmlFor="featured" className="text-xs text-ink font-mono">Featured Course</label>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setCreating(false)}
              className="rounded-lg border border-line px-4 py-2 text-xs font-mono text-muted hover:text-ink transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={createCourse}
              disabled={saving || !form.title}
              className="rounded-lg bg-signal px-6 py-2 text-xs font-mono font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create Course"}
            </button>
          </div>
        </div>
      )}

      {/* Course list */}
      {loading ? (
        <div className="py-16 text-center text-muted text-sm">Loading courses…</div>
      ) : courses.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-muted text-sm">No courses yet.</p>
          <p className="text-xs text-muted/60 mt-1">Create the first course using the button above.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-line overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-bg">
                {["Title", "Category", "Level", "Hours", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-muted/70">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {courses.map((course) => (
                <tr key={course.id} className="hover:bg-bg/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-ink">{course.title}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[10px] text-muted capitalize">{course.category}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[10px] text-muted capitalize">{course.level}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-[10px] text-muted">{course.estimatedHours}h</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-[9px] font-mono uppercase tracking-wide ${
                      course.isArchived
                        ? "bg-muted/10 text-muted"
                        : course.isPublished
                          ? "bg-signal/10 text-signal"
                          : "bg-amber-400/10 text-amber-300"
                    }`}>
                      {course.isArchived ? "Archived" : course.isPublished ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {!course.isArchived && (
                        <button
                          onClick={() => togglePublish(course.id, course.isPublished)}
                          className="text-[10px] font-mono text-muted hover:text-ink transition-colors"
                        >
                          {course.isPublished ? "Unpublish" : "Publish"}
                        </button>
                      )}
                      {!course.isArchived && (
                        <button
                          onClick={() => archiveCourse(course.id)}
                          className="text-[10px] font-mono text-muted/60 hover:text-danger transition-colors"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
