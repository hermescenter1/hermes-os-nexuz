"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { Link }                from "@/i18n/navigation";
import type { CustomerProject, Milestone } from "@/lib/customer-portal/types";
import { formatDate } from "@/lib/i18n/format";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    "border-signal/30 bg-signal/10 text-signal",
  ON_HOLD:   "border-amber-400/30 bg-amber-400/10 text-amber-400",
  COMPLETED: "border-ice/30 bg-ice/10 text-ice",
  CANCELLED: "border-red-500/30 bg-red-500/10 text-red-400",
};

export function CustomerProjectDetailClient({ projectId }: { projectId: string }) {
  const locale = useLocale();
  const [project, setProject] = useState<CustomerProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/customer/projects/${projectId}`)
      .then((r) => { if (r.status === 404) { setNotFound(true); return null; } return r.json(); })
      .then((d: { project?: CustomerProject } | null) => { if (d) setProject(d.project ?? null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="h-64 rounded-xl border border-line bg-surface animate-pulse" />;

  if (notFound || !project) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center">
        <h2 className="text-lg font-bold text-ink">Project Not Found</h2>
        <Link href="/customer/projects" className="mt-4 inline-block text-sm text-signal hover:underline">← Back to projects</Link>
      </div>
    );
  }

  const milestones = (project.milestones ?? []) as Milestone[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <Link href="/customer/projects" className="text-xs text-faint hover:text-signal">← Projects</Link>
            <h2 className="mt-2 text-xl font-bold text-ink">{project.title}</h2>
            {project.descriptionEn && <p className="mt-1 text-sm text-muted">{project.descriptionEn}</p>}
          </div>
          <span className={`shrink-0 rounded border px-2 py-1 text-xs font-mono font-semibold ${STATUS_COLORS[project.status] ?? "border-line text-muted"}`}>
            {project.status}
          </span>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-faint">Overall Progress</span>
            <span className="text-xs text-muted font-mono font-bold">{project.progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-line">
            <div className="h-2 rounded-full bg-signal transition-all" style={{ width: `${Math.min(project.progress, 100)}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-faint">Manager</p><p className="text-ink">{project.managerName ?? "—"}</p></div>
          <div><p className="text-xs text-faint">Priority</p><p className="text-ink">{project.priority}</p></div>
          <div><p className="text-xs text-faint">Start Date</p><p className="text-ink">{project.startDate ? formatDate(project.startDate, locale) : "—"}</p></div>
          <div><p className="text-xs text-faint">End Date</p><p className="text-ink">{project.endDate ? formatDate(project.endDate, locale) : "—"}</p></div>
        </div>
      </div>

      {/* Team */}
      {project.teamMembers.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-faint mb-3">Team</p>
          <div className="flex flex-wrap gap-2">
            {project.teamMembers.map((m) => (
              <span key={m} className="rounded-full border border-line px-3 py-1 text-xs text-muted">{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* Milestones */}
      <div className="rounded-xl border border-line bg-surface">
        <div className="px-6 py-4 border-b border-line">
          <p className="font-mono text-xs uppercase tracking-widest text-faint">Milestones</p>
        </div>
        {milestones.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted">No milestones defined.</div>
        ) : (
          <ul className="divide-y divide-line">
            {milestones.map((ms) => (
              <li key={ms.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className={`shrink-0 h-4 w-4 rounded-full border-2 ${ms.completed ? "bg-signal border-signal" : "border-line"}`} />
                  <div>
                    <p className={`text-sm ${ms.completed ? "line-through text-faint" : "text-ink"}`}>{ms.title}</p>
                    {ms.description && <p className="text-xs text-muted">{ms.description}</p>}
                  </div>
                </div>
                {ms.dueDate && (
                  <span className="shrink-0 text-xs text-faint">{formatDate(ms.dueDate, locale)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {project.tags.map((t) => (
            <span key={t} className="rounded-full border border-line px-3 py-1 text-xs text-faint">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
