"use client";

import { useLocale } from "next-intl";
import { useState, useEffect, useMemo } from "react";
import type { Candidate, PipelineStage } from "@/lib/ats/types";
import { STAGE_LABELS, STAGE_ORDER }     from "@/lib/ats/types";
import { AtsScoreCard }                  from "./AtsScoreCard";
import { formatNumber } from "@/lib/i18n/format";

interface CandidatesResponse { candidates: Candidate[]; total: number }

const SCORE_COLOR = (s: number) =>
  s >= 80 ? "text-signal" : s >= 60 ? "text-warn" : "text-danger";

const STAGE_BADGE: Record<PipelineStage, string> = {
  applied:            "hs-badge hs--nominal",
  screening:          "hs-badge hs--confident",
  "technical-review": "hs-badge hs--knowledge",
  interview:          "hs-badge hs--warning",
  offer:              "hs-badge hs--reasoning",
  hired:              "hs-badge hs--reasoning",
  rejected:           "hs-badge hs--risk",
};

const SOURCE_LABEL: Record<string, string> = {
  linkedin: "LinkedIn", indeed: "Indeed", referral: "Referral",
  direct: "Direct", agency: "Agency", internal: "Internal",
};

export function CandidateListClient() {
  const locale = useLocale();
  const [data,       setData]       = useState<CandidatesResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [stageFilter,setStageFilter]= useState<PipelineStage | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search,     setSearch]     = useState("");

  useEffect(() => {
    const url = stageFilter === "all"
      ? "/api/ats/candidates"
      : `/api/ats/candidates?stage=${stageFilter}`;
    fetch(url)
      .then(r => r.json())
      .then((d: CandidatesResponse) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [stageFilter]);

  const visible = useMemo(() => {
    const list = data?.candidates ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.skills.some(s => s.toLowerCase().includes(q)) ||
      c.location.toLowerCase().includes(q)
    );
  }, [data, search]);

  const selected = useMemo(() =>
    data?.candidates.find(c => c.id === selectedId) ?? null,
    [data, selectedId]
  );

  return (
    <div className="flex flex-col gap-5">

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search candidates, skills, location…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded border border-line bg-bg px-3 py-1.5 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-signal/50 w-56"
        />
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...STAGE_ORDER] as const).map(s => (
            <button
              key={s}
              onClick={() => { setStageFilter(s as PipelineStage | "all"); setLoading(true); }}
              className={`hs-badge transition-colors ${
                stageFilter === s
                  ? s === "hired" ? "hs--reasoning" : s === "rejected" ? "hs--risk" : s === "interview" ? "hs--warning" : "hs--memory"
                  : "hs--nominal opacity-60"
              }`}
            >
              {s === "all" ? "ALL" : STAGE_LABELS[s as PipelineStage].toUpperCase()}
            </button>
          ))}
        </div>
        <span className="kpi-label text-faint ms-auto">{loading ? "Loading…" : `${visible.length} candidates`}</span>
      </div>

      {/* Main grid */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Candidate list */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="space-y-1.5">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="rounded border border-line bg-surface h-16 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {visible.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(prev => prev === c.id ? null : c.id)}
                  className={`w-full text-left rounded border px-3 py-2.5 transition-colors ${
                    selectedId === c.id
                      ? "border-signal/40 bg-signal/[0.03]"
                      : "border-line bg-surface hover:bg-surface2"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-body text-xs font-semibold text-ink">{c.name}</p>
                        <span className={STAGE_BADGE[c.stage]}>{STAGE_LABELS[c.stage]}</span>
                      </div>
                      <p className="kpi-label text-faint mt-0.5">
                        {c.location} · {c.experienceYears}y exp · {SOURCE_LABEL[c.source]}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className={`font-mono text-base font-bold ${SCORE_COLOR(c.atsScore.total)}`}>
                          {c.atsScore.total}
                        </p>
                        <p className="kpi-label">ATS</p>
                      </div>
                      {c.atsScore.riskFlags.length > 0 && (
                        <span className="hs-badge hs--risk">{c.atsScore.riskFlags.length}⚑</span>
                      )}
                    </div>
                  </div>
                  {selectedId === c.id && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.skills.slice(0, 6).map(s => (
                        <span key={s} className="hs-badge hs--knowledge">{s}</span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
              {visible.length === 0 && (
                <p className="kpi-label text-faint py-8 text-center">No candidates match your filters</p>
              )}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div>
          {selected ? (
            <div className="rounded-xl border border-line bg-surface px-4 py-4 space-y-4 sticky top-4">
              {/* Header */}
              <div className="border-b border-line pb-3">
                <p className="font-body text-sm font-semibold text-ink">{selected.name}</p>
                <p className="kpi-label text-faint mt-0.5">{selected.location} · {selected.experienceYears}y experience</p>
                <span className={`${STAGE_BADGE[selected.stage]} mt-1.5 inline-block`}>
                  {STAGE_LABELS[selected.stage]}
                </span>
              </div>

              {/* ATS Score breakdown */}
              <AtsScoreCard score={selected.atsScore} />

              {/* Contact + meta */}
              <div className="border-t border-line pt-3 space-y-1.5">
                {[
                  { label: "Email",        value: selected.email           },
                  { label: "Phone",        value: selected.phone           },
                  { label: "Auth",         value: selected.workAuthorization.replace(/-/g, " ") },
                  { label: "Salary",       value: `${formatNumber(selected.salaryExpectation, locale)} — expectation` },
                  { label: "Source",       value: SOURCE_LABEL[selected.source] },
                  { label: "Applied",      value: selected.appliedAt       },
                ].map(row => (
                  <div key={row.label} className="flex justify-between gap-2">
                    <span className="kpi-label text-faint flex-shrink-0">{row.label}</span>
                    <span className="font-mono text-[0.65rem] text-ink text-right truncate">{row.value}</span>
                  </div>
                ))}
              </div>

              <div>
                <p className="kpi-label mb-1.5">CV Summary</p>
                <p className="font-body text-xs text-faint leading-relaxed">{selected.cvSummary}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface px-4 py-8 flex flex-col items-center justify-center text-center">
              <p className="kpi-label text-faint">Select a candidate</p>
              <p className="kpi-label text-faint/60 mt-1">Click any row to view ATS score breakdown</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
