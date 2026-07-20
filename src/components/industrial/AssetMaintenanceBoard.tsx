"use client";

import { useLocale } from "next-intl";
import { useState, useEffect, useCallback } from "react";
import { formatDateTime } from "@/lib/i18n/format";

interface MaintenanceRec {
  id:                 string;
  assetId:            string;
  recommendationType: string;
  priority:           string;
  title:              string;
  description:        string;
  confidence:         string;
  dismissed:          boolean;
  createdAt:          string;
  updatedAt:          string;
}

const PRIORITY_COLOR: Record<string, string> = {
  HIGH:   "var(--danger)",
  MEDIUM: "var(--warn)",
  LOW:    "var(--signal)",
};

const TYPE_LABEL: Record<string, string> = {
  inspection:         "Inspection",
  alarm_review:       "Alarm Review",
  maintenance_review: "Maintenance Review",
  comms_inspection:   "Comms Inspection",
};

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function RecCard({
  rec,
  onDismiss,
}: {
  rec: MaintenanceRec;
  onDismiss: (id: string) => void;
}) {
  const locale = useLocale();
  const color = PRIORITY_COLOR[rec.priority] ?? "var(--signal)";
  return (
    <div
      className="rounded-xl border border-line bg-surface p-4 transition-opacity"
      style={{ opacity: rec.dismissed ? 0.45 : 1 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider"
              style={{ background: `${color}18`, color }}
            >
              {rec.priority}
            </span>
            <span className="font-mono text-[0.6rem] uppercase tracking-wider text-muted">
              {TYPE_LABEL[rec.recommendationType] ?? rec.recommendationType}
            </span>
            <span className="font-mono text-[0.6rem] text-muted/50 uppercase">
              {rec.confidence}
            </span>
          </div>
          <p className="text-sm font-semibold text-ink">{rec.title}</p>
          <p className="mt-1 text-xs text-muted leading-relaxed">{rec.description}</p>
          <p className="mt-2 font-mono text-[0.6rem] text-muted/40">
            Generated {formatDateTime(rec.createdAt, locale)}
          </p>
        </div>
        {!rec.dismissed && (
          <button
            onClick={() => onDismiss(rec.id)}
            className="flex-shrink-0 rounded border border-line px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wider text-muted hover:border-signal/40 hover:text-signal transition-colors"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}

interface AssetMaintenanceBoardProps {
  assetId: string;
}

export function AssetMaintenanceBoard({ assetId }: AssetMaintenanceBoardProps) {
  const locale = useLocale();
  const [recs,    setRecs]    = useState<MaintenanceRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/industrial/assets/${assetId}/maintenance?includeDismissed=${showAll}`)
      .then((r) => r.json())
      .then((d) => {
        const sorted = (d.recommendations ?? []).sort(
          (a: MaintenanceRec, b: MaintenanceRec) =>
            (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
        );
        setRecs(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [assetId, showAll]);

  useEffect(() => { load(); }, [load]);

  const dismiss = (recId: string) => {
    fetch(`/api/industrial/assets/${assetId}/maintenance`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ recId }),
    }).then(() => load());
  };

  const active = recs.filter((r) => !r.dismissed);
  const highCount = active.filter((r) => r.priority === "HIGH").length;

  if (loading) {
    return (
      <div className="py-8 text-center font-mono text-xs text-muted animate-pulse">
        Loading maintenance plan…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">Maintenance Actions</span>
          {active.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[0.6rem] font-bold"
              style={{
                background: highCount > 0 ? "rgba(239,68,68,0.15)" : "rgba(56,224,176,0.1)",
                color:      highCount > 0 ? "var(--danger)" : "var(--signal)",
              }}
            >
              {active.length} open
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="font-mono text-[0.6rem] uppercase tracking-wider text-muted hover:text-signal transition-colors"
        >
          {showAll ? "Active Only" : "Show Completed"}
        </button>
      </div>

      {recs.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-6 text-center">
          <p className="font-mono text-xs text-muted">
            No maintenance recommendations. Run the automation engine to generate them.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {recs.map((r) => (
            <RecCard key={r.id} rec={r} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </div>
  );
}
