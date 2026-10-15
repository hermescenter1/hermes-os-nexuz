"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import type { InterviewStatus, InterviewType } from "@/lib/ats/types";
import { formatDate } from "@/lib/i18n/format";

/**
 * Interview planner — REAL, tenant-scoped.
 *
 * Reads this organization's interviews from `/api/ats/interviews` (the real,
 * org-scoped route) and renders only what the records actually contain. There
 * is no static or fabricated interview list. A fresh organization with no
 * interviews gets the honest empty state.
 */

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

/** The real AtsInterviewType enum mapped to the display vocabulary. */
function mapType(t: string): InterviewType {
  switch (t) {
    case "VIDEO_CALL": return "video";
    case "TECHNICAL": return "technical";
    case "PANEL": return "panel";
    case "ONSITE": return "on-site";
    default: return "phone"; // PHONE_SCREEN and unknown
  }
}

interface ApiInterview {
  id: string;
  interviewType: string;
  scheduledAt: string | null;
  durationMinutes: number;
  interviewerName: string | null;
  location: string | null;
  notes: string | null;
  completedAt: string | null;
}
interface ViewInterview {
  id: string;
  type: InterviewType;
  status: InterviewStatus;
  scheduledAt: string | null;
  durationMinutes: number;
  interviewerName: string | null;
  notes: string | null;
}

function toView(i: ApiInterview): ViewInterview {
  const status: InterviewStatus = i.completedAt
    ? "completed"
    : i.scheduledAt && new Date(i.scheduledAt).getTime() >= Date.now()
      ? "scheduled"
      : "pending";
  return {
    id: i.id,
    type: mapType(i.interviewType),
    status,
    scheduledAt: i.scheduledAt,
    durationMinutes: i.durationMinutes,
    interviewerName: i.interviewerName,
    notes: i.notes,
  };
}

export function InterviewPlannerClient() {
  const t = useTranslations("ats");
  const locale = useLocale();
  const [interviews, setInterviews] = useState<ViewInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<InterviewStatus | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/ats/interviews", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: { interviews?: ApiInterview[] }) => {
        if (!active) return;
        setInterviews((d.interviews ?? []).map(toView));
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const visible = filter === "all" ? interviews : interviews.filter((i) => i.status === filter);
  const counts: Record<InterviewStatus, number> = {
    scheduled: interviews.filter((i) => i.status === "scheduled").length,
    pending:   interviews.filter((i) => i.status === "pending").length,
    completed: interviews.filter((i) => i.status === "completed").length,
    cancelled: interviews.filter((i) => i.status === "cancelled").length,
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-line bg-surface h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (failed) {
    return <p role="alert" className="kpi-label text-danger py-8 text-center">{t("analyticsUnavailable")}</p>;
  }

  if (interviews.length === 0) {
    return <p className="kpi-label text-metadata py-12 text-center">{t("realEmpty.body")}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="global-ops-strip">
        {[
          { id: "statusTotal",     label: t("statusTotal"),     value: interviews.length, color: "text-ink"      },
          { id: "statusScheduled", label: t("statusScheduled"), value: counts.scheduled,  color: "text-warn"     },
          { id: "statusPending",   label: t("statusPending"),   value: counts.pending,    color: "text-metadata" },
          { id: "statusCompleted", label: t("statusCompleted"), value: counts.completed,  color: "text-signal"   },
          { id: "statusCancelled", label: t("statusCancelled"), value: counts.cancelled,  color: "text-danger"   },
        ].map((kpi) => (
          <div key={kpi.id} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{kpi.label}</p>
            <p className={`exec-kpi-value ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...STATUS_ORDER] as const).map((s) => (
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
        <span className="kpi-label text-metadata ms-auto">{visible.length} interview{visible.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="space-y-2">
        {visible.map((interview) => (
          <div key={interview.id} className="rounded-xl border border-line bg-surface overflow-hidden">
            <button
              className="w-full text-left px-5 py-3.5 hover:bg-surface2 transition-colors"
              onClick={() => setExpanded((prev) => (prev === interview.id ? null : interview.id))}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={STATUS_BADGE[interview.status]}>{interview.status}</span>
                    <span className={TYPE_BADGE[interview.type]}>{interview.type}</span>
                  </div>
                  {interview.interviewerName ? (
                    <p className="kpi-label text-metadata mt-0.5">Interviewer: {interview.interviewerName}</p>
                  ) : null}
                </div>
                <div className="text-right flex-shrink-0">
                  {interview.scheduledAt ? (
                    <>
                      <p className="font-mono text-xs text-ink">
                        {formatDate(interview.scheduledAt, locale, { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      <p className="kpi-label text-metadata">
                        {formatDate(interview.scheduledAt, locale, { hour: "2-digit", minute: "2-digit" })} UTC
                      </p>
                    </>
                  ) : (
                    <p className="kpi-label text-metadata">{t("notScheduled")}</p>
                  )}
                  <p className="kpi-label text-metadata mt-0.5">{interview.durationMinutes} min</p>
                </div>
              </div>
            </button>

            {expanded === interview.id && interview.notes && (
              <div className="border-t border-line px-5 py-3 bg-bg">
                <p className="kpi-label mb-1">{t("interviewNotes")}</p>
                <p className="font-body text-xs text-metadata leading-relaxed">{interview.notes}</p>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && (
          <p className="kpi-label text-metadata py-8 text-center">{t("noInterviewsMatch")}</p>
        )}
      </div>
    </div>
  );
}
