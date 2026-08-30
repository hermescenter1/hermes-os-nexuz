"use client";

/**
 * PHASE 104-I.D2 — Alarm Center (Gate A reference surface B).
 *
 * A read-only alarm INVESTIGATION surface. It is bounded by what
 * `GET /api/operations/alerts` actually returns, and by nothing else:
 *
 *   ALERTS_API_METHODS      = ["GET"]
 *   ACKNOWLEDGE_CONTROL     = ABSENT   (no enabled control, no disabled decoy)
 *   FAKE_MUTATION           = ABSENT
 *   OPTIMISTIC_ACKNOWLEDGE  = ABSENT
 *
 * Facts the endpoint does NOT carry, and which are therefore rendered as
 * unknown rather than invented:
 *   - there is no per-alert timestamp, only a payload-level `builtAt`;
 *   - `status` is a constant the builder writes, not observed lifecycle state,
 *     so it is not presented as one;
 *   - the only server-side filter is `severity`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { formatDate } from "@/lib/i18n/format";
import type { AlertSeverity, OperationsAlert } from "@/lib/operations/types";
import {
  StateBoundary,
  SeverityLedger,
  ProvenanceFooter,
  SEVERITY_BADGE,
  SEVERITY_FILL,
  SEVERITY_ROW,
  SEVERITY_TEXT,
  interpretResponse,
  selectQueue,
  buildLedger,
  dominantSeverity,
  distinctVendors,
  assessFreshness,
  scheduleFreshnessCheck,
  SEVERITY_ORDER,
  type AlarmState,
  type SeverityFilter,
} from "@/components/command-center";

/** Meets the 44x44 minimum target without altering the badge type scale. */
/**
 * Gate A.1 §3C — every interactive control here meets 44x44 and shows a visible
 * focus ring. `min-w-11` matters as much as `min-h-11`: a short localized label
 * ("Alle", "همه") would otherwise produce a target narrower than the minimum.
 */
const TARGET =
  "min-h-11 min-w-11 inline-flex items-center justify-center px-3 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

export function AlertCommandClient() {
  const locale = useLocale();
  const t = useTranslations("dashboard.alarms");

  const [state, setState] = useState<AlarmState>({ phase: "loading" });
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Freshness must age on its own. Computed once at render, a page left open
  // keeps asserting "Current" indefinitely while the data quietly goes stale.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    setState({ phase: "loading" });

    (async () => {
      try {
        const res = await fetch("/api/operations/alerts", { cache: "no-store" });
        // Parsed defensively: a non-OK status usually carries an error envelope,
        // and a proxy can return HTML that is not JSON at all.
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = null;
        }
        if (cancelled) return;
        setState(interpretResponse(res.status, res.ok, body));
      } catch {
        if (!cancelled) setState({ phase: "failed", failure: { kind: "network" } });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const builtAt = state.phase === "ready" ? state.payload.builtAt : null;
  useEffect(() => {
    if (builtAt === null) return;
    setNow(Date.now());
    // ONE timer, fired at the crossing point — not a poll, no request, no
    // mutation. Cleaned up on unmount and whenever the payload changes.
    return scheduleFreshnessCheck(builtAt, Date.now(), () => setNow(Date.now()));
  }, [builtAt]);

  const nf = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    [locale],
  );
  const formatNumber = useCallback((n: number) => nf.format(n), [nf]);

  const severityLabels = useMemo(
    () =>
      ({
        critical: t("severity.critical"),
        warning: t("severity.warning"),
        info: t("severity.info"),
      }) as Record<AlertSeverity, string>,
    [t],
  );

  /* ── Loading ─────────────────────────────────────────────────────────── */
  if (state.phase === "loading") {
    return <StateBoundary busy title={t("state.loadingTitle")} body={t("state.loadingBody")} />;
  }

  /* ── Failed — never reported as "no alarms" ──────────────────────────── */
  if (state.phase === "failed") {
    const f = state.failure;
    const rateLimited = f.kind === "rateLimited";
    const detailLine =
      f.kind === "unavailable" || f.kind === "rateLimited"
        ? "GET /api/operations/alerts - HTTP " + String(f.status)
        : f.kind === "malformed"
          ? "GET /api/operations/alerts - unexpected payload shape"
          : "GET /api/operations/alerts - network error";

    return (
      <StateBoundary
        tone={rateLimited ? "warning" : "danger"}
        title={rateLimited ? t("state.rateLimitedTitle") : t("state.errorTitle")}
        body={rateLimited ? t("state.rateLimitedBody") : t("state.errorBody")}
        detail={detailLine}
        action={
          <button
            type="button"
            onClick={retry}
            className={
              TARGET +
              " rounded-md border border-signal/40 bg-signal/[0.08] text-ink transition-colors hover:border-signal/70 hover:bg-signal/[0.14]"
            }
          >
            <span className="kpi-label text-ink">{t("state.retry")}</span>
          </button>
        }
      />
    );
  }

  /* ── Ready ───────────────────────────────────────────────────────────── */
  const payload = state.payload;
  const queue = selectQueue(payload, filter);
  const ledger = buildLedger(payload.counts);
  const dominant = dominantSeverity(payload.counts);
  const freshness = assessFreshness(payload.builtAt, now);
  const built = Number.isNaN(Date.parse(payload.builtAt))
    ? null
    : formatDate(payload.builtAt, locale, { timeStyle: "medium" });

  const detail: OperationsAlert | null = payload.alerts.find((a) => a.id === selected) ?? null;

  return (
    <div data-phase104-surface="alarm-center" className="flex flex-col gap-6">
      {/* Dominant composition — estate posture as one proportional band. */}
      {payload.counts.total > 0 ? (
        <SeverityLedger
          segments={ledger}
          total={payload.counts.total}
          totalLabel={t("ledger.total")}
          labels={severityLabels}
          dominant={dominant}
          dominantLabel={dominant ? t("ledger.posture." + dominant) : null}
          formatNumber={formatNumber}
        />
      ) : (
        <StateBoundary title={t("state.emptyTitle")} body={t("state.emptyBody")} />
      )}

      {payload.counts.total > 0 && (
        <>
          {/* Severity filter. aria-pressed carries state to assistive tech;
              colour alone would not. */}
          <div
            role="group"
            aria-label={t("filter.legend")}
            className="flex flex-wrap items-center gap-2"
          >
            {(["all", ...SEVERITY_ORDER] as const).map((f) => {
              const active = filter === f;
              const count = f === "all" ? payload.counts.total : payload.counts[f];
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f)}
                  className={
                    TARGET +
                    " gap-2 rounded-md border transition-colors " +
                    (active
                      ? "border-signal/50 bg-signal/[0.06] text-ink"
                      : "border-line text-muted hover:border-signal/30 hover:text-ink")
                  }
                >
                  <span className="kpi-label">
                    {f === "all" ? t("filter.all") : severityLabels[f]}
                  </span>
                  <span
                    className={
                      "font-mono text-caption " +
                      (f === "all" ? "text-metadata" : SEVERITY_TEXT[f])
                    }
                  >
                    {formatNumber(count)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Investigation split — queue leads, evidence supports. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-8 xl:col-span-9">
              <h2 className="type-panel-title mb-3">{t("queue.heading")}</h2>

              {queue.kind === "empty" && (
                <StateBoundary title={t("state.emptyTitle")} body={t("state.emptyBody")} />
              )}

              {queue.kind === "filtered" && (
                <StateBoundary
                  title={t("state.noMatchTitle")}
                  body={t("state.noMatchBody", {
                    severity: severityLabels[queue.filter],
                    // Passed as a NUMBER, not a pre-formatted string: the
                    // catalogue selects the plural form and formats the digits
                    // per locale. Formatting it here would both break plural
                    // selection and print "1 alarms remain".
                    total: queue.totalAvailable,
                  })}
                  action={
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className={
                        TARGET +
                        " rounded-md border border-line text-ink transition-colors hover:border-signal/40"
                      }
                    >
                      <span className="kpi-label">{t("filter.clear")}</span>
                    </button>
                  }
                />
              )}

              {queue.kind === "list" && (
                <>
                  <p className="kpi-label mb-2 text-metadata">
                    {t("queue.showing", { shown: formatNumber(queue.alerts.length) })}
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {queue.alerts.map((alert) => {
                      const open = selected === alert.id;
                      return (
                        <li key={alert.id}>
                          <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => setSelected(open ? null : alert.id)}
                            className={
                              "relative w-full rounded-lg border py-3 pe-3 ps-4 text-start transition-colors " +
                              (open
                                ? "border-signal/45 bg-signal/[0.06]"
                                : SEVERITY_ROW[alert.severity] + " hover:border-signal/25")
                            }
                          >
                            {/* Severity as a leading edge: scannable down the
                                column without reading a single badge. */}
                            <span
                              aria-hidden="true"
                              className={
                                "absolute inset-y-2 start-0 w-1 rounded-full " +
                                SEVERITY_FILL[alert.severity]
                              }
                            />
                            <span className="flex flex-col gap-1.5">
                              <span className="font-body text-sm font-medium leading-snug text-ink">
                                {alert.label}
                              </span>
                              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className={SEVERITY_BADGE[alert.severity]}>
                                  {severityLabels[alert.severity]}
                                </span>
                                <span className="font-mono text-caption text-metadata">
                                  {alert.vendorName || t("unknown")}
                                </span>
                                <span className="font-mono text-caption text-metadata">
                                  {alert.category}
                                </span>
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>

            {/* Evidence rail */}
            <aside className="flex flex-col gap-5 lg:col-span-4 xl:col-span-3">
              <section className="rounded-xl border border-line bg-surface p-4">
                <h2 className="type-panel-title mb-3">{t("detail.heading")}</h2>
                {detail ? (
                  <>
                    <span className={SEVERITY_BADGE[detail.severity] + " mb-3 inline-block"}>
                      {severityLabels[detail.severity]}
                    </span>
                    <h3 className="mb-3 font-body text-sm font-semibold leading-snug text-ink">
                      {detail.label}
                    </h3>
                    <dl className="flex flex-col gap-2">
                      {(
                        [
                          ["detail.category", detail.category],
                          ["detail.vendor", detail.vendorName],
                          ["detail.device", detail.deviceLabel || detail.deviceId],
                          ["detail.caseRef", detail.caseId],
                        ] as const
                      ).map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-3">
                          <dt className="kpi-label shrink-0 text-metadata">{t(key)}</dt>
                          <dd className="truncate text-end font-mono text-caption text-ink">
                            {value || t("unknown")}
                          </dd>
                        </div>
                      ))}
                      {/* The feed carries no per-alert observation time. Saying so is
                          the honest rendering; printing `builtAt` here would read as
                          the moment THIS alarm was raised — a different, unsupported
                          claim. */}
                      <div className="flex justify-between gap-3">
                        <dt className="kpi-label shrink-0 text-metadata">
                          {t("detail.observedAt")}
                        </dt>
                        <dd className="text-end font-mono text-caption text-metadata">
                          {t("unknownTimestamp")}
                        </dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  // Purposeful rather than empty: it names what the rail will
                  // show, without inventing a metric to fill the space.
                  <div className="flex flex-col gap-3">
                    <p className="type-secondary text-xs">{t("detail.prompt")}</p>
                    <ul className="flex flex-col gap-1.5 border-t border-line pt-3">
                      {(["detail.category", "detail.vendor", "detail.device", "detail.caseRef"] as const).map((k) => (
                        <li key={k} className="kpi-label text-metadata">
                          {t(k)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-line bg-surface p-4">
                <h2 className="type-panel-title mb-3">{t("heat.heading")}</h2>
                <ul className="flex flex-col gap-1.5">
                  {payload.byCategory.map((cat) => (
                    <li
                      key={cat.category}
                      className="flex items-center justify-between gap-3 rounded border border-line px-2.5 py-1.5"
                    >
                      <span className="truncate font-body text-xs text-ink">{cat.category}</span>
                      <span
                        className={"shrink-0 font-mono text-caption " + SEVERITY_TEXT[cat.severity]}
                      >
                        {formatNumber(cat.count)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="kpi-label mb-1">{t("ledger.vendors")}</dt>
                  <dd className="metric text-lg text-ink">
                    {formatNumber(distinctVendors(payload.alerts))}
                  </dd>
                </div>
                <div>
                  <dt className="kpi-label mb-1">{t("ledger.categories")}</dt>
                  <dd className="metric text-lg text-ink">
                    {formatNumber(payload.byCategory.length)}
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </>
      )}

      <ProvenanceFooter
        sourceLabel={t("provenance.source")}
        builtLabel={built}
        freshness={freshness}
        freshLabel={t("provenance.fresh")}
        staleLabel={t("provenance.stale")}
        unknownLabel={t("provenance.unknownTime")}
        readOnlyLabel={t("provenance.readOnly")}
      />
    </div>
  );
}
