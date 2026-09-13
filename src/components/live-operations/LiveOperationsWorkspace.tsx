/**
 * PHASE 109-C-UI.2 — the Live Operations workspace.
 *
 * A SERVER component. There is no client state, no fetch, no polling and no
 * timer: the filters are links that change the URL, so every view is a fresh
 * server render behind the tenant boundary. That is slower than a client
 * refresh and it is the point — a screen that updates itself without going back
 * through authorization is a screen that can outlive a permission change.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE THIS FILE ENFORCES
 * ─────────────────────────────────────────────────────────────────────────────
 * No number reaches the reader unless its `Measured.state` says it may. Every
 * figure goes through `<MetricValue>`, which renders a STATE — not connected,
 * no data, stale, unknown — whenever there is no readable value. A `0` is only
 * ever printed when the source answered and the answer was zero.
 */

import { getTranslations } from "next-intl/server";

import { cn } from "@/components/ds/cn";
import { FOCUS_RING } from "@/components/ds/a11y";
import { Link } from "@/i18n/navigation";
import {
  ALL_ACKNOWLEDGEMENTS,
  ALL_SEVERITIES,
  ALL_TIME_RANGES,
  isCompletePicture,
  isReadable,
  unreachedSources,
  type LiveOperationsFeed,
  type Measured,
  type OperationalEvent,
  type Severity,
} from "@/lib/live-operations/contract";

interface Props {
  readonly feed: LiveOperationsFeed;
  readonly sites: readonly { id: string; name: string }[];
  readonly organizationSlug: string;
}

/* ── primitives ───────────────────────────────────────────────────────────── */

/**
 * A measured number, or the reason there is none.
 *
 * The `state` branch comes FIRST and returns early. There is no path on which a
 * value is read without the state having been considered, which is what stops
 * `NOT_CONNECTED` from rendering as `0`.
 */
async function MetricValue({ metric }: { metric: Measured<number> }) {
  const t = await getTranslations("liveOperations");
  if (!isReadable(metric.state) || metric.value === null) {
    return (
      <span
        data-metric-state={metric.state}
        className="text-[13px] font-medium text-amber-100/90"
      >
        {t(`state.${metric.state}`)}
      </span>
    );
  }
  return (
    <span data-metric-state={metric.state} className="text-2xl font-semibold text-white">
      {metric.value}
    </span>
  );
}

async function SummaryCard({
  labelKey,
  metric,
}: {
  labelKey: string;
  metric: Measured<number>;
}) {
  const t = await getTranslations("liveOperations");
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <dt className="mb-1 text-[10px] uppercase tracking-wide text-white/50">
        {t(labelKey)}
      </dt>
      <dd>
        <MetricValue metric={metric} />
        {/* Provenance travels with the number, never in a legend somewhere
            else — and inside the <dd>, because a <div> in a <dl> may contain
            nothing but <dt> and <dd>. */}
        <p className="mt-2 text-[11px] text-white/50">
          <span dir="ltr" className="font-mono">{metric.provenance.source}</span>
          {" · "}
          {t(`freshness.${metric.provenance.freshness}`)}
        </p>
      </dd>
    </div>
  );
}

const SEVERITY_TONE: Readonly<Record<Severity, string>> = {
  CRITICAL: "bg-rose-500/20 text-rose-100",
  HIGH: "bg-orange-400/20 text-orange-100",
  MEDIUM: "bg-amber-400/15 text-amber-100",
  LOW: "bg-white/10 text-white/80",
};

/* ── filters ──────────────────────────────────────────────────────────────── */

/**
 * Filters are LINKS, not form controls.
 *
 * Each one is a real `<a href>` that re-renders the page on the server, so the
 * filtered view is produced behind the same authorization as the unfiltered one
 * and is shareable and back-button correct. A client-side filter would narrow a
 * list the browser already holds — which means the browser would have had to
 * hold rows the reader may not be entitled to.
 */
function filterHref(
  base: Readonly<Record<string, string | null>>,
  patch: Readonly<Record<string, string | null>>,
): string {
  const merged = { ...base, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v !== null && v !== "") params.set(k, v);
  }
  const q = params.toString();
  return q ? `/live-operations?${q}` : "/live-operations";
}

async function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        // 44 px minimum hit area on every filter, at every width.
        "inline-flex min-h-[44px] items-center rounded-full border px-4 text-[13px]",
        active
          ? "border-cyan-300/50 bg-cyan-400/15 text-white"
          : "border-white/15 text-white/75 hover:bg-white/[0.06] hover:text-white",
        FOCUS_RING,
      )}
    >
      {children}
    </Link>
  );
}

/* ── the workspace ────────────────────────────────────────────────────────── */

export async function LiveOperationsWorkspace({ feed, sites, organizationSlug }: Props) {
  const t = await getTranslations("liveOperations");

  const base: Record<string, string | null> = {
    site: feed.filter.siteId,
    severity: feed.filter.severity,
    ack: feed.filter.acknowledgement,
    range: feed.filter.timeRange,
  };

  const unreached = unreachedSources(feed);
  const complete = isCompletePicture(feed);

  return (
    <div
      data-live-operations-connection={feed.connection}
      data-live-operations-complete={String(complete)}
      className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8"
    >
      {/* ── header ─────────────────────────────────────────────────────── */}
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-200/70">
          {t("eyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-white">{t("title")}</h1>
        <p className="mt-1 text-sm text-white/60">
          {t("subtitle")}{" "}
          <span dir="ltr" className="font-mono text-white/50">{organizationSlug}</span>
        </p>

        {/* The advisory boundary. Stated on every render, in every locale — not
            in a tooltip, not once at first visit. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] px-4 py-2.5 text-[12px]">
          <span className="rounded bg-amber-300/20 px-2 py-0.5 font-medium text-amber-100">
            {t("boundary.advisory")}
          </span>
          <span className="text-amber-100/85">{t("boundary.noControl")}</span>
          <span className="text-amber-100/85">{t("boundary.humanValidation")}</span>
        </div>
      </header>

      {/* ── connection / provenance banner ─────────────────────────────── */}
      {!complete && (
        <section
          aria-live="polite"
          aria-labelledby="live-ops-degraded-heading"
          data-live-operations-degraded="true"
          className="mb-6 rounded-lg border border-amber-300/30 bg-amber-300/[0.08] p-4"
        >
          <h2 id="live-ops-degraded-heading" className="mb-1 text-sm font-semibold text-amber-100">
            {feed.connection === "NOT_CONNECTED"
              ? t("degraded.notConnectedHeading")
              : t("degraded.partialHeading")}
          </h2>
          <p className="text-[13px] leading-relaxed text-amber-100/85">
            {/* The sentence that keeps a blind screen from reading as calm. */}
            {t("degraded.notAnAllClear")}
          </p>
          {unreached.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {unreached.map((s) => (
                <li key={s.source} dir="ltr" className="font-mono text-[11px] text-amber-100/70">
                  {s.source}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── summary ────────────────────────────────────────────────────── */}
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
        {t("summary.heading")}
      </h2>
      <dl className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard labelKey="summary.activeSignals" metric={feed.summary.activeSignals} />
        <SummaryCard labelKey="summary.unresolvedIssues" metric={feed.summary.unresolvedIssues} />
        <SummaryCard labelKey="summary.staleSources" metric={feed.summary.staleSources} />
        <SummaryCard labelKey="summary.pendingValidations" metric={feed.summary.pendingValidations} />
        <SummaryCard labelKey="summary.recentEvents" metric={feed.summary.recentEvents} />
      </dl>

      {/* ── filters ────────────────────────────────────────────────────── */}
      <nav aria-labelledby="live-ops-filters-heading" className="mb-6">
        <h2
          id="live-ops-filters-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50"
        >
          {t("filters.label")}
        </h2>

        <div className="flex flex-wrap gap-2">
          <FilterChip href={filterHref(base, { severity: null })} active={feed.filter.severity === null}>
            {t("filters.allSeverities")}
          </FilterChip>
          {ALL_SEVERITIES.map((s) => (
            <FilterChip
              key={s}
              href={filterHref(base, { severity: s })}
              active={feed.filter.severity === s}
            >
              {t(`severity.${s}`)}
            </FilterChip>
          ))}
        </div>

        {/* Acknowledgement. Every value the parser accepts is offered here,
            including the reset — an accepted parameter with no control is an
            invisible filter, and on this page it would hide unacknowledged
            alarms from a reader who never chose to hide them. */}
        <div className="mt-2 flex flex-wrap gap-2">
          <FilterChip
            href={filterHref(base, { ack: null })}
            active={feed.filter.acknowledgement === null}
          >
            {t("filters.allAcknowledgements")}
          </FilterChip>
          {ALL_ACKNOWLEDGEMENTS.map((a) => (
            <FilterChip
              key={a}
              href={filterHref(base, { ack: a })}
              active={feed.filter.acknowledgement === a}
            >
              {t(`acknowledgement.${a}`)}
            </FilterChip>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_TIME_RANGES.map((r) => (
            <FilterChip
              key={r}
              href={filterHref(base, { range: r })}
              active={feed.filter.timeRange === r}
            >
              {t(`range.${r}`)}
            </FilterChip>
          ))}
        </div>

        {/* Only sites the reader is entitled to. The list itself is the
            boundary made visible: a site absent here is one they cannot see. */}
        <div className="mt-2 flex flex-wrap gap-2">
          <FilterChip href={filterHref(base, { site: null })} active={feed.filter.siteId === null}>
            {t("filters.allSites")}
          </FilterChip>
          {sites.map((s) => (
            <FilterChip
              key={s.id}
              href={filterHref(base, { site: s.id })}
              active={feed.filter.siteId === s.id}
            >
              <span dir="ltr">{s.name}</span>
            </FilterChip>
          ))}
        </div>
      </nav>

      {/* ── events ─────────────────────────────────────────────────────── */}
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
        {t("events.heading")}
      </h2>

      {feed.events.length === 0 ? (
        <EmptyEvents feed={feed} />
      ) : (
        <ul data-live-operations-events={feed.events.length} className="space-y-2">
          {feed.events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </ul>
      )}

      {/* ── what this surface cannot do ────────────────────────────────── */}
      <section
        aria-labelledby="live-ops-capabilities-heading"
        className="mt-8 rounded-lg border border-white/10 p-4"
      >
        <h2
          id="live-ops-capabilities-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50"
        >
          {t("capabilities.heading")}
        </h2>
        <ul className="space-y-1 text-[13px] text-white/70">
          {feed.unavailableCapabilities.map((c) => (
            <li key={c}>{t(`capabilities.${c}`)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * The empty state.
 *
 * Branches on WHY it is empty. "Not connected", "you have no site access" and
 * "nothing matched your filter" are three different sentences, and only the
 * last of them means the plant is quiet.
 */
async function EmptyEvents({ feed }: { feed: LiveOperationsFeed }) {
  const t = await getTranslations("liveOperations");

  const reason =
    feed.connection === "NOT_CONNECTED"
      ? "notConnected"
      : feed.allowedSiteIds.length === 0
        ? "noSiteAccess"
        : "noMatches";

  return (
    <div
      data-live-operations-empty={reason}
      className="rounded-lg border border-white/10 bg-white/[0.02] p-6"
    >
      <h3 className="mb-1 text-sm font-semibold text-white">{t(`empty.${reason}.heading`)}</h3>
      <p className="text-[13px] leading-relaxed text-white/70">{t(`empty.${reason}.body`)}</p>
    </div>
  );
}

async function EventRow({ event }: { event: OperationalEvent }) {
  const t = await getTranslations("liveOperations");

  return (
    <li
      data-event-id={event.id}
      data-event-site={event.siteId ?? "unattributed"}
      className="rounded-lg border border-white/10 bg-white/[0.02] p-4"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium", SEVERITY_TONE[event.severity])}>
          {t(`severity.${event.severity}`)}
        </span>
        <span className="rounded bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/80">
          {t(`acknowledgement.${event.acknowledgement}`)}
        </span>
        {/* Origin is shown because a reader must be able to tell a plant record
            from something derived. Nothing on this page is a catalogue entry. */}
        <span className="rounded bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/80">
          {t(`origin.${event.origin}`)}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-white">{event.title}</h3>
      <p className="mt-0.5 text-[13px] leading-relaxed text-white/70">{event.description}</p>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-3">
        <div>
          <dt className="uppercase tracking-wide text-white/50">{t("event.observedAt")}</dt>
          {/* The SERVER-observed instant. The source's own claim is never shown
              as if it were an observation. */}
          <dd dir="ltr" className="font-mono text-white/80">
            {new Date(event.observedAtEpochMs).toISOString()}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-white/50">{t("event.site")}</dt>
          <dd dir="ltr" className="font-mono text-white/80">
            {event.siteId ?? t("event.unattributed")}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-white/50">{t("event.owner")}</dt>
          <dd className="text-white/80">{event.owner ?? t("event.noOwner")}</dd>
        </div>
      </dl>

      {event.evidence.length > 0 && (
        <div className="mt-3">
          <h4 className="mb-1 text-[10px] uppercase tracking-wide text-white/50">
            {t("event.evidence")}
          </h4>
          <ul className="flex flex-wrap gap-2">
            {event.evidence.map((ref) => (
              <li
                key={`${ref.kind}-${ref.id}`}
                dir="ltr"
                className="rounded border border-white/10 px-2 py-1 font-mono text-[11px] text-white/70"
              >
                {ref.kind}:{ref.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
