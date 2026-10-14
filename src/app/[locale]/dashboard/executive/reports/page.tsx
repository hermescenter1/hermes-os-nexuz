/**
 * /[locale]/dashboard/executive/reports — the nightly report archive.
 *
 * Server-rendered, same gate chain as the dashboard. The archive is scoped to
 * the reader's active organization and the listing never selects a snapshot, so
 * opening a year of history costs a year of envelopes, not a year of frozen
 * summaries.
 *
 * SUPERSEDED VERSIONS ARE LISTED. "What did we believe that night, before the
 * correction" is exactly what an archive is for; hiding version 1 behind
 * version 2 would make a correction indistinguishable from the original having
 * been wrong all along.
 */

import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, PageStatusBadge } from "@/components/ui/PageHeader";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import { resolveExecutiveScope } from "@/lib/executive/scope";
import { ExecutiveScopeNotice } from "@/components/executive/ExecutiveScopeNotice";
import { countReports, listReports } from "@/lib/executive/report/read";
import { coverageVerdict } from "@/lib/executive/report/contract";

export const metadata = noIndexMetadata("Executive nightly reports");
export const dynamic = "force-dynamic";

export default async function ExecutiveReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("executive");

  const resolved = await resolveExecutiveScope();

  let body: React.ReactNode;
  if (!resolved.ok) {
    body = <ExecutiveScopeNotice code={resolved.code} memberships={resolved.memberships} />;
  } else {
    const organizationId = resolved.scope.organizationId;
    // `count` tells EMPTY from UNAVAILABLE: a null count means the archive could
    // not be read, which must not render as "no reports yet".
    const [entries, total] = await Promise.all([
      listReports({ organizationId }),
      countReports(organizationId),
    ]);

    if (total === null) {
      body = (
        <p className="rounded-lg border border-line bg-surface-glass px-4 py-3 text-sm text-muted" role="alert">
          {t("reports.archiveUnavailable")}
        </p>
      );
    } else if (entries.length === 0) {
      body = (
        <p className="rounded-lg border border-line bg-surface-glass px-4 py-3 text-sm text-muted">
          {t("reports.archiveEmpty")}
        </p>
      );
    } else {
      body = (
        <div className="relative overflow-x-auto rounded-xl border border-line bg-surface p-5 shadow-e2">
          <table className="w-full min-w-[40rem] text-start text-sm">
            <caption className="sr-only">{t("reports.title")}</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t("reports.columnDate")}</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t("reports.columnVersion")}</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t("reports.columnGenerated")}</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t("reports.columnCoverage")}</th>
                <th scope="col" className="py-2 text-start font-medium">
                  <span className="sr-only">{t("reports.open")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                // Three answers, not two: a section that FAILED is an
                // outage, a section that was never asked is a boundary. The
                // archive used to print both as "did not answer".
                const v = coverageVerdict(entry.coverage);
                return (
                  <tr key={`${entry.businessDate}-${entry.version}`} className="border-b border-border-subtle last:border-0">
                    <th scope="row" className="py-2 pe-3 text-start font-normal text-text-primary">
                      {entry.businessDate}
                    </th>
                    <td className="py-2 pe-3">
                      <PageStatusBadge
                        label={
                          entry.supersedesVersion === null
                            ? t("reports.original")
                            : t("reports.corrected")
                        }
                        variant={entry.supersedesVersion === null ? "neutral" : "warning"}
                      />
                      <span className="ms-2 tabular-nums text-muted">
                        {t("reports.versionLabel", { version: formatNumber(entry.version, locale) })}
                      </span>
                    </td>
                    <td className="py-2 pe-3 text-muted">
                      {formatDateTime(entry.generatedAtIso, locale, {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: entry.timeZone,
                      })}
                    </td>
                    <td className="py-2 pe-3 text-muted">
                      {v.failed > 0
                        ? t("reports.coverageFailed", { count: v.failed })
                        : v.notAsked > 0
                          ? t("reports.coverageNotAsked", { count: v.notAsked })
                          : t("reports.coverageComplete")}
                    </td>
                    <td className="py-2">
                      <Link
                        href={`/${locale}/dashboard/executive/reports/${entry.businessDate}?version=${entry.version}`}
                        className="text-signal underline underline-offset-2"
                      >
                        {t("reports.open")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-6 sm:px-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("reports.title")}
          subtitle={t("reports.lede")}
          level="page"
        />
        <Link
          href={`/${locale}/dashboard/executive`}
          className="inline-block text-xs text-signal underline underline-offset-2"
        >
          {t("title")}
        </Link>
        {body}
      </div>
    </AppShell>
  );
}
