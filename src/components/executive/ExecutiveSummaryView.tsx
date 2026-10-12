/**
 * Executive Management Center — the surface.
 *
 * SERVER COMPONENTS ONLY. There is no `"use client"` anywhere in this file and no
 * client component is imported, so this surface adds no client bundle of its own:
 * the range selector is three ordinary links, the drill-downs are ordinary links,
 * and the whole surface is rendered once on the server from one summary object.
 * (The authenticated AppShell around it has client parts that every dashboard
 * page already loads — this file adds none, which is not the same as the page
 * shipping zero JavaScript.)
 *
 * This is deliberate — an executive screen is read, not operated, and a 5-second
 * client poll is what the previous dashboard did instead of reading real data.
 *
 * THREE LAYERS, in the order the brief asks for:
 *   A. today's position      — the headline numbers, each with its provenance
 *   B. what needs a decision — the action centre, every item with its cause
 *   C. detail to inspect     — the plant table, and a link out of every figure
 *
 * Nothing here invents a value. A section that is refused, broken or
 * unimplemented renders its own stated reason; it never renders as an empty
 * panel, and it never renders as a zero.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PageStatusBadge } from "@/components/ui/PageHeader";
import { formatDateTime, formatNumber, INVALID_DISPLAY } from "@/lib/i18n/format";
import type {
  ExecutiveMetric,
  ExecutiveSection,
  MetricDelta,
  SectionStatus,
  SourceFreshness,
} from "@/lib/executive/contract";
import type {
  DataQualityNote,
  DecisionItem,
  ExecutiveSummary,
  FinancialSummary,
  IndustrialSummary,
  OperationsSummary,
  SiteConnectivity,
} from "@/lib/executive/summary";
import { EXECUTIVE_RANGES, type ExecutiveRange } from "@/lib/executive/period";

type T = Awaited<ReturnType<typeof getTranslations<"executive">>>;

/** A translation key that may legitimately be absent is read defensively. */
const keyOf = (full: string) => full.replace(/^executive\./, "");

/* ── status presentation ───────────────────────────────────────────────────── */

const STATUS_VARIANT: Record<SectionStatus, "live" | "neutral" | "warning" | "offline"> = {
  OPERATIONAL: "live",
  EMPTY: "neutral",
  FORBIDDEN: "neutral",
  UNAVAILABLE: "offline",
  NO_SOURCE: "warning",
};

const FRESHNESS_VARIANT: Record<SourceFreshness, "live" | "warning" | "offline" | "neutral"> = {
  FRESH: "live",
  STALE: "warning",
  DISCONNECTED: "offline",
  NEVER: "neutral",
  INVALID: "offline",
};

/* ── shared shells ─────────────────────────────────────────────────────────── */

function Panel({
  title,
  lede,
  badge,
  children,
}: {
  title: string;
  lede?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-e2">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-panel-title">{title}</h2>
          {lede && <p className="mt-1 text-xs text-muted">{lede}</p>}
        </div>
        {badge}
      </header>
      {children}
    </section>
  );
}

/**
 * Renders a section, or the reason it has no data.
 *
 * The reason is ALWAYS shown — a refusal that renders as blank space is
 * indistinguishable from "everything is fine", which is the single failure this
 * whole surface is built to avoid.
 */
function SectionBody<D>({
  section,
  t,
  children,
}: {
  section: ExecutiveSection<D>;
  t: T;
  children: (data: D) => React.ReactNode;
}) {
  if (section.status === "OPERATIONAL" && section.data !== null) {
    return <>{children(section.data)}</>;
  }
  return (
    <div
      className="rounded-lg border border-line/70 bg-base/40 px-4 py-3"
      role={section.status === "UNAVAILABLE" ? "alert" : undefined}
    >
      <p className="text-sm text-muted">
        {section.reasonKey ? t(keyOf(section.reasonKey) as never) : t("status.UNAVAILABLE")}
      </p>
    </div>
  );
}

/* ── metrics ───────────────────────────────────────────────────────────────── */

function DeltaLine({ delta, t, locale }: { delta: MetricDelta; t: T; locale: string }) {
  if (delta.kind === "NO_CHANGE") {
    return <span className="text-xs text-muted">{t("delta.noChange")}</span>;
  }
  if (delta.kind === "INCOMPARABLE") {
    // The REASON is printed, not an em dash. "No baseline" and "the period has
    // not finished" lead a reader to different conclusions.
    return (
      <span className="text-xs text-muted">
        {t(`delta.incomparable.${delta.reason}` as never)}
      </span>
    );
  }
  if (delta.kind === "FROM_ZERO") {
    return (
      <span className="text-xs text-signal">
        {t("delta.fromZero", { absolute: formatNumber(delta.absolute, locale) })}
      </span>
    );
  }

  const up = delta.absolute > 0;
  const sign = up ? "+" : "−";
  const magnitude = formatNumber(Math.abs(delta.absolute), locale);
  const percent = formatNumber(Math.abs(delta.percent), locale, { maximumFractionDigits: 1 });
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 text-xs">
      {/* The arrow is decorative; the sign is in the text, so a screen reader
          and a monochrome print both carry the direction. */}
      <span className={up ? "text-signal" : "text-warn"}>
        {sign}
        {magnitude} ({sign}
        {percent}%)
      </span>
      {delta.lowBaseline && <span className="text-muted">{t("delta.lowBaselineNote")}</span>}
    </span>
  );
}

function MetricCard({
  metric,
  t,
  locale,
  timeZone,
}: {
  metric: ExecutiveMetric;
  t: T;
  locale: string;
  timeZone: string;
}) {
  const { provenance: p } = metric;
  const detailHref = p.detailPath ? `/${locale}/${p.detailPath}` : null;

  return (
    <article className="flex h-full flex-col justify-between rounded-lg border border-line bg-base/30 p-4">
      <div>
        <h3 className="text-xs font-medium text-muted">{t(`metrics.${metric.key}` as never)}</h3>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">
          {metric.value === null ? INVALID_DISPLAY : formatNumber(metric.value, locale)}
        </p>
        <div className="mt-1">
          <DeltaLine delta={metric.delta} t={t} locale={locale} />
        </div>
      </div>

      {/* Provenance. Every figure carries its definition, its system of record,
          the window it covers and when it was computed — in a <details> so the
          surface stays readable while the evidence is one click away. */}
      <details className="mt-3 border-t border-line/60 pt-2">
        <summary className="cursor-pointer text-[11px] text-muted">
          {t("provenance.definition")}
        </summary>
        <dl className="mt-2 space-y-1 text-[11px] text-muted">
          <div>
            <dt className="sr-only">{t("provenance.definition")}</dt>
            <dd>{t(`definitions.${metric.key}` as never)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="font-medium">{t("provenance.source")}:</dt>
            <dd>{t(keyOf(p.sourceKey) as never)}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="font-medium">{t("provenance.period")}:</dt>
            <dd>
              {p.period
                ? `${formatDateTime(p.period.fromIso, locale, { dateStyle: "short", timeStyle: "short", timeZone })} – ${formatDateTime(p.period.toIso, locale, { dateStyle: "short", timeStyle: "short", timeZone })}`
                : t("provenance.pointInTime")}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="font-medium">{t("provenance.dataAsOf")}:</dt>
            <dd>
              {formatDateTime(p.dataAsOfIso, locale, {
                dateStyle: "short",
                timeStyle: "short",
                timeZone,
              })}
            </dd>
          </div>
        </dl>
        {detailHref && (
          <Link
            href={detailHref}
            className="mt-2 inline-block text-[11px] text-signal underline underline-offset-2"
          >
            {t("provenance.detail")}
          </Link>
        )}
      </details>
    </article>
  );
}

function MetricGrid({
  metrics,
  t,
  locale,
  timeZone,
}: {
  metrics: readonly ExecutiveMetric[];
  t: T;
  locale: string;
  timeZone: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {metrics.map(m => (
        <MetricCard key={m.key} metric={m} t={t} locale={locale} timeZone={timeZone} />
      ))}
    </div>
  );
}

/* ── layer B: the action centre ────────────────────────────────────────────── */

function ActionCenter({
  section,
  t,
  locale,
}: {
  section: ExecutiveSection<readonly DecisionItem[]>;
  t: T;
  locale: string;
}) {
  return (
    <Panel
      title={t("sections.actions")}
      badge={<PageStatusBadge label={t(`status.${section.status}`)} variant={STATUS_VARIANT[section.status]} />}
    >
      <SectionBody section={section} t={t}>
        {items =>
          items.length === 0 ? (
            <p className="text-sm text-muted">{t("actionCenter.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {items.map(item => (
                <li
                  key={item.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-base/30 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <PageStatusBadge
                        label={t(`priority.${item.priority}`)}
                        variant={item.priority === "HIGH" ? "offline" : "warning"}
                      />
                      <span className="text-sm font-medium text-fg">
                        {t(`metrics.${item.key}` as never)}
                      </span>
                      <span className="text-sm tabular-nums text-muted">
                        {t("actionCenter.affected", { count: item.count })}
                      </span>
                    </div>
                    {/* The CAUSE, not a score: the rule that put this on the list. */}
                    <p className="mt-1 text-xs text-muted">{t(keyOf(item.causeKey) as never)}</p>
                  </div>
                  {item.detailPath && (
                    <Link
                      href={`/${locale}/${item.detailPath}`}
                      className="shrink-0 rounded border border-signal/30 px-3 py-1.5 text-xs text-signal hover:bg-signal/5"
                    >
                      {t("actionCenter.viewRecords")}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </SectionBody>
    </Panel>
  );
}

/* ── layer C: plants ──────────────────────────────────────────────────────── */

function SiteTable({
  sites,
  t,
  locale,
  timeZone,
}: {
  sites: readonly SiteConnectivity[];
  t: T;
  locale: string;
  timeZone: string;
}) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[34rem] text-start text-sm">
        <caption className="sr-only">{t("sites.title")}</caption>
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t("sites.columnName")}</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t("sites.columnFreshness")}</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t("sites.columnGateways")}</th>
            <th scope="col" className="py-2 text-start font-medium">{t("sites.columnLastSignal")}</th>
          </tr>
        </thead>
        <tbody>
          {sites.map(site => (
            <tr key={site.siteId} className="border-b border-line/50 last:border-0">
              <th scope="row" className="py-2 pe-3 text-start font-normal text-fg">{site.name}</th>
              <td className="py-2 pe-3">
                <PageStatusBadge
                  label={t(`freshness.${site.freshness}`)}
                  variant={FRESHNESS_VARIANT[site.freshness]}
                />
              </td>
              <td className="py-2 pe-3 tabular-nums text-muted">
                {site.gatewayCount === 0
                  ? t("sites.noGateway")
                  : `${formatNumber(site.onlineGatewayCount, locale)} / ${formatNumber(site.gatewayCount, locale)}`}
              </td>
              <td className="py-2 text-muted">
                {site.lastSignalIso === null
                  ? INVALID_DISPLAY
                  : formatDateTime(site.lastSignalIso, locale, {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone,
                    })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── data quality ─────────────────────────────────────────────────────────── */

function DataQualityPanel({ notes, t }: { notes: readonly DataQualityNote[]; t: T }) {
  if (notes.length === 0) return null;
  return (
    <Panel title={t("quality.title")}>
      <ul className="space-y-2">
        {notes.map(note => (
          <li key={note.key} className="flex items-start gap-2 text-sm">
            <span
              aria-hidden="true"
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${note.severity === "WARNING" ? "bg-warn" : "bg-muted/60"}`}
            />
            <span className={note.severity === "WARNING" ? "text-fg" : "text-muted"}>
              {t(keyOf(note.key) as never, (note.meta ?? {}) as never)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ── range selector (three links, no client JavaScript) ───────────────────── */

function RangeSelector({
  active,
  locale,
  t,
}: {
  active: ExecutiveRange;
  locale: string;
  t: T;
}) {
  return (
    <nav aria-label={t("rangeLabel")} className="flex flex-wrap gap-1">
      {EXECUTIVE_RANGES.map(range => {
        const current = range === active;
        return (
          <Link
            key={range}
            href={`/${locale}/dashboard/executive?range=${range}`}
            aria-current={current ? "true" : undefined}
            className={`rounded border px-3 py-1.5 text-xs transition-colors ${
              current
                ? "border-signal/40 bg-signal/10 text-signal"
                : "border-line text-muted hover:border-signal/20 hover:text-fg"
            }`}
          >
            {t(`ranges.${range}`)}
          </Link>
        );
      })}
    </nav>
  );
}

/* ── the view ─────────────────────────────────────────────────────────────── */

/**
 * The envelope of a FROZEN report, when this view is rendering one from the
 * archive rather than the live screen.
 *
 * Its presence replaces the range selector — a frozen report has no range to
 * choose — with the report's own identity: which night, which version, which
 * calculation produced it and how current its data was. Reusing this renderer
 * rather than writing a second one is what guarantees the archive shows exactly
 * what the screen showed.
 */
export interface FrozenReportHeader {
  readonly businessDate: string;
  readonly version: number;
  readonly calcVersion: string;
  readonly dataCutoffIso: string;
  readonly supersedesVersion: number | null;
  readonly regenerationReason: string | null;
}

export async function ExecutiveSummaryView({
  summary,
  locale,
  frozen,
}: {
  summary: ExecutiveSummary;
  locale: string;
  frozen?: FrozenReportHeader;
}) {
  const t = await getTranslations("executive");
  const tz = summary.timeZone;

  const operations = summary.sections.operations as ExecutiveSection<OperationsSummary>;
  const financial = summary.sections.financial as ExecutiveSection<FinancialSummary>;
  const industrial = summary.sections.industrial as ExecutiveSection<IndustrialSummary>;
  const customers = summary.sections.customers;

  return (
    <div className="space-y-5">
      {frozen ? (
        /* A frozen report states WHEN it was true instead of offering a range.
           The data cutoff is shown, not the generation time, because that is
           the moment the figures actually describe. */
        <div className="rounded-lg border border-line bg-base/40 px-4 py-3">
          <p className="text-sm text-fg">{t("reports.frozenNotice")}</p>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <div className="flex gap-1">
              <dt className="font-medium">{t("reports.dataCutoff")}:</dt>
              <dd>
                {formatDateTime(frozen.dataCutoffIso, locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: tz,
                })}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="font-medium">{t("reports.period")}:</dt>
              <dd>
                {formatDateTime(summary.period.current.fromIso, locale, { dateStyle: "short", timeStyle: "short", timeZone: tz })}
                {" – "}
                {formatDateTime(summary.period.current.toIso, locale, { dateStyle: "short", timeStyle: "short", timeZone: tz })}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="font-medium">{t("provenance.timeZone")}:</dt>
              <dd>{tz}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="font-medium">{t("reports.calcVersion")}:</dt>
              <dd>{frozen.calcVersion}</dd>
            </div>
          </dl>
          {frozen.supersedesVersion !== null && (
            <p className="mt-2 text-xs text-warn">
              {t("reports.supersedes", { version: frozen.supersedesVersion })}
              {frozen.regenerationReason ? ` — ${frozen.regenerationReason}` : null}
            </p>
          )}
        </div>
      ) : (
        /* Period, zone and data cutoff — stated once, at the top, so no figure
           below has to be interpreted against an unknown clock. */
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RangeSelector active={summary.range} locale={locale} t={t} />
          <p className="text-xs text-muted">
            {t("lastUpdated", {
              time: formatDateTime(summary.generatedAtIso, locale, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: tz,
              }),
            })}
            {" · "}
            {t("provenance.timeZone")}: {tz}
            {" · "}
            <Link
              href={`/${locale}/dashboard/executive/reports`}
              className="text-signal underline underline-offset-2"
            >
              {t("reports.navLink")}
            </Link>
          </p>
        </div>
      )}

      {/* LAYER B first on the screen: what needs a decision outranks what is
          merely true. */}
      <ActionCenter section={summary.actions} t={t} locale={locale} />

      {/* LAYER A */}
      <Panel
        title={t("sections.operations")}
        lede={t("sectionLede.operations")}
        badge={
          <PageStatusBadge
            label={t(`status.${operations.status}`)}
            variant={STATUS_VARIANT[operations.status]}
          />
        }
      >
        <SectionBody section={operations} t={t}>
          {data => <MetricGrid metrics={data.metrics} t={t} locale={locale} timeZone={tz} />}
        </SectionBody>
      </Panel>

      <Panel
        title={t("sections.financial")}
        lede={t("sectionLede.financial")}
        badge={
          <PageStatusBadge
            label={t(`status.${financial.status}`)}
            variant={STATUS_VARIANT[financial.status]}
          />
        }
      >
        <SectionBody section={financial} t={t}>
          {data => (
            <div className="space-y-3">
              <MetricGrid metrics={data.metrics} t={t} locale={locale} timeZone={tz} />
              {/* Stated on the surface, not only in the data: these are project
                  cost figures and this product has no ledger. */}
              <p className="text-xs text-muted">{t("reasons.noLedger")}</p>
            </div>
          )}
        </SectionBody>
      </Panel>

      {/* LAYER C */}
      <Panel
        title={t("sections.industrial")}
        lede={t("sectionLede.industrial")}
        badge={
          <PageStatusBadge
            label={t(`status.${industrial.status}`)}
            variant={STATUS_VARIANT[industrial.status]}
          />
        }
      >
        <SectionBody section={industrial} t={t}>
          {data => (
            <div className="space-y-4">
              <MetricGrid metrics={data.metrics} t={t} locale={locale} timeZone={tz} />
              <SiteTable sites={data.sites} t={t} locale={locale} timeZone={tz} />
            </div>
          )}
        </SectionBody>
      </Panel>

      <Panel
        title={t("sections.customers")}
        badge={
          <PageStatusBadge
            label={t(`status.${customers.status}`)}
            variant={STATUS_VARIANT[customers.status]}
          />
        }
      >
        <SectionBody section={customers} t={t}>
          {() => null}
        </SectionBody>
      </Panel>

      <DataQualityPanel notes={summary.dataQuality} t={t} />
    </div>
  );
}
