"use client";

import { useTranslations }   from "next-intl";
import { GlassCard }          from "@/components/ui/GlassCard";
import { CaseCard }           from "@/components/knowledge/CaseCard";
import { KnowledgeSearchBar } from "@/components/knowledge/KnowledgeSearchBar";
import { useState }           from "react";
import type { CaseRecord }    from "@/lib/knowledge/types";

export default function CasesPage() {
  const t = useTranslations("ke");
  const [cases, setCases]     = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(q: string) {
    if (!q.trim()) { setCases([]); setSearched(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/knowledge/cases?q=${encodeURIComponent(q)}&limit=50`);
      const json = await res.json();
      setCases(json.cases ?? []);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  async function loadAll() {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge/cases?limit=50");
      const json = await res.json();
      setCases(json.cases ?? []);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-signal">{t("eyebrow")}</p>
        <h1 className="text-2xl font-bold text-white mt-1">{t("engineeringCases.title")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("engineeringCases.subtitle")}</p>
      </div>

      <GlassCard className="p-4 flex gap-3 items-center">
        <div className="flex-1">
          <KnowledgeSearchBar onSearch={handleSearch} placeholder={t("search.placeholder")} />
        </div>
        <button
          onClick={loadAll}
          className="px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-sm hover:bg-cyan-500/20 transition-colors"
        >
          {loading ? "…" : "Load All"}
        </button>
      </GlassCard>

      {searched && cases.length === 0 && (
        <p className="text-white/30 text-sm text-center py-8">{t("search.noResults")}</p>
      )}

      {!searched && (
        <p className="text-white/20 text-sm text-center py-8">{t("engineeringCases.noData")}</p>
      )}

      <div className="space-y-3">
        {cases.map((c) => <CaseCard key={c.id} engineeringCase={c} />)}
      </div>
    </div>
  );
}
