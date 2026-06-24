"use client";

// ── Hermes Signal Language ────────────────────────────────────────────────────
// Proprietary status indicators for the Hermes OS platform.
// Each signal type maps to a semantic meaning within the intelligence system.
// Use these instead of generic badges anywhere platform state is communicated.

export type HermesSignalType =
  | "knowledge-active"
  | "reasoning-active"
  | "memory-synced"
  | "intelligence-growing"
  | "risk-detected"
  | "confidence-high"
  | "telemetry-active"
  | "system-online"
  | "system-offline"
  | "warning-active";

interface SignalConfig {
  label:   string;
  badge:   string;   // hs--* modifier
  dot:     string;   // hs-dot--* modifier
  pulse?:  boolean;  // reasoning pulse animation on dot
}

const SIGNAL_MAP: Record<HermesSignalType, SignalConfig> = {
  "knowledge-active":     { label: "Knowledge Active",     badge: "hs--knowledge",  dot: "hs-dot--knowledge" },
  "reasoning-active":     { label: "Reasoning Active",     badge: "hs--reasoning",  dot: "hs-dot--reasoning", pulse: true },
  "memory-synced":        { label: "Memory Synced",        badge: "hs--memory",     dot: "hs-dot--memory" },
  "intelligence-growing": { label: "Intelligence Growing", badge: "hs--growing",    dot: "hs-dot--knowledge", pulse: true },
  "risk-detected":        { label: "Risk Detected",        badge: "hs--risk",       dot: "hs-dot--risk",    pulse: true },
  "confidence-high":      { label: "Confidence High",      badge: "hs--confident",  dot: "hs-dot--reasoning" },
  "telemetry-active":     { label: "Telemetry Active",     badge: "hs--reasoning",  dot: "hs-dot--reasoning", pulse: true },
  "system-online":        { label: "System Online",        badge: "hs--memory",     dot: "hs-dot--reasoning" },
  "system-offline":       { label: "System Offline",       badge: "hs--nominal",    dot: "hs-dot--nominal" },
  "warning-active":       { label: "Warning Active",       badge: "hs--warning",    dot: "hs-dot--warning",  pulse: true },
};

export function HermesSignal({
  type,
  label: overrideLabel,
  compact = false,
  className = "",
}: {
  type:       HermesSignalType;
  label?:     string;
  compact?:   boolean;
  className?: string;
}) {
  const cfg   = SIGNAL_MAP[type];
  const label = overrideLabel ?? cfg.label;

  return (
    <span className={`hs-badge ${cfg.badge} ${className}`}>
      <span
        className={`hs-dot ${cfg.dot} ${cfg.pulse ? "animate-h-reason-pulse" : ""}`}
      />
      {!compact && label}
    </span>
  );
}

// ── HermesSignalRow — compact inline signal status list ───────────────────────
export function HermesSignalRow({
  signals,
  className = "",
}: {
  signals:    { type: HermesSignalType; label?: string }[];
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {signals.map((s, i) => (
        <HermesSignal key={i} type={s.type} label={s.label} />
      ))}
    </div>
  );
}

// ── HermesIntelligenceBar — horizontal confidence / coverage bar ──────────────
export function HermesIntelligenceBar({
  value,
  max = 100,
  tone = "signal",
  label,
  className = "",
}: {
  value:      number;
  max?:       number;
  tone?:      "signal" | "gold" | "ice" | "warn" | "danger";
  label?:     string;
  className?: string;
}) {
  const pct  = Math.min(100, Math.round((value / max) * 100));
  const fill: Record<string, string> = {
    signal:  "bg-signal",
    gold:    "bg-[#C4A028]",
    ice:     "bg-ice",
    warn:    "bg-warn",
    danger:  "bg-danger",
  };

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <span className="signal-text">{label}</span>
          <span className="signal-text opacity-60">{pct}%</span>
        </div>
      )}
      <div className="h-[2px] rounded-full bg-line overflow-hidden">
        <div
          className={`h-full rounded-full ${fill[tone] ?? "bg-signal"} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
