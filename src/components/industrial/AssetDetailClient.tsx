"use client";

import { useState, useEffect } from "react";
import type { AssetRecord }    from "@/lib/industrial/types";
import type { AssetIntelligence, HealthPoint } from "@/lib/industrial/intelligence";
import { GlassCard }           from "@/components/ui/GlassCard";
import { LoadingState }        from "@/components/ui/LoadingState";
import { AssetTypeIcon, ASSET_TYPE_LABEL } from "./AssetTypeIcon";
import { AssetHealthBadge }    from "./AssetHealthBadge";
import { AssetAlertCenter }    from "./AssetAlertCenter";
import { AssetTrendDashboard } from "./AssetTrendDashboard";
import { AssetMaintenanceBoard } from "./AssetMaintenanceBoard";

type Tab = "overview" | "alerts" | "trends" | "maintenance";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview",     label: "Overview" },
  { key: "alerts",       label: "Alerts" },
  { key: "trends",       label: "Trends" },
  { key: "maintenance",  label: "Maintenance" },
];

// ── Mini sparkline (health history) ──────────────────────────────────────────

function HealthSparkline({ history }: { history: HealthPoint[] }) {
  if (history.length < 2) return null;
  const data = [...history].reverse().map((h) => h.score); // oldest → newest
  const w = 200, h = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts  = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - 4 - ((v - min) / span) * (h - 8)}`)
    .join(" ");

  return (
    <svg
      width={w} height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      className="w-full"
      style={{ direction: "ltr" }}
    >
      <polyline
        points={pts}
        fill="none"
        stroke="var(--signal)"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Risk score ring ───────────────────────────────────────────────────────────

function RiskRing({ score, level }: { score: number; level: string }) {
  const radius = 32;
  const circ   = 2 * Math.PI * radius;
  const filled = Math.min(score / 100, 1);
  const dash   = filled * circ;

  const color =
    level === "CRITICAL" ? "var(--danger)"
    : level === "HIGH"   ? "#e8643c"
    : level === "MEDIUM" ? "var(--warn)"
    : "var(--signal)";

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-[80px] h-[80px] flex-shrink-0">
        <svg width="80" height="80" viewBox="0 0 80 80" className="rotate-[-90deg]">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
          <circle
            cx="40" cy="40" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ - dash}`}
            style={{ filter: `drop-shadow(0 0 5px ${color}80)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="metric text-lg font-bold leading-none" style={{ color }}>
            {Math.round(score)}
          </span>
        </div>
      </div>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1">Risk Level</p>
        <p className="text-sm font-semibold" style={{ color }}>{level}</p>
      </div>
    </div>
  );
}

// ── Knowledge coverage bar ────────────────────────────────────────────────────

function CoverageBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="font-body text-xs text-muted">{label}</span>
        <span className="font-mono text-xs text-ink">{count}</span>
      </div>
      <div className="h-1 rounded-full bg-line">
        <div
          className="h-1 rounded-full bg-signal transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassCard>
      <div className="px-5 py-3.5 border-b border-line">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </GlassCard>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AssetDetailClientProps {
  assetId: string;
}

export function AssetDetailClient({ assetId }: AssetDetailClientProps) {
  const [asset,       setAsset]       = useState<AssetRecord | null>(null);
  const [intelligence, setIntelligence] = useState<AssetIntelligence | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [tab,         setTab]         = useState<Tab>("overview");

  useEffect(() => {
    Promise.all([
      fetch(`/api/industrial/assets/${assetId}`).then((r) => r.json()),
      fetch(`/api/industrial/assets/${assetId}/intelligence`).then((r) => r.json()),
    ])
      .then(([assetData, intelData]) => {
        if (assetData.error) { setError(assetData.error); setLoading(false); return; }
        setAsset(assetData.asset ?? null);
        setIntelligence(intelData.intelligence ?? null);
        setLoading(false);
      })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, [assetId]);

  if (loading) return <LoadingState label="Loading asset…" />;

  if (error || !asset) {
    return (
      <div className="rounded-lg border border-[var(--danger)]/40 bg-surface px-4 py-3 font-mono text-sm text-[var(--danger)]">
        {error ?? "Asset not found"}
      </div>
    );
  }

  const label = ASSET_TYPE_LABEL[asset.assetType] ?? asset.assetType;
  const intel = intelligence;
  const maxCoverage = Math.max(
    1,
    (intel?.knowledgeCoverage.articles    ?? 0)
    + (intel?.knowledgeCoverage.failureModes ?? 0)
    + (intel?.knowledgeCoverage.procedures   ?? 0)
    + (intel?.knowledgeCoverage.cases        ?? 0)
  );

  return (
    <div className="space-y-4">

      {/* ── Asset header ── */}
      <GlassCard>
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(56,224,176,0.08)", border: "1px solid rgba(56,224,176,0.20)" }}
            >
              <AssetTypeIcon type={asset.assetType} className="w-6 h-6 text-signal" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs uppercase tracking-widest text-signal/80">{label}</span>
                {intel?.healthStatus && intel.healthStatus !== "unknown" && (
                  <AssetHealthBadge status={intel.healthStatus} score={intel.healthScore} />
                )}
              </div>
              <h1 className="font-display text-2xl font-bold text-ink mt-1">{asset.name}</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {asset.manufacturer && (
                  <span className="text-xs text-muted">
                    <span className="text-muted/50">Manufacturer</span>{" "}
                    <span className="text-ink">{asset.manufacturer}</span>
                  </span>
                )}
                {asset.model && (
                  <span className="text-xs text-muted">
                    <span className="text-muted/50">Model</span>{" "}
                    <span className="text-ink">{asset.model}</span>
                  </span>
                )}
                <span className="text-xs text-muted font-mono" dir="ltr">
                  {asset.protocol.replace(/_/g, "-")}
                </span>
                <span className="text-xs text-muted">
                  <span className="text-muted/50">Status</span>{" "}
                  <span className="text-ink">{asset.status}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 border-b border-line pb-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors border-b-2 -mb-px",
              tab === t.key
                ? "border-signal text-signal"
                : "border-transparent text-muted hover:text-ink",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Alerts tab ── */}
      {tab === "alerts" && <AssetAlertCenter assetId={assetId} />}

      {/* ── Trends tab ── */}
      {tab === "trends" && <AssetTrendDashboard assetId={assetId} />}

      {/* ── Maintenance tab ── */}
      {tab === "maintenance" && <AssetMaintenanceBoard assetId={assetId} />}

      {/* ── Overview tab content ── */}
      {tab === "overview" && <>

      {/* ── Key metrics row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Risk Score",
            value: intel?.riskScore !== null && intel?.riskScore !== undefined
              ? Math.round(intel.riskScore).toString()
              : "—",
            accent: intel?.riskLevel === "CRITICAL" ? "text-[--danger]"
              : intel?.riskLevel === "HIGH"   ? "text-[--danger]"
              : intel?.riskLevel === "MEDIUM" ? "text-[--warn]"
              : "text-signal",
          },
          {
            label: "Health Score",
            value: intel?.healthScore !== null && intel?.healthScore !== undefined
              ? Math.round(intel.healthScore).toString()
              : "—",
            accent: intel?.healthStatus === "critical" ? "text-[--danger]"
              : intel?.healthStatus === "degraded" ? "text-[--warn]"
              : "text-signal",
          },
          { label: "Tag Count",       value: intel?.tagCount?.toString() ?? "—",     accent: "text-signal" },
          { label: "Knowledge Links", value: intel?.knowledgeCoverage.total?.toString() ?? "—", accent: "text-signal" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted">{m.label}</p>
            <p className={`metric text-2xl font-bold mt-1 ${m.accent}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* ── Risk score ── */}
      {intel?.riskScore !== null && intel?.riskScore !== undefined && intel?.riskBreakdown && (
        <Section title="Risk Analysis">
          <div className="grid sm:grid-cols-2 gap-6">
            <RiskRing score={intel.riskScore} level={intel.riskLevel} />
            <div className="space-y-3">
              {[
                { label: "Health Trend",       value: intel.riskBreakdown.healthTrendScore,    max: 30 },
                { label: "Alarm Trend",         value: intel.riskBreakdown.alarmTrendScore,     max: 25 },
                { label: "KPI Degradation",     value: intel.riskBreakdown.kpiDegradationScore, max: 20 },
                { label: "Telemetry Quality",   value: intel.riskBreakdown.telQualityScore,     max: 15 },
                { label: "Telemetry Freshness", value: intel.riskBreakdown.telFreshnessScore,   max: 10 },
              ].map((f) => (
                <div key={f.label}>
                  <div className="flex justify-between mb-1">
                    <span className="font-body text-xs text-muted">{f.label}</span>
                    <span className="font-mono text-xs text-ink">{f.value.toFixed(1)} / {f.max}</span>
                  </div>
                  <div className="h-1 rounded-full bg-line">
                    <div
                      className="h-1 rounded-full bg-signal"
                      style={{ width: `${Math.min((f.value / f.max) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {intel.riskConfidence && (
            <p className="mt-4 text-xs text-muted font-mono">
              Confidence: <span className="text-ink">{intel.riskConfidence}</span>
            </p>
          )}
        </Section>
      )}

      {/* ── Health trend ── */}
      {intel?.recentHealth && intel.recentHealth.length >= 2 && (
        <Section title="Health Trend">
          <div className="mb-3 flex items-center gap-3">
            <span
              className="font-mono text-xs uppercase tracking-widest"
              style={{
                color: intel.healthTrend === "improving" ? "var(--signal)"
                  : intel.healthTrend === "degrading" ? "var(--danger)"
                  : "var(--warn)",
              }}
            >
              {intel.healthTrend}
            </span>
            <span className="text-xs text-muted">
              ({intel.recentHealth.length} data points)
            </span>
          </div>
          <HealthSparkline history={intel.recentHealth} />
          <div className="mt-3 space-y-1.5">
            {intel.recentHealth.slice(0, 5).map((h, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="text-muted font-mono w-36 flex-shrink-0">
                  {new Date(h.date).toLocaleString()}
                </span>
                <AssetHealthBadge status={h.status} score={h.score} size="sm" />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Knowledge coverage ── */}
      {intel?.knowledgeCoverage && intel.knowledgeCoverage.total > 0 && (
        <Section title="Knowledge Coverage">
          <div className="space-y-3">
            <CoverageBar label="Articles"     count={intel.knowledgeCoverage.articles}    max={maxCoverage} />
            <CoverageBar label="Failure Modes" count={intel.knowledgeCoverage.failureModes} max={maxCoverage} />
            <CoverageBar label="Procedures"    count={intel.knowledgeCoverage.procedures}   max={maxCoverage} />
            <CoverageBar label="Cases"         count={intel.knowledgeCoverage.cases}        max={maxCoverage} />
          </div>
        </Section>
      )}

      {/* ── Asset metadata ── */}
      <Section title="Asset Metadata">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          {[
            { label: "ID",           value: asset.id,             mono: true },
            { label: "Site",         value: asset.siteId,         mono: true },
            { label: "Gateway",      value: asset.gatewayId ?? "—", mono: true },
            { label: "Tag Prefix",   value: asset.tagPrefix  ?? "—", mono: true },
            { label: "Protocol",     value: asset.protocol.replace(/_/g, "-"), mono: true },
            { label: "Type",         value: label,                mono: false },
            { label: "Created",      value: new Date(asset.createdAt).toLocaleDateString(), mono: false },
            { label: "Updated",      value: new Date(asset.updatedAt).toLocaleDateString(), mono: false },
            ...(intel?.twinNodeId
              ? [{ label: "Twin Node", value: intel.twinNodeId, mono: true }]
              : []),
          ].map(({ label, value, mono }) => (
            <div key={label}>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-muted/70">{label}</dt>
              <dd
                className={`mt-0.5 text-sm text-ink truncate ${mono ? "font-mono" : ""}`}
                dir={mono ? "ltr" : undefined}
                title={value}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* No intelligence note */}
      {!intel && (
        <div className="rounded-lg border border-signalDim/20 bg-surface px-4 py-3 text-xs text-muted">
          No intelligence data recorded yet. Risk scores and health history will appear here once telemetry is ingested and analysis runs.
        </div>
      )}

      </> /* end overview tab */}
    </div>
  );
}
