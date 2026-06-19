"use client";

import { useTranslations }   from "next-intl";
import { GlassCard }          from "@/components/ui/GlassCard";
import { KnowledgeSearchBar } from "@/components/knowledge/KnowledgeSearchBar";
import { ArticleCard }        from "@/components/knowledge/ArticleCard";
import { useState }           from "react";
import type { ArticleRecord } from "@/lib/knowledge/types";

export default function ArticlesPage() {
  const t = useTranslations("ke");
  const [query, setQuery]     = useState("");
  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(q: string) {
    setQuery(q);
    if (!q.trim()) { setArticles([]); setSearched(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/knowledge/articles?q=${encodeURIComponent(q)}&limit=50`);
      const json = await res.json();
      setArticles((json.results ?? []).map((r: { record: ArticleRecord }) => r.record));
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  async function loadAll() {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge/articles?limit=50");
      const json = await res.json();
      setArticles(json.articles ?? []);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-signal">{t("eyebrow")}</p>
        <h1 className="text-2xl font-bold text-white mt-1">{t("articles.title")}</h1>
        <p className="text-white/50 text-sm mt-1">{t("articles.subtitle")}</p>
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

      {searched && articles.length === 0 && (
        <p className="text-white/30 text-sm text-center py-8">{t("search.noResults")}</p>
      )}

      {!searched && (
        <p className="text-white/20 text-sm text-center py-8">{t("articles.noData")}</p>
      )}

      <div className="space-y-3">
        {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
      </div>
    </div>
  );
}
