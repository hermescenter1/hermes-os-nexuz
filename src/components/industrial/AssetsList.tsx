"use client";

import { useState, useEffect } from "react";
import { GlassCard }           from "@/components/ui/GlassCard";
import { DashboardPanel }      from "@/components/ui/DashboardPanel";
import { useTranslations }     from "next-intl";
import type { AssetRecord }    from "@/lib/industrial/types";

export function AssetsList() {
  const t = useTranslations("industrial");
  const [assets, setAssets]   = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/industrial/assets")
      .then((r) => r.json())
      .then((d) => { setAssets(d.assets ?? []); setLoading(false); })
      .catch(() => { setError((t as unknown as (k: string) => string)("loadError")); setLoading(false); });
  }, [t]);

  if (loading) {
    return (
      <DashboardPanel title="">
        <p className="text-muted text-sm animate-pulse">{(t as unknown as (k: string) => string)("loading")}</p>
      </DashboardPanel>
    );
  }
  if (error) {
    return (
      <DashboardPanel title="">
        <p className="text-red-400 text-sm">{error}</p>
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel title={(t as unknown as (k: string) => string)("assets.title")}>
      {assets.length === 0 ? (
        <p className="text-muted text-sm">{(t as unknown as (k: string) => string)("assets.empty")}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <GlassCard key={asset.id}>
              <div className="px-4 py-3">
                <p className="font-mono text-sm font-semibold truncate">{asset.name}</p>
                <p className="text-signal text-xs mt-0.5 font-mono uppercase">{asset.assetType}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  <span className="text-muted text-xs">{asset.protocol}</span>
                  {asset.manufacturer && <span className="text-muted text-xs">{asset.manufacturer}</span>}
                  {asset.model        && <span className="text-muted text-xs">{asset.model}</span>}
                </div>
                <p className="text-muted text-xs mt-1">{asset.status}</p>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}
