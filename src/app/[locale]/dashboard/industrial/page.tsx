import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { PLATFORM_COMPONENTS } from "@/lib/industrial/platform-facts";

const SECTION_ICONS: Record<string, string> = {
  sites:      "◈",
  gateways:   "⬡",
  assets:     "◉",
  telemetry:  "∿",
  connectors: "⊕",
};

/* Static operational context for each module — no API call required */
const SECTION_META: Record<string, {
  statusLabel: string;
  statusColor: string;
  stateDot:    string;
  detail:      string;
  badge?:      string;
}> = {
  sites:      { statusLabel: "Configurable",  statusColor: "text-muted",   stateDot: "bg-muted/50",  detail: "Define physical plant locations and network zones" },
  gateways:   { statusLabel: "Edge ready",    statusColor: "text-ice",     stateDot: "bg-ice/70",    detail: "OPC-UA / Modbus bridging to cloud data pipeline" },
  assets:     { statusLabel: "Operational",   statusColor: "text-signal",  stateDot: "bg-signal",    detail: "PLCs, drives, sensors — full lifecycle tracking" },
  telemetry:  { statusLabel: "Simulated",     statusColor: "text-warn",    stateDot: "bg-warn",      detail: "Time-series streams · configurable in DB mode", badge: "Simulated" },
  connectors: { statusLabel: "Phase 2",       statusColor: "text-muted",   stateDot: "bg-muted/40",  detail: "Protocol adapters — PROFINET, EtherNet/IP, BACnet", badge: "Phase 2" },
};

/* Primary modules shown large (2-col) */
const PRIMARY_SECTIONS = ["sites", "assets"];
/* Supporting modules shown compact (3-col) */
const SUPPORT_SECTIONS = ["gateways", "telemetry", "connectors"];

export default async function IndustrialOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t    = await getTranslations("industrial");
  const tFn  = t as unknown as (k: string) => string;

  return (
    <PageShell ambient={2}>
      <div className="mx-auto max-w-7xl px-6 sm:px-8 pb-20">

        <PageHeader
          eyebrow={tFn("eyebrow")}
          title={tFn("title")}
          subtitle={tFn("subtitle")}
          level="page"
        />

        {/* ── Operational KPI Strip ────────────────────────────────────────── */}
        <div className="flex items-stretch divide-x divide-line border border-line rounded-xl overflow-x-auto mb-6" style={{ background: "var(--surface)" }}>
          {[
            { label: "Sites",           value: "—",        note: "configure first" },
            { label: "Gateways",        value: "—",        note: "edge-ready" },
            { label: "Asset Registry",  value: "Active",   note: "full asset tracking", color: "text-signal" },
            { label: "Telemetry Mode",  value: "Simulated",note: "DB mode extends this", color: "text-warn" },
            { label: "Platform Health", value: "Online",   note: "brain + knowledge", color: "text-signal" },
          ].map((kpi, i) => (
            <div key={i} className="flex-1 min-w-[110px] px-5 py-4">
              <p className="type-eyebrow mb-1.5">{kpi.label}</p>
              <p className={`metric text-xl leading-tight ${kpi.color ?? "text-ink"}`}>{kpi.value}</p>
              <p className="mt-1 type-caption">{kpi.note}</p>
            </div>
          ))}
        </div>

        {/* ── Safety Banner ─────────────────────────────────────────────────── */}
        <div className="flex items-start gap-3 rounded-xl border border-warn/20 bg-warn/[0.04] px-4 py-3 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-warn flex-shrink-0 mt-1.5" />
          <p className="font-body text-xs text-warn leading-relaxed">{tFn("safetyBanner")}</p>
        </div>

        {/* ── Primary + Secondary layout ──────────────────────────────────────*/}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 mb-5">

          {/* PRIMARY (2/3): Core modules */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Primary modules — large cards */}
            <div className="grid sm:grid-cols-2 gap-4">
              {PRIMARY_SECTIONS.map((key) => {
                const meta = SECTION_META[key];
                return (
                  <a
                    key={key}
                    href={`industrial/${key}`}
                    className="group block rounded-xl border border-line bg-surface p-6 hover:border-line2 transition-all duration-150"
                    style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
                        style={{ background: "rgba(var(--signal-rgb), 0.07)", border: "1px solid rgba(var(--signal-rgb), 0.13)" }}
                      >
                        <span className="text-xl text-signal select-none">{SECTION_ICONS[key]}</span>
                      </div>
                      <span className={`flex items-center gap-1.5 font-body text-xs ${meta.statusColor}`}>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.stateDot}`} />
                        {meta.statusLabel}
                      </span>
                    </div>

                    <h3 className="font-display text-base font-bold text-ink group-hover:text-signal transition-colors duration-150 mb-1.5">
                      {tFn(`${key}.title`)}
                    </h3>
                    <p className="type-secondary text-xs leading-relaxed mb-4">{meta.detail}</p>
                    <p className="type-caption">{tFn(`${key}.description`)}</p>
                    <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
                      <span className="type-caption">Configure →</span>
                      <span
                        className="inline-block h-3 w-[2px] rounded-full"
                        style={{ background: "var(--signal)", opacity: 0.5 }}
                      />
                    </div>
                  </a>
                );
              })}
            </div>

            {/* Supporting modules — compact 3-col */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {SUPPORT_SECTIONS.map((key) => {
                const meta = SECTION_META[key];
                return (
                  <a
                    key={key}
                    href={`industrial/${key}`}
                    className="group block rounded-xl border border-line bg-surface p-4 hover:border-line2 transition-all duration-150"
                    style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-base text-muted select-none">{SECTION_ICONS[key]}</span>
                      {meta.badge && (
                        <span className="rounded border border-line px-1.5 py-0.5 font-body text-[0.60rem] text-faint">{meta.badge}</span>
                      )}
                    </div>
                    <h3 className="font-display text-sm font-semibold text-ink group-hover:text-signal transition-colors duration-150 mb-1">
                      {tFn(`${key}.title`)}
                    </h3>
                    <p className="type-caption leading-relaxed">{meta.detail}</p>
                  </a>
                );
              })}
            </div>
          </div>

          {/* SECONDARY (1/3): Platform status + operational context */}
          <div className="flex flex-col gap-5">

            {/* Platform health */}
            <section className="rounded-xl border border-line bg-surface p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
              <h2 className="type-panel-title mb-4">Platform Health</h2>
              <ul className="space-y-3">
                {PLATFORM_COMPONENTS.map((c) => {
                  const tone  = c.state === "online" ? "text-signal" : c.state === "simulated" ? "text-warn" : "text-muted";
                  const dot   = c.state === "online" ? "bg-signal" : c.state === "simulated" ? "bg-warn" : "bg-muted/50";
                  const label = c.state.charAt(0).toUpperCase() + c.state.slice(1);
                  return (
                    <li key={c.key} className="flex items-center justify-between gap-2">
                      <span className="font-body text-sm text-ink">{c.key.replace(/([A-Z])/g, " $1").trim()}</span>
                      <span className={`flex items-center gap-1.5 font-body text-xs ${tone}`}>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Operational notes */}
            <section className="rounded-xl border border-line bg-surface p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
              <h2 className="type-panel-title mb-4">Operational Context</h2>
              <ul className="space-y-4">
                {[
                  { label: "Data Mode",        value: "Session / Simulated", icon: "○" },
                  { label: "AI Coupling",       value: "Brain Engine",        icon: "◎" },
                  { label: "Protocol Support",  value: "OPC-UA · Modbus",     icon: "⬡" },
                  { label: "Safety Mode",       value: "Read-only",           icon: "◈" },
                  { label: "Compliance",        value: "SOC 2 aligned",       icon: "⊕" },
                ].map((row) => (
                  <li key={row.label} className="flex items-start gap-3">
                    <span className="text-muted text-sm flex-shrink-0 mt-0.5">{row.icon}</span>
                    <div>
                      <p className="type-eyebrow mb-0.5">{row.label}</p>
                      <p className="font-body text-xs text-ink">{row.value}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

          </div>
        </div>

      </div>
    </PageShell>
  );
}
