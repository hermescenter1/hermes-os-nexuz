"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { brainService }              from "@/lib/services/brain-service";
import type { BrainAnalysis, BrainMemoryStats } from "@/lib/services/types";
import { buildEngineeringReport }    from "@/lib/industrial/engineering-report";
import { ResultSection, Chip }       from "@/components/copilot/ResultSection";
import { ConfidenceRing }            from "@/components/copilot/ConfidenceRing";
import { RootCausePanel }            from "@/components/copilot/RootCausePanel";
import { AssetContextPanel }         from "@/components/copilot/AssetContextPanel";
import { KNOWLEDGE_DOMAINS }         from "@/lib/knowledge/types";
import { VENDORS }                   from "@/lib/industrial/vendors";
import { PLATFORM_COMPONENTS }       from "@/lib/industrial/platform-facts";

interface BrainRow {
  id:         string;
  ts:         number;
  question:   string;
  locale:     string;
  domains:    { id: string; score: number }[];
  confidence: number;
  unknown?:   boolean;
}
interface BrainResponse {
  recent: BrainRow[];
  stats:  BrainMemoryStats;
}

const stateColor: Record<string, string> = {
  online: "text-signal", simulated: "text-warn", phase2: "text-muted",
};
const stateDot: Record<string, string> = {
  online: "bg-signal", simulated: "bg-warn", phase2: "bg-muted/50",
};

function Panel({ title, children, className = "", executive = false }: {
  title: string; children: React.ReactNode; className?: string; executive?: boolean;
}) {
  return (
    <section
      className={`rounded-xl p-5 ${executive ? "border border-signal/10 bg-surface h-s3" : "border border-line bg-surface"} ${className}`}
      style={{ boxShadow: executive ? "0 2px 16px rgba(0,0,0,0.28), 0 0 0 1px rgba(30,200,164,0.04)" : "0 2px 8px rgba(0,0,0,0.18)" }}
    >
      <h2 className={executive ? "intel-title mb-4" : "type-panel-title mb-4"}>{title}</h2>
      {children}
    </section>
  );
}

export function CopilotClient() {
  const t       = useTranslations("copilot");
  const tDomain = useTranslations("brain.domains");
  const tVendor = useTranslations("brain.vendors");
  const tCase   = useTranslations("brain.cases");
  const k       = useTranslations("knowledge");
  const locale  = useLocale();
  const nf  = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pct = locale === "fa" ? "٪" : "%";
  const tf  = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });

  const [question,  setQuestion]  = useState("");
  const [result,    setResult]    = useState<BrainAnalysis | null>(null);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [brainData, setBrainData] = useState<BrainResponse | null>(null);

  function refreshStats() {
    // SECURITY-6: public Copilot reads the anonymous-safe demo endpoint, not
    // the now-authenticated /api/brain history.
    fetch("/api/copilot/demo?n=5", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: BrainResponse) => setBrainData(j))
      .catch(() => {});
  }
  useEffect(() => { refreshStats(); }, []);

  async function analyze() {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    const r = await brainService.analyze(q, locale);
    if (r.ok) { setResult(r.data); refreshStats(); }
    else { setError(r.error); setResult(null); }
    setBusy(false);
  }

  const cases   = result?.evidence?.cases ?? [];
  const sources = result?.citations?.length
    ? result.citations.map((c) => c.sourceId)
    : (result?.libraries ?? []);

  const tr = useTranslations("copilot.report");
  const report = result
    ? buildEngineeringReport(
        question, result,
        {
          maintenanceEvent:  tr("ev.maintenance"),
          domainDetected:    (d) => tr("ev.domain",  { domain: tDomain(d) }),
          vendorDetected:    (v) => tr("ev.vendor",  { vendor: tVendor(v) }),
          casesFound:        (n) => tr("ev.cases",   { n: nf.format(n) }),
          relatedCaseLow:    tr("ev.relatedLow"),
          evidenceScore:     (n) => tr("ev.score",   { n: nf.format(n) }),
        },
        tr("safetyGeneric")
      )
    : null;

  const topDomainLabel  = result?.domains?.[0] ? tDomain(result.domains[0].id) : "Unknown";
  const topVendorLabels = (result?.vendors ?? []).map((v) => tVendor(v));
  const topDomainLabels = (result?.domains ?? []).map((d) => tDomain(d.id));

  const stats    = brainData?.stats;
  const recent   = brainData?.recent ?? [];
  const total    = stats?.count ?? 0;
  const known    = stats?.knownCount ?? 0;
  const knownPct = total > 0 ? Math.round((known / total) * 100) : 0;
  const avgConf  = Math.round((stats?.avgConfidence ?? 0) * 100);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-16">

      {/* ── KPI Strip ────────────────────────────────────────────────────── */}
      <div
        className="flex items-stretch divide-x divide-line border border-line rounded-xl overflow-x-auto mb-6"
        style={{ background: "var(--surface)" }}
      >
        {[
          { label: "Analyses",       value: nf.format(total),                                                                     note: "this session",               color: "text-ink" },
          { label: "Known %",        value: total > 0 ? `${nf.format(knownPct)}${pct}` : "—",                                    note: `${nf.format(known)} classified`, color: knownPct >= 70 ? "text-signal" : knownPct >= 40 ? "text-warn" : "text-ink" },
          { label: "Avg Confidence", value: total > 0 ? `${nf.format(avgConf)}${pct}` : "—",                                     note: "deterministic scoring",       color: avgConf >= 70 ? "text-signal" : avgConf >= 40 ? "text-warn" : "text-ink" },
          { label: "Guardrails",     value: nf.format(stats?.guardrailHits ?? 0),                                                 note: "blocked queries",             color: (stats?.guardrailHits ?? 0) > 0 ? "text-warn" : "text-ink" },
          { label: "Domains",        value: String(KNOWLEDGE_DOMAINS.length),                                                     note: "query classifications",       color: "text-ink" },
          { label: "Vendors",        value: String(VENDORS.length),                                                               note: "OEMs indexed",               color: "text-ink" },
        ].map((kpi) => (
          <div key={kpi.label} className="flex-1 min-w-[95px] px-4 py-4">
            <p className="type-eyebrow mb-1.5">{kpi.label}</p>
            <p className={`metric text-xl ${kpi.color}`}>{kpi.value}</p>
            <p className="mt-1 type-caption">{kpi.note}</p>
          </div>
        ))}
      </div>

      {/* ── Intelligence Context (2/3 + 1/3) ────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3 mb-8">

        {/* PRIMARY (2/3) */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Supported Domains */}
          <Panel title="Supported Domains" executive>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {KNOWLEDGE_DOMAINS.map((d) => {
                const hitCount = stats?.byDomain?.[d as string] ?? 0;
                return (
                  <div
                    key={d as string}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 ${
                      hitCount > 0
                        ? "border-signal/25 bg-signal/[0.03]"
                        : "border-line/50 bg-surface2/40"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${hitCount > 0 ? "bg-signal" : "bg-muted/40"}`} />
                      <span className="font-body text-xs text-ink truncate">{tDomain(d as string)}</span>
                    </div>
                    {hitCount > 0 && (
                      <span className="font-mono text-[0.60rem] text-muted flex-shrink-0">{nf.format(hitCount)}</span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 type-caption">Queried domains highlighted · session-scoped usage counts</p>
          </Panel>

          {/* Vendor Coverage */}
          <Panel title="Vendor Intelligence Coverage" executive>
            <div className="flex flex-wrap gap-2">
              {VENDORS.map((v) => {
                const hitCount = stats?.byVendor?.[v.id] ?? 0;
                return (
                  <span
                    key={v.id}
                    dir="ltr"
                    className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-body text-xs ${
                      hitCount > 0
                        ? "border-signal/30 bg-signal/[0.04] text-ink"
                        : "border-line/40 text-muted"
                    }`}
                  >
                    {hitCount > 0 && <span className="h-1 w-1 rounded-full bg-signal flex-shrink-0" />}
                    {tVendor(v.id)}
                    {hitCount > 0 && (
                      <span className="font-mono text-[0.60rem] text-muted/70">{nf.format(hitCount)}</span>
                    )}
                  </span>
                );
              })}
            </div>
            <p className="mt-3 type-caption">
              {VENDORS.length} industrial OEMs indexed · active vendors highlighted with session counts
            </p>
          </Panel>

          {/* Recent Analyses */}
          {recent.length > 0 && (
            <Panel title="Recent Analyses">
              <ul className="space-y-2.5">
                {recent.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-start gap-3 rounded-lg border border-line/50 bg-surface2/40 px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-sm text-ink truncate mb-1">{row.question}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {row.domains.slice(0, 2).map((d) => (
                          <span key={d.id} className="rounded border border-line px-1.5 py-0.5 font-body text-[0.60rem] text-muted">
                            {tDomain(d.id)}
                          </span>
                        ))}
                        {row.unknown && (
                          <span className="rounded border border-warn/30 px-1.5 py-0.5 font-body text-[0.60rem] text-warn">
                            Unknown
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`font-mono text-xs ${
                        row.confidence >= 0.75 ? "text-signal" : row.confidence >= 0.40 ? "text-warn" : "text-danger"
                      }`}>
                        {nf.format(Math.round(row.confidence * 100))}{pct}
                      </span>
                      <span className="font-mono text-[0.60rem] text-faint">{tf.format(row.ts)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

        </div>

        {/* SECONDARY (1/3) */}
        <div className="flex flex-col gap-5">

          {/* System Status */}
          <Panel title="System Status">
            <ul className="space-y-3 mb-5">
              {PLATFORM_COMPONENTS.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-2">
                  <span className="font-body text-sm text-ink">
                    {c.key.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  <span className={`flex items-center gap-1.5 font-body text-xs ${stateColor[c.state]}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${stateDot[c.state]}`} />
                    {c.state.charAt(0).toUpperCase() + c.state.slice(1)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line pt-4">
              <p className="type-caption leading-relaxed">
                Session-scoped intelligence. Analyses reset on server restart.
              </p>
            </div>
          </Panel>

          {/* Capability & Safety */}
          <Panel title={t("safetyTitle")}>
            <ul className="space-y-3 mb-5">
              {[
                { text: t("safetyReadOnly"),      icon: "◈" },
                { text: t("safetyDeterministic"), icon: "◎" },
                { text: t("safetyNoLLM"),         icon: "⊕" },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-2.5">
                  <span className="text-signal text-sm flex-shrink-0 mt-0.5">{item.icon}</span>
                  <p className="font-body text-xs text-muted leading-relaxed">{item.text}</p>
                </li>
              ))}
            </ul>
            <div className="border-t border-line pt-4">
              <p className="type-eyebrow mb-3">{t("confidenceTitle")}</p>
              <div className="space-y-2">
                {[
                  { label: "HIGH",   range: "≥ 75%",  color: "text-signal" },
                  { label: "MEDIUM", range: "40–74%", color: "text-warn"   },
                  { label: "LOW",    range: "< 40%",  color: "text-danger" },
                ].map((tier) => (
                  <div key={tier.label} className="flex items-center justify-between">
                    <span className={`font-mono text-xs ${tier.color}`}>{tier.label}</span>
                    <span className="type-caption">{tier.range}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Session domain distribution */}
          {stats?.byDomain && Object.keys(stats.byDomain).length > 0 && (
            <Panel title="Session Distribution">
              <ul className="space-y-2.5">
                {Object.entries(stats.byDomain)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 7)
                  .map(([domain, count]) => {
                    const maxCount = Math.max(...Object.values(stats.byDomain));
                    const barPct   = Math.round((count / maxCount) * 100);
                    return (
                      <li key={domain}>
                        <div className="flex items-center justify-between font-body text-xs mb-1">
                          <span className="text-muted">{tDomain(domain)}</span>
                          <span className="font-mono text-ink">{nf.format(count)}</span>
                        </div>
                        <div className="h-0.5 rounded bg-line">
                          <div className="h-0.5 rounded bg-signal/60" style={{ inlineSize: `${barPct}%` }} />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </Panel>
          )}

        </div>
      </div>

      {/* ── Reasoning Interface ────────────────────────────────────────────── */}
      <div className="h-layer-sep mb-5">
        <span className="kpi-label">Reasoning Interface</span>
      </div>
      <div className="pt-1">


        <div
          className="rounded-xl border border-line bg-surface p-5 mb-4"
          style={{ boxShadow: "0 4px 32px rgba(0,0,0,0.35)" }}
        >
          <label htmlFor="copilot-input" className="sr-only">{t("placeholder")}</label>
          <textarea
            id="copilot-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") analyze();
            }}
            rows={5}
            placeholder={t("placeholder")}
            className="w-full resize-y rounded-lg border border-line bg-bg px-4 py-3 font-body text-sm leading-relaxed text-ink placeholder:text-muted/50 focus:border-signal/50 focus:outline-none focus:ring-1 focus:ring-signal/20 transition-colors"
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="hidden sm:block text-xs text-muted/50 font-mono">Ctrl+Enter</p>
            <button
              onClick={analyze}
              disabled={busy || question.trim() === ""}
              className="ms-auto rounded-lg bg-signal px-6 py-2.5 font-body text-sm font-semibold text-bg transition-all hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed"
            >
              {busy ? t("analyzing") : t("analyze")}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-danger/40 bg-surface px-4 py-3 font-mono text-sm text-danger">
            {error}
          </div>
        )}

        {!result && !error && (
          <div className="py-6 text-center">
            <p className="font-body text-sm text-muted/70 max-w-xs mx-auto leading-relaxed">
              {t("emptyHint")}
            </p>
          </div>
        )}
      </div>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {result && (
        <div className="mt-6 space-y-4">

          <div className="rounded-xl border border-line bg-surface p-6">
            <ConfidenceRing
              value={result.confidence}
              label={t("confidenceTitle")}
              formatted={`${nf.format(Math.round(result.confidence * 100))}${pct}`}
            />
          </div>

          {result.unknown && (
            <div className="rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 font-body text-sm leading-relaxed text-warn">
              {t("unknownNote")}
            </div>
          )}

          {report?.available && report.rootCause && (
            <RootCausePanel
              result={result}
              domainLabel={topDomainLabel}
              rootCause={report.rootCause}
              recommendations={report.correctiveActions}
            />
          )}

          <AssetContextPanel domains={topDomainLabels} vendors={topVendorLabels} />

          <ResultSection
            title={t("sections.domains")}
            empty={t("none.domains")}
            isEmpty={!result.domains || result.domains.length === 0}
          >
            <div className="flex flex-wrap gap-2">
              {result.domains.map((d) => (
                <Chip key={d.id} tone="signal">
                  {tDomain(d.id)}{" "}
                  <span className="font-mono text-muted">
                    {nf.format(Math.round(d.score * 100))}{pct}
                  </span>
                </Chip>
              ))}
            </div>
          </ResultSection>

          <ResultSection
            title={t("sections.vendors")}
            empty={t("none.vendors")}
            isEmpty={!result.vendors || result.vendors.length === 0}
          >
            <div className="flex flex-wrap gap-2">
              {(result.vendors ?? []).map((v) => (
                <Chip key={v} ltr>{tVendor(v)}</Chip>
              ))}
            </div>
          </ResultSection>

          <ResultSection
            title={t("sections.cases")}
            empty={t("none.cases")}
            isEmpty={cases.length === 0}
          >
            <ul className="space-y-2">
              {cases.map((c) => (
                <li key={c.id}>
                  <a
                    href={`/${locale}/library/cases/${c.id}`}
                    className="group flex items-center justify-between gap-3 rounded-lg border border-line bg-bg/60 px-3 py-2.5 transition-all hover:border-signal/40 hover:bg-signal/5"
                  >
                    <span className="font-body text-sm text-ink group-hover:text-signal transition-colors">
                      {tCase(c.id)}
                    </span>
                    <span className="flex shrink-0 gap-1.5">
                      <Chip ltr>{tVendor(c.vendor)}</Chip>
                      <Chip>{tDomain(c.category)}</Chip>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </ResultSection>

          <ResultSection
            title={t("sections.sources")}
            empty={t("none.sources")}
            isEmpty={sources.length === 0}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {sources.map((id) => (
                <a
                  key={id}
                  href={`/${locale}/library/${id}`}
                  className="group rounded-lg border border-line bg-bg/60 p-3.5 transition-all hover:border-signal/40 hover:bg-signal/5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-sm font-semibold text-ink group-hover:text-signal transition-colors">
                      {k(`${id}.name`)}
                    </p>
                    <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-60 transition-opacity text-signal">
                      <path d="M2 10L10 2M10 2H5M10 2v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <p className="mt-1 font-body text-xs leading-relaxed text-muted">
                    {k(`${id}.summary`)}
                  </p>
                </a>
              ))}
            </div>
          </ResultSection>

          <p className="rounded-lg border border-line/30 bg-bg/60 px-4 py-3 font-body text-xs leading-relaxed text-muted">
            {t("approvalNote")}
          </p>

          {report?.available && (
            <section
              className="rounded-xl border border-line bg-surface p-6"
              style={{ boxShadow: "0 4px 32px rgba(0,0,0,0.30)" }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(var(--signal-rgb),0.08)", border: "1px solid rgba(var(--signal-rgb),0.18)" }}
                >
                  <span className="text-signal text-sm">◉</span>
                </div>
                <h2 className="font-display text-base font-bold text-ink">{tr("title")}</h2>
              </div>

              <ReportBlock title={tr("problemSummary")}>
                <p className="font-body text-sm leading-relaxed text-ink">{report.problemSummary}</p>
              </ReportBlock>

              <ReportBlock title={tr("rootCause")}>
                <p className="font-body text-sm leading-relaxed text-ink">{report.rootCause}</p>
                {report.rootCauseLowConfidence && (
                  <p className="mt-2 font-body text-xs leading-relaxed text-warn">{tr("lowConfidenceNote")}</p>
                )}
              </ReportBlock>

              {report.supportingEvidence.length > 0 && (
                <ReportBlock title={tr("evidence")}>
                  <ul className="space-y-2">
                    {report.supportingEvidence.map((e, i) => (
                      <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-ink">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-signal" />
                        {e}
                      </li>
                    ))}
                  </ul>
                </ReportBlock>
              )}

              {report.verificationSteps.length > 0 && (
                <ReportBlock title={tr("verification")}>
                  <ol className="space-y-2">
                    {report.verificationSteps.map((v, i) => (
                      <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-ink">
                        <span className="metric w-5 shrink-0 text-sm text-muted/60 font-bold">{nf.format(i + 1)}.</span>
                        {v}
                      </li>
                    ))}
                  </ol>
                </ReportBlock>
              )}

              {report.correctiveActions.length > 0 && (
                <ReportBlock title={tr("corrective")}>
                  <ol className="space-y-2">
                    {report.correctiveActions.map((a, i) => (
                      <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-ink">
                        <span className="metric w-5 shrink-0 text-sm text-muted/60 font-bold">{nf.format(i + 1)}.</span>
                        {a}
                      </li>
                    ))}
                  </ol>
                </ReportBlock>
              )}

              <ReportBlock title={tr("safety")}>
                <div className="flex gap-3 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3">
                  <span className="text-warn text-base flex-shrink-0 mt-0.5">⚠</span>
                  <p className="font-body text-sm leading-relaxed text-warn">{report.safetyNote}</p>
                </div>
              </ReportBlock>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ReportBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 pt-5 border-t border-line first:border-0 first:mt-0 first:pt-0">
      <h3 className="type-eyebrow mb-2.5">{title}</h3>
      {children}
    </div>
  );
}
