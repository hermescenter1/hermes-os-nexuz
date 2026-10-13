/**
 * Executive Management Center — tomorrow's priorities view.
 *
 * Server-only, built from the same shells as the other executive pages. Each
 * item states, in one sentence, the rule that placed it and the numbers that
 * made the rule fire; the full rule set is printed below the list with the
 * thresholds actually in force, so a manager can check any placement against
 * the record and the rule.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PageStatusBadge } from "@/components/ui/PageHeader";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import {
  CANDIDATE_LIMIT,
  PRIORITY_RULES,
  type PriorityItem,
  type PriorityList,
  type PriorityTier,
  type TomorrowsPriorities,
} from "@/lib/executive/priorities";
import type { SettingsSource } from "@/lib/executive/settings";
import {
  keyOf,
  Panel,
  SectionBody,
  STATUS_VARIANT,
  type ExecutiveTranslator as T,
} from "./ExecutiveSummaryView";

const TIERS: readonly PriorityTier[] = [1, 2, 3];

const TIER_ACCENT: Record<PriorityTier, string> = {
  1: "border-s-4 border-s-warn",
  2: "border-s-4 border-s-signal",
  3: "border-s-4 border-s-line",
};

function when(iso: string, locale: string, timeZone: string): string {
  return formatDateTime(iso, locale, { dateStyle: "medium", timeStyle: "short", timeZone });
}

/** "3 days" when at least a day has passed, otherwise "5 hours". */
function duration(item: PriorityItem, t: T): string {
  return item.reason.days > 0
    ? t("priorities.duration.days", { count: item.reason.days })
    : t("priorities.duration.hours", { count: item.reason.hours });
}

function reasonText(
  item: PriorityItem,
  t: T,
  locale: string,
  timeZone: string,
  config: TomorrowsPriorities["config"],
): string {
  const id = item.reason.ruleId;
  const threshold =
    id === "APPROVAL_CRITICALLY_LATE"
      ? config.approvalCriticalDays
      : id === "APPROVAL_LATE"
        ? config.approvalStaleDays
        : 0;
  return t(`priorities.reason.${id}` as never, {
    duration: duration(item, t),
    due: item.reason.dueAtIso ? when(item.reason.dueAtIso, locale, timeZone) : "",
    threshold,
  } as never);
}

function ItemRow({
  item,
  t,
  locale,
  timeZone,
  config,
}: {
  item: PriorityItem;
  t: T;
  locale: string;
  timeZone: string;
  config: TomorrowsPriorities["config"];
}) {
  return (
    <li className={`rounded-lg border border-line bg-surface-glass px-4 py-3 ${TIER_ACCENT[item.tier]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className="rounded-sm border border-line px-1.5 py-0.5 text-[11px] text-muted">
            {t(`priorities.kind.${item.kind}` as never)}
          </span>
          <Link href={`/${locale}/${item.detailPath}`} className="text-sm text-text-primary underline underline-offset-2">
            {item.title}
          </Link>
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">{reasonText(item, t, locale, timeZone, config)}</p>
    </li>
  );
}

function ListBody({
  data,
  t,
  locale,
  timeZone,
  config,
}: {
  data: PriorityList;
  t: T;
  locale: string;
  timeZone: string;
  config: TomorrowsPriorities["config"];
}) {
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-3 gap-3">
        {TIERS.map(tier => (
          <div key={tier} className={`rounded-lg border border-line bg-surface-glass p-3 ${TIER_ACCENT[tier]}`}>
            <dt className="text-xs text-muted">{t(`priorities.tier.${tier}` as never)}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{formatNumber(data.tierCounts[tier], locale)}</dd>
          </div>
        ))}
      </dl>

      {TIERS.map(tier => {
        const items = data.items.filter(i => i.tier === tier);
        return (
          <section key={tier} aria-labelledby={`tier-${tier}`}>
            <h3 id={`tier-${tier}`} className="mb-2 flex items-baseline gap-2 text-sm font-medium text-text-primary">
              {t(`priorities.tier.${tier}` as never)}
              <span className="text-xs font-normal text-muted">
                {t("priorities.tierCount", { count: data.tierCounts[tier] })}
              </span>
            </h3>
            {items.length === 0 ? (
              <p className="text-xs text-muted">{t("priorities.noneInTier")}</p>
            ) : (
              <ol className="space-y-2">
                {items.map(item => (
                  <ItemRow key={`${item.kind}:${item.id}`} item={item} t={t} locale={locale} timeZone={timeZone} config={config} />
                ))}
              </ol>
            )}
          </section>
        );
      })}

      {data.listTruncated && (
        <p className="text-xs text-warn">
          {t("priorities.listTruncated", { shown: data.items.length, total: data.totalPriorities })}
        </p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium text-text-primary">{t("priorities.sourcesTitle")}</h3>
        <ul className="divide-y divide-line/50 rounded-lg border border-line">
          {data.sources.map(s => (
            <li key={s.source} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-xs">
              <span className="text-text-primary">{t(`priorities.source.${s.source}` as never)}</span>
              <span className={s.excludedReasonKey ? "text-warn" : "text-muted"}>
                {s.excludedReasonKey
                  ? t(keyOf(s.excludedReasonKey) as never)
                  : s.truncated
                    ? t("priorities.sourceTruncated", { limit: CANDIDATE_LIMIT })
                    : t("priorities.sourceRead")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RulesPanel({
  t,
  config,
  locale,
  configSource,
}: {
  t: T;
  config: TomorrowsPriorities["config"];
  locale: string;
  configSource: SettingsSource;
}) {
  return (
    <Panel title={t("priorities.rulesTitle")} lede={t("priorities.rulesLede")}>
      <ol className="space-y-2">
        {PRIORITY_RULES.map((rule, index) => (
          <li key={rule.id} className={`rounded-lg border border-line bg-surface-glass px-4 py-2 ${TIER_ACCENT[rule.tier]}`}>
            <p className="text-sm text-text-primary">
              {/* Through the locale formatter: a raw {index + 1} printed Latin
                  digits in the Persian view. */}
              <span className="me-2 tabular-nums text-muted">{formatNumber(index + 1, locale)}.</span>
              {t(`priorities.rule.${rule.id}` as never, {
                hours: config.alertAgeHours,
                days: rule.id === "APPROVAL_CRITICALLY_LATE" ? config.approvalCriticalDays : config.approvalStaleDays,
              } as never)}
            </p>
            <p className="mt-0.5 text-xs text-muted">{t(`priorities.tier.${rule.tier}` as never)}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">
        {configSource === "ORGANIZATION" ? t("priorities.configNoteOrganization") : t("priorities.configNote")}{" "}
        <Link href={`/${locale}/dashboard/executive/settings`} className="text-signal underline underline-offset-2">
          {t("settings.linkFromPriorities")}
        </Link>
      </p>
    </Panel>
  );
}

export async function TomorrowsPrioritiesView({
  result,
  locale,
  configSource,
}: {
  result: TomorrowsPriorities;
  locale: string;
  /** Whose thresholds these are: the organization's own, or the defaults. */
  configSource: SettingsSource;
}) {
  const t = await getTranslations("executive");
  const { priorities, timeZone, config } = result;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">
        {t("priorities.horizon", { when: when(result.horizonEndIso, locale, timeZone) })}
        {" · "}
        {t("lastUpdated", { time: when(result.generatedAtIso, locale, timeZone) })}
        {" · "}
        {t("provenance.timeZone")}: {timeZone}
        {" · "}
        <Link href={`/${locale}/dashboard/executive`} className="text-signal underline underline-offset-2">
          {t("title")}
        </Link>
      </p>

      <Panel
        title={t("priorities.pageTitle")}
        badge={<PageStatusBadge label={t(`status.${priorities.status}` as never)} variant={STATUS_VARIANT[priorities.status]} />}
      >
        <SectionBody section={priorities} t={t}>
          {data => <ListBody data={data} t={t} locale={locale} timeZone={timeZone} config={config} />}
        </SectionBody>
      </Panel>

      <RulesPanel t={t} config={config} locale={locale} configSource={configSource} />
    </div>
  );
}
