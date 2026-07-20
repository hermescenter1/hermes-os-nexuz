import { useTranslations } from "next-intl";
import { AppShell }        from "@/components/app-shell";
import { GlassCard }       from "@/components/ui/GlassCard";
import Link                from "next/link";
import { PLATFORM_FACTS }  from "@/lib/industrial/platform-facts";

const MODULE_META: {
  key:    string;
  href:   string;
  count?: number;
  badge?: string;
  accent: string;
}[] = [
  { key: "articles",        href: "knowledge/articles",   count: PLATFORM_FACTS.knowledgeLibraries,    accent: "var(--ice)" },
  { key: "failures",        href: "knowledge/failures",   badge: "FMEA",                               accent: "var(--warn)" },
  { key: "procedures",      href: "knowledge/procedures", badge: "Versioned",                          accent: "var(--signal)" },
  { key: "engineeringCases",href: "knowledge/cases",      count: PLATFORM_FACTS.engineeringCases,      accent: "var(--steel)" },
];

const ENGINE_PILLARS: [string, string][] = [
  ["Bilingual Search",   "Unicode NFC · Arabic→Persian normalization · diacritics strip · token match"],
  ["Confidence Scale",   "0.0–1.0 Float · ≤0.39 LOW · 0.40–0.74 MEDIUM · ≥0.75 HIGH"],
  ["Root Cause Scoring", "weight constants: health −0.20 · alarms +0.15 · indicator +0.10 · type +0.10"],
  ["Procedure Safety",   "Every PATCH increments version + writes audit diff (changedFields, changedBy)"],
  ["Asset FK Invariant", "DB CHECK + service validation → exactly one FK non-null per knowledge link"],
  ["Auditability",       "All events → AuditLog + meter · engine version ke_v1 in every record"],
];

const PLATFORM_COMPONENTS = [
  { label: "Brain Engine",       state: "online"    },
  { label: "Knowledge Cloud",    state: "online"    },
  { label: "Case Engine",        state: "online"    },
  { label: "Telemetry Binding",  state: "simulated" },
  { label: "PLC Connectivity",   state: "phase2"    },
];

const stateColor: Record<string, string> = {
  online:    "text-signal",
  simulated: "text-warn",
  phase2:    "text-muted",
};
const stateDot: Record<string, string> = {
  online:    "bg-signal",
  simulated: "bg-warn",
  phase2:    "bg-muted/50",
};

// PHASE 87C — reference integration: this page previously rendered BARE (no
// header, no navigation — audit "Cluster B"). Wrapping it in the shared
// AppShell restores global navigation; the page body below is unchanged.
export default function KnowledgePage() {
  const t = useTranslations("ke");

  return (
    <AppShell>
    <div className="max-w-7xl mx-auto px-6 sm:px-8 pb-20 pt-8">

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="page-header-premium">
        <p className="eyebrow-label mb-2">{t("eyebrow")}</p>
        <h1 className="type-page-title">{t("overview.title")}</h1>
        <p className="mt-2 type-secondary max-w-2xl">{t("overview.subtitle")}</p>
      </div>

      {/* ── KPI Strip ────────────────────────────────────────────────────── */}
      <div className="flex items-stretch divide-x divide-line border border-line rounded-xl overflow-x-auto mb-6" style={{ background: "var(--surface)" }}>
        <div className="flex-1 min-w-[120px] px-5 py-4">
          <p className="type-eyebrow mb-1.5">Knowledge Articles</p>
          <p className="metric text-2xl text-ink">{PLATFORM_FACTS.knowledgeLibraries}</p>
          <p className="mt-1 type-caption">bilingual, versioned</p>
        </div>
        <div className="flex-1 min-w-[120px] px-5 py-4">
          <p className="type-eyebrow mb-1.5">Engineering Cases</p>
          <p className="metric text-2xl text-ink">{PLATFORM_FACTS.engineeringCases}</p>
          <p className="mt-1 type-caption">documented incidents</p>
        </div>
        <div className="flex-1 min-w-[120px] px-5 py-4">
          <p className="type-eyebrow mb-1.5">Supported Vendors</p>
          <p className="metric text-2xl text-ink">{PLATFORM_FACTS.supportedVendors}</p>
          <p className="mt-1 type-caption">industrial OEMs</p>
        </div>
        <div className="flex-1 min-w-[120px] px-5 py-4">
          <p className="type-eyebrow mb-1.5">Engine Version</p>
          <p className="metric text-2xl text-ink">ke_v1</p>
          <p className="mt-1 type-caption">deterministic, no LLM</p>
        </div>
        <div className="flex-1 min-w-[120px] px-5 py-4">
          <p className="type-eyebrow mb-1.5">Coverage</p>
          <p className="metric text-2xl text-signal">Bilingual</p>
          <p className="mt-1 type-caption">EN + FA Unicode</p>
        </div>
      </div>

      {/* ── Safety Notice ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl border border-warn/20 bg-warn/[0.04] px-4 py-3 mb-6">
        <span className="h-1.5 w-1.5 rounded-full bg-warn flex-shrink-0 mt-1.5" />
        <p className="font-body text-xs text-warn leading-relaxed">{t("safetyBanner")}</p>
      </div>

      {/* ── Primary + Secondary layout ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 mb-5">

        {/* PRIMARY (2/3): Module Navigator */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Module grid */}
          <section className="rounded-xl border border-line bg-surface p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
            <h2 className="type-panel-title mb-4">Knowledge Modules</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {MODULE_META.map((m) => (
                <Link key={m.key} href={m.href}>
                  <div className="group relative rounded-xl border border-line/70 bg-surface2/60 p-5 hover:border-line2 transition-all duration-150 cursor-pointer h-full"
                    style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>
                    {/* Accent marker */}
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className="inline-block h-4 w-[3px] rounded-full"
                        style={{ background: m.accent, opacity: 0.7 }}
                      />
                      {m.count !== undefined ? (
                        <span className="font-mono text-xs text-faint">{m.count}</span>
                      ) : m.badge ? (
                        <span className="rounded border border-line px-1.5 py-0.5 font-body text-[0.65rem] text-faint">{m.badge}</span>
                      ) : null}
                    </div>
                    <p className="font-display font-semibold text-ink group-hover:text-signal transition-colors duration-150 mb-1.5 text-base">
                      {t(`${m.key}.title`)}
                    </p>
                    <p className="type-secondary text-xs leading-relaxed">{t(`${m.key}.subtitle`)}</p>
                    <div className="mt-3 flex items-center gap-1">
                      <span className="text-xs text-faint group-hover:text-muted transition-colors">Open</span>
                      <span className="text-xs text-faint group-hover:text-signal transition-colors duration-150 ms-0.5">→</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Engine Architecture — compact */}
          <section className="rounded-xl border border-line bg-surface p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
            <h2 className="type-panel-title mb-4">Engine Architecture</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ENGINE_PILLARS.map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line/60 bg-surface2/50 px-4 py-3">
                  <p className="font-body text-xs font-semibold text-ink mb-1">{k}</p>
                  <p className="type-caption leading-relaxed">{v}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* SECONDARY (1/3): System Health + Coverage */}
        <div className="flex flex-col gap-5">

          {/* Platform Status */}
          <section className="rounded-xl border border-line bg-surface p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
            <h2 className="type-panel-title mb-4">System Health</h2>
            <ul className="space-y-3 mb-5">
              {PLATFORM_COMPONENTS.map((c) => (
                <li key={c.label} className="flex items-center justify-between gap-2">
                  <span className="font-body text-sm text-ink">{c.label}</span>
                  <span className={`flex items-center gap-1.5 font-body text-xs ${stateColor[c.state]}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${stateDot[c.state]}`} />
                    {c.state.charAt(0).toUpperCase() + c.state.slice(1)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line pt-4">
              <p className="type-eyebrow mb-3">Safety Compliance</p>
              <ul className="space-y-2">
                {[
                  "Read-only — no PLC writes",
                  "Deterministic — no LLM",
                  "Audit trail on all mutations",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-signal flex-shrink-0 mt-1.5" />
                    <span className="type-caption leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Knowledge Coverage */}
          <section className="rounded-xl border border-line bg-surface p-5" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}>
            <h2 className="type-panel-title mb-4">Knowledge Coverage</h2>
            <div className="space-y-3">
              {[
                { label: "Engineering Standards",  pct: 100 },
                { label: "Vendor Documentation",   pct: 100 },
                { label: "Failure Analysis",        pct: 100 },
                { label: "Maintenance History",     pct: 100 },
                { label: "Internal Cases",          pct: 100 },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between font-body text-xs mb-1">
                    <span className="text-muted">{row.label}</span>
                    <span className="font-mono text-ink">{row.pct}%</span>
                  </div>
                  <div className="h-1 rounded bg-line">
                    <div className="h-1 rounded bg-signal" style={{ inlineSize: `${row.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 type-caption">Static corpus · database mode extends this dynamically</p>
          </section>

        </div>
      </div>
    </div>
    </AppShell>
  );
}
