/**
 * Executive Management Center — financial activity and approval oversight view.
 *
 * Server-only, like the summary view it sits beside, and built from the same
 * shells (`Panel`, `SectionBody`, `DeltaLine`) so a refusal, an empty source and
 * an outage read identically on both pages.
 *
 * Two things this view is careful never to do:
 *   · print a single cross-currency total — each currency is its own panel row,
 *     and a permanent note says why there is no combined figure;
 *   · present cost oversight as accounting — the no-ledger note is permanent,
 *     not shown only when a section is empty.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PageStatusBadge } from "@/components/ui/PageHeader";
import { formatCurrency, formatDateTime, formatNumber, INVALID_DISPLAY } from "@/lib/i18n/format";
import { EXECUTIVE_RANGES, type ExecutiveRange } from "@/lib/executive/period";
import type {
  AgeBuckets,
  ApprovalOversight,
  CostActivity,
  FinancialOversight,
} from "@/lib/executive/oversight";
import {
  DeltaLine,
  Panel,
  SectionBody,
  STATUS_VARIANT,
  type ExecutiveTranslator as T,
} from "./ExecutiveSummaryView";

/**
 * Money in its own currency. A code that is not ISO-4217 (the column is a free
 * string) still prints its amount next to the code as stored — never converted,
 * never hidden behind a dash when the amount itself is perfectly readable.
 */
function money(amount: number, currency: string, locale: string): string {
  const formatted = formatCurrency(amount, locale, currency);
  if (formatted !== INVALID_DISPLAY) return formatted;
  const n = formatNumber(amount, locale);
  return n === INVALID_DISPLAY ? INVALID_DISPLAY : `${n} ${currency}`;
}

function Truncated({ show, t }: { show: boolean; t: T }) {
  if (!show) return null;
  return <p className="mt-2 text-xs text-warn">{t("oversight.truncated")}</p>;
}

function RangeSelector({ current, locale, t }: { current: ExecutiveRange; locale: string; t: T }) {
  return (
    <nav aria-label={t("rangeLabel")} className="flex flex-wrap gap-2">
      {EXECUTIVE_RANGES.map(range => {
        const active = range === current;
        return (
          <Link
            key={range}
            href={`/${locale}/dashboard/executive/oversight?range=${range}`}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-md border border-signal bg-signalDim px-3 py-1.5 text-xs text-signal"
                : "rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-text-primary"
            }
          >
            {t(`ranges.${range}` as never)}
          </Link>
        );
      })}
    </nav>
  );
}

/* ── cost activity ─────────────────────────────────────────────────────────── */

function CostActivityBody({ data, t, locale }: { data: CostActivity; t: T; locale: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-medium text-text-primary">{t("oversight.cost.byCurrencyTitle")}</h3>
        {data.byCurrency.length === 0 ? (
          <p className="text-sm text-muted">{t("oversight.cost.noneInPeriod")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.byCurrency.map(c => (
              <li key={c.currency} className="rounded-lg border border-line bg-surface-glass p-4">
                <p className="text-xs text-muted">{t("oversight.cost.currencyLabel", { currency: c.currency })}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{money(c.amount, c.currency, locale)}</p>
                <p className="mt-1 text-xs text-muted">
                  {t("oversight.cost.entries", { count: c.entries })}
                </p>
                <div className="mt-2">
                  <DeltaLine delta={c.delta} t={t} locale={locale} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <Truncated show={data.currenciesTruncated} t={t} />
        <p className="mt-3 text-xs text-muted">{t("oversight.cost.noExchangeRate")}</p>
      </div>

      {data.byCategory.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-text-primary">{t("oversight.cost.byCategoryTitle")}</h3>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[30rem] text-start text-sm">
              <caption className="sr-only">{t("oversight.cost.byCategoryTitle")}</caption>
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t("oversight.cost.columnCategory")}</th>
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t("oversight.cost.columnCurrency")}</th>
                  <th scope="col" className="py-2 pe-3 text-end font-medium">{t("oversight.cost.columnAmount")}</th>
                  <th scope="col" className="py-2 text-end font-medium">{t("oversight.cost.columnEntries")}</th>
                </tr>
              </thead>
              <tbody>
                {data.byCategory.map(c => (
                  <tr key={`${c.currency}|${c.category ?? ""}`} className="border-b border-border-subtle last:border-0">
                    <th scope="row" className="py-2 pe-3 text-start font-normal text-text-primary">
                      {c.category ?? <span className="text-muted">{t("oversight.cost.uncategorised")}</span>}
                    </th>
                    <td className="py-2 pe-3 text-muted">{c.currency}</td>
                    <td className="py-2 pe-3 text-end tabular-nums">{money(c.amount, c.currency, locale)}</td>
                    <td className="py-2 text-end tabular-nums text-muted">{formatNumber(c.entries, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Truncated show={data.categoriesTruncated} t={t} />
        </div>
      )}

      <div>
        <h3 className="mb-1 text-sm font-medium text-text-primary">{t("oversight.cost.recordersTitle")}</h3>
        <p className="mb-2 text-xs text-muted">{t("oversight.cost.recordersLede")}</p>
        {data.recorders.length === 0 ? (
          <p className="text-sm text-muted">{t("oversight.cost.noRecorders")}</p>
        ) : (
          <ul className="divide-y divide-line/50 rounded-lg border border-line">
            {data.recorders.map(r => (
              <li key={r.userId} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2">
                <span className="text-sm text-text-primary">
                  {r.displayName ?? <span className="text-muted">{t("oversight.unresolvedUser")}</span>}
                </span>
                <span className="flex flex-wrap gap-x-3 text-xs text-muted">
                  <span>{t("oversight.cost.entries", { count: r.entries })}</span>
                  {r.amounts.map(a => (
                    <span key={a.currency} className="tabular-nums">
                      {money(a.amount, a.currency, locale)}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Truncated show={data.recordersTruncated} t={t} />
        {data.unattributedEntries > 0 && (
          <p className="mt-2 text-xs text-warn">
            {t("oversight.cost.unattributed", { count: data.unattributedEntries })}
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium text-text-primary">{t("oversight.cost.overBudgetTitle")}</h3>
        <p className="mb-2 text-xs text-muted">
          {t("oversight.cost.overBudgetSummary", {
            over: data.overBudgetCount,
            total: data.projectsSampled,
          })}
        </p>
        {data.overBudget.length > 0 && (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[30rem] text-start text-sm">
              <caption className="sr-only">{t("oversight.cost.overBudgetTitle")}</caption>
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t("oversight.cost.columnProject")}</th>
                  <th scope="col" className="py-2 pe-3 text-end font-medium">{t("oversight.cost.columnBudget")}</th>
                  <th scope="col" className="py-2 pe-3 text-end font-medium">{t("oversight.cost.columnActual")}</th>
                  <th scope="col" className="py-2 text-end font-medium">{t("oversight.cost.columnOverrun")}</th>
                </tr>
              </thead>
              <tbody>
                {data.overBudget.map(p => (
                  <tr key={p.projectId} className="border-b border-border-subtle last:border-0">
                    <th scope="row" className="py-2 pe-3 text-start font-normal text-text-primary">
                      <Link href={`/${locale}/erp/projects/${p.projectId}`} className="underline underline-offset-2">
                        {p.name}
                      </Link>
                    </th>
                    <td className="py-2 pe-3 text-end tabular-nums">{formatNumber(p.budget, locale)}</td>
                    <td className="py-2 pe-3 text-end tabular-nums">{formatNumber(p.actualCost, locale)}</td>
                    <td className="py-2 text-end tabular-nums text-warn">+{formatNumber(p.overrun, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Truncated show={data.projectsTruncated} t={t} />
        <p className="mt-2 text-xs text-muted">{t("oversight.cost.budgetHasNoCurrency")}</p>
      </div>
    </div>
  );
}

/* ── approvals ─────────────────────────────────────────────────────────────── */

const AGE_KEYS: readonly (keyof AgeBuckets)[] = ["underOneDay", "oneToThreeDays", "threeToSevenDays", "overSevenDays"];

function ApprovalsBody({
  data,
  t,
  locale,
  timeZone,
}: {
  data: ApprovalOversight;
  t: T;
  locale: string;
  timeZone: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-text-primary">{t("oversight.approvals.pendingTitle")}</h3>
          <Link href={`/${locale}/erp/approvals`} className="text-xs text-signal underline underline-offset-2">
            {t("actionCenter.viewRecords")}
          </Link>
        </div>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{formatNumber(data.pendingTotal, locale)}</p>
        {data.oldestPendingIso && (
          <p className="text-xs text-muted">
            {t("oversight.approvals.oldest", {
              when: formatDateTime(data.oldestPendingIso, locale, { dateStyle: "medium", timeStyle: "short", timeZone }),
            })}
          </p>
        )}

        {data.pendingByRole.length > 0 && (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-start text-sm">
              <caption className="sr-only">{t("oversight.approvals.byRoleTitle")}</caption>
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t("oversight.approvals.columnRole")}</th>
                  <th scope="col" className="py-2 pe-3 text-end font-medium">{t("oversight.approvals.columnTotal")}</th>
                  {AGE_KEYS.map(k => (
                    <th key={k} scope="col" className="py-2 pe-3 text-end font-medium">
                      {t(`oversight.approvals.age.${k}` as never)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.pendingByRole.map(r => (
                  <tr key={r.approverRole ?? "\u0000none"} className="border-b border-border-subtle last:border-0">
                    <th scope="row" className="py-2 pe-3 text-start font-normal text-text-primary">
                      {r.approverRole ?? <span className="text-warn">{t("oversight.approvals.noPendingStep")}</span>}
                    </th>
                    <td className="py-2 pe-3 text-end tabular-nums">{formatNumber(r.total, locale)}</td>
                    {AGE_KEYS.map(k => (
                      <td
                        key={k}
                        className={`py-2 pe-3 text-end tabular-nums ${k === "overSevenDays" && r.age[k] > 0 ? "text-warn" : "text-muted"}`}
                      >
                        {formatNumber(r.age[k], locale)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.pendingTruncated && (
          <p className="mt-2 text-xs text-warn">
            {t("oversight.approvals.sampled", { sampled: data.pendingSampled, total: data.pendingTotal })}
          </p>
        )}
        <p className="mt-2 text-xs text-muted">{t("oversight.approvals.waitingDefinition")}</p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-text-primary">{t("oversight.approvals.decidedTitle")}</h3>
        <dl className="grid grid-cols-3 gap-3">
          {(
            [
              ["approved", data.decidedApproved],
              ["rejected", data.decidedRejected],
              ["cancelled", data.decidedCancelled],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line bg-surface-glass p-3">
              <dt className="text-xs text-muted">{t(`oversight.approvals.outcome.${k}` as never)}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{formatNumber(v, locale)}</dd>
            </div>
          ))}
        </dl>

        {data.deciders.length > 0 && (
          <ul className="mt-3 divide-y divide-line/50 rounded-lg border border-line">
            {data.deciders.map(d => (
              <li key={d.userId} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2">
                <span className="text-sm text-text-primary">
                  {d.displayName ?? <span className="text-muted">{t("oversight.unresolvedUser")}</span>}
                </span>
                <span className="text-xs text-muted">
                  {t("oversight.approvals.deciderSplit", { approved: d.approved, rejected: d.rejected })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Truncated show={data.decidersTruncated} t={t} />
        {data.unattributedDecisions > 0 && (
          <p className="mt-2 text-xs text-warn">
            {t("oversight.approvals.unattributed", { count: data.unattributedDecisions })}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── page body ─────────────────────────────────────────────────────────────── */

export async function FinancialOversightView({
  oversight,
  locale,
}: {
  oversight: FinancialOversight;
  locale: string;
}) {
  const t = await getTranslations("executive");
  const { costActivity, approvals } = oversight.sections;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeSelector current={oversight.range} locale={locale} t={t} />
        <p className="text-xs text-muted">
          {t("lastUpdated", {
            time: formatDateTime(oversight.generatedAtIso, locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: oversight.timeZone,
            }),
          })}
          {" · "}
          {t("provenance.timeZone")}: {oversight.timeZone}
          {" · "}
          <Link href={`/${locale}/dashboard/executive`} className="text-signal underline underline-offset-2">
            {t("title")}
          </Link>
        </p>
      </div>

      <Panel
        title={t("oversight.cost.title")}
        lede={t("oversight.cost.lede")}
        badge={<PageStatusBadge label={t(`status.${costActivity.status}` as never)} variant={STATUS_VARIANT[costActivity.status]} />}
      >
        <SectionBody section={costActivity} t={t}>
          {data => <CostActivityBody data={data} t={t} locale={locale} />}
        </SectionBody>
        {/* Permanent, not conditional: the absence of a ledger is true whether or
            not this organization happens to have cost rows. */}
        <p className="mt-4 text-xs text-muted">{t("oversight.cost.notAccounting")}</p>
      </Panel>

      <Panel
        title={t("oversight.approvals.title")}
        lede={t("oversight.approvals.lede")}
        badge={<PageStatusBadge label={t(`status.${approvals.status}` as never)} variant={STATUS_VARIANT[approvals.status]} />}
      >
        <SectionBody section={approvals} t={t}>
          {data => <ApprovalsBody data={data} t={t} locale={locale} timeZone={oversight.timeZone} />}
        </SectionBody>
      </Panel>
    </div>
  );
}
