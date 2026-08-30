"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { IntelligenceStats, AlertSeverity } from "@/lib/operations/types";

type TabKey = "graph" | "vendors" | "alarms" | "platform";

/*
 * PHASE 104-I.D — the labels are looked up, not literals.
 *
 * These four were hard-coded English and rendered as English in EN, DE and FA
 * alike, while the Operations rail directly above them was correctly localized.
 * The KEYS are the contract: each addresses both its catalog entry and its
 * `data-phase104-intelligence-tab` attribute, so a translation can never
 * silently move a tab or rename what the visual harness measures.
 */
const TAB_KEYS: TabKey[] = ["graph", "vendors", "alarms", "platform"];

const SEV_COLOR: Record<AlertSeverity, string> = {
  critical: "text-danger",
  warning:  "text-warn",
  info:     "text-muted",
};

const SEV_BAR: Record<AlertSeverity, string> = {
  critical: "bg-danger",
  warning:  "bg-warn",
  info:     "bg-muted",
};

const COMPONENT_LABEL: Record<string, string> = {
  brainEngine:     "Hermes Reasoning Engine",
  knowledgeCloud:  "Hermes Knowledge Cloud",
  caseEngine:      "Hermes Memory Engine",
  telemetry:       "Telemetry Network",
  plcConnectivity: "Industrial Graph",
};

const STATE_BADGE: Record<string, string> = {
  online:    "hs-badge hs--reasoning",
  simulated: "hs-badge hs--warning",
  phase2:    "hs-badge hs--nominal",
};

export function IntelligenceWallClient() {
  const [data,    setData]    = useState<IntelligenceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tab,     setTab]     = useState<TabKey>("graph");
  // The same catalog the Operations rail reads from
  // (`dashboard.operations.nav`), so there is one localization system, not two.
  const t = useTranslations("dashboard.operations.intelligenceTabs");
  const stripRef  = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  /*
   * Keep the SELECTED tab fully inside the strip.
   *
   * A click does not scroll a horizontal scroller on its own, so selecting a
   * tab that sits past the visible edge left it selected but only partly
   * readable. This is the same treatment the Operations rail already applies to
   * its active route, and it is deliberately geometry-based: it compares
   * bounding rectangles rather than reading `scrollLeft`, whose sign convention
   * differs between engines under RTL. `scrollBy` moves the STRIP, never the
   * document — `scrollIntoView` would scroll the page and fight the layout.
   */
  useEffect(() => {
    const strip = stripRef.current;
    const active = activeRef.current;
    if (!strip || !active) return;

    const stripBox = strip.getBoundingClientRect();
    const tabBox = active.getBoundingClientRect();
    const overflowsEnd = tabBox.right > stripBox.right;
    const overflowsStart = tabBox.left < stripBox.left;
    if (!overflowsEnd && !overflowsStart) return;

    // Overshoot: the strip clamps to its own scroll range, so a generous margin
    // can only help the tab clear the edge completely rather than almost.
    const delta = overflowsEnd
      ? tabBox.right - stripBox.right + 24
      : tabBox.left - stripBox.left - 24;
    strip.scrollBy({ left: delta, behavior: "auto" });
  }, [tab]);

  useEffect(() => {
    fetch("/api/operations/intelligence")
      .then(r => r.json())
      .then((d: IntelligenceStats) => { setData(d); setLoading(false); })
      .catch(() => { setError("Failed to load intelligence data"); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="global-ops-strip animate-pulse">
          {[1,2,3,4,5,6,7].map(i => <div key={i} className="global-ops-cell h-16" />)}
        </div>
        <div className="rounded-xl border border-line bg-surface h-80 animate-pulse" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-danger/30 bg-surface px-5 py-4">
        <p className="font-mono text-sm text-danger">{error ?? "Intelligence data unavailable"}</p>
      </div>
    );
  }

  const maxVendorCases = Math.max(...data.vendorBreakdown.map(v => v.cases), 1);

  return (
    <div className="flex flex-col gap-5">

      {/* Intelligence KPI strip */}
      <div className="global-ops-strip">
        {[
          { label: "Graph Nodes",    value: data.graphNodes,                    color: "text-ink"    },
          { label: "Graph Edges",    value: data.graphEdges,                    color: "text-ink"    },
          { label: "Vendors",        value: data.vendors,                       color: "text-signal" },
          { label: "Protocols",      value: data.protocols,                     color: "text-ice"    },
          { label: "Assets",         value: data.assets,                        color: "text-ink"    },
          { label: "Cases",          value: data.cases,                         color: "text-warn"   },
          { label: "Graph Density",  value: data.graphDensity.toFixed(4),       color: "text-metadata"  },
        ].map(kpi => (
          <div key={kpi.label} className="global-ops-cell">
            <p className="kpi-label mb-1.5">{kpi.label}</p>
            <p className={`exec-kpi-value ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/*
        Tab navigation.

        PHASE 104-I.D — mobile page-level horizontal overflow.

        These four buttons are `flex-shrink-0` inside a container that had no
        scroll of its own, so the strip laid out at its intrinsic width — 552px
        in EN and DE, 471px in FA — inside a 288px content column, and widened
        the DOCUMENT. Measured before the fix: +248px at 320, +208 at 360, +178
        at 390 (EN and DE); +167 / +127 / +97 (FA). Those baselines were taken
        while all four labels were hard-coded English in every locale, which is
        why FA differed at all: identical Latin strings simply set narrower in
        the Persian font stack. The labels are localized now, so the intrinsic
        widths differ per locale on their own merits and the strip must keep
        working for whichever is widest.

        Root cause was isolated by removal, not inferred: hiding this strip in
        the live page dropped document overflow to 0 in all three locales, while
        hiding the cookie-consent banner — which also measured 568px wide and
        sorted top of the offender list — changed nothing. A `position: fixed`
        element simply sizes itself to the visual viewport once the page is
        already too wide, so it is a passenger, not the cause.

        The strip now owns its horizontal scroll, exactly as the operations rail
        above it does. Labels are neither truncated nor shrunk: a half-read
        destination is worse than one the reader scrolls to. `pe-2` is
        the same trailing pad the rail carries, so the last tab clears the edge
        completely rather than almost.
      */}
      <div className="relative">
        <div
          ref={stripRef}
          data-phase104-intelligence-tabs="true"
          className="flex items-center gap-0 overflow-x-auto overscroll-x-contain border-b border-line pe-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TAB_KEYS.map(key => (
            <button
              key={key}
              ref={key === tab ? activeRef : undefined}
              onClick={() => setTab(key)}
              data-phase104-intelligence-tab={key}
              data-phase104-intelligence-tab-active={tab === key ? "true" : "false"}
              className={`px-4 py-2.5 border-b-2 transition-colors flex-shrink-0 whitespace-nowrap min-h-11 sm:min-h-0 ${
                tab === key
                  ? "border-signal text-signal"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <span className="kpi-label">{t(key)}</span>
            </button>
          ))}
        </div>
        {/* Decorative: signals that the strip continues, and cannot take a tap. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 end-0 w-8 bg-gradient-to-l from-bg to-transparent rtl:bg-gradient-to-r"
        />
      </div>

      {/* Tab: Knowledge Graph */}
      {tab === "graph" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Node distribution */}
          <div className="rounded-xl border border-line bg-surface px-5 py-5">
            <div className="h-layer-sep mb-4">
              <span className="kpi-label">Node Distribution</span>
            </div>
            <div className="space-y-2">
              {Object.entries(data.nodesByType)
                .sort(([,a],[,b]) => (b as number) - (a as number))
                .map(([type, count]) => {
                  const c = count as number;
                  const maxCount = Math.max(...Object.values(data.nodesByType).map(v => v as number), 1);
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <span className="kpi-label text-metadata w-28 flex-shrink-0">
                        {type.replace(/_/g, " ")}
                      </span>
                      <div className="flex-1 h-1.5 rounded bg-line overflow-hidden">
                        <div
                          className="h-1.5 rounded bg-signal/50"
                          style={{ width: `${(c / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-ink w-5 text-right flex-shrink-0">{c}</span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Edge distribution */}
          <div className="rounded-xl border border-line bg-surface px-5 py-5">
            <div className="h-layer-sep mb-4">
              <span className="kpi-label">Relationship Types</span>
            </div>
            <div className="space-y-2">
              {Object.entries(data.edgesByType)
                .sort(([,a],[,b]) => (b as number) - (a as number))
                .map(([type, count]) => {
                  const c = count as number;
                  const maxCount = Math.max(...Object.values(data.edgesByType).map(v => v as number), 1);
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <span className="kpi-label text-metadata w-32 flex-shrink-0 truncate">
                        {type.replace(/_/g, " ")}
                      </span>
                      <div className="flex-1 h-1.5 rounded bg-line overflow-hidden">
                        <div
                          className="h-1.5 rounded bg-ice/50"
                          style={{ width: `${(c / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-ink w-5 text-right flex-shrink-0">{c}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Vendor Intelligence */}
      {tab === "vendors" && (
        <div className="space-y-3">
          {data.vendorBreakdown.map(v => (
            <div
              key={v.vendor}
              className="rounded-xl border border-line bg-surface px-5 py-4"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="font-body text-sm font-semibold text-ink">{v.name}</p>
                  <p className="kpi-label text-metadata mt-0.5">{v.vendor.toUpperCase()} · TECHNOLOGY DOMAIN</p>
                </div>
                <div className="grid grid-cols-4 gap-4 text-right">
                  {[
                    { label: "Cases",     value: v.cases,     color: "text-warn"   },
                    { label: "Assets",    value: v.assets,    color: "text-ink"    },
                    { label: "Protocols", value: v.protocols, color: "text-ice"    },
                    { label: "Alarms",    value: v.alarms,    color: "text-danger" },
                  ].map(kpi => (
                    <div key={kpi.label}>
                      <p className={`intel-kpi-value ${kpi.color}`}>{kpi.value}</p>
                      <p className="kpi-label">{kpi.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Case volume bar */}
              <div>
                <div className="h-1.5 rounded bg-line overflow-hidden">
                  <div
                    className="h-1.5 rounded bg-signal/40"
                    style={{ width: `${(v.cases / maxVendorCases) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Alarm Analysis */}
      {tab === "alarms" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface px-5 py-5">
            <div className="h-layer-sep mb-4">
              <span className="kpi-label">Alarm Categories by Severity</span>
            </div>
            <div className="space-y-2">
              {data.alarmsByCategory.map(cat => {
                const sev = cat.severity as AlertSeverity;
                return (
                  <div key={cat.category} className="flex items-center gap-3">
                    <span className={`kpi-label w-28 flex-shrink-0 ${SEV_COLOR[sev]}`}>
                      {cat.category}
                    </span>
                    <div className="flex-1 h-1.5 rounded bg-line overflow-hidden">
                      <div
                        className={`h-1.5 rounded ${SEV_BAR[sev]} opacity-60`}
                        style={{ width: `${(cat.count / Math.max(...data.alarmsByCategory.map(c => c.count), 1)) * 100}%` }}
                      />
                    </div>
                    <span className={`font-mono text-xs w-4 text-right flex-shrink-0 ${SEV_COLOR[sev]}`}>
                      {cat.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface px-5 py-5">
            <div className="h-layer-sep mb-4">
              <span className="kpi-label">Knowledge Coverage</span>
            </div>
            <div className="space-y-4">
              {[
                { label: "Engineering Cases",     value: data.platformFacts.engineeringCases,   note: "Documented failure modes" },
                { label: "Knowledge Libraries",   value: data.platformFacts.knowledgeLibraries, note: "Bilingual articles" },
                { label: "Supported Vendors",     value: data.platformFacts.supportedVendors,   note: "Industrial OEMs" },
                { label: "Resolution Coverage",   value: `${data.cases}/14`,                    note: "100% documented" },
              ].map(row => (
                <div key={row.label} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-body text-xs text-ink">{row.label}</p>
                    <p className="kpi-label text-metadata">{row.note}</p>
                  </div>
                  <p className="intel-kpi-value text-signal">{row.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Platform Status */}
      {tab === "platform" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.componentStates.map(comp => (
            <div
              key={comp.key}
              className="rounded-xl border border-line bg-surface px-4 py-4"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="font-body text-sm font-semibold text-ink">
                  {COMPONENT_LABEL[comp.key] ?? comp.key}
                </p>
                <span className={STATE_BADGE[comp.state] ?? "hs-badge hs--nominal"}>
                  {comp.state.toUpperCase()}
                </span>
              </div>
              <p className="kpi-label text-metadata">
                {comp.state === "online"    ? "Operational · Full capability"
                : comp.state === "simulated"? "Simulated mode · Demo data"
                : "Planned · Phase 2 roadmap"}
              </p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
