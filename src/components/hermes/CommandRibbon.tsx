// Server component — no "use client" needed.
// All data is static (PLATFORM_FACTS / PLATFORM_COMPONENTS imported synchronously).
// HermesSignal is a client component; Next.js App Router handles the boundary.

import { PLATFORM_FACTS, PLATFORM_COMPONENTS } from "@/lib/industrial/platform-facts";
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
  const onlineCount    = PLATFORM_COMPONENTS.filter((c) => c.state === "online").length;
  const simulatedCount = PLATFORM_COMPONENTS.filter((c) => c.state === "simulated").length;
  const activeCount    = onlineCount + simulatedCount;
  const totalCount     = PLATFORM_COMPONENTS.length;
  const healthPct      = Math.round((activeCount / totalCount) * 100);

  const brainState     = PLATFORM_COMPONENTS.find((c) => c.key === "brainEngine")?.state;
  const knowledgeState = PLATFORM_COMPONENTS.find((c) => c.key === "knowledgeCloud")?.state;
  const telemetryState = PLATFORM_COMPONENTS.find((c) => c.key === "telemetry")?.state;

  const reasoningSignal: HermesSignalType =
    brainState === "online" ? "reasoning-active" : "system-offline";

  const knowledgeSignal: HermesSignalType =
    knowledgeState === "online" ? "knowledge-active" : "system-offline";

  const telemetrySignal: HermesSignalType =
    telemetryState === "online" || telemetryState === "simulated"
      ? "telemetry-active"
      : "system-offline";

  return (
    <div className="hermes-command-ribbon" role="banner" aria-label="Platform operational status">
      <div className="mx-auto max-w-7xl px-6 sm:px-8 flex items-stretch overflow-x-auto">

        {/* Platform identity */}
        <div className="flex items-center gap-3 pe-5 me-1 flex-shrink-0 py-[9px]">
          <span
            className="signal-text"
            style={{ fontSize: "0.6rem", letterSpacing: "0.16em" }}
          >
            HERMES OS
          </span>
          <span
            className="kpi-label"
            style={{ fontSize: "0.52rem", letterSpacing: "0.16em", color: "var(--faint)" }}
          >
            COMMAND
          </span>
        </div>

        <VRule />

        {/* Platform intelligence stats */}
        <div className="flex items-stretch flex-shrink-0">
          <RibbonStat
            label="Knowledge Records"
            value={PLATFORM_FACTS.knowledgeLibraries}
          />
          <RibbonStat
            label="Engineering Cases"
            value={PLATFORM_FACTS.engineeringCases}
          />
          <RibbonStat
            label="Supported Vendors"
            value={PLATFORM_FACTS.supportedVendors}
          />
          <RibbonStat
            label="Active Subsystems"
            value={`${activeCount} / ${totalCount}`}
          />
          <RibbonStat
            label="System Health"
            value={`${healthPct}%`}
          />
        </div>

        <VRule />

        {/* HermesSignal status row — right side */}
        <div className="ms-auto flex items-center gap-2 ps-4 pe-1 flex-shrink-0">
          <HermesSignal type={reasoningSignal} />
          <HermesSignal type={knowledgeSignal} />
          <HermesSignal type={telemetrySignal} />
        </div>

      </div>
    </div>
  );
}
