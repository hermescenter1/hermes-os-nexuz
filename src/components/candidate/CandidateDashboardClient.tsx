"use client";

import { useState, useEffect } from "react";
import { Link }                 from "@/i18n/navigation";

interface CandidateProfile {
  id: string;
  name: string;
  email: string;
  location: string | null;
  skills: string[];
  workAuthorization: string;
  createdAt: string;
}

interface ApplicationSummary {
  id: string;
  jobTitle: string;
  jobDepartment: string;
  jobLocation: string;
  status: string;
  createdAt: string;
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
  INTERVIEW: "Interview", OFFER: "Offer", HIRED: "Hired", REJECTED: "Rejected",
};

const STAGE_ORDER = ["APPLIED","SCREENING","TECHNICAL_REVIEW","INTERVIEW","OFFER","HIRED","REJECTED"];

export function CandidateDashboardClient() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [apps, setApps]       = useState<ApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauth, setUnauth]   = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/candidate/profile").then((r) => r.json()),
      fetch("/api/candidate/applications").then((r) => r.json()),
    ])
      .then(([prof, appsData]: [{ candidate?: CandidateProfile; error?: string }, { applications?: ApplicationSummary[] }]) => {
        if (prof.error === "Authentication required") { setUnauth(true); setLoading(false); return; }
        if (prof.candidate) setProfile(prof.candidate);
        setApps(appsData.applications ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-20 text-center text-muted text-sm">Loading…</div>;

  if (unauth) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md text-center space-y-4 p-8 rounded-xl border border-line bg-surface">
          <h2 className="font-mono text-lg text-ink">Candidate Portal</h2>
          <p className="text-sm text-muted">Sign in to your candidate account to track your applications.</p>
          <div className="flex gap-3 justify-center">
            <Link href="/auth/login" className="rounded-lg bg-signal px-5 py-2.5 text-sm font-mono text-bg hover:bg-signal/90 transition-colors">
              Sign In
            </Link>
            <Link href="/candidate/register" className="rounded-lg border border-line px-5 py-2.5 text-sm text-muted hover:text-ink transition-colors">
              Register
            </Link>
          </div>
          <p className="text-xs text-muted mt-2">
            <Link href="/careers" className="text-signal hover:underline">Browse open positions →</Link>
          </p>
        </div>
      </div>
    );
  }

  const active = apps.filter((a) => !["HIRED","REJECTED"].includes(a.status));
  const terminal = apps.filter((a) => ["HIRED","REJECTED"].includes(a.status));

  return (
    <div>
      <div className="page-header-premium">
        <p className="eyebrow-label mb-2">HERMES OS · CANDIDATE PORTAL</p>
        <h1 className="type-page-title">Welcome back{profile ? `, ${profile.name.split(" ")[0]}` : ""}</h1>
        <p className="mt-2 type-secondary">Track your applications and interview progress.</p>
      </div>

      {/* KPI strip */}
      <div className="global-ops-strip mb-8">
        <div className="global-ops-cell">
          <span className="kpi-label">TOTAL APPLICATIONS</span>
          <span className="intel-kpi-value">{apps.length}</span>
        </div>
        <div className="global-ops-cell">
          <span className="kpi-label">ACTIVE</span>
          <span className="intel-kpi-value">{active.length}</span>
        </div>
        <div className="global-ops-cell">
          <span className="kpi-label">OFFERS</span>
          <span className="intel-kpi-value text-emerald-400">{apps.filter((a) => a.status === "OFFER").length}</span>
        </div>
        <div className="global-ops-cell">
          <span className="kpi-label">HIRED</span>
          <span className="intel-kpi-value text-signal">{apps.filter((a) => a.status === "HIRED").length}</span>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex gap-2 mb-6 border-b border-line">
        <Link href="/candidate" className="px-4 py-2 text-sm font-mono text-signal border-b-2 border-signal">Overview</Link>
        <Link href="/candidate/applications" className="px-4 py-2 text-sm font-mono text-muted hover:text-ink transition-colors">All Applications</Link>
      </div>

      {apps.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-muted text-sm">You haven&apos;t applied to any positions yet.</p>
          <Link href="/careers" className="inline-block rounded-lg bg-signal px-5 py-2.5 text-sm font-mono text-bg hover:bg-signal/90 transition-colors">
            Browse Open Positions
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70 mb-3">Active Applications</h2>
              <div className="space-y-3">
                {active.map((app) => (
                  <ApplicationRow key={app.id} app={app} />
                ))}
              </div>
            </div>
          )}
          {terminal.length > 0 && (
            <div>
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70 mb-3">Completed</h2>
              <div className="space-y-3">
                {terminal.map((app) => (
                  <ApplicationRow key={app.id} app={app} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ApplicationRow({ app }: { app: ApplicationSummary }) {
  const cls = STATUS_COLORS[app.status] ?? "bg-surface text-muted border-line";
  const stageIdx = STAGE_ORDER.indexOf(app.status);

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="font-mono text-sm font-semibold text-ink">{app.jobTitle}</h3>
          <p className="text-xs text-muted mt-0.5">{app.jobDepartment} · {app.jobLocation}</p>
        </div>
        <span className={`shrink-0 rounded-md border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wide ${cls}`}>
          {STATUS_LABEL[app.status] ?? app.status}
        </span>
      </div>

      {/* Stage progress bar */}
      {!["HIRED","REJECTED"].includes(app.status) && (
        <div className="flex gap-1">
          {["APPLIED","SCREENING","TECHNICAL_REVIEW","INTERVIEW","OFFER","HIRED"].map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= stageIdx ? "bg-signal" : "bg-line"}`}
            />
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] text-muted font-mono">
        Applied {new Date(app.createdAt).toLocaleDateString()}
      </p>
    </div>
  );
}
