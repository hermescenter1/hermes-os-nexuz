"use client";

import { useState, useEffect, useCallback } from "react";
import type { AssetAlertRecord }            from "@/lib/industrial/alerts";

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--danger)",
  HIGH:     "#e8643c",
  MEDIUM:   "var(--warn)",
  LOW:      "var(--signal)",
};

const TYPE_LABEL: Record<string, string> = {
  CRITICAL_RISK:          "Critical Risk",
  HEALTH_DEGRADATION:     "Health Degradation",
  COMMUNICATION_FAILURE:  "Communication Failure",
  KNOWLEDGE_COVERAGE_LOW: "Knowledge Gap",
};

function AlertRow({
  alert,
  onDismiss,
}: {
  alert: AssetAlertRecord;
  onDismiss: (id: string) => void;
}) {
  const color = SEVERITY_COLOR[alert.severity] ?? "var(--signal)";
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-opacity"
      style={{ opacity: alert.dismissed ? 0.45 : 1 }}
    >
      <span
        className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full"
        style={{ background: color, boxShadow: `0 0 6px ${color}80` }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-mono text-[0.6rem] uppercase tracking-widest"
            style={{ color }}
          >
            {TYPE_LABEL[alert.alertType] ?? alert.alertType}
          </span>
          <span className="font-mono text-[0.6rem] text-muted uppercase">
            {alert.severity}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-semibold text-ink">{alert.title}</p>
        <p className="mt-0.5 text-xs text-muted">{alert.description}</p>
        <p className="mt-1 font-mono text-[0.6rem] text-muted/50">
          {new Date(alert.createdAt).toLocaleString()}
        </p>
      </div>
      {!alert.dismissed && (
        <button
          onClick={() => onDismiss(alert.id)}
          className="flex-shrink-0 rounded border border-line px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wider text-muted hover:border-signal/40 hover:text-signal transition-colors"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

interface AssetAlertCenterProps {
  assetId: string;
}

export function AssetAlertCenter({ assetId }: AssetAlertCenterProps) {
  const [alerts,   setAlerts]   = useState<AssetAlertRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showAll,  setShowAll]  = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/industrial/assets/${assetId}/alerts?includeDismissed=${showAll}`)
      .then((r) => r.json())
      .then((d) => { setAlerts(d.alerts ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [assetId, showAll]);

  useEffect(() => { load(); }, [load]);

  const dismiss = (alertId: string) => {
    fetch(`/api/industrial/assets/${assetId}/alerts/${alertId}`, { method: "PATCH" })
      .then(() => load());
  };

  const active = alerts.filter((a) => !a.dismissed);

  if (loading) {
    return (
      <div className="py-8 text-center font-mono text-xs text-muted animate-pulse">
        Loading alerts…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">Active Alerts</span>
          {active.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[0.6rem] font-bold"
              style={{ background: "rgba(239,68,68,0.15)", color: "var(--danger)" }}
            >
              {active.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="font-mono text-[0.6rem] uppercase tracking-wider text-muted hover:text-signal transition-colors"
        >
          {showAll ? "Hide Dismissed" : "Show All"}
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-6 text-center">
          <p className="font-mono text-xs text-muted">No alerts — asset is within normal parameters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <AlertRow key={a.id} alert={a} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </div>
  );
}
