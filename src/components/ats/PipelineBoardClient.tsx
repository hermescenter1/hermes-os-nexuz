"use client";

import { useLocale } from "next-intl";
import { useState, useEffect }          from "react";
import type { PipelineColumn, Candidate, PipelineStage } from "@/lib/ats/types";
import { AtsScoreCard }                 from "./AtsScoreCard";
import { formatNumber } from "@/lib/i18n/format";

interface PipelineResponse { columns: PipelineColumn[]; total: number }

const SCORE_COLOR = (s: number) =>
  s >= 80 ? "text-signal" : s >= 60 ? "text-warn" : "text-danger";

const COL_ACCENT: Record<PipelineStage, string> = {
  applied:            "border-t-muted",
  screening:          "border-t-ice",
  "technical-review": "border-t-ice",
  interview:          "border-t-warn",
  offer:              "border-t-signal",
  hired:              "border-t-signal",
  rejected:           "border-t-danger",
};

const COL_COUNT_COLOR: Record<PipelineStage, string> = {
  applied:            "text-muted",
  screening:          "text-ice",
  "technical-review": "text-ice",
  interview:          "text-warn",
  offer:              "text-signal",
  hired:              "text-signal",
  rejected:           "text-danger",
};

function CandidateCard({
  candidate, isSelected, onClick,
}: { candidate: Candidate; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded border px-2.5 py-2 transition-colors ${
        isSelected
          ? "border-signal/40 bg-signal/[0.04]"
          : "border-line bg-bg hover:bg-surface2"
      }`}
    >
      <div className="flex items-center justify-between gap-1.5 mb-0.5">
        <p className="font-body text-xs font-semibold text-ink truncate">{candidate.name}</p>
        <span className={`font-mono text-xs font-bold flex-shrink-0 ${SCORE_COLOR(candidate.atsScore.total)}`}>
          {candidate.atsScore.total}
        </span>
      </div>
      <p className="kpi-label text-faint truncate">{candidate.location}</p>
      <p className="kpi-label text-faint">{candidate.experienceYears}y exp</p>
    </button>
  );
}

export function PipelineBoardClient() {
  const locale = useLocale();
  const [data,       setData]       = useState<PipelineResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ats/pipeline")
      .then(r => r.json())
      .then((d: PipelineResponse) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const selected = data?.columns
    .flatMap(c => c.candidates)
    .find(c => c.id === selectedId) ?? null;

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {[1,2,3,4,5,6,7].map(i => (
          <div key={i} className="flex-shrink-0 w-40 h-64 rounded-xl border border-line bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-danger/30 bg-surface px-5 py-4">
        <p className="font-mono text-sm text-danger">Pipeline data unavailable</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="kpi-label text-faint">
        {data.total} candidate{data.total !== 1 ? "s" : ""} across {data.columns.filter(c => c.count > 0).length} active stages · Click a card to inspect
      </p>

      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "360px" }}>
        {data.columns.map(col => (
          <div
            key={col.stage}
            className={`flex-shrink-0 w-44 flex flex-col rounded-xl border border-t-2 border-line bg-surface ${COL_ACCENT[col.stage]}`}
          >
            {/* Column header */}
            <div className="px-3 py-2.5 border-b border-line">
              <p className="kpi-label truncate">{col.label}</p>
              <p className={`font-mono text-sm font-bold ${COL_COUNT_COLOR[col.stage]}`}>{col.count}</p>
            </div>

            {/* Candidate cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {col.candidates.map(c => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  isSelected={selectedId === c.id}
                  onClick={() => setSelectedId(prev => prev === c.id ? null : c.id)}
                />
              ))}
              {col.count === 0 && (
                <p className="kpi-label text-faint text-center py-4">Empty</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Selected candidate detail */}
      {selected && (
        <div className="rounded-xl border border-signal/20 bg-surface px-5 py-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="h-layer-sep mb-3">
              <span className="kpi-label">Candidate Profile</span>
            </div>
            <p className="font-body text-sm font-semibold text-ink mb-1">{selected.name}</p>
            <p className="kpi-label text-faint mb-3">{selected.location} · {selected.experienceYears}y experience</p>
            <div className="space-y-1">
              {[
                { label: "Work Auth", value: selected.workAuthorization.replace(/-/g, " ") },
                { label: "Salary Exp.", value: `${formatNumber(selected.salaryExpectation, locale)}` },
                { label: "Applied",    value: selected.appliedAt },
              ].map(row => (
                <div key={row.label} className="flex justify-between gap-2">
                  <span className="kpi-label text-faint">{row.label}</span>
                  <span className="font-mono text-[0.65rem] text-ink">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <p className="kpi-label mb-1.5">Skills</p>
              <div className="flex flex-wrap gap-1">
                {selected.skills.slice(0, 8).map(s => (
                  <span key={s} className="hs-badge hs--knowledge">{s}</span>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="h-layer-sep mb-3">
              <span className="kpi-label">ATS Score Analysis</span>
            </div>
            <AtsScoreCard score={selected.atsScore} />
          </div>

          <div>
            <div className="h-layer-sep mb-3">
              <span className="kpi-label">CV Summary</span>
            </div>
            <p className="font-body text-xs text-faint leading-relaxed">{selected.cvSummary}</p>
          </div>
        </div>
      )}
    </div>
  );
}
