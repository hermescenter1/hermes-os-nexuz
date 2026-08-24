"use client";

import { useState, useEffect, useId } from "react";
import { useTranslations }            from "next-intl";
import { Link }                       from "@/i18n/navigation";

interface JobSummary {
  id: string;
  title: string;
  department: string;
  location: string;
}

type FormState = {
  name:              string;
  email:             string;
  phone:             string;
  location:          string;
  coverLetter:       string;
  resumeText:        string;
  totalYearsExp:     string;
  workAuthorization: string;
  skills:            string;
};

const INIT: FormState = {
  name:              "",
  email:             "",
  phone:             "",
  location:          "",
  coverLetter:       "",
  resumeText:        "",
  totalYearsExp:     "",
  workAuthorization: "citizen",
  skills:            "",
};

const WORK_AUTH = ["citizen", "permanent-resident", "work-visa", "requires-sponsorship"] as const;

/** Verification outcome for the posting this application targets. */
type JobState =
  | { kind: "verifying" }
  | { kind: "verified"; job: JobSummary }
  | { kind: "unverified" };

export function ApplyFormClient({ jobId }: { jobId: string }) {
  const t = useTranslations("careers.apply");
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;

  const [jobState, setJobState] = useState<JobState>({ kind: "verifying" });
  const [form, setForm]         = useState<FormState>(INIT);
  const [submitting, setSub]    = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/careers/jobs/${jobId}`)
      .then((r) => r.json())
      .then((d: { job?: JobSummary; source?: "db" | "mock" }) => {
        if (cancelled) return;
        // PHASE 104-I3 — DB-only application contract.
        //
        // The job API falls back to a fabricated posting when the database is
        // unreachable and labels it `source: "mock"`. This flow previously
        // ignored that field entirely, so an invented vacancy became a live
        // application target: a candidate could complete and submit a real
        // application — with their name, email and résumé — against a job that
        // does not exist. Only a verifiably database-backed posting opens the
        // form; anything else gets the honest unavailable state below.
        setJobState(
          d.source === "db" && d.job ? { kind: "verified", job: d.job } : { kind: "unverified" }
        );
      })
      .catch(() => { if (!cancelled) setJobState({ kind: "unverified" }); });
    return () => { cancelled = true; };
  }, [jobId]);

  function set(field: keyof FormState, val: string) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (jobState.kind !== "verified") return;   // belt-and-braces: no unverified submit
    if (!form.name.trim() || !form.email.trim()) {
      setError(t("errorRequired"));
      return;
    }
    setSub(true);
    setError("");
    try {
      const res = await fetch("/api/careers/apply", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          name:              form.name,
          email:             form.email,
          phone:             form.phone || undefined,
          location:          form.location || undefined,
          coverLetter:       form.coverLetter || undefined,
          resumeText:        form.resumeText || undefined,
          totalYearsExp:     form.totalYearsExp ? Number(form.totalYearsExp) : undefined,
          workAuthorization: form.workAuthorization,
          skills:            form.skills ? form.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
        }),
      });
      if (!res.ok) {
        // The server's own error string is not echoed: it is unlocalized and
        // not vetted for public display.
        setError(t("errorGeneric"));
      } else {
        setSuccess(true);
      }
    } catch {
      setError(t("errorNetwork"));
    } finally {
      setSub(false);
    }
  }

  const job = jobState.kind === "verified" ? jobState.job : null;

  // ── Success ───────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div role="status" className="max-w-md space-y-4 rounded-2xl border border-signal/30 bg-signal/5 p-8 text-center">
          <div aria-hidden="true" className="text-4xl text-signal">✓</div>
          <h1 className="type-page-title">{t("successTitle")}</h1>
          <p className="text-sm leading-relaxed text-muted">
            {job ? t("successBodyFor", { title: job.title }) : t("successBody")}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/careers" className="ds-focus rounded-lg border border-line px-4 py-2.5 text-sm text-muted transition-colors hover:text-ink">
              {t("successAllJobs")}
            </Link>
            <Link href="/candidate" className="ds-focus rounded-lg bg-signal px-4 py-2.5 text-sm font-mono text-bg transition-colors hover:bg-signal/90">
              {t("successMyApplications")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Verifying ─────────────────────────────────────────────────────────────
  if (jobState.kind === "verifying") {
    return (
      <div className="py-24 text-center text-sm text-muted" aria-busy="true">
        {t("verifying")}
      </div>
    );
  }

  // ── Unverified posting: no form is offered at all ─────────────────────────
  if (jobState.kind === "unverified") {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <h1 className="type-page-title mb-3">{t("unavailableTitle")}</h1>
        <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-muted">{t("unavailableBody")}</p>
        <Link
          href="/careers"
          className="ds-focus inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-signal px-6 py-2.5 text-sm font-semibold text-bg transition-colors hover:bg-signal/90"
        >
          {t("unavailableCta")}
          <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span>
        </Link>
      </div>
    );
  }

  const req = t("requiredMark");
  const fieldCls =
    "ds-focus w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-signal";

  // ── Verified posting: the application form ────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href={`/careers/${jobId}`} className="ds-focus font-mono text-xs text-muted transition-colors hover:text-ink">
          <span aria-hidden="true" className="inline-block rtl:rotate-180">←</span> {t("backToJob")}
        </Link>
      </div>

      <div className="page-header-premium mb-8">
        <p className="eyebrow-label mb-2">{t("eyebrow")}</p>
        <h1 className="type-page-title">
          {job ? t("titleFor", { title: job.title }) : t("titleGeneric")}
        </h1>
        {job && (
          <p className="mt-2 type-secondary">
            {job.department} · {job.location}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Personal */}
        <section aria-labelledby={fid("ph")} className="space-y-4 rounded-xl border border-line bg-surface p-6">
          <div>
            <h2 id={fid("ph")} className="font-mono text-xs uppercase tracking-widest text-muted/70">{t("personalSection")}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted/80">{t("personalSectionHint")}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={fid("name")} className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted">
                {t("fullName")}<span aria-hidden="true" className="ms-1 text-signal">*</span><span className="sr-only"> ({req})</span>
              </label>
              <input id={fid("name")} required value={form.name} onChange={(e) => set("name", e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label htmlFor={fid("email")} className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted">
                {t("emailAddress")}<span aria-hidden="true" className="ms-1 text-signal">*</span><span className="sr-only"> ({req})</span>
              </label>
              <input id={fid("email")} required type="email" dir="ltr" value={form.email} onChange={(e) => set("email", e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label htmlFor={fid("phone")} className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted">{t("phone")}</label>
              <input id={fid("phone")} type="tel" dir="ltr" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label htmlFor={fid("loc")} className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted">{t("currentLocation")}</label>
              <input id={fid("loc")} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder={t("currentLocationPlaceholder")} className={fieldCls} />
            </div>
          </div>
        </section>

        {/* Professional */}
        <section aria-labelledby={fid("prh")} className="space-y-4 rounded-xl border border-line bg-surface p-6">
          <div>
            <h2 id={fid("prh")} className="font-mono text-xs uppercase tracking-widest text-muted/70">{t("profileSection")}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted/80">{t("profileSectionHint")}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={fid("yrs")} className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted">{t("yearsExperience")}</label>
              <input id={fid("yrs")} type="number" min="0" max="50" dir="ltr" value={form.totalYearsExp}
                onChange={(e) => set("totalYearsExp", e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label htmlFor={fid("auth")} className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted">{t("workAuthorization")}</label>
              <select id={fid("auth")} value={form.workAuthorization}
                onChange={(e) => set("workAuthorization", e.target.value)} className={fieldCls}>
                {/* Values stay canonical — only the label is localized. */}
                {WORK_AUTH.map((v) => <option key={v} value={v}>{t(`workAuth.${v}`)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor={fid("skills")} className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted">{t("keySkills")}</label>
            <p id={fid("skills-hint")} className="mb-1.5 text-xs text-muted/80">{t("keySkillsHint")}</p>
            <input id={fid("skills")} aria-describedby={fid("skills-hint")} value={form.skills}
              onChange={(e) => set("skills", e.target.value)} placeholder={t("keySkillsPlaceholder")} className={fieldCls} />
          </div>

          <div>
            <label htmlFor={fid("resume")} className="mb-1.5 block font-mono text-xs uppercase tracking-wide text-muted">{t("resume")}</label>
            <p id={fid("resume-hint")} className="mb-1.5 text-xs text-muted/80">{t("resumeHint")}</p>
            <textarea id={fid("resume")} aria-describedby={fid("resume-hint")} rows={6} value={form.resumeText}
              onChange={(e) => set("resumeText", e.target.value)} placeholder={t("resumePlaceholder")}
              className={`${fieldCls} resize-y`} />
          </div>
        </section>

        {/* Cover letter */}
        <section aria-labelledby={fid("clh")} className="space-y-3 rounded-xl border border-line bg-surface p-6">
          <div>
            <h2 id={fid("clh")} className="font-mono text-xs uppercase tracking-widest text-muted/70">{t("coverLetterSection")}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted/80">{t("coverLetterHint")}</p>
          </div>
          <textarea aria-labelledby={fid("clh")} rows={8} value={form.coverLetter}
            onChange={(e) => set("coverLetter", e.target.value)} placeholder={t("coverLetterPlaceholder")}
            className={`${fieldCls} resize-y`} />
        </section>

        {error && (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
            <p className="text-sm font-semibold text-danger">{t("errorHeading")}</p>
            <p className="mt-1 text-sm leading-relaxed text-danger/90">{error}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Link href={`/careers/${jobId}`}
            className="ds-focus rounded-lg border border-line px-5 py-2.5 text-sm text-muted transition-colors hover:text-ink">
            {t("cancel")}
          </Link>
          <button type="submit" disabled={submitting}
            className="ds-focus rounded-lg bg-signal px-6 py-2.5 font-mono text-sm font-semibold text-bg transition-colors hover:bg-signal/90 disabled:opacity-50">
            {submitting ? t("submitting") : t("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
