"use client";

import { useState, useEffect } from "react";
import { Link }                 from "@/i18n/navigation";
import { useTranslations }      from "next-intl";

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
  const t = useTranslations("careers");
  const [job, setJob]         = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/careers/jobs/${jobId}`)
      .then((r) => r.json())
      .then((d: { job?: JobDetail; source?: "db" | "mock" }) => {
        if (cancelled) return;
        // PHASE 104-I2 — DB-only public rendering, matching the board.
        // The API falls back to a fabricated posting (invented salary band,
        // location and requirements) when the database is unreachable and
        // labels it `source: "mock"`. The board already suppresses that data;
        // this detail route did not, so an invented posting was published as a
        // real vacancy. Only a verifiably database-backed record renders.
        setJob(d.source === "db" && d.job ? d.job : null);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setJob(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [jobId]);

  if (loading) return <div className="py-20 text-center text-muted text-sm">{t("jobLoading")}</div>;

  // One honest state for "no verified posting": not published, closed, never
  // existed, or the datastore is unavailable. It carries the page's <h1> —
  // this branch previously rendered a bare <p>, leaving the document with no
  // top-level heading at all.
  if (!job) return (
    <div className="py-20 text-center">
      <h1 className="type-page-title mb-3">{t("jobUnavailable")}</h1>
      <p className="text-muted text-sm mb-6 mx-auto max-w-md leading-relaxed">{t("jobUnavailableBody")}</p>
      <Link href="/careers" className="ds-focus inline-flex min-h-11 items-center gap-1.5 text-signal text-sm hover:underline">
        <span aria-hidden="true" className="rtl:rotate-180 inline-block">←</span> {t("backToBoard")}
      </Link>
    </div>
  );

  const skills       = Array.isArray(job.skills)          ? (job.skills          as string[]) : [];
  const reqs         = Array.isArray(job.requirements)    ? (job.requirements    as string[]) : [];
  const resps        = Array.isArray(job.responsibilities) ? (job.responsibilities as string[]) : [];
  const benefits     = Array.isArray(job.benefits)        ? (job.benefits        as string[]) : [];

  return (
    <div>
      <div className="mb-6">
        <Link href="/careers" className="ds-focus inline-flex min-h-11 items-center gap-1.5 text-xs text-muted hover:text-ink font-mono transition-colors">
          <span aria-hidden="true" className="rtl:rotate-180 inline-block">←</span> {t("backToBoard")}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="page-header-premium">
            <p className="eyebrow-label mb-2">HERMES OS · CAREERS · {job.department.toUpperCase()}</p>
            <h1 className="type-page-title">{job.title}</h1>
          </div>

          <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">{t("aboutRole")}</h2>
            <p className="text-sm text-ink/80 leading-relaxed">{job.description}</p>
          </div>

          {resps.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-6 space-y-3">
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">{t("responsibilities")}</h2>
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
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">{t("requirements")}</h2>
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
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">{t("benefits")}</h2>
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
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">{t("positionDetails")}</h2>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted font-mono text-xs">{t("locationLabel")}</span>
                <span className="text-ink">{job.location}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted font-mono text-xs">{t("typeLabel")}</span>
                <span className="text-ink capitalize">{job.locationType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted font-mono text-xs">{t("departmentDetailLabel")}</span>
                <span className="text-ink">{job.department}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted font-mono text-xs">{t("compensationLabel")}</span>
                <span className="text-signal font-mono text-xs">{fmtSalary(job.salaryMin, job.salaryMax, job.salaryCurrency)}</span>
              </div>
            </div>

            {skills.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted/70">{t("keySkills")}</h3>
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
              {t("applyCta")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
