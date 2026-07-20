"use client";

import { useLocale } from "next-intl";
import { useState, useEffect } from "react";
import type { Job, JobStatus }  from "@/lib/ats/types";
import { formatNumber } from "@/lib/i18n/format";

interface JobsResponse { jobs: Job[]; total: number }

const STATUS_BADGE: Record<JobStatus, string> = {
  open:   "hs-badge hs--reasoning",
  draft:  "hs-badge hs--nominal",
  paused: "hs-badge hs--warning",
  closed: "hs-badge hs--risk",
};

const CONTRACT_LABEL: Record<string, string> = {
  "full-time":  "Full-Time",
  "part-time":  "Part-Time",
  "contract":   "Contract",
  "internship": "Internship",
};

export function JobListClient() {
  const locale = useLocale();
  const [data,     setData]     = useState<JobsResponse | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<JobStatus | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const url = filter === "all" ? "/api/ats/jobs" : `/api/ats/jobs?status=${filter}`;
    fetch(url)
      .then(r => r.json())
      .then((d: JobsResponse) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter]);

  const jobs = data?.jobs ?? [];

  return (
    <div className="flex flex-col gap-5">

      {/* Filter strip */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "open", "draft", "paused", "closed"] as const).map(s => (
          <button
            key={s}
            onClick={() => { setFilter(s); setLoading(true); }}
            className={`hs-badge transition-colors ${
              filter === s
                ? s === "open" ? "hs--reasoning"
                : s === "paused" ? "hs--warning"
                : s === "closed" ? "hs--risk"
                : "hs--memory"
                : "hs--nominal opacity-60"
            }`}
          >
            {s.toUpperCase()}
          </button>
        ))}
        <span className="kpi-label text-faint ms-auto">
          {loading ? "Loading…" : `${jobs.length} position${jobs.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Job list */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="rounded-xl border border-line bg-surface h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map(job => (
            <div
              key={job.id}
              className="rounded-xl border border-line bg-surface overflow-hidden"
            >
              {/* Header row */}
              <button
                className="w-full text-left px-5 py-3.5 hover:bg-surface2 transition-colors"
                onClick={() => setExpanded(prev => prev === job.id ? null : job.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-body text-sm font-semibold text-ink truncate">{job.title}</p>
                      <span className={STATUS_BADGE[job.status]}>{job.status}</span>
                    </div>
                    <p className="kpi-label text-faint">
                      {job.department} · {job.location} · {CONTRACT_LABEL[job.contractType]}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 text-right">
                    <div>
                      <p className="intel-kpi-value text-ink">{job.applicantCount}</p>
                      <p className="kpi-label">applicants</p>
                    </div>
                    <div>
                      <p className="intel-kpi-value text-ink">
                        {formatNumber(job.salaryMin, locale)}–{formatNumber(job.salaryMax, locale)}
                      </p>
                      <p className="kpi-label">{job.currency}</p>
                    </div>
                  </div>
                </div>

                {/* Skill tags */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {job.requiredSkills.slice(0, 5).map(s => (
                    <span key={s} className="hs-badge hs--knowledge">{s}</span>
                  ))}
                  {job.requiredSkills.length > 5 && (
                    <span className="hs-badge hs--nominal">+{job.requiredSkills.length - 5}</span>
                  )}
                </div>
              </button>

              {/* Expanded detail */}
              {expanded === job.id && (
                <div className="border-t border-line px-5 py-4 bg-bg">
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 mb-4">
                    <div>
                      <p className="kpi-label mb-2">Required Skills</p>
                      <div className="flex flex-wrap gap-1">
                        {job.requiredSkills.map(s => (
                          <span key={s} className="hs-badge hs--knowledge">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="kpi-label mb-2">Nice to Have</p>
                      <div className="flex flex-wrap gap-1">
                        {job.niceToHaveSkills.map(s => (
                          <span key={s} className="hs-badge hs--nominal">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {[
                        { label: "Min Experience",     value: `${job.minExperienceYears}+ years`          },
                        { label: "Visa Sponsorship",   value: job.visaSponsorship ? "Available" : "Not offered" },
                        { label: "Opened",             value: job.openedAt                                },
                      ].map(row => (
                        <div key={row.label} className="flex justify-between gap-2">
                          <span className="kpi-label text-faint">{row.label}</span>
                          <span className="font-mono text-[0.65rem] text-ink">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="font-body text-xs text-faint leading-relaxed">{job.description}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
