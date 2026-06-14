"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useMessages, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { knowledgeService } from "@/lib/services/knowledge-service";
import { brainService } from "@/lib/services/brain-service";
import type { BrainMemoryStats, KnowledgeBrowseData } from "@/lib/services/types";

const CATEGORY_ORDER = [
  "plc",
  "scadaHmi",
  "electrical",
  "instrumentation",
  "protocols",
  "cybersecurity",
  "maintenance",
  "vendorKnowledge",
] as const;

const VENDOR_ORDER = [
  "siemens",
  "abb",
  "schneider",
  "phoenix",
  "delta",
  "mitsubishi",
  "omron",
] as const;

type Card = {
  id: string;
  kind: "library" | "case";
  category: string; // browse category (vendorKnowledge for cases)
  domains: string[];
  keywords: string[];
  vendor?: string;
  title: string;
  summary: string;
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 font-body text-xs transition-colors ${
        active
          ? "border-signal bg-signal/10 text-signal"
          : "border-line text-muted hover:border-signal/40 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function LibraryClient() {
  const t = useTranslations("library");
  const b = useTranslations("brain");
  const locale = useLocale();
  const msgs = useMessages() as {
    knowledge?: Record<string, { name?: string; summary?: string }>;
    brain?: { cases?: Record<string, string> };
    knowledgeCases?: Record<string, string>;
  };

  const [data, setData] = useState<KnowledgeBrowseData | null>(null);
  const [brainMem, setBrainMem] = useState<{
    stats: BrainMemoryStats;
    recentLibraries: string[];
  } | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [vendor, setVendor] = useState<string>("all");

  useEffect(() => {
    knowledgeService.browse().then((r) => {
      if (r.ok) setData(r.data);
    });
    brainService.memory(50).then((r) => {
      if (r.ok) setBrainMem(r.data);
    });
  }, []);

  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });

  // Assemble translated cards once; filtering happens on this list.
  const cards: Card[] = useMemo(() => {
    if (!data) return [];
    const libs: Card[] = data.libraries.map((l) => ({
      id: l.id,
      kind: "library",
      category: l.category,
      domains: l.domains,
      keywords: l.keywords,
      vendor: l.vendor,
      title: msgs.knowledge?.[l.id]?.name ?? l.id,
      summary: msgs.knowledge?.[l.id]?.summary ?? "",
    }));
    const cases: Card[] = data.cases.map((c) => ({
      id: c.id,
      kind: "case",
      category: "vendorKnowledge",
      domains: [c.domain],
      keywords: c.keywords,
      vendor: c.vendor,
      title: msgs.brain?.cases?.[c.id] ?? c.id,
      summary: msgs.knowledgeCases?.[c.id] ?? "",
    }));
    return [...libs, ...cases];
  }, [data, msgs]);

  const filtered = useMemo(() => {
    const norm = (x: string) => x.toLowerCase().replace(/\u200C/g, "");
    const tokens = norm(query.trim()).split(/\s+/).filter(Boolean);
    const scored = cards
      .filter(
        (c) =>
          (category === "all" || c.category === category) &&
          (vendor === "all" || c.vendor === vendor)
      )
      .map((c) => {
        if (tokens.length === 0) return { c, score: 0, hit: true };
        const title = norm(c.title);
        const kw = norm(c.keywords.join(" "));
        const sum = norm(c.summary);
        let score = 0;
        let hit = true;
        for (const tk of tokens) {
          const inTitle = title.includes(tk);
          const inKw = kw.includes(tk);
          const inSum = sum.includes(tk);
          if (!inTitle && !inKw && !inSum) {
            hit = false; // every token must match somewhere (AND)
            break;
          }
          score += (inTitle ? 3 : 0) + (inKw ? 2 : 0) + (inSum ? 1 : 0);
        }
        return { c, score, hit };
      })
      .filter((x) => x.hit);
    if (tokens.length > 0) scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.c);
  }, [cards, query, category, vendor]);

  const countByCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of cards) m[c.category] = (m[c.category] ?? 0) + 1;
    return m;
  }, [cards]);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-20 pt-8">
      {/* search */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="w-full rounded-lg border border-line bg-surface px-4 py-3 font-body text-base text-ink placeholder:text-muted/60 focus:border-signal focus:outline-none"
      />

      {/* category filter — also the Knowledge Cloud landing taxonomy */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-widest text-muted">
          {t("categoriesLabel")}
        </span>
        <Chip active={category === "all"} onClick={() => setCategory("all")}>
          {t("allFilter")}
        </Chip>
        {CATEGORY_ORDER.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {t(`categories.${c}`)}{" "}
            <span className="font-mono text-[0.65rem] opacity-70">
              {nf.format(countByCategory[c] ?? 0)}
            </span>
          </Chip>
        ))}
      </div>

      {/* vendor filter */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-widest text-muted">
          {t("vendorsLabel")}
        </span>
        <Chip active={vendor === "all"} onClick={() => setVendor("all")}>
          {t("allFilter")}
        </Chip>
        {VENDOR_ORDER.map((v) => (
          <Chip key={v} active={vendor === v} onClick={() => setVendor(v)}>
            {b(`vendors.${v}`)}
          </Chip>
        ))}
        {vendor !== "all" && (
          <Link
            href={`/library/vendor/${vendor}`}
            className="font-body text-xs text-signal underline-offset-4 hover:underline"
          >
            {t("article.vendorCenter")}
          </Link>
        )}
      </div>

      {/* Step 9 — Brain reference statistics (session-scoped) */}
      {brainMem && brainMem.stats.count > 0 && (
        <div className="mt-6 rounded-xl border border-line bg-surface p-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
                {t("stats.recentTitle")}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {brainMem.recentLibraries.slice(0, 5).map((id) => (
                  <Link
                    key={id}
                    href={`/library/${id}`}
                    className="rounded-full border border-line px-3 py-1 font-body text-xs text-ink transition-colors hover:border-signal/50"
                  >
                    {msgs.knowledge?.[id]?.name ?? id}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
                {t("stats.mostTitle")}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(brainMem.stats.libraryRefs ?? {})
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([id, n]) => (
                    <Link
                      key={id}
                      href={`/library/${id}`}
                      className="rounded-full border border-line px-3 py-1 font-body text-xs text-ink transition-colors hover:border-signal/50"
                    >
                      {msgs.knowledge?.[id]?.name ?? id}{" "}
                      <span className="font-mono text-muted">{nf.format(n)}</span>
                    </Link>
                  ))}
              </div>
            </div>
          </div>
          <p className="mt-4 border-t border-line pt-3 font-body text-[0.7rem] text-muted/70">
            {t("stats.sessionNote")}
          </p>
        </div>
      )}

      {/* results */}
      <p className="mt-6 font-mono text-xs text-muted">
        {t("resultsCount", { count: nf.format(filtered.length) })}
      </p>

      {filtered.length === 0 ? (
        <p className="mt-6 font-body text-sm text-muted">{t("empty")}</p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <article
              key={c.id}
              className="flex flex-col rounded-xl border border-line bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-base font-semibold leading-snug text-ink">
                  {c.kind === "library" ? (
                    <Link
                      href={`/library/${c.id}`}
                      className="transition-colors hover:text-signal"
                    >
                      {c.title}
                    </Link>
                  ) : (
                    c.title
                  )}
                </h3>
                {c.kind === "case" && (
                  <span className="shrink-0 rounded-full border border-line px-2 py-0.5 font-body text-[0.6rem] text-muted">
                    {t("caseLabel")}
                  </span>
                )}
              </div>
              <p className="mt-2 flex-1 font-body text-xs leading-relaxed text-muted">
                {c.summary}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.65rem] text-ink">
                  {t(`categories.${c.category}`)}
                </span>
                {c.domains
                  .filter((d) => b(`domains.${d}`) !== t(`categories.${c.category}`))
                  .map((d) => (
                    <span
                      key={d}
                      className="rounded-full border border-line px-2 py-0.5 font-body text-[0.65rem] text-muted"
                    >
                      {b(`domains.${d}`)}
                    </span>
                  ))}
                {c.vendor && (
                  <Link
                    href={`/library/vendor/${c.vendor}`}
                    className="rounded-full border border-signalDim px-2 py-0.5 font-body text-[0.65rem] text-signal transition-colors hover:bg-signal/10"
                  >
                    {b(`vendors.${c.vendor}`)}
                  </Link>
                )}
              </div>
              <p
                className="mt-3 truncate font-mono text-[0.6rem] text-muted/60"
                dir="ltr"
                title={c.keywords.join(", ")}
              >
                {c.keywords.slice(0, 4).join(" · ")}
              </p>
              <p className="mt-3 border-t border-line pt-2.5 font-body text-[0.65rem] text-signal/90">
                <span className="me-1.5 inline-block h-1 w-1 rounded-full bg-signal align-middle" />
                {t("usedByBrain")}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
