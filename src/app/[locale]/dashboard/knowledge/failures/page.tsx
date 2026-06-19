"use client";

import { useTranslations }    from "next-intl";
import { GlassCard }           from "@/components/ui/GlassCard";
import { FailureModeCard }     from "@/components/knowledge/FailureModeCard";
import { useState }            from "react";
import type { FailureModeRecord } from "@/lib/knowledge/types";

export default function FailuresPage() {
  const t = useTranslations("ke");
  const [modes, setModes]   = useState<FailureModeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge/failures?limit=100");
      const json = await res.json();
      setModes(json.failureModes ?? []);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-signal">{t("eyebrow")}</p>
        <h1 className="text-2xl font-bold text-white mt-1">{t("failures.title")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("failures.subtitle")}</p>
      </div>

      {!loaded && (
        <GlassCard className="p-4 flex justify-center">
          <button
            onClick={load}
            disabled={loading}
            className="px-6 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-sm hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
          >
            {loading ? "…" : t("failures.noData") + " — Load"}
          </button>
        </GlassCard>
      )}

      {loaded && modes.length === 0 && (
        <p className="text-white/30 text-sm text-center py-8">{t("failures.noData")}</p>
      )}

      <div className="space-y-3">
        {modes.map((fm) => <FailureModeCard key={fm.id} failureMode={fm} />)}
      </div>
    </div>
  );
}
