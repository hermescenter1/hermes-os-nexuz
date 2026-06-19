"use client";

import { useTranslations }   from "next-intl";
import { GlassCard }          from "@/components/ui/GlassCard";
import { ProcedureCard }      from "@/components/knowledge/ProcedureCard";
import { useState }           from "react";
import type { ProcedureRecord } from "@/lib/knowledge/types";

export default function ProceduresPage() {
  const t = useTranslations("ke");
  const [procs, setProcs]   = useState<ProcedureRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge/procedures?limit=100");
      const json = await res.json();
      setProcs(json.procedures ?? []);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-signal">{t("eyebrow")}</p>
        <h1 className="text-2xl font-bold text-white mt-1">{t("procedures.title")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("procedures.subtitle")}</p>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
        <p className="text-amber-300 text-sm">{t("safetyBanner")}</p>
      </div>

      {!loaded && (
        <GlassCard className="p-4 flex justify-center">
          <button
            onClick={load}
            disabled={loading}
            className="px-6 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-sm hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
          >
            {loading ? "…" : "Load Procedures"}
          </button>
        </GlassCard>
      )}

      {loaded && procs.length === 0 && (
        <p className="text-white/30 text-sm text-center py-8">{t("procedures.noData")}</p>
      )}

      <div className="space-y-3">
        {procs.map((p) => <ProcedureCard key={p.id} procedure={p} />)}
      </div>
    </div>
  );
}
