import type { AtsScore } from "@/lib/ats/types";

const SCORE_COLOR = (s: number) =>
  s >= 80 ? "text-signal" : s >= 60 ? "text-warn" : "text-danger";

const BAR_COLOR = (s: number) =>
  s >= 80 ? "bg-signal" : s >= 60 ? "bg-warn" : "bg-danger";

const RING_COLOR = (s: number) =>
  s >= 80 ? "border-signal/40" : s >= 60 ? "border-warn/40" : "border-danger/40";

interface ScoreBarProps { label: string; value: number; weight: string }

function ScoreBar({ label, value, weight }: ScoreBarProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="kpi-label text-faint">{label}</span>
        <span className={`font-mono text-[0.65rem] font-semibold ${SCORE_COLOR(value)}`}>
          {value} <span className="text-faint font-normal">({weight})</span>
        </span>
      </div>
      <div className="h-1 rounded bg-line overflow-hidden">
        <div className={`h-1 rounded ${BAR_COLOR(value)} opacity-70`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

interface Props {
  score: AtsScore;
  compact?: boolean;
}

export function AtsScoreCard({ score, compact = false }: Props) {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${RING_COLOR(score.total)}`}>
          <span className={`font-mono text-xs font-bold ${SCORE_COLOR(score.total)}`}>{score.total}</span>
        </div>
        {score.riskFlags.length > 0 && (
          <span className="hs-badge hs--risk" title={score.riskFlags.join(" · ")}>
            {score.riskFlags.length} risk
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Total score ring */}
      <div className="flex items-center gap-4">
        <div className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full border-2 ${RING_COLOR(score.total)}`}>
          <div className="text-center">
            <p className={`font-mono text-xl font-bold leading-none ${SCORE_COLOR(score.total)}`}>{score.total}</p>
            <p className="kpi-label" style={{ fontSize: "0.48rem" }}>ATS</p>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          <ScoreBar label="Skill Match"       value={score.skillScore}         weight="35%" />
          <ScoreBar label="Experience"        value={score.experienceScore}    weight="20%" />
          <ScoreBar label="Authorization"     value={score.authorizationScore} weight="15%" />
        </div>
      </div>

      <div className="space-y-1.5">
        <ScoreBar label="Location"   value={score.locationScore} weight="10%" />
        <ScoreBar label="Salary Fit" value={score.salaryScore}   weight="10%" />
        <ScoreBar label="Industry"   value={score.industryScore} weight="10%" />
      </div>

      {/* Risk flags */}
      {score.riskFlags.length > 0 && (
        <div className="rounded border border-danger/20 bg-danger/[0.04] px-3 py-2.5">
          <p className="kpi-label text-danger mb-1.5">RISK FLAGS</p>
          {score.riskFlags.map((f, i) => (
            <p key={i} className="font-body text-xs text-danger/80 leading-snug">{f}</p>
          ))}
        </div>
      )}

      {/* Explanations */}
      <div>
        <p className="kpi-label mb-2">Score Rationale</p>
        <div className="space-y-1">
          {score.explanations.map((e, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="h-1 w-1 rounded-full bg-signal/60 flex-shrink-0 mt-1.5" />
              <p className="font-body text-xs text-faint leading-snug">{e}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
