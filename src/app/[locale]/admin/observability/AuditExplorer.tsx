"use client";

/**
 * PHASE 93 — Audit explorer (client). Filters the ALREADY-FETCHED, bounded set
 * of real audit events client-side (action / outcome substring). It fetches
 * nothing, invents nothing, and cannot widen the server-imposed bound — it only
 * narrows what the operator already received.
 */

import { useMemo, useState, useId } from "react";
import { cn } from "@/components/ds/cn";

export interface AuditRow {
  id: string;
  action: string;
  outcome?: string | null;
  createdAt: string;
}

const OUTCOME_TONE: Record<string, string> = {
  success: "text-status-success",
  attempted: "text-status-information",
  denied: "text-status-warning",
  failed: "text-status-danger",
  degraded: "text-status-warning",
};

function shortTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

export function AuditExplorer({
  rows,
  labels,
}: {
  rows: AuditRow[];
  labels: {
    filterLabel: string;
    filterPlaceholder: string;
    time: string;
    action: string;
    outcome: string;
    empty: string;
    results: (shown: number, total: number) => string;
  };
}) {
  const [q, setQ] = useState("");
  const inputId = useId();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.action.toLowerCase().includes(needle) ||
        (r.outcome ?? "").toLowerCase().includes(needle),
    );
  }, [q, rows]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label htmlFor={inputId} className="flex-1 text-caption text-text-secondary">
          <span className="mb-1 block">{labels.filterLabel}</span>
          <input
            id={inputId}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={labels.filterPlaceholder}
            className="w-full max-w-sm rounded-md border border-border-default bg-background-deep px-3 py-2 text-body text-text-primary outline-none placeholder:text-text-disabled focus:border-border-active"
          />
        </label>
        <span aria-live="polite" className="ds-tabular text-label-compact text-text-muted">
          {labels.results(filtered.length, rows.length)}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-caption text-text-muted">{labels.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-caption">
            <thead>
              <tr className="text-text-muted">
                <th scope="col" className="py-1.5 pe-4 text-start font-medium">{labels.time}</th>
                <th scope="col" className="py-1.5 pe-4 text-start font-medium">{labels.action}</th>
                <th scope="col" className="py-1.5 text-start font-medium">{labels.outcome}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border-subtle">
                  <td className="ds-tabular py-1.5 pe-4 text-text-muted">{shortTime(r.createdAt)}</td>
                  <td className="py-1.5 pe-4 text-text-secondary">{r.action}</td>
                  <td className={cn("py-1.5", OUTCOME_TONE[r.outcome ?? ""] ?? "text-text-muted")}>{r.outcome ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
