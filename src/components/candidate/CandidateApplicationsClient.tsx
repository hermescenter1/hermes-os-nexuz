"use client";

import { useLocale } from "next-intl";
import { useState, useEffect } from "react";
import { Link }                 from "@/i18n/navigation";
import { formatDate } from "@/lib/i18n/format";

interface ApplicationRow {
  id: string;
  jobTitle: string;
  jobDepartment: string;
  jobLocation: string;
  status: string;
  coverLetter: string | null;
  totalYearsExp: number | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  APPLIED:          "bg-ice/10 text-ice border-ice/30",
  SCREENING:        "bg-signal/10 text-signal border-signal/30",
  TECHNICAL_REVIEW: "bg-purple-400/10 text-purple-300 border-purple-400/30",
  INTERVIEW:        "bg-amber-400/10 text-amber-300 border-amber-400/30",
  OFFER:            "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  HIRED:            "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  REJECTED:         "bg-danger/10 text-danger border-danger/30",
};

const STATUS_LABEL: Record<string, string> = {
  APPLIED: "Applied", SCREENING: "Screening", TECHNICAL_REVIEW: "Technical Review",
  INTERVIEW: "Interview", OFFER: "Offer Extended", HIRED: "Hired", REJECTED: "Not Selected",
};

export function CandidateApplicationsClient() {
  const locale = useLocale();
  const [apps, setApps]       = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ApplicationRow | null>(null);

  useEffect(() => {
    fetch("/api/candidate/applications")
      .then((r) => r.json())
      .then((d: { applications?: ApplicationRow[] }) => {
        setApps(d.applications ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header-premium">
        <p className="eyebrow-label mb-2">HERMES OS · CANDIDATE PORTAL · APPLICATIONS</p>
        <h1 className="type-page-title">My Applications</h1>
      </div>

      <div className="flex gap-2 mb-6 border-b border-line">
        <Link href="/candidate" className="px-4 py-2 text-sm font-mono text-muted hover:text-ink transition-colors">Overview</Link>
        <Link href="/candidate/applications" className="px-4 py-2 text-sm font-mono text-signal border-b-2 border-signal">All Applications</Link>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted text-sm">Loading…</div>
      ) : apps.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-muted text-sm">No applications found.</p>
          <Link href="/careers" className="inline-block rounded-lg bg-signal px-5 py-2.5 text-sm font-mono text-bg hover:bg-signal/90 transition-colors">
            Browse Open Positions
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* List */}
          <div className="lg:col-span-1 space-y-2">
            {apps.map((app) => {
              const cls = STATUS_COLORS[app.status] ?? "bg-surface text-muted border-line";
              return (
                <button
                  key={app.id}
                  onClick={() => setSelected(app === selected ? null : app)}
                  className={`w-full text-left rounded-xl border p-4 transition-colors ${selected?.id === app.id ? "border-signal/40 bg-signal/5" : "border-line bg-surface hover:border-signal/20"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-mono text-xs font-semibold text-ink leading-snug">{app.jobTitle}</h3>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase ${cls}`}>
                      {STATUS_LABEL[app.status]?.split(" ")[0] ?? app.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted font-mono">{app.jobDepartment}</p>
                  <p className="mt-0.5 text-[10px] text-muted/60">{formatDate(app.createdAt, locale)}</p>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            {selected ? (
              <div className="rounded-xl border border-line bg-surface p-6 space-y-5 sticky top-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-mono text-sm font-semibold text-ink">{selected.jobTitle}</h2>
                    <p className="text-xs text-muted mt-0.5">{selected.jobDepartment} · {selected.jobLocation}</p>
                  </div>
                  <span className={`rounded-md border px-2.5 py-1 text-[10px] font-mono uppercase ${STATUS_COLORS[selected.status] ?? "bg-surface text-muted border-line"}`}>
                    {STATUS_LABEL[selected.status] ?? selected.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-bg p-3">
                    <p className="text-muted font-mono uppercase text-[9px] tracking-widest mb-1">Applied</p>
                    <p className="text-ink">{formatDate(selected.createdAt, locale)}</p>
                  </div>
                  <div className="rounded-lg bg-bg p-3">
                    <p className="text-muted font-mono uppercase text-[9px] tracking-widest mb-1">Last Updated</p>
                    <p className="text-ink">{formatDate(selected.updatedAt, locale)}</p>
                  </div>
                  {selected.totalYearsExp !== null && (
                    <div className="rounded-lg bg-bg p-3">
                      <p className="text-muted font-mono uppercase text-[9px] tracking-widest mb-1">Experience Stated</p>
                      <p className="text-ink">{selected.totalYearsExp} years</p>
                    </div>
                  )}
                  <div className="rounded-lg bg-bg p-3">
                    <p className="text-muted font-mono uppercase text-[9px] tracking-widest mb-1">Source</p>
                    <p className="text-ink capitalize">{selected.source.replace(/_/g, " ")}</p>
                  </div>
                </div>

                {selected.coverLetter && (
                  <div>
                    <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted/70 mb-2">Your Cover Letter</h3>
                    <p className="text-xs text-ink/80 leading-relaxed whitespace-pre-wrap line-clamp-6">
                      {selected.coverLetter}
                    </p>
                  </div>
                )}

                <p className="text-[10px] text-muted font-mono">Application ID: {selected.id}</p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 rounded-xl border border-dashed border-line text-muted text-sm">
                Select an application to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
