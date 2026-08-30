"use client";

// PHASE 104 R1 (V-M5) - this was a Server Component reading the STATIC
// PLATFORM_FACTS while the Executive Overview two screens below read the LIVE
// published counts, so one dashboard printed "Knowledge Records 30" and
// "Knowledge Libraries 0" for the same quantity. It now reads the shared
// `usePlatformFacts` hook, which is what makes the three surfaces agree;
// that hook is client-side (it fetches), hence the boundary moves here.
// PLATFORM_COMPONENTS is still a synchronous static import.

import { useLocale, useTranslations } from "next-intl";
import { PLATFORM_COMPONENTS } from "@/lib/industrial/platform-facts";
import { usePlatformFacts } from "@/lib/industrial/use-platform-facts";
import { HermesSignal, type HermesSignalType }  from "@/components/hermes/HermesSignal";

// ── Single stat cell ──────────────────────────────────────────────────────────
function RibbonStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-[3px] px-4 py-[9px] border-e border-white/[0.06] flex-shrink-0 last:border-e-0">
      <span
        className="kpi-label"
        style={{ fontSize: "0.54rem", letterSpacing: "0.13em" }}
      >
        {label}
      </span>
      <span className="font-mono text-[0.8125rem] font-semibold text-ink leading-none tracking-tight">
        {value}
      </span>
    </div>
  );
}

// ── Vertical rule ─────────────────────────────────────────────────────────────
function VRule() {
  return (
    <div
      className="self-stretch w-px flex-shrink-0"
      style={{ background: "rgba(255,255,255,0.06)" }}
      aria-hidden="true"
    />
  );
}

// ── CommandRibbon ─────────────────────────────────────────────────────────────
export function CommandRibbon() {
  // PHASE 104 R1 (V-M6) — every label here used to be an English literal, so
  // the Persian and German dashboards printed an ASCII status strip above an
  // otherwise fully localised page. Labels now come from the catalogue; the
  // stat labels reuse the keys the KPI band already uses rather than adding a
  // second wording for the same quantity.
  const t    = useTranslations("dashboard.commandRibbon");
  const tKpi = useTranslations("dashboard.exec.kpi");
  const tOps = useTranslations("dashboard.command.globalOps");

  /* PHASE 104 R1 (FA-NUMERAL-MIXING) - the ribbon printed ASCII digits
     ("5 / 4", "80%") directly above a KPI band rendering Persian digits, so
     one screen used two numeral systems. Every number here now goes through
     the locale formatter, like the rest of the dashboard. */
  const locale         = useLocale();
  const nf             = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pctSign        = locale === "fa" ? "٪" : "%";
  const facts          = usePlatformFacts();
  const onlineCount    = PLATFORM_COMPONENTS.filter((c) => c.state === "online").length;
  const simulatedCount = PLATFORM_COMPONENTS.filter((c) => c.state === "simulated").length;
  const activeCount    = onlineCount + simulatedCount;
  const totalCount     = PLATFORM_COMPONENTS.length;
  const healthPct      = Math.round((activeCount / totalCount) * 100);

  const brainState     = PLATFORM_COMPONENTS.find((c) => c.key === "brainEngine")?.state;
  const knowledgeState = PLATFORM_COMPONENTS.find((c) => c.key === "knowledgeCloud")?.state;
  const telemetryState = PLATFORM_COMPONENTS.find((c) => c.key === "telemetry")?.state;

  const reasoningOn = brainState === "online";
  const knowledgeOn = knowledgeState === "online";
  const telemetrySimulated = telemetryState === "simulated";
  const telemetryOn = telemetryState === "online" || telemetrySimulated;

  const reasoningSignal: HermesSignalType = reasoningOn ? "reasoning-active" : "system-offline";
  const knowledgeSignal: HermesSignalType = knowledgeOn ? "knowledge-active" : "system-offline";
  const telemetrySignal: HermesSignalType = telemetryOn ? "telemetry-active" : "system-offline";
  /* PHASE 109-B0 — the telemetry subsystem ships SIMULATED, and this chip used
     to read "Telemetry Active" regardless, which is a live-connectivity claim
     over synthetic values. The label now follows the actual component state. */
  const telemetryLabel = telemetrySimulated
    ? t("signals.telemetrySimulated")
    : telemetryOn
      ? t("signals.telemetryActive")
      : t("signals.systemOffline");

  return (
    <div className="hermes-command-ribbon" role="banner" aria-label={t("ariaLabel")}>
      {/* PHASE 104 R1 (V-M3) — the ribbon used to be `overflow-x-auto`, so at
          every real viewport its trailing chips were cut at the inline edge
          with nothing but a native scrollbar to say so — and the inline edge is
          the LEFT one under RTL, which made it look like broken mirroring.
          It now WRAPS instead of scrolling: no clipping at any width, in either
          direction, with no scrollbar and no JavaScript. The separator rules
          only make sense on a single line, so they are hidden once wrapping can
          occur. `gap-y` keeps the rows legible when it does. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-stretch gap-y-1 px-6 sm:px-8">

        {/* Platform identity */}
        <div className="flex items-center gap-2 pe-5 me-1 flex-shrink-0 py-[9px]">
          <span
            className="signal-text"
            style={{ fontSize: "0.6rem", letterSpacing: "0.16em" }}
          >
            {t("network")}
          </span>
          <span
            className="kpi-label"
            style={{ fontSize: "0.48rem", letterSpacing: "0.14em", color: "var(--faint)" }}
          >
            {t("scope")}
          </span>
        </div>

        <div className="hidden 2xl:flex"><VRule /></div>

        {/* Platform intelligence stats */}
        <div className="flex items-stretch flex-wrap">
          <RibbonStat
            label={tOps("knowledgeVolume")}
            value={nf.format(facts.knowledgeLibraries)}
          />
          <RibbonStat
            label={tKpi("engineeringCases")}
            value={nf.format(facts.engineeringCases)}
          />
          <RibbonStat
            label={tKpi("supportedVendors")}
            value={nf.format(facts.supportedVendors)}
          />
          <RibbonStat
            label={t("activeSubsystems")}
            value={`${nf.format(activeCount)} / ${nf.format(totalCount)}`}
          />
          <RibbonStat
            label={tKpi("systemHealth")}
            value={`${nf.format(healthPct)}${pctSign}`}
          />
        </div>

        <div className="hidden 2xl:flex"><VRule /></div>

        {/* HermesSignal status row — trailing edge */}
        <div className="flex flex-wrap items-center gap-2 ps-4 pe-1 py-[9px] 2xl:ms-auto">
          <HermesSignal
            type={reasoningSignal}
            label={reasoningOn ? t("signals.reasoningActive") : t("signals.systemOffline")}
          />
          <HermesSignal
            type={knowledgeSignal}
            label={knowledgeOn ? t("signals.knowledgeActive") : t("signals.systemOffline")}
          />
          <HermesSignal
            type={telemetrySignal}
            label={telemetryLabel}
          />
        </div>

      </div>
    </div>
  );
}
