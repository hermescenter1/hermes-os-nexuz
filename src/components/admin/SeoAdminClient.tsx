"use client";

import { useTranslations } from "next-intl";

interface SeoStats {
  totalRoutes:       number;
  staticRoutes:      number;
  articleRoutes:     number;
  jobRoutes:         number;
  locales:           number;
  schemaTypes:       string[];
  knowledgeArticles: number;
  openJobs:          number;
  sitemapUrl:        string;
  robotsUrl:         string;
  manifestUrl:       string;
  baseUrl:           string;
  hreflangEnabled:   boolean;
  ogEnabled:         boolean;
  twitterEnabled:    boolean;
  canonicalEnabled:  boolean;
}

interface SeoAdminClientProps {
  stats:  SeoStats;
  labels: Record<string, string>;
}


function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-ink tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function ActiveChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-signal/20 bg-signal/5 px-2.5 py-1 text-xs font-medium text-signal">
      <span className="h-1.5 w-1.5 rounded-full bg-signal" />
      {label}
    </span>
  );
}

export function SeoAdminClient({ stats, labels }: SeoAdminClientProps) {
  const t = useTranslations("adminOperations.seo");
  return (
    <div className="space-y-8">

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={labels.totalPages   ?? "Indexed Routes"} value={stats.totalRoutes} />
        <StatCard label={labels.locales      ?? "Locales"}        value={stats.locales} />
        <StatCard label={labels.knowledgeArticles ?? "Articles"}  value={stats.knowledgeArticles} sub={t("perLocales")} />
        <StatCard label={labels.openJobs     ?? "Open Jobs"}      value={stats.openJobs}    sub={t("perLocales")} />
      </div>

      {/* Feature flags */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
          {labels.overview ?? "SEO Features"}
        </h2>
        <div className="flex flex-wrap gap-3">
          {stats.canonicalEnabled  && <ActiveChip label={`${t("canonicalUrls")} — ${labels.configured ?? "Configured"}`} />}
          {stats.hreflangEnabled   && <ActiveChip label={`${labels.hreflang ?? "hreflang"} fa / en / x-default — ${labels.configured ?? "Configured"}`} />}
          {stats.ogEnabled         && <ActiveChip label={`${labels.ogTags ?? "Open Graph"} — ${labels.configured ?? "Configured"}`} />}
          {stats.twitterEnabled    && <ActiveChip label={`${t("twitterCards")} — ${labels.configured ?? "Configured"}`} />}
          <ActiveChip label={`${t("xmlSitemap")} — ${labels.active ?? "Active"}`} />
          <ActiveChip label={`${t("robotsTxt")} — ${labels.active ?? "Active"}`} />
          <ActiveChip label={`${t("webManifest")} — ${labels.active ?? "Active"}`} />
        </div>
      </div>

      {/* Schema types */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
          {labels.schemaTypes ?? "Active JSON-LD Schema Types"}
        </h2>
        <div className="flex flex-wrap gap-2">
          {stats.schemaTypes.map((s) => (
            <span key={s} className="rounded border border-line bg-surface/50 px-3 py-1 font-mono text-xs text-ink">
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Route breakdown */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
          {labels.publicRoutes ?? "Sitemap Route Breakdown"}
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <th className="pb-2 text-start">{t("routeGroup")}</th>
              <th className="pb-2 text-end">{t("count")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <tr>
              <td className="py-2 text-ink">{t("staticRoutes")}</td>
              <td className="py-2 text-end tabular-nums text-ink">{stats.staticRoutes}</td>
            </tr>
            <tr>
              <td className="py-2 text-ink">{t("knowledgeRoutes")}</td>
              <td className="py-2 text-end tabular-nums text-ink">{stats.articleRoutes}</td>
            </tr>
            <tr>
              <td className="py-2 text-ink">{t("jobRoutes")}</td>
              <td className="py-2 text-end tabular-nums text-ink">{stats.jobRoutes}</td>
            </tr>
            <tr className="font-semibold">
              <td className="py-2 text-signal">{t("totalEntries")}</td>
              <td className="py-2 text-end tabular-nums text-signal">{stats.totalRoutes}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Resource links */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
          {t("liveResources")}
        </h2>
        <div className="space-y-3">
          {[
            { label: labels.previewSitemap ?? "Sitemap", url: stats.sitemapUrl },
            { label: labels.previewRobots  ?? "Robots.txt", url: stats.robotsUrl },
            { label: t("webManifest"), url: stats.manifestUrl },
          ].map(({ label, url }) => (
            <div key={url} className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted">{label}</span>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-signal hover:underline break-all"
              >
                {url}
              </a>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
