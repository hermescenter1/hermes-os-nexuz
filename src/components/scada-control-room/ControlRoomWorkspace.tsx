/**
 * PHASE 109-C-UI.3 — the SCADA Control Room surface.
 *
 * A SERVER component throughout. Nothing here is interactive, so nothing here
 * needs to be: no `"use client"`, no hydration cost, no polling, no animation.
 * The page is a snapshot with its generation time printed on it, which is a more
 * honest thing to put in front of an operator than a screen that looks live and
 * is not.
 *
 * LAYOUT. Single column on a phone, two columns from `md`. Every interactive
 * target is at least 44px in its smaller dimension. Direction comes from the
 * document — the surface uses logical properties (`ms-`, `me-`, `text-start`)
 * rather than left/right, so Persian renders right-to-left without a second
 * code path.
 *
 * TRANSLATION. Every string is a catalogue lookup. There is not one `isFa ? …`
 * ternary, which is the defect that made three earlier phases ship English into
 * German pages.
 */

import { getTranslations } from "next-intl/server";
import { ConnectivityBadge } from "./ConnectivityBadge";
import {
  ALARM_SEVERITIES,
  SAFETY_CLASSES,
  STORED_GATEWAY_STATUSES,
  type ControlRoomView,
  type Provenance,
} from "@/lib/scada-control-room/contract";

/**
 * Translate a KNOWN enum token; print an unknown one verbatim.
 *
 * The alternative, a bare catalogue lookup on the raw value, either throws or
 * renders the key the day a migration adds a value this catalogue has never
 * heard of. A raw token is ugly; a broken alarm table at three in the morning
 * is worse.
 */
function tokenLabel(
  t: (k: string) => string,
  group: string,
  vocabulary: readonly string[],
  value: string,
): string {
  return vocabulary.includes(value) ? t(`${group}.${value}`) : value;
}

/** A small definition row. `dt`/`dd` so the pairing survives a screen reader. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-100">{value}</dd>
    </div>
  );
}

function ProvenanceLine({
  provenance,
  sourceLabel,
  uncertaintyLabel,
  sourceHeading,
  uncertaintyHeading,
}: {
  provenance: Provenance;
  sourceLabel: string;
  uncertaintyLabel: string;
  sourceHeading: string;
  uncertaintyHeading: string;
}) {
  return (
    <p className="mt-2 text-xs text-slate-400">
      <span className="text-slate-500">{sourceHeading}: </span>
      {sourceLabel}
      <span className="mx-2 text-slate-600" aria-hidden="true">
        ·
      </span>
      <span className="text-slate-500">{uncertaintyHeading}: </span>
      {uncertaintyLabel}
      {provenance.observedAt !== null ? (
        <>
          <span className="mx-2 text-slate-600" aria-hidden="true">
            ·
          </span>
          <time dateTime={provenance.observedAt} dir="ltr">{provenance.observedAt}</time>
        </>
      ) : null}
    </p>
  );
}

export async function ControlRoomWorkspace({
  view,
  locale,
}: {
  view: ControlRoomView;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: "otEdge.controlRoom" });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 text-start sm:px-6 lg:px-8">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">{t("eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">{t("subtitle")}</p>

        {/*
          Stated once, prominently. This screen is a read path and an operator
          should never wonder whether tapping something moved a valve.
        */}
        <p className="mt-4 rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
          {t("readOnlyNotice")}
        </p>

        <p className="mt-3 text-xs text-slate-400">
          {t("generatedAt")}{" "}
          <time dateTime={view.generatedAt} dir="ltr">{view.generatedAt}</time>
        </p>
      </header>

      {/* ── sites and gateways ───────────────────────────────────────────── */}
      <section aria-labelledby="cr-sites" className="mb-10">
        <h2 id="cr-sites" className="mb-4 text-lg font-semibold text-white">
          {t("sitesHeading")}
        </h2>

        {view.sites.length === 0 ? (
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-6">
            <p className="text-sm font-medium text-slate-100">{t("noSites")}</p>
            <p className="mt-2 text-sm text-slate-400">{t("noSitesBody")}</p>
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {view.sites.map((site) => (
              <li
                key={site.id}
                className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-white">{site.name}</h3>
                  <ConnectivityBadge
                    verdict={site.rollup}
                    label={t(`state.${site.rollup.state}`)}
                  />
                </div>
                {/*
                  With no gateway there is nothing to roll up, and the reason
                  text for that case (the record could not be read) would sit
                  one line above the no-gateway line and contradict it. The
                  UNKNOWN badge stays; the explanation is the line below.
                */}
                {site.gateways.length > 0 ? (
                  <p className="mt-1 text-xs text-slate-400">
                    {t("rollupLabel")}: {t(`reason.${site.rollup.reason}`)}
                  </p>
                ) : null}

                {site.gateways.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">{t("noGateways")}</p>
                ) : (
                  <ul className="mt-4 space-y-4">
                    {site.gateways.map((g) => (
                      <li
                        key={g.id}
                        className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-slate-100">{g.name}</span>
                          <ConnectivityBadge
                            verdict={g.connectivity}
                            label={t(`state.${g.connectivity.state}`)}
                          />
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          {t(`reason.${g.connectivity.reason}`)}
                        </p>
                        <dl className="mt-3 space-y-1">
                          <Field label={t("gatewayIdLabel")} value={g.gatewayId} />
                          <Field
                            label={t("versionLabel")}
                            value={g.version ?? t("versionUnknown")}
                          />
                          <Field
                            label={t("lastSeenLabel")}
                            value={g.provenance.observedAt ?? t("neverSeen")}
                          />
                          {/*
                            The stored column is shown as what it is — the last
                            value the ingest path wrote — never as the live
                            state. Only present when there is one.
                          */}
                          {g.connectivity.storedStatus !== null ? (
                            <Field
                              label={t("storedStatusLabel")}
                              value={tokenLabel(
                                t,
                                "storedStatus",
                                STORED_GATEWAY_STATUSES,
                                g.connectivity.storedStatus,
                              )}
                            />
                          ) : null}
                        </dl>
                        <ProvenanceLine
                          provenance={g.provenance}
                          sourceHeading={t("provenance.heading")}
                          uncertaintyHeading={t("uncertainty.heading")}
                          sourceLabel={t(`provenance.${g.provenance.source}`)}
                          uncertaintyLabel={t(`uncertainty.${g.provenance.uncertainty}`)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── declared protocol references ─────────────────────────────────── */}
      <section aria-labelledby="cr-protocols" className="mb-10">
        <h2 id="cr-protocols" className="mb-1 text-lg font-semibold text-white">
          {t("protocolsHeading")}
        </h2>
        <p className="mb-4 max-w-3xl text-sm text-slate-400">{t("protocolsNote")}</p>
        {!view.engineeringPermitted ? (
          <p
            role="note"
            className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-100"
          >
            {t("engineeringNotPermitted")}
          </p>
        ) : view.protocols.length === 0 ? (
          <p className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5 text-sm text-slate-300">
            {t("protocolsEmpty")}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {view.protocols.map((p) => (
              <li
                key={p.protocol}
                className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-4 py-3"
              >
                {/* The protocol name is data, not a translated string. */}
                <span className="text-sm font-medium text-slate-100">{p.protocol}</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {t("nodeCount")}: {p.nodeCount}
                </span>
              </li>
            ))}
          </ul>
        )}
        {view.protocolsTruncated ? (
          <p role="note" className="mt-3 text-xs text-amber-200/90">
            {t("protocolsTruncated")}
          </p>
        ) : null}
      </section>

      {/* ── configured alarm definitions ─────────────────────────────────── */}
      <section aria-labelledby="cr-alarms" className="mb-10">
        <h2 id="cr-alarms" className="mb-1 text-lg font-semibold text-white">
          {t("alarmsHeading")}
        </h2>
        <p className="mb-4 max-w-3xl text-sm text-slate-400">{t("alarmsNote")}</p>
        {!view.engineeringPermitted ? (
          <p
            role="note"
            className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-100"
          >
            {t("engineeringNotPermitted")}
          </p>
        ) : view.alarmDefinitions.length === 0 ? (
          <p className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5 text-sm text-slate-300">
            {t("alarmsEmpty")}
          </p>
        ) : (
          /* Wide content scrolls inside its own container, never the page. */
          <div className="overflow-x-auto rounded-xl border border-slate-700/60">
            <table className="w-full min-w-[36rem] text-start text-sm">
              <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3 text-start">
                    {t("severityLabel")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-start">
                    {t("codeLabel")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-start">
                    {t("safetyClassLabel")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-start">
                    {t("requiresAck")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {view.alarmDefinitions.map((a) => (
                  <tr key={a.id} className="bg-slate-950/30">
                    <td className="px-4 py-3 text-slate-200">
                      {tokenLabel(t, "severity", ALARM_SEVERITIES, a.severity)}
                    </td>
                    <td className="px-4 py-3 text-slate-100">
                      <span className="font-medium">{a.code}</span>
                      {a.message !== null ? (
                        <span className="mt-0.5 block text-xs text-slate-400">{a.message}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {tokenLabel(t, "safetyClass", SAFETY_CLASSES, a.safetyClass)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {/* The glyph is decoration; the word is what a screen reader gets. */}
                      <span aria-hidden="true">{a.requiresAck ? "✔" : "—"}</span>
                      <span className="sr-only">{a.requiresAck ? t("yes") : t("no")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {view.alarmsTruncated ? (
          <p role="note" className="mt-3 text-xs text-amber-200/90">
            {t("alarmsTruncated")}
          </p>
        ) : null}
      </section>

      {/* ── what this platform genuinely cannot show ─────────────────────── */}
      <section aria-labelledby="cr-unavailable">
        <h2 id="cr-unavailable" className="mb-4 text-lg font-semibold text-white">
          {t("unavailableHeading")}
        </h2>
        <ul className="space-y-3">
          {view.unavailable.map((cap) => (
            <li
              key={cap}
              className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5"
              data-capability={cap}
              data-state="DATA_UNAVAILABLE"
            >
              <p className="text-sm text-slate-300">{t(`unavailable.${cap}`)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
