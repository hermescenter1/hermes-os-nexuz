"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { Link }                from "@/i18n/navigation";
import type { CustomerProject } from "@/lib/customer-portal/types";
import { formatDate } from "@/lib/i18n/format";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:    "border-signal/30 bg-signal/10 text-signal",
  ON_HOLD:   "border-amber-400/30 bg-amber-400/10 text-amber-400",
  COMPLETED: "border-ice/30 bg-ice/10 text-ice",
  CANCELLED: "border-red-500/30 bg-red-500/10 text-red-400",
};

export function CustomerProjectsClient() {
  const locale = useLocale();
  const [projects, setProjects] = useState<CustomerProject[]>([]);
  const [loading, setLoading]   = useState(true);
  const [noAccount, setNoAccount] = useState(false);

  useEffect(() => {
    fetch("/api/customer/projects")
      .then((r) => r.json())
      .then((d: { projects?: CustomerProject[]; noAccount?: boolean }) => {
        if (d.noAccount) { setNoAccount(true); return; }
        setProjects(d.projects ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-line bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (noAccount) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center">
        <h2 className="text-lg font-bold text-ink">No Account Found</h2>
        <p className="mt-2 text-sm text-muted">Contact your account manager to access your projects.</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Projects</p>
        <h2 className="text-lg font-bold text-ink">No Projects Yet</h2>
        <p className="text-sm text-muted">Your projects will appear here once your account manager sets them up.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {projects.map((p) => (
        <Link key={p.id} href={`/customer/projects/${p.id}` as "/customer"}>
          <div className="rounded-xl border border-line bg-surface p-6 hover:border-signal/30 transition-colors cursor-pointer">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="font-medium text-ink">{p.title}</p>
                {p.descriptionEn && (
                  <p className="mt-1 text-sm text-muted line-clamp-2">{p.descriptionEn}</p>
                )}
              </div>
              <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-mono font-semibold ${STATUS_COLORS[p.status] ?? "border-line text-muted"}`}>
                {p.status}
              </span>
            </div>

            {/* Progress bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-faint">Progress</span>
                <span className="text-xs text-muted font-mono">{p.progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-line">
                <div
                  className="h-1.5 rounded-full bg-signal transition-all"
                  style={{ width: `${Math.min(p.progress, 100)}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-6 text-xs text-faint">
              {p.managerName && <span>Manager: <span className="text-muted">{p.managerName}</span></span>}
              {p.startDate && <span>Started: <span className="text-muted">{formatDate(p.startDate, locale)}</span></span>}
              {p._count && <span>{p._count.tickets} tickets · {p._count.documents} docs</span>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
