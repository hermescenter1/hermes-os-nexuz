"use client";

import { useState, useEffect } from "react";
import { GlassCard }           from "@/components/ui/GlassCard";
import { DashboardPanel }      from "@/components/ui/DashboardPanel";
import { useTranslations }     from "next-intl";
import type { SiteRecord, IndustrialSiteStatus } from "@/lib/industrial/types";

const STATUS_COLORS: Record<IndustrialSiteStatus, string> = {
  ACTIVE:      "text-signal",
  INACTIVE:    "text-muted",
  MAINTENANCE: "text-amber-400",
};

export function SitesList() {
  const t = useTranslations("industrial");
  const [sites, setSites]     = useState<SiteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/industrial/sites")
      .then((r) => r.json())
      .then((d) => { setSites(d.sites ?? []); setLoading(false); })
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
    <DashboardPanel title={(t as unknown as (k: string) => string)("sites.title")}>
      {sites.length === 0 ? (
        <p className="text-muted text-sm">{(t as unknown as (k: string) => string)("sites.empty")}</p>
      ) : (
        <div className="space-y-3">
          {sites.map((site) => (
            <GlassCard key={site.id}>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-mono text-sm font-semibold">{site.name}</p>
                  <p className="text-muted text-xs mt-0.5">{site.slug}{site.location ? ` · ${site.location}` : ""}</p>
                </div>
                <span className={`font-mono text-xs uppercase tracking-wider ${STATUS_COLORS[site.status]}`}>
                  {site.status}
                </span>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}
