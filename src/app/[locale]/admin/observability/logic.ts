/**
 * PHASE 92 — pure presentation logic for the operator observability page.
 *
 * Kept separate from the .tsx page so it can be unit-tested (the Vitest oxc
 * transform does not parse the app's `jsx: "preserve"` .tsx files). No React,
 * no I/O — just deterministic shaping of the snapshot for display.
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
