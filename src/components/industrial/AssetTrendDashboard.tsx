"use client";

import { useState, useEffect } from "react";

interface Snapshot {
  id:             string;
  riskScore:      number | null;
  riskLevel:      string;
  healthScore:    number | null;
  healthStatus:   string;
  healthTrend:    string;
  tagCount:       number;
  knowledgeTotal: number;
  deltaRiskScore: number | null;
  deltaHealth:    number | null;
  createdAt:      string;
}

interface RiskPoint   { riskScore: number; createdAt: string }
interface HealthPoint { healthScore: number; healthStatus: string; createdAt: string }

interface TrendData {
  snapshots:     Snapshot[];
  riskHistory:   RiskPoint[];
  healthHistory: HealthPoint[];
}

function DeltaBadge({ delta, invert = false }: { delta: number | null; invert?: boolean }) {
  if (delta === null) return null;
  const good = invert ? delta < 0 : delta > 0;
  const bad  = invert ? delta > 0 : delta < 0;
  const color = good ? "var(--signal)" : bad ? "var(--danger)" : "var(--muted)";
  const sign  = delta > 0 ? "+" : "";
  return (
    <span className="font-mono text-[0.6rem]" style={{ color }}>
      {sign}{Math.round(delta)}
    </span>
  );
}

function MiniLine({
  data,
  color = "var(--signal)",
}: {
  data: number[];
  color?: string;
}) {
  if (data.length < 2) return null;
  const w = 220, h = 48;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const span = mx - mn || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - 4 - ((v - mn) / span) * (h - 8)}`)
    .join(" ");

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      className="w-full"
      style={{ direction: "ltr" }}
    >
      <defs>
        <linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface AssetTrendDashboardProps {
  assetId: string;
}

export function AssetTrendDashboard({ assetId }: AssetTrendDashboardProps) {
  const [data,    setData]    = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/industrial/assets/${assetId}/trends`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [assetId]);

  if (loading) {
    return (
      <div className="py-8 text-center font-mono text-xs text-muted animate-pulse">
        Loading trend data…
      </div>
    );
  }

  if (!data || data.snapshots.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface px-4 py-6 text-center">
        <p className="font-mono text-xs text-muted">
          No trend data yet. Run the automation engine to generate intelligence snapshots.
        </p>
      </div>
    );
  }

  const latest     = data.snapshots[0];
  const riskPts    = [...data.riskHistory].reverse().map((r) => r.riskScore);
  const healthPts  = [...data.healthHistory].reverse().map((h) => h.healthScore);

  const riskColor =
    latest.riskLevel === "CRITICAL" ? "var(--danger)"
    : latest.riskLevel === "HIGH"   ? "#e8643c"
    : latest.riskLevel === "MEDIUM" ? "var(--warn)"
    : "var(--signal)";

  const healthColor =
    latest.healthStatus === "critical" ? "var(--danger)"
    : latest.healthStatus === "degraded" ? "var(--warn)"
    : "var(--signal)";

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Risk Score",
            value: latest.riskScore !== null ? Math.round(latest.riskScore).toString() : "—",
            delta: latest.deltaRiskScore,
            invertDelta: true,
            color: riskColor,
          },
          {
            label: "Health Score",
            value: latest.healthScore !== null ? Math.round(latest.healthScore).toString() : "—",
            delta: latest.deltaHealth,
            invertDelta: false,
            color: healthColor,
          },
          {
            label: "Tag Count",
            value: latest.tagCount.toString(),
            delta: null,
            invertDelta: false,
            color: "var(--signal)",
          },
          {
            label: "Knowledge",
            value: latest.knowledgeTotal.toString(),
            delta: null,
            invertDelta: false,
            color: "var(--signal)",
          },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted">{m.label}</p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <p className="metric text-2xl font-bold" style={{ color: m.color }}>{m.value}</p>
              <DeltaBadge delta={m.delta} invert={m.invertDelta} />
            </div>
          </div>
        ))}
      </div>

      {/* Risk trend chart */}
      {riskPts.length >= 2 && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted mb-3">Risk Score Trend</p>
          <MiniLine data={riskPts} color={riskColor} />
          <div className="mt-2 flex justify-between font-mono text-[0.6rem] text-muted/50">
            <span>{new Date(data.riskHistory[data.riskHistory.length - 1]?.createdAt).toLocaleDateString()}</span>
            <span>{new Date(data.riskHistory[0]?.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      )}

      {/* Health trend chart */}
      {healthPts.length >= 2 && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted mb-3">Health Score Trend</p>
          <MiniLine data={healthPts} color={healthColor} />
          <div className="mt-2 flex justify-between font-mono text-[0.6rem] text-muted/50">
            <span>{new Date(data.healthHistory[data.healthHistory.length - 1]?.createdAt).toLocaleDateString()}</span>
            <span>{new Date(data.healthHistory[0]?.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      )}

      {/* Snapshot history table */}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">
            Snapshot History ({data.snapshots.length})
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line">
                {["Timestamp", "Risk", "Level", "Health", "Status", "Trend", "ΔRisk", "ΔHealth"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left font-mono text-[0.6rem] uppercase tracking-wider text-muted/60">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.snapshots.map((s) => {
                const rc =
                  s.riskLevel === "CRITICAL" ? "var(--danger)"
                  : s.riskLevel === "HIGH"   ? "#e8643c"
                  : s.riskLevel === "MEDIUM" ? "var(--warn)"
                  : "var(--signal)";
                return (
                  <tr key={s.id} className="border-b border-line/40 hover:bg-white/[0.02]">
                    <td className="px-4 py-2 font-mono text-muted/70 whitespace-nowrap">
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-mono font-bold" style={{ color: rc }}>
                      {s.riskScore !== null ? Math.round(s.riskScore) : "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-[0.6rem] uppercase" style={{ color: rc }}>
                      {s.riskLevel}
                    </td>
                    <td className="px-4 py-2 font-mono text-ink">
                      {s.healthScore !== null ? Math.round(s.healthScore) : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted capitalize">{s.healthStatus}</td>
                    <td className="px-4 py-2 text-muted capitalize">{s.healthTrend}</td>
                    <td className="px-4 py-2">
                      <DeltaBadge delta={s.deltaRiskScore} invert />
                    </td>
                    <td className="px-4 py-2">
                      <DeltaBadge delta={s.deltaHealth} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
