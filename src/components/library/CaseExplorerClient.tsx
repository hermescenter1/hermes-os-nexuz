"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  CASE_ROWS,
  publishedRowFor,
  vendorsOf,
  domainsOf,
  metricsFor,
  type DisplayCaseRow,
} from "@/lib/industrial/case-explorer";
import { CASES } from "@/lib/industrial/cases";

interface RawPublishedCase {
  id?: unknown;
  vendor?: unknown;
  domain?: unknown;
  title?: unknown;
  rootCause?: unknown;
  correctiveActions?: unknown;
  tags?: unknown;
  confidence?: unknown;
  status?: unknown;
}

/** Confidence band → tone (matches the Brain confidence model). */
function confTone(c: number): string {
  if (c >= 70) return "text-signal";
  if (c >= 40) return "text-[var(--warn)]";
  return "text-muted";
}

export function CaseExplorerClient() {
  const t = useTranslations("caseExplorer");
  const tCase = useTranslations("brain.cases");
  const tDomain = useTranslations("brain.domains");
  const tVendor = useTranslations("brain.vendors");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pct = locale === "fa" ? "\u066A" : "%";

  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState<string>("all");
  const [domain, setDomain] = useState<string>("all");

  // Phase 11B-B: published cases from PostgreSQL, fetched client-side via
  // the existing /api/cases route (never imports the repository/Prisma
  // directly). Session mode or any fetch failure leaves this empty, so the
  // static-only corpus below is the entire result — unchanged behavior.
  const [publishedRaw, setPublishedRaw] = useState<RawPublishedCase[]>([]);
  useEffect(() => {
    let live = true;
    fetch("/api/cases", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live && Array.isArray(j?.cases)) {
          setPublishedRaw(
            (j.cases as RawPublishedCase[]).filter((c) => c.status === "published")
          );
        }
      })
      .catch(() => {
        /* best-effort; static corpus remains */
      });
    return () => {
      live = false;
    };
  }, []);

  const publishedRows: DisplayCaseRow[] = useMemo(
    () =>
      publishedRaw
        .map((c) =>
          publishedRowFor({
            id: String(c.id ?? ""),
            vendor: String(c.vendor ?? ""),
            domain: String(c.domain ?? ""),
            title: String(c.title ?? ""),
            rootCause: String(c.rootCause ?? ""),
            correctiveActions: Array.isArray(c.correctiveActions)
              ? (c.correctiveActions as string[])
              : [],
            tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
            confidence: Number(c.confidence ?? 0),
          })
        )
        .filter((r): r is DisplayCaseRow => r !== null),
    [publishedRaw]
  );

  // root-cause/corrective summaries come from the localized case content
  const caseContent = useMemo(() => {
    const map: Record<string, { rootCause: string; corrective: string; searchBlob: string }> = {};
    for (const c of CASES) {
      const loc = locale === "fa" ? c.fa : c.en;
      map[c.id] = {
        rootCause: loc.rootCauses[0] ?? loc.rootCause,
        corrective: loc.correctiveActions[0] ?? loc.resolution,
        searchBlob: [
          tCase(c.id),
          c.vendor,
          c.category,
          ...c.keywords,
          ...loc.rootCauses,
        ]
          .join(" ")
          .toLowerCase(),
      };
    }
    return map;
  }, [locale, tCase]);

  const staticRows: DisplayCaseRow[] = useMemo(
    () =>
      CASE_ROWS.map((r) => ({
        ...r,
        title: tCase(r.id),
        rootCause: caseContent[r.id]?.rootCause ?? "",
        corrective: caseContent[r.id]?.corrective ?? "",
        source: "static" as const,
      })),
    [caseContent, tCase]
  );

  const allRows = useMemo(() => [...staticRows, ...publishedRows], [staticRows, publishedRows]);
  const vendorOptions = useMemo(() => vendorsOf(allRows), [allRows]);
  const domainOptions = useMemo(() => domainsOf(allRows), [allRows]);
  const metrics = useMemo(() => metricsFor(allRows), [allRows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((r) => {
      if (vendor !== "all" && r.vendor !== vendor) return false;
      if (domain !== "all" && r.domain !== domain) return false;
      if (q) {
        const blob =
          r.source === "static"
            ? caseContent[r.id]?.searchBlob ?? ""
            : [r.title, r.vendor, r.domain, ...r.keywords, r.rootCause].join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, query, vendor, domain, caseContent]);

  const hasFilters = query !== "" || vendor !== "all" || domain !== "all";

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8">
      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ["total", metrics.total],
            ["vendors", metrics.vendors],
            ["domains", metrics.domains],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-surface p-4">
            <p className="font-body text-[0.7rem] uppercase tracking-wide text-muted">
              {t(`metrics.${k}`)}
            </p>
            <p className="metric mt-2 text-2xl text-ink">{nf.format(v)}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mt-6">
        <label className="sr-only" htmlFor="case-search">
          {t("search.label")}
        </label>
        <input
          id="case-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 font-body text-sm text-ink placeholder:text-muted/60 focus:border-signal/50 focus:outline-none"
        />
      </div>

      {/* Filters */}
      <div className="mt-4 space-y-3">
        <FilterRow
          label={t("filters.vendor")}
          allLabel={t("filters.all")}
          options={vendorOptions}
          value={vendor}
          onChange={setVendor}
          render={(v) => tVendor(v)}
        />
        <FilterRow
          label={t("filters.domain")}
          allLabel={t("filters.all")}
          options={domainOptions}
          value={domain}
          onChange={setDomain}
          render={(d) => tDomain(d)}
        />
        {hasFilters && (
          <button
            onClick={() => {
              setQuery("");
              setVendor("all");
              setDomain("all");
            }}
            className="font-body text-xs text-signal hover:underline"
          >
            {t("filters.clear")}
          </button>
        )}
      </div>

      {/* Listing */}
      {filtered.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {filtered.map((r) => {
            const inner = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-base font-semibold leading-snug text-ink group-hover:text-signal">
                    {r.title}
                  </h3>
                  <span className={`shrink-0 font-mono text-sm ${confTone(r.confidence)}`}>
                    {nf.format(r.confidence)}
                    {pct}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-signalDim px-2 py-0.5 font-body text-[0.65rem] text-signal" dir="ltr">
                    {tVendor(r.vendor)}
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.65rem] text-muted">
                    {tDomain(r.domain)}
                  </span>
                </div>
                <dl className="mt-3 space-y-2">
                  <div>
                    <dt className="font-mono text-[0.6rem] uppercase tracking-widest text-muted/70">
                      {t("card.rootCause")}
                    </dt>
                    <dd className="mt-0.5 font-body text-xs leading-relaxed text-ink">
                      {r.rootCause}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[0.6rem] uppercase tracking-widest text-muted/70">
                      {t("card.corrective")}
                    </dt>
                    <dd className="mt-0.5 font-body text-xs leading-relaxed text-muted">
                      {r.corrective}
                    </dd>
                  </div>
                </dl>
              </>
            );
            // Published (DB-only) cases have no statically generated detail
            // page yet — render as a plain card, mirroring how the Library
            // already treats DB-only entries (see LibraryClient).
            return r.source === "static" ? (
              <Link
                key={r.id}
                href={`/library/cases/${r.id}`}
                className="group rounded-xl border border-line bg-surface p-5 transition-colors hover:border-signal/40"
              >
                {inner}
              </Link>
            ) : (
              <div key={r.id} className="rounded-xl border border-line bg-surface p-5">
                {inner}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-8 rounded-xl border border-line bg-surface px-5 py-8 text-center font-body text-sm text-muted">
          {t("none")}
        </p>
      )}
    </div>
  );
}

function FilterRow({
  label,
  allLabel,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  allLabel: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  render: (v: string) => string;
}) {
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 font-body text-xs transition-colors ${
      active
        ? "border-signal/50 bg-signal/10 text-signal"
        : "border-line text-muted hover:border-signal/30"
    }`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="me-1 font-mono text-[0.65rem] uppercase tracking-widest text-muted/70">
        {label}
      </span>
      <button onClick={() => onChange("all")} className={chip(value === "all")}>
        {allLabel}
      </button>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={chip(value === o)}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}
