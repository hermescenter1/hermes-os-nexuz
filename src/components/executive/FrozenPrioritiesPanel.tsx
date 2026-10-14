import { getTranslations } from "next-intl/server";
import { PageStatusBadge } from "@/components/ui/PageHeader";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import { statusLabelKey } from "@/lib/executive/status-label";
import type { FrozenPriorities } from "@/lib/executive/report/contract";
import type { PriorityItem } from "@/lib/executive/priorities";

type Translator = Awaited<ReturnType<typeof getTranslations<"executive">>>;

/**
 * The priority list a nightly pass froze, rendered inside a frozen report.
 *
 * WHAT THIS PANEL HAS TO GET RIGHT, because the data cannot say it for itself:
 *
 *  · `null` is "NOT RECORDED", never "nothing was due". Every report written
 *    before `exec-report-3` has no list, and a pass whose priority sources
 *    could not be read records none either. Rendering an empty list for that
 *    would be a false statement about a night nobody can re-examine.
 *
 *  · The list was OBSERVED when the report was generated — it is not the
 *    ranking as it stood at the data cutoff, which the sources cannot
 *    reconstruct. The panel says so, in the reader's language, rather than
 *    leaving the reader to assume the stronger claim.
 *
 *  · A LATE pass is a record of what was outstanding, not advice. When the
 *    target day had already ended by the time the rows were read, the panel
 *    leads with that instead of presenting the list as "tomorrow".
 */
/** This item's own reason, with its elapsed time and its due date. */
function reasonText(
  item: PriorityItem,
  t: Translator,
  locale: string,
  timeZone: string,
  config: FrozenPriorities["config"],
): string {
  const id = item.reason.ruleId;
  const threshold =
    id === "APPROVAL_CRITICALLY_LATE"
      ? config.approvalCriticalDays
      : id === "APPROVAL_LATE"
        ? config.approvalStaleDays
        : 0;
  const duration =
    item.reason.days > 0
      ? t("priorities.duration.days", { count: item.reason.days })
      : t("priorities.duration.hours", { count: item.reason.hours });
  return t(`priorities.reason.${id}` as never, {
    duration,
    due: item.reason.dueAtIso
      ? formatDateTime(item.reason.dueAtIso, locale, { dateStyle: "medium", timeStyle: "short", timeZone })
      : "",
    threshold,
  } as never);
}

export async function FrozenPrioritiesPanel({
  priorities,
  locale,
}: {
  priorities: FrozenPriorities | null;
  locale: string;
}) {
  const t = await getTranslations("executive");

  if (priorities === null) {
    return (
      <section className="rounded-xl border border-line bg-surface-glass px-5 py-4">
        <h2 className="text-sm font-medium text-text-primary">{t("reports.priorities.heading")}</h2>
        <p className="mt-1 text-sm text-muted">{t("reports.priorities.notRecorded")}</p>
      </section>
    );
  }

  const tz = priorities.timeZone;
  const when = (iso: string) =>
    formatDateTime(iso, locale, { dateStyle: "medium", timeStyle: "short", timeZone: tz });
  const items = priorities.list.data?.items ?? [];

  return (
    <section className="rounded-xl border border-line bg-surface-glass px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-text-primary">
          {t("reports.priorities.headingFor", { date: priorities.targetBusinessDate })}
        </h2>
        <PageStatusBadge
          label={t(statusLabelKey(priorities.list.status, true) as never)}
          variant={priorities.list.status === "OPERATIONAL" ? "neutral" : "warning"}
        />
      </div>

      {/* The late case leads, because it changes what the list IS. */}
      {priorities.late && (
        <p className="mt-2 text-sm text-warn">
          {t("reports.priorities.late", { date: priorities.targetBusinessDate })}
        </p>
      )}

      <p className="mt-2 text-xs text-muted">
        {t("reports.priorities.observedAt", { time: when(priorities.observedAtIso) })}
        {" · "}
        {t("reports.priorities.rulesVersion", { version: priorities.rulesVersion })}
      </p>
      <p className="mt-1 text-xs text-muted">{t("reports.priorities.notReconstructed")}</p>

      {priorities.list.status !== "OPERATIONAL" ? (
        <p className="mt-3 text-sm text-muted">
          {priorities.list.reasonKey
            ? t(priorities.list.reasonKey.replace(/^executive\./, "") as never)
            : t("status.UNAVAILABLE")}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t("reports.priorities.none")}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {items.map(item => (
            <li
              key={`${item.kind}:${item.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <PageStatusBadge
                    label={t("priorities.tier", { tier: formatNumber(item.tier, locale) })}
                    variant={item.tier === 1 ? "offline" : item.tier === 2 ? "warning" : "neutral"}
                  />
                  <span className="text-sm text-text-primary">{item.title}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {t(`priorities.kind.${item.kind}` as never)}
                  {" · "}
                  {reasonText(item, t, locale, tz, priorities.config)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
