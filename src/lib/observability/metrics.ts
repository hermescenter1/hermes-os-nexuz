/**
 * PHASE 92 — in-process operational metrics registry.
 *
 * A dependency-free counter/gauge/histogram store. No Prometheus client, no
 * OpenTelemetry SDK, no network — just a Map keyed by low-cardinality label
 * series, rendered on demand in the Prometheus text exposition format (a stable,
 * vendor-neutral wire format that any scraper understands).
 *
 * DESIGN INVARIANTS (all enforced here, proven by tests):
 *   1. A metric name not in the catalogue (metric-names.ts) is rejected.
 *   2. A label key not declared for that metric is DROPPED — a userId/email/URL
 *      accidentally passed as a label never enters the store.
 *   3. Distinct series per metric are capped (`maxSeries`); excess samples fold
 *      into a single `overflow="true"` series so cardinality cannot explode.
 *   4. Label values are length-capped and stripped of exposition-breaking
 *      characters, so a hostile value cannot forge extra metric lines.
 *   5. Every entry point is wrapped — recording a metric never throws into the
 *      request path.
 *
 * The store is a global singleton so counters survive Next.js hot reloads and
 * are shared by every route/module in one process.
 */

import { METRICS, type MetricDef, type MetricName } from "./metric-names";

type Labels = Record<string, string | number | boolean | undefined | null>;

interface ScalarSeries {
  labels: Record<string, string>;
  value: number;
}

interface HistogramSeries {
  labels: Record<string, string>;
  bucketCounts: number[]; // one per def.buckets, plus implicit +Inf via count
  sum: number;
  count: number;
}

interface MetricStore {
  scalars: Map<MetricName, Map<string, ScalarSeries>>;
  histograms: Map<MetricName, Map<string, HistogramSeries>>;
}

function freshStore(): MetricStore {
  return { scalars: new Map(), histograms: new Map() };
}

function store(): MetricStore {
  const g = globalThis as unknown as { __hermesMetrics?: MetricStore };
  g.__hermesMetrics ??= freshStore();
  return g.__hermesMetrics;
}

const MAX_LABEL_LEN = 64;

/** Strip characters that would break the exposition format, and cap length. */
function sanitizeLabelValue(raw: unknown): string {
  const s = String(raw);
  // Remove control chars / quotes / backslashes that could forge lines, then cap.
  return s.replace(/[\r\n"\\]/g, "_").slice(0, MAX_LABEL_LEN);
}

/**
 * Reduce a caller's label bag to only the keys DECLARED for this metric, with
 * sanitized string values. Unknown keys are silently dropped (invariant #2).
 */
function normalizeLabels(def: MetricDef, labels: Labels | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!labels) return out;
  for (const key of def.labels) {
    const v = labels[key];
    if (v !== undefined && v !== null) out[key] = sanitizeLabelValue(v);
  }
  return out;
}

/** Deterministic key for a label set (sorted so order never matters). */
function seriesKey(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${labels[k]}`).join(",");
}

/**
 * Resolve the series map slot for a label set, enforcing the cardinality cap.
 * Returns the (possibly overflow-folded) labels + key, or null if the metric is
 * unknown / wrong type.
 */
function resolveSlot(
  name: MetricName,
  labels: Record<string, string>,
  existing: Map<string, unknown>,
): { key: string; labels: Record<string, string> } {
  const def = METRICS[name];
  const key = seriesKey(labels);
  if (existing.has(key)) return { key, labels };
  if (existing.size >= def.maxSeries) {
    // Fold into a single overflow series and record the drop once.
    const overflowLabels = { overflow: "true" };
    const overflowKey = seriesKey(overflowLabels);
    // Self-recursion guard: the drop-counter must never account for its OWN
    // overflow (that would recurse). Its own overflow simply folds silently.
    if (!existing.has(overflowKey) && name !== "metrics_series_dropped_total") {
      incCounter("metrics_series_dropped_total", { metric: name });
    }
    return { key: overflowKey, labels: overflowLabels };
  }
  return { key, labels };
}

function scalarMap(name: MetricName): Map<string, ScalarSeries> {
  const s = store();
  let m = s.scalars.get(name);
  if (!m) { m = new Map(); s.scalars.set(name, m); }
  return m;
}

function histogramMap(name: MetricName): Map<string, HistogramSeries> {
  const s = store();
  let m = s.histograms.get(name);
  if (!m) { m = new Map(); s.histograms.set(name, m); }
  return m;
}

// ── Public recording API (never throws) ───────────────────────────────────────

/** Increment a counter by `value` (default 1). Ignored for non-counter metrics. */
export function incCounter(name: MetricName, labels?: Labels, value = 1): void {
  try {
    const def = METRICS[name];
    if (def.type !== "counter") return;
    if (!Number.isFinite(value) || value < 0) return;
    const m = scalarMap(name);
    const norm = normalizeLabels(def, labels);
    const slot = resolveSlot(name, norm, m);
    const cur = m.get(slot.key);
    if (cur) cur.value += value;
    else m.set(slot.key, { labels: slot.labels, value });
  } catch { /* metrics must never break the caller */ }
}

/** Set a gauge to an absolute value. Ignored for non-gauge metrics. */
export function setGauge(name: MetricName, value: number, labels?: Labels): void {
  try {
    const def = METRICS[name];
    if (def.type !== "gauge") return;
    if (!Number.isFinite(value)) return;
    const m = scalarMap(name);
    const norm = normalizeLabels(def, labels);
    const slot = resolveSlot(name, norm, m);
    m.set(slot.key, { labels: slot.labels, value });
  } catch { /* never throw */ }
}

/** Observe a value into a histogram. Ignored for non-histogram metrics. */
export function observeHistogram(name: MetricName, value: number, labels?: Labels): void {
  try {
    const def = METRICS[name];
    if (def.type !== "histogram" || !def.buckets) return;
    if (!Number.isFinite(value) || value < 0) return;
    const m = histogramMap(name);
    const norm = normalizeLabels(def, labels);
    const slot = resolveSlot(name, norm, m);
    let h = m.get(slot.key);
    if (!h) {
      h = { labels: slot.labels, bucketCounts: def.buckets.map(() => 0), sum: 0, count: 0 };
      m.set(slot.key, h);
    }
    h.sum += value;
    h.count += 1;
    for (let i = 0; i < def.buckets.length; i++) {
      if (value <= def.buckets[i]) h.bucketCounts[i] += 1;
    }
  } catch { /* never throw */ }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderLabels(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  return "{" + keys.map((k) => `${k}="${labels[k]}"`).join(",") + "}";
}

/**
 * Render the entire registry in Prometheus text exposition format.
 * Contains only metric names, low-cardinality labels and numbers — never a
 * secret, connection string or tenant identifier by construction.
 */
export function renderProm(): string {
  const s = store();
  const lines: string[] = [];

  for (const name of Object.keys(METRICS) as MetricName[]) {
    const def = METRICS[name];
    const scalars = s.scalars.get(name);
    const hist = s.histograms.get(name);
    const hasData = (scalars && scalars.size > 0) || (hist && hist.size > 0);
    if (!hasData) continue;

    lines.push(`# HELP ${name} ${def.help}`);
    lines.push(`# TYPE ${name} ${def.type}`);

    if (def.type === "histogram" && hist) {
      for (const series of hist.values()) {
        const base = { ...series.labels };
        let cumulative = 0;
        for (let i = 0; i < (def.buckets ?? []).length; i++) {
          cumulative = series.bucketCounts[i];
          const le = String(def.buckets![i]);
          lines.push(`${name}_bucket${renderLabels({ ...base, le })} ${cumulative}`);
        }
        lines.push(`${name}_bucket${renderLabels({ ...base, le: "+Inf" })} ${series.count}`);
        lines.push(`${name}_sum${renderLabels(base)} ${series.sum}`);
        lines.push(`${name}_count${renderLabels(base)} ${series.count}`);
      }
    } else if (scalars) {
      for (const series of scalars.values()) {
        lines.push(`${name}${renderLabels(series.labels)} ${series.value}`);
      }
    }
  }

  return lines.join("\n") + (lines.length ? "\n" : "");
}

/**
 * A JSON snapshot for the authenticated operator dashboard. Same data as the
 * Prometheus render, in a shape convenient for a UI. Contains no secrets.
 */
export function snapshotMetrics(): Record<string, unknown> {
  const s = store();
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(METRICS) as MetricName[]) {
    const def = METRICS[name];
    if (def.type === "histogram") {
      const hist = s.histograms.get(name);
      if (!hist || hist.size === 0) continue;
      out[name] = [...hist.values()].map((h) => ({
        labels: h.labels,
        count: h.count,
        sum: h.sum,
        avgMs: h.count > 0 ? Math.round((h.sum / h.count) * 100) / 100 : 0,
      }));
    } else {
      const scalars = s.scalars.get(name);
      if (!scalars || scalars.size === 0) continue;
      out[name] = [...scalars.values()].map((v) => ({ labels: v.labels, value: v.value }));
    }
  }
  return out;
}

/** Reset the entire registry. Test-only; also usable by an operator tool. */
export function resetMetrics(): void {
  const g = globalThis as unknown as { __hermesMetrics?: MetricStore };
  g.__hermesMetrics = freshStore();
}
