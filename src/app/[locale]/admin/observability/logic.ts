/**
 * PHASE 92 / 93 — pure presentation logic for the operator observability page.
 *
 * Kept separate from the .tsx page so it can be unit-tested (the Vitest oxc
 * transform does not parse the app's `jsx: "preserve"` .tsx files). No React,
 * no I/O — just deterministic shaping of the already-collected snapshot for
 * display. Phase 93 adds Control-Room shaping helpers (chart series, dependency
 * / backup / latency status tone, posture) — every value is DERIVED from real
 * collected data; nothing here fabricates a series, a trend or a placeholder.
 */

import { SEVERITY_RANK, type Severity } from "@/lib/observability/log-schema";

/** A neutral tone token the page maps to a CSS class; validated passthrough. */
export function severityTone(severity: string): Severity {
  return (severity in SEVERITY_RANK ? severity : "info") as Severity;
}

/** Order items most-severe first (stable). */
export function sortBySeverityDesc<T>(items: T[], getSeverity: (t: T) => string): T[] {
  return [...items].sort((a, b) => SEVERITY_RANK[severityTone(getSeverity(b))] - SEVERITY_RANK[severityTone(getSeverity(a))]);
}

/** Turn a {event: count} map into rows sorted by count desc, then event asc. */
export function summaryRows(counts: Record<string, number>): { event: string; count: number }[] {
  return Object.entries(counts)
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count || a.event.localeCompare(b.event));
}

/** A compact, locale-agnostic timestamp for dense operator tables. */
export function shortTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

/* ─────────────────────────── Phase 93: Control-Room shaping ─────────────────────────── */

/** The five status tones shared with the design system's StatusKind. */
export type Tone = "success" | "warning" | "danger" | "information" | "neutral";

/** A single labelled magnitude for a real bar chart (one metric label = one bar). */
export interface SeriesPoint {
  label: string;
  value: number;
  /** Optional tone for per-bar colouring (e.g. severity). */
  tone?: Tone;
}

/** A scalar (counter/gauge) metric series as returned by snapshotMetrics(). */
interface ScalarSample {
  labels: Record<string, string>;
  value: number;
}
/** A histogram metric series as returned by snapshotMetrics(). */
interface HistogramSample {
  labels: Record<string, string>;
  count: number;
  sum: number;
  avgMs: number;
}

type Snapshot = Record<string, unknown>;

function asScalarSamples(raw: unknown): ScalarSample[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is ScalarSample =>
      !!s && typeof s === "object" && typeof (s as ScalarSample).value === "number",
  );
}

function asHistogramSamples(raw: unknown): HistogramSample[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is HistogramSample =>
      !!s && typeof s === "object" && typeof (s as HistogramSample).count === "number",
  );
}

const SEVERITY_TONE: Record<string, Tone> = {
  info: "information",
  warning: "warning",
  error: "danger",
  critical: "danger",
};

/**
 * Build a real bar series from a counter metric in the snapshot, one bar per
 * distinct label value. Returns [] when the metric has no recorded samples
 * (the caller renders an empty-state — never a zero-filled placeholder).
 */
export function counterSeries(
  snapshot: Snapshot,
  metric: string,
  labelKey: string,
  opts: { toneByLabel?: boolean } = {},
): SeriesPoint[] {
  const samples = asScalarSamples(snapshot[metric]);
  const points = samples.map((s) => {
    const label = s.labels[labelKey] ?? (s.labels.overflow ? "overflow" : "—");
    const point: SeriesPoint = { label, value: s.value };
    if (opts.toneByLabel && SEVERITY_TONE[label]) point.tone = SEVERITY_TONE[label];
    return point;
  });
  return points.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** Sum of all sample values for a counter metric (0 when unrecorded). */
export function counterTotal(snapshot: Snapshot, metric: string): number {
  return asScalarSamples(snapshot[metric]).reduce((s, x) => s + x.value, 0);
}

/** The histogram stat for one dependency, or null when no probe sample exists. */
export function histogramStat(
  snapshot: Snapshot,
  metric: string,
  labelKey: string,
  labelValue: string,
): { count: number; sum: number; avgMs: number } | null {
  const match = asHistogramSamples(snapshot[metric]).find((s) => s.labels[labelKey] === labelValue);
  if (!match) return null;
  return { count: match.count, sum: match.sum, avgMs: match.avgMs };
}

/** Largest value in a series (for bar scaling); 0 for an empty series. */
export function seriesMax(points: SeriesPoint[]): number {
  return points.reduce((m, p) => Math.max(m, p.value), 0);
}

/** Percentage width (0–100) of a bar, guarding division by zero. */
export function barPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 1000) / 10));
}

/** Dependency up/down/unknown → tone. `null` = not probed / unknown. */
export function dependencyTone(up: boolean | null): Tone {
  if (up === null) return "neutral";
  return up ? "success" : "danger";
}

/** Latency against warn/critical thresholds → tone. */
export function latencyTone(avgMs: number | null, warnMs: number, critMs: number): Tone {
  if (avgMs === null) return "neutral";
  if (avgMs >= critMs) return "danger";
  if (avgMs >= warnMs) return "warning";
  return "success";
}

/** Backup freshness + verification → tone. `ageHours === null` = no backup found. */
export function backupTone(ageHours: number | null, verified: boolean | null): Tone {
  if (ageHours === null) return "danger"; // no backup at all is a real problem
  if (ageHours > 24) return "warning";
  if (verified === false) return "danger";
  if (verified === null) return "warning"; // present but never verified
  return "success";
}

/** A degraded rate-limiter is a warning, not an outage (in-process fallback). */
export function limiterTone(degraded: boolean): Tone {
  return degraded ? "warning" : "success";
}

/** Rank tones so the worst can bubble up to the overall posture. */
const TONE_RANK: Record<Tone, number> = { success: 0, neutral: 1, information: 1, warning: 2, danger: 3 };

/** The most severe tone in a list (neutral when empty). */
export function worstTone(tones: Tone[]): Tone {
  return tones.reduce<Tone>((worst, t) => (TONE_RANK[t] > TONE_RANK[worst] ? t : worst), "neutral");
}

/** Human-readable uptime from seconds (e.g. "3d 04h 12m"). */
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}m`;
}

/** Human-readable byte size (binary units). */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${Math.round(v * 10) / 10} ${units[i]}`;
}

/** Backup age in hours → compact label. */
export function formatAgeHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Group audit events into an outcome distribution (real counts). */
export function auditOutcomeDistribution(
  events: { outcome?: string | null }[],
): SeriesPoint[] {
  const counts: Record<string, number> = {};
  for (const e of events) {
    const key = e.outcome && e.outcome.trim() ? e.outcome : "unspecified";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const toneByOutcome: Record<string, Tone> = {
    success: "success",
    attempted: "information",
    denied: "warning",
    failed: "danger",
    degraded: "warning",
  };
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value, tone: toneByOutcome[label] ?? "neutral" }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}
