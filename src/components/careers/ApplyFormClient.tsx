"use client";

import { useState, useEffect } from "react";
import { Link }                 from "@/i18n/navigation";

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

export function ApplyFormClient({ jobId }: { jobId: string }) {
  const [job, setJob]       = useState<JobSummary | null>(null);
  const [form, setForm]     = useState<FormState>(INIT);
  const [submitting, setSub] = useState(false);
  const [error, setError]   = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/careers/jobs/${jobId}`)
      .then((r) => r.json())
      .then((d: { job?: JobSummary }) => { if (d.job) setJob(d.job); })
      .catch(() => undefined);
  }, [jobId]);

  function set(field: keyof FormState, val: string) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email) {
      setError("Name and email are required");
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
      const data = await res.json() as { applicationId?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Submission failed");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSub(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md text-center space-y-4 p-8 rounded-xl border border-signal/30 bg-signal/5">
          <div className="text-4xl">✓</div>
          <h2 className="font-mono text-lg text-ink">Application Submitted</h2>
          <p className="text-sm text-muted">
            Thank you for applying{job ? ` for ${job.title}` : ""}. Our team will review your application and be in touch.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/careers" className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-ink transition-colors">
              View All Jobs
            </Link>
            <Link href="/candidate" className="rounded-lg bg-signal px-4 py-2 text-sm text-bg font-mono hover:bg-signal/90 transition-colors">
              My Applications
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href={`/careers/${jobId}`} className="text-xs text-muted hover:text-ink font-mono transition-colors">
          ← Back to Job
        </Link>
      </div>

      <div className="page-header-premium mb-8">
        <p className="eyebrow-label mb-2">HERMES OS · CAREERS · APPLICATION</p>
        <h1 className="type-page-title">{job ? `Apply — ${job.title}` : "Apply for Position"}</h1>
        {job && (
          <p className="mt-2 type-secondary">
            {job.department} · {job.location}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">Personal Information</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Full Name *</label>
              <input
                required value={form.name} onChange={(e) => set("name", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
              />
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Email Address *</label>
              <input
                required type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
              />
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Phone</label>
              <input
                type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
              />
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Current Location</label>
              <input
                value={form.location} onChange={(e) => set("location", e.target.value)}
                placeholder="City, Country"
                className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">Professional Profile</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Years of Experience</label>
              <input
                type="number" min="0" max="50" value={form.totalYearsExp}
                onChange={(e) => set("totalYearsExp", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
              />
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Work Authorization</label>
              <select
                value={form.workAuthorization} onChange={(e) => set("workAuthorization", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
              >
                <option value="citizen">Citizen</option>
                <option value="permanent-resident">Permanent Resident</option>
                <option value="work-visa">Work Visa</option>
                <option value="requires-sponsorship">Requires Sponsorship</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Key Skills (comma-separated)</label>
            <input
              value={form.skills} onChange={(e) => set("skills", e.target.value)}
              placeholder="PLC, SCADA, Python, OPC-UA…"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
            />
          </div>

          <div>
            <label className="block mb-1.5 text-xs font-mono text-muted uppercase tracking-wide">Resume / CV (paste text)</label>
            <textarea
              rows={6} value={form.resumeText} onChange={(e) => set("resumeText", e.target.value)}
              placeholder="Paste your resume or CV text here…"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal resize-none"
            />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">Cover Letter</h2>
          <textarea
            rows={8} value={form.coverLetter} onChange={(e) => set("coverLetter", e.target.value)}
            placeholder="Tell us why you're a great fit for this role…"
            className="w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal resize-none"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger font-mono">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Link
            href={`/careers/${jobId}`}
            className="rounded-lg border border-line px-5 py-2.5 text-sm text-muted hover:text-ink transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-signal px-6 py-2.5 text-sm font-mono font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit Application"}
          </button>
        </div>
      </form>
    </div>
  );
}
