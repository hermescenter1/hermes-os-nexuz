"use client";

import { useState, useEffect } from "react";
import { Link }                 from "@/i18n/navigation";

interface JobDetail {
  id: string;
  title: string;
  department: string;
  description: string;
  location: string;
  locationType: string;
  salaryCurrency: string;
  salaryMin: number | null;
  salaryMax: number | null;
  skills: string[];
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
  status: string;
  createdAt: string;
}

function fmtSalary(min: number | null, max: number | null, cur: string) {
  if (!min && !max) return "Competitive";
  if (min && max) return `${cur} ${(min / 1000).toFixed(0)}k – ${(max / 1000).toFixed(0)}k / year`;
  if (min) return `${cur} ${(min / 1000).toFixed(0)}k+ / year`;
  return "";
}

export function JobDetailClient({ jobId }: { jobId: string }) {
  const [job, setJob]       = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  useEffect(() => {
    fetch(`/api/careers/jobs/${jobId}`)
      .then((r) => r.json())
      .then((d: { job?: JobDetail; error?: string }) => {
        if (d.job) setJob(d.job);
        else setError(d.error ?? "Job not found");
        setLoading(false);
      })
      .catch(() => { setError("Failed to load job"); setLoading(false); });
  }, [jobId]);

  if (loading) return <div className="py-20 text-center text-muted text-sm">Loading…</div>;
  if (error || !job) return (
    <div className="py-20 text-center">
      <p className="text-muted text-sm mb-4">{error || "Job not found"}</p>
      <Link href="/careers" className="text-signal text-sm hover:underline">← Back to Careers</Link>
    </div>
  );

  const skills       = Array.isArray(job.skills)          ? (job.skills          as string[]) : [];
  const reqs         = Array.isArray(job.requirements)    ? (job.requirements    as string[]) : [];
  const resps        = Array.isArray(job.responsibilities) ? (job.responsibilities as string[]) : [];
  const benefits     = Array.isArray(job.benefits)        ? (job.benefits        as string[]) : [];

  return (
    <div>
      <div className="mb-6">
        <Link href="/careers" className="text-xs text-muted hover:text-ink font-mono transition-colors">
          ← All Positions
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="page-header-premium">
            <p className="eyebrow-label mb-2">HERMES OS · CAREERS · {job.department.toUpperCase()}</p>
            <h1 className="type-page-title">{job.title}</h1>
          </div>

          <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">About the Role</h2>
            <p className="text-sm text-ink/80 leading-relaxed">{job.description}</p>
          </div>

          {resps.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-6 space-y-3">
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">Responsibilities</h2>
              <ul className="space-y-2">
                {resps.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink/80">
                    <span className="text-signal mt-0.5 shrink-0">▸</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reqs.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-6 space-y-3">
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">Requirements</h2>
              <ul className="space-y-2">
                {reqs.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink/80">
                    <span className="text-ice mt-0.5 shrink-0">✓</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {benefits.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-6 space-y-3">
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">Benefits</h2>
              <ul className="space-y-2">
                {benefits.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink/80">
                    <span className="text-hermes-gold mt-0.5 shrink-0">★</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-5 space-y-4 sticky top-8">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">Position Details</h2>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted font-mono text-xs">LOCATION</span>
                <span className="text-ink">{job.location}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted font-mono text-xs">TYPE</span>
                <span className="text-ink capitalize">{job.locationType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted font-mono text-xs">DEPARTMENT</span>
                <span className="text-ink">{job.department}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted font-mono text-xs">COMPENSATION</span>
                <span className="text-signal font-mono text-xs">{fmtSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)}</span>
              </div>
            </div>

            {skills.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted/70">Key Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((s) => (
                    <span key={s} className="rounded-md bg-bg px-2 py-0.5 text-[10px] font-mono text-muted border border-line">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Link
              href={`/careers/apply/${job.id}`}
              className="block w-full rounded-lg bg-signal text-bg text-center py-2.5 text-sm font-mono font-semibold hover:bg-signal/90 transition-colors"
            >
              Apply for this Role
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
