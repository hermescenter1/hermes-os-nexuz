/**
 * /[locale]/dashboard/executive/reports/[date] — one frozen nightly report.
 *
 * The date in the URL is a SELECTOR, never an authority: the query matches on
 * `(organizationId, businessDate)` with the organization taken from the
 * resolved scope, so a date from another tenant's archive resolves to nothing.
 * Permission is re-checked here, at open time, exactly as the brief requires —
 * a link in last month's notification does not carry last month's access.
 *
 * The snapshot is rendered through the SAME view the live dashboard uses, with
 * the range selector replaced by the report's own envelope. That is what makes
 * "the archive shows what the screen showed" a structural fact rather than a
 * promise: there is only one renderer.
 */

import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { resolveExecutiveScope } from "@/lib/executive/scope";
import { ExecutiveScopeNotice } from "@/components/executive/ExecutiveScopeNotice";
import { ExecutiveSummaryView } from "@/components/executive/ExecutiveSummaryView";
import { FrozenPrioritiesPanel } from "@/components/executive/FrozenPrioritiesPanel";
import { getReport } from "@/lib/executive/report/read";

export const metadata = noIndexMetadata("Executive nightly report");
export const dynamic = "force-dynamic";

/** `YYYY-MM-DD` and nothing else. An unparseable date is simply not found. */
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export default async function ExecutiveReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; date: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, date } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("executive");

  const query = await searchParams;
  const rawVersion = Array.isArray(query.version) ? query.version[0] : query.version;
  const parsedVersion = rawVersion === undefined ? undefined : Number(rawVersion);
  // A malformed version is ignored rather than refused: the page then shows the
  // CURRENT version of that night, which is the safe default for a human who
  // edited a URL. The API is where a programmatic caller gets a 400.
  const version =
    parsedVersion !== undefined && Number.isInteger(parsedVersion) && parsedVersion > 0
      ? parsedVersion
      : undefined;

  const resolved = await resolveExecutiveScope();

  let body: React.ReactNode;
  if (!resolved.ok) {
    body = <ExecutiveScopeNotice code={resolved.code} memberships={resolved.memberships} />;
  } else if (!DATE_KEY.test(date)) {
    body = <NotFound message={t("reports.notFound")} />;
  } else {
    const report = await getReport({
      organizationId: resolved.scope.organizationId,
      businessDate: date,
      version,
    });

    body = report ? (
      <>
        <ExecutiveSummaryView
          summary={report.snapshot}
          locale={locale}
          frozen={{
            businessDate: report.businessDate,
            version: report.version,
            calcVersion: report.calcVersion,
            dataCutoffIso: report.dataCutoffIso,
            supersedesVersion: report.supersedesVersion,
            regenerationReason: report.regenerationReason,
          }}
        />
        {/* Null renders "not recorded", never an empty list: every report
            written before exec-report-3 has none, and absence is not a
            statement that nothing was due. */}
        <FrozenPrioritiesPanel priorities={report.priorities} locale={locale} />
      </>
    ) : (
      <NotFound message={t("reports.notFound")} />
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-6 sm:px-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("reports.detailTitle", { date })}
          level="page"
        />
        <Link
          href={`/${locale}/dashboard/executive/reports`}
          className="inline-block text-xs text-signal underline underline-offset-2"
        >
          {t("reports.backToArchive")}
        </Link>
        {body}
      </div>
    </AppShell>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <p
      className="max-w-xl rounded-xl border border-line bg-surface px-6 py-4 text-sm text-text-primary shadow-e2"
      role="alert"
    >
      {message}
    </p>
  );
}
