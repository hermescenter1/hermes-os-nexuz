"use client";

import { useState, useEffect }     from "react";
import { useTranslations }         from "next-intl";
import { LoadingState }            from "@/components/ui/LoadingState";
import { EmptyState }              from "@/components/ui/EmptyState";
import type { AssetRecord }        from "@/lib/industrial/types";
import type { AssetAnalytics }     from "@/lib/industrial/intelligence";
import { AssetCard }               from "./AssetCard";
import { ASSET_TYPE_LABEL }        from "./AssetTypeIcon";

export function AssetsList() {
  const t = useTranslations("industrial");
  const [assets,    setAssets]    = useState<AssetRecord[]>([]);
  const [analytics, setAnalytics] = useState<AssetAnalytics | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/industrial/assets").then((r) => r.json()),
      fetch("/api/industrial/assets/analytics").then((r) => r.json()),
    ])
      .then(([assetData, analyticsData]) => {
        setAssets(assetData.assets ?? []);
        setAnalytics(analyticsData.analytics ?? null);
        setLoading(false);
      })
      .catch(() => {
        setError((t as unknown as (k: string) => string)("loadError"));
        setLoading(false);
      });
  }, [t]);

  if (loading) return <LoadingState label="Loading assets…" />;

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--danger)]/40 bg-surface px-4 py-3 font-mono text-sm text-[var(--danger)]">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Analytics summary bar */}
      {analytics && analytics.totalAssets > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Assets",     value: analytics.totalAssets.toString()                              },
            { label: "Avg Risk Score",   value: analytics.avgRiskScore !== null ? analytics.avgRiskScore.toString() : "—" },
            { label: "With Risk Data",   value: analytics.withRiskScore.toString()                            },
            { label: "With Health Data", value: analytics.withHealthData.toString()                           },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded-xl border border-line bg-surface px-4 py-3"
            >
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted">{m.label}</p>
              <p className="metric text-2xl font-bold text-signal mt-1">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Type distribution chips */}
      {analytics && analytics.byType.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {analytics.byType.map((t) => (
            <span
              key={t.type}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs text-ink"
            >
              <span className="text-signal font-bold">{t.count}</span>
              {ASSET_TYPE_LABEL[t.type] ?? t.type}
            </span>
          ))}
        </div>
      )}

      {/* Asset grid */}
      {assets.length === 0 ? (
        <EmptyState
          title={(t as unknown as (k: string) => string)("assets.empty")}
          message="No industrial assets are registered. Add your first asset to start monitoring."
          icon="⚙"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}
    </div>
  );
}
