"use client";

// Hermes-native visualization components.
// No chart libraries. No generic widgets. Every visual is specific to the
// Hermes knowledge and intelligence architecture.

import { KNOWLEDGE_DOMAINS } from "@/lib/knowledge/types";

// ── Domain display labels ─────────────────────────────────────────────────────
const DOMAIN_LABEL: Record<string, string> = {
  plc:          "PLC",
  scada:        "SCADA",
  otNetwork:    "OT NET",
  drives:       "DRIVES",
  motors:       "MOTORS",
  electrical:   "ELEC",
  sensors:      "SENSORS",
  cybersecurity:"CYBER",
  maintenance:  "MAINT",
};

function label(d: string): string {
  return DOMAIN_LABEL[d] ?? d.slice(0, 6).toUpperCase();
}

// ── KnowledgeDomainMap ────────────────────────────────────────────────────────
// A grid of domain tiles showing which knowledge domains have coverage.
// Active tiles (with article count) glow with a signal-tinted bottom bar.
// Empty tiles are visible but dimmed — showing the knowledge architecture
// even where coverage is not yet built.
//
// activeDomains: pass article counts per domain when available.
// When empty, all tiles render as "uncovered" — the architecture is visible
// but no counts are shown.

export function KnowledgeDomainMap({
  activeDomains = [],
  className     = "",
}: {
  activeDomains?: { domain: string; count: number }[];
  className?:     string;
}) {
  const maxCount = Math.max(...activeDomains.map((d) => d.count), 1);

  return (
    <div
      className={`grid gap-1.5 ${className}`}
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(68px, 1fr))" }}
      role="list"
      aria-label="Knowledge domain coverage"
    >
      {(KNOWLEDGE_DOMAINS as readonly string[]).map((domain) => {
        const hit      = activeDomains.find((d) => d.domain === domain);
        const isActive = !!hit && hit.count > 0;
        const depth    = isActive ? Math.min(1, hit!.count / maxCount) : 0;

        return (
          <div
            key={domain}
            className={`domain-tile ${isActive ? "domain-tile--active" : ""}`}
            role="listitem"
            title={domain}
          >
            {/* Coverage depth bar — width represents relative article count */}
            {isActive && (
              <div
                className="absolute bottom-0 start-0 h-[2px] bg-signal"
                style={{
                  inlineSize: `${Math.round(30 + depth * 70)}%`,
                  opacity: 0.45 + depth * 0.35,
                }}
                aria-hidden="true"
              />
            )}

            <p
              className="kpi-label leading-none"
              style={{
                fontSize:   "0.52rem",
                letterSpacing: "0.11em",
                color: isActive ? "var(--signal)" : "var(--faint)",
              }}
            >
              {label(domain)}
            </p>

            <p
              className="font-mono leading-none mt-[4px]"
              style={{
                fontSize: "0.70rem",
                color: isActive ? "var(--ink)" : "var(--faint)",
                opacity: isActive ? 1 : 0.4,
              }}
            >
              {isActive ? hit!.count : "—"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── EcosystemCoverageBar ──────────────────────────────────────────────────────
// A single horizontal bar segmented by domain, colored by coverage depth.
// Used as a compact summary when space is tight.

export function EcosystemCoverageBar({
  activeDomains = [],
  className     = "",
}: {
  activeDomains?: { domain: string; count: number }[];
  className?:     string;
}) {
  const total    = activeDomains.reduce((s, d) => s + d.count, 0);
  const covered  = activeDomains.filter((d) => d.count > 0).length;
  const coverage = Math.round((covered / KNOWLEDGE_DOMAINS.length) * 100);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex justify-between items-baseline">
        <span className="kpi-label">Domain Coverage</span>
        <span className="font-mono text-[0.65rem] text-ink">{coverage}%</span>
      </div>
      <div className="flex gap-px h-[6px] rounded-sm overflow-hidden">
        {(KNOWLEDGE_DOMAINS as readonly string[]).map((domain) => {
          const hit  = activeDomains.find((d) => d.domain === domain);
          const pct  = hit && total > 0 ? (hit.count / total) : 0;
          return (
            <div
              key={domain}
              className="flex-1 rounded-sm"
              style={{
                background: hit && hit.count > 0
                  ? `rgba(30,200,164,${0.35 + pct * 1.8})`
                  : "var(--line)",
              }}
              title={`${label(domain)}: ${hit?.count ?? 0}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between">
        <span className="kpi-label text-faint">{covered} / {KNOWLEDGE_DOMAINS.length} domains</span>
        <span className="kpi-label text-faint">{total} records</span>
      </div>
    </div>
  );
}
