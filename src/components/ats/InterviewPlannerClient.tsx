"use client";

import { useState, useEffect } from "react";
import type { Interview, InterviewStatus, InterviewType } from "@/lib/ats/types";

const STATUS_BADGE: Record<InterviewStatus, string> = {
  scheduled: "hs-badge hs--warning",
  pending:   "hs-badge hs--nominal",
  completed: "hs-badge hs--reasoning",
  cancelled: "hs-badge hs--risk",
};

const TYPE_BADGE: Record<InterviewType, string> = {
  phone:    "hs-badge hs--nominal",
  video:    "hs-badge hs--confident",
  "on-site":"hs-badge hs--knowledge",
  technical:"hs-badge hs--warning",
  panel:    "hs-badge hs--reasoning",
};

const STATUS_ORDER: InterviewStatus[] = ["scheduled", "pending", "completed", "cancelled"];

export function InterviewPlannerClient() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState<InterviewStatus | "all">("all");
  const [expanded,   setExpanded]   = useState<string | null>(null);

  useEffect(() => {
    // Interviews come from the pipeline API (stub) — use the mock-data interviews directly
    fetch("/api/ats/pipeline")
      .then(() => {
        // Since interviews aren't in a separate API endpoint, we inline a deterministic list
        // derived from the known interview data (no AI, no hallucination)
        const STATIC_INTERVIEWS: Interview[] = [
          {
            id: "int-001", candidateId: "cand-001", candidateName: "Ahmad Karimi",
            jobId: "job-001", jobTitle: "Senior PLC Engineer",
            type: "video", scheduledAt: "2026-07-01T10:00:00Z", durationMinutes: 60,
            interviewer: "Thomas Weber", notes: "Focus on S7-1500 and functional safety experience.",
            status: "scheduled",
          },
          {
            id: "int-002", candidateId: "cand-002", candidateName: "Lars Petersen",
            jobId: "job-001", jobTitle: "Senior PLC Engineer",
            type: "on-site", scheduledAt: "2026-06-25T09:00:00Z", durationMinutes: 120,
            interviewer: "Thomas Weber, Anna Schmidt", notes: "Final round. Completed well. Offer extended.",
            status: "completed",
          },
          {
            id: "int-003", candidateId: "cand-005", candidateName: "James Wright",
            jobId: "job-002", jobTitle: "SCADA Architect",
            type: "panel", scheduledAt: "2026-07-02T13:00:00Z", durationMinutes: 90,
            interviewer: "Sanjay Mehta, Yasmin Al-Hakim", notes: "Architecture design challenge included. Review oil & gas references.",
            status: "scheduled",
          },
          {
            id: "int-004", candidateId: "cand-010", candidateName: "Kris Van Den Berg",
            jobId: "job-003", jobTitle: "Automation Technician",
            type: "video", scheduledAt: "2026-07-03T11:00:00Z", durationMinutes: 45,
            interviewer: "Marie Lefevre", notes: "Check French language level and PLC troubleshooting depth.",
            status: "scheduled",
          },
          {
            id: "int-005", candidateId: "cand-017", candidateName: "Carlos Mendez",
            jobId: "job-005", jobTitle: "Field Service Engineer",
            type: "technical", scheduledAt: "2026-07-05T14:00:00Z", durationMinutes: 75,
            interviewer: "David Park", notes: "P&ID walkthrough exercise and refinery safety protocols review.",
            status: "scheduled",
          },
          {
            id: "int-006", candidateId: "cand-013", candidateName: "Alex Chen",
            jobId: "job-004", jobTitle: "Industrial Software Developer",
            type: "on-site", scheduledAt: "2026-06-20T10:00:00Z", durationMinutes: 120,
            interviewer: "Lisa De Boer, Erik Jansen", notes: "Live coding: OPC-UA bridge implementation. Excellent result.",
            status: "completed",
          },
          {
            id: "int-007", candidateId: "cand-020", candidateName: "Aisha Patel",
            jobId: "job-006", jobTitle: "Sales Engineer — Industrial Automation",
            type: "panel", scheduledAt: "2026-06-15T09:00:00Z", durationMinutes: 90,
            interviewer: "John Hargreaves, Emma Thornton", notes: "Outstanding product knowledge and client references. Hired.",
            status: "completed",
          },
          {
            id: "int-008", candidateId: "cand-003", candidateName: "Mehdi Tehrani",
            jobId: "job-001", jobTitle: "Senior PLC Engineer",
            type: "phone", scheduledAt: null, durationMinutes: 30,
            interviewer: "Thomas Weber", notes: "Initial phone screen to be scheduled after technical assessment.",
            status: "pending",
          },
        ];
        setInterviews(STATIC_INTERVIEWS);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const visible = filter === "all"
    ? interviews
    : interviews.filter(i => i.status === filter);

  const counts: Record<InterviewStatus, number> = {
    scheduled: interviews.filter(i => i.status === "scheduled").length,
    pending:   interviews.filter(i => i.status === "pending").length,
    completed: interviews.filter(i => i.status === "completed").length,
    cancelled: interviews.filter(i => i.status === "cancelled").length,
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1,2,3,4].map(i => (
          <div key={i} className="rounded-xl border border-line bg-surface h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Summary strip */}
      <div className="global-ops-strip">
        {[
          { label: "Total",     value: interviews.length, color: "text-ink"    },
          { label: "Scheduled", value: counts.scheduled,  color: "text-warn"   },
          { label: "Pending",   value: counts.pending,    color: "text-faint"  },
          { label: "Completed", value: counts.completed,  color: "text-signal" },
          { label: "Cancelled", value: counts.cancelled,  color: "text-danger" },
        ].map(kpi => (
          <div key={kpi.label} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{kpi.label}</p>
            <p className={`exec-kpi-value ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...STATUS_ORDER] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s as InterviewStatus | "all")}
            className={`hs-badge transition-colors ${
              filter === s
                ? s === "scheduled" ? "hs--warning"
                : s === "completed" ? "hs--reasoning"
                : s === "cancelled" ? "hs--risk"
                : "hs--memory"
                : "hs--nominal opacity-60"
            }`}
          >
            {s.toUpperCase()}
          </button>
        ))}
        <span className="kpi-label text-faint ms-auto">{visible.length} interview{visible.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Interview list */}
      <div className="space-y-2">
        {visible.map(interview => (
          <div key={interview.id} className="rounded-xl border border-line bg-surface overflow-hidden">
            <button
              className="w-full text-left px-5 py-3.5 hover:bg-surface2 transition-colors"
              onClick={() => setExpanded(prev => prev === interview.id ? null : interview.id)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-body text-xs font-semibold text-ink">{interview.candidateName}</p>
                    <span className={STATUS_BADGE[interview.status]}>{interview.status}</span>
                    <span className={TYPE_BADGE[interview.type]}>{interview.type}</span>
                  </div>
                  <p className="kpi-label text-faint">{interview.jobTitle}</p>
                  <p className="kpi-label text-faint mt-0.5">
                    Interviewer: {interview.interviewer}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  {interview.scheduledAt ? (
                    <>
                      <p className="font-mono text-xs text-ink">
                        {new Date(interview.scheduledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      <p className="kpi-label text-faint">
                        {new Date(interview.scheduledAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} UTC
                      </p>
                    </>
                  ) : (
                    <p className="kpi-label text-faint">Not scheduled</p>
                  )}
                  <p className="kpi-label text-faint mt-0.5">{interview.durationMinutes} min</p>
                </div>
              </div>
            </button>

            {expanded === interview.id && interview.notes && (
              <div className="border-t border-line px-5 py-3 bg-bg">
                <p className="kpi-label mb-1">Interview Notes</p>
                <p className="font-body text-xs text-faint leading-relaxed">{interview.notes}</p>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && (
          <p className="kpi-label text-faint py-8 text-center">No interviews match this filter</p>
        )}
      </div>
    </div>
  );
}
