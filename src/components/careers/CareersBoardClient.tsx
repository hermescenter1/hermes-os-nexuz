"use client";

import { useState, useEffect } from "react";
import { Link }                 from "@/i18n/navigation";

interface JobRow {
  id: string;
  title: string;
  department: string;
  location: string;
  locationType: string;
  salaryCurrency: string;
  salaryMin: number | null;
  salaryMax: number | null;
  skills: string[];
  status: string;
  createdAt: string;
}

const DEPT_COLORS: Record<string, string> = {
  "Automation Engineering": "bg-signal/10 text-signal",
  "Field Services":         "bg-ice/10 text-ice",
  "Software Engineering":   "bg-purple-400/10 text-purple-300",
  "Project Management":     "bg-amber-400/10 text-amber-300",
  "Human Resources":        "bg-pink-400/10 text-pink-300",
  "Sales & Business Dev":   "bg-emerald-400/10 text-emerald-300",
};
function deptColor(d: string) {
  return DEPT_COLORS[d] ?? "bg-surface text-muted";
}

function fmtSalary(min: number | null, max: number | null, cur: string) {
  if (!min && !max) return "Competitive";
  if (min && max) return `${cur} ${(min / 1000).toFixed(0)}k – ${(max / 1000).toFixed(0)}k`;
  if (min) return `${cur} ${(min / 1000).toFixed(0)}k+`;
  return "";
}

export function CareersBoardClient() {
  const [jobs, setJobs]     = useState<JobRow[]>([]);
  const [search, setSearch] = useState("");
  const [dept, setDept]     = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const p = new URLSearchParams();
    if (dept)   p.set("department", dept);
    if (search) p.set("search", search);
    setLoading(true);
    fetch(`/api/careers/jobs?${p}`)
      .then((r) => r.json())
      .then((d: { jobs: JobRow[] }) => { setJobs(d.jobs ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [search, dept]);

  const departments = [...new Set(jobs.map((j) => j.department))].sort();

  return (
    <div>
      {/* Hero */}
      <div className="page-header-premium">
        <p className="eyebrow-label mb-2">HERMES OS · CAREERS</p>
        <h1 className="type-page-title">Open Positions</h1>
        <p className="mt-2 type-secondary max-w-2xl">
          Join us in building the future of industrial intelligence. Challenging projects, expert teams, global impact.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search roles, skills, locations…"
          className="flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-signal"
        />
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal sm:w-64"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {/* KPI strip */}
      <div className="global-ops-strip mb-8">
        <div className="global-ops-cell">
          <span className="kpi-label">OPEN ROLES</span>
          <span className="intel-kpi-value">{jobs.length}</span>
        </div>
        <div className="global-ops-cell">
          <span className="kpi-label">DEPARTMENTS</span>
          <span className="intel-kpi-value">{departments.length}</span>
        </div>
        <div className="global-ops-cell">
          <span className="kpi-label">GLOBAL OFFICES</span>
          <span className="intel-kpi-value">{[...new Set(jobs.map((j) => j.location))].length}</span>
        </div>
      </div>

      {/* Job cards */}
      {loading ? (
        <div className="py-20 text-center text-muted text-sm">Loading positions…</div>
      ) : jobs.length === 0 ? (
        <div className="py-20 text-center text-muted text-sm">No open positions match your criteria.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/careers/${job.id}`}
              className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 transition hover:border-signal/40 hover:bg-surface/80"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-mono text-sm font-semibold text-ink group-hover:text-signal transition-colors leading-snug">
                  {job.title}
                </h2>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide ${deptColor(job.department)}`}>
                  {job.department.split(" ")[0]}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(Array.isArray(job.skills) ? job.skills : []).slice(0, 3).map((s) => (
                  <span key={s} className="rounded-md bg-bg px-2 py-0.5 text-[10px] font-mono text-muted border border-line">
                    {s}
                  </span>
                ))}
              </div>

              <div className="mt-auto flex items-center justify-between text-xs text-muted font-mono">
                <span>{job.location}</span>
                <span className="text-signal/70">{fmtSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)}</span>
              </div>

              <div className="pt-2 border-t border-line">
                <span className="text-xs text-signal font-mono group-hover:underline">View &amp; Apply →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
