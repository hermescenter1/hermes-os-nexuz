"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface SearchMatch {
  chunkId: string;
  documentId: string;
  position: number;
  text: string;
  score: number;
}

const inputCls =
  "w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none";

/**
 * Phase 16D admin test page client — query box + results list, reusing
 * the exact same Tailwind classes/component shapes as
 * `AdminDocumentsClient.tsx`. No new visual patterns introduced.
 */
export function AdminDocumentSearchClient() {
  const t = useTranslations("adminDocumentSearch");

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search() {
    if (!query.trim()) {
      setError(t("validation.queryRequired"));
      return;
    }
    setError(null);
    setSearching(true);
    try {
      const res = await fetch("/api/documents/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) {
        setError(t("validation.searchFailed"));
        return;
      }
      const body = await res.json();
      setMatches(Array.isArray(body.matches) ? body.matches : []);
      setSearched(true);
    } catch {
      setError(t("validation.searchFailed"));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 pb-16 pt-8">
      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") search();
            }}
            placeholder={t("queryPlaceholder")}
            className={`${inputCls} flex-1`}
            dir="auto"
          />
          <button
            onClick={search}
            disabled={searching}
            className="rounded-lg bg-signal px-4 py-2 font-body text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {searching ? t("searching") : t("search")}
          </button>
        </div>
        {error && <p className="mt-3 font-body text-xs text-[var(--danger)]">{error}</p>}
      </section>

      <h2 className="mt-8 font-mono text-xs uppercase tracking-widest text-muted">
        {t("results.heading")}
      </h2>

      {matches.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {matches.map((m) => (
            <li key={m.chunkId} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-mono text-[0.65rem] text-muted/70" dir="ltr">
                  {m.documentId} · {t("results.position", { position: m.position })}
                </p>
                <span className="shrink-0 font-mono text-sm text-signal" dir="ltr">
                  {m.score.toFixed(3)}
                </span>
              </div>
              <p className="mt-2 font-body text-sm leading-relaxed text-ink">{m.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-line bg-surface px-5 py-8 text-center font-body text-sm text-muted/70">
          {searched ? t("results.empty") : t("results.notYetSearched")}
        </p>
      )}
    </div>
  );
}
