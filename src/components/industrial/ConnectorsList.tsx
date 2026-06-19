"use client";

import { useState, useEffect } from "react";
import { GlassCard }           from "@/components/ui/GlassCard";
import { DashboardPanel }      from "@/components/ui/DashboardPanel";
import { useTranslations }     from "next-intl";
import type { ConnectorRecord } from "@/lib/industrial/types";

export function ConnectorsList() {
  const t = useTranslations("industrial");
  const [connectors, setConnectors] = useState<ConnectorRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/industrial/connectors")
      .then((r) => r.json())
      .then((d) => { setConnectors(d.connectors ?? []); setLoading(false); })
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
    <DashboardPanel title={(t as unknown as (k: string) => string)("connectors.title")}>
      {connectors.length === 0 ? (
        <p className="text-muted text-sm">{(t as unknown as (k: string) => string)("connectors.empty")}</p>
      ) : (
        <div className="space-y-3">
          {connectors.map((conn) => (
            <GlassCard key={conn.id}>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-mono text-sm font-semibold">{conn.name}</p>
                  <p className="text-signal text-xs mt-0.5 font-mono uppercase">{conn.connectorType}</p>
                </div>
                <span className={`font-mono text-xs px-2 py-0.5 rounded border ${
                  conn.enabled
                    ? "border-signal/40 text-signal"
                    : "border-line text-muted"
                }`}>
                  {conn.enabled
                    ? (t as unknown as (k: string) => string)("connectors.enabled")
                    : (t as unknown as (k: string) => string)("connectors.disabled")
                  }
                </span>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}
