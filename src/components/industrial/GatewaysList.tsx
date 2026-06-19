"use client";

import { useState, useEffect } from "react";
import { GlassCard }           from "@/components/ui/GlassCard";
import { DashboardPanel }      from "@/components/ui/DashboardPanel";
import { useTranslations }     from "next-intl";
import type { GatewayRecord, IndustrialGatewayStatus } from "@/lib/industrial/types";

const STATUS_COLORS: Record<IndustrialGatewayStatus, string> = {
  ONLINE:   "text-signal",
  OFFLINE:  "text-muted",
  DEGRADED: "text-amber-400",
  REVOKED:  "text-red-400",
};

const STATUS_DOT: Record<IndustrialGatewayStatus, string> = {
  ONLINE:   "bg-signal",
  OFFLINE:  "bg-zinc-500",
  DEGRADED: "bg-amber-400",
  REVOKED:  "bg-red-400",
};

export function GatewaysList() {
  const t = useTranslations("industrial");
  const [gateways, setGateways] = useState<GatewayRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/industrial/gateways")
      .then((r) => r.json())
      .then((d) => { setGateways(d.gateways ?? []); setLoading(false); })
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
    <DashboardPanel title={(t as unknown as (k: string) => string)("gateways.title")}>
      {gateways.length === 0 ? (
        <p className="text-muted text-sm">{(t as unknown as (k: string) => string)("gateways.empty")}</p>
      ) : (
        <div className="space-y-3">
          {gateways.map((gw) => (
            <GlassCard key={gw.id}>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${STATUS_DOT[gw.status]}`} />
                  <div>
                    <p className="font-mono text-sm font-semibold">{gw.name}</p>
                    <p className="text-muted text-xs mt-0.5">
                      ID: {gw.gatewayId}
                      {gw.version ? ` · v${gw.version}` : ""}
                    </p>
                    {gw.lastSeenAt && (
                      <p className="text-muted text-xs">
                        Last seen: {new Date(gw.lastSeenAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <span className={`font-mono text-xs uppercase tracking-wider ${STATUS_COLORS[gw.status]}`}>
                  {gw.status}
                </span>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}
