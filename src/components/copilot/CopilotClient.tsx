"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { brainService } from "@/lib/services/brain-service";
import type { BrainAnalysis } from "@/lib/services/types";
import { buildEngineeringReport } from "@/lib/industrial/engineering-report";
import { ResultSection, Chip } from "@/components/copilot/ResultSection";
import { ConfidenceRing }       from "@/components/copilot/ConfidenceRing";
import { RootCausePanel }       from "@/components/copilot/RootCausePanel";
import { AssetContextPanel }    from "@/components/copilot/AssetContextPanel";

export function CopilotClient() {
  const t       = useTranslations("copilot");
  const tDomain = useTranslations("brain.domains");
  const tVendor = useTranslations("brain.vendors");
  const tCase   = useTranslations("brain.cases");
  const k       = useTranslations("knowledge");
  const locale  = useLocale();
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pct = locale === "fa" ? "٪" : "%";

  const [question, setQuestion] = useState("");
  const [result,   setResult]   = useState<BrainAnalysis | null>(null);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function analyze() {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    const r = await brainService.analyze(q, locale);
    if (r.ok) {
      setResult(r.data);
    } else {
      setError(r.error);
      setResult(null);
    }
    setBusy(false);
  }

  const cases   = result?.evidence?.cases ?? [];
  const sources = result?.citations?.length
    ? result.citations.map((c) => c.sourceId)
    : (result?.libraries ?? []);

  const tr = useTranslations("copilot.report");
  const report = result
    ? buildEngineeringReport(
        question,
        result,
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

  /* derived labels for V2 panels */
  const topDomainLabel =
    result?.domains?.[0] ? tDomain(result.domains[0].id) : "Unknown";
  const topVendorLabels =
    (result?.vendors ?? []).map((v) => tVendor(v));
  const topDomainLabels =
    (result?.domains ?? []).map((d) => tDomain(d.id));

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pb-16 pt-8">

      {/* ── Input panel ───────────────────────────────────────────────────── */}
      <div
        className="rounded-xl border border-line bg-surface p-5"
        style={{ boxShadow: "0 4px 32px rgba(0,0,0,0.35)" }}
      >
        <label htmlFor="copilot-input" className="sr-only">
          {t("placeholder")}
        </label>
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
          <p className="hidden sm:block text-xs text-muted/50 font-mono">
            Ctrl+Enter to analyze
          </p>
          <button
            onClick={analyze}
            disabled={busy || question.trim() === ""}
            className="ms-auto rounded-lg bg-signal px-6 py-2.5 font-body text-sm font-semibold text-bg transition-all hover:opacity-90 hover:shadow-[0_0_20px_rgba(56,224,176,0.30)] disabled:opacity-35 disabled:cursor-not-allowed"
          >
            {busy ? t("analyzing") : t("analyze")}
          </button>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mt-4 rounded-lg border border-[var(--danger)]/40 bg-surface px-4 py-3 font-mono text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {/* ── Empty hint ────────────────────────────────────────────────────── */}
      {!result && !error && (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <div
            className="w-12 h-12 rounded-xl border border-signalDim/30 flex items-center justify-center"
            style={{ background: "rgba(56,224,176,0.06)" }}
          >
            <span className="text-signal text-xl">⚙</span>
          </div>
          <p className="font-body text-sm text-muted/70 max-w-xs leading-relaxed">
            {t("emptyHint")}
          </p>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {result && (
        <div className="mt-6 space-y-4">

          {/* Confidence ring — V2 */}
          <div className="rounded-xl border border-line bg-surface p-6">
            <ConfidenceRing
              value={result.confidence}
              label={t("confidence")}
              formatted={`${nf.format(Math.round(result.confidence * 100))}${pct}`}
            />
          </div>

          {/* Unknown flag */}
          {result.unknown && (
            <div className="rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-4 py-3 font-body text-sm leading-relaxed text-[var(--warn)]">
              {t("unknownNote")}
            </div>
          )}

          {/* Root cause chain — V2, only when report has a root cause */}
          {report?.available && report.rootCause && (
            <RootCausePanel
              result={result}
              domainLabel={topDomainLabel}
              rootCause={report.rootCause}
              recommendations={report.correctiveActions}
            />
          )}

          {/* Industrial asset context — V2 */}
          <AssetContextPanel
            domains={topDomainLabels}
            vendors={topVendorLabels}
          />

          {/* Detected Domains */}
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

          {/* Detected Vendors */}
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

          {/* Matched Cases */}
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

          {/* Knowledge Sources */}
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
                    <svg
                      viewBox="0 0 12 12"
                      fill="none"
                      className="w-3 h-3 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-60 transition-opacity text-signal"
                    >
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

          {/* Approval note */}
          <p className="rounded-lg border border-signalDim/30 bg-bg/60 px-4 py-3 font-body text-xs leading-relaxed text-muted">
            {t("approvalNote")}
          </p>

          {/* Engineering report — deterministic */}
          {report?.available && (
            <section
              className="rounded-xl border border-signalDim/30 bg-surface p-6"
              style={{ boxShadow: "0 4px 32px rgba(0,0,0,0.30)" }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(56,224,176,0.10)", border: "1px solid rgba(56,224,176,0.25)" }}
                >
                  <span className="text-signal text-sm">📋</span>
                </div>
                <h2 className="font-display text-lg font-bold text-ink">{tr("title")}</h2>
              </div>

              <ReportBlock title={tr("problemSummary")}>
                <p className="font-body text-sm leading-relaxed text-ink">{report.problemSummary}</p>
              </ReportBlock>

              <ReportBlock title={tr("rootCause")}>
                <p className="font-body text-sm leading-relaxed text-ink">{report.rootCause}</p>
                {report.rootCauseLowConfidence && (
                  <p className="mt-2 font-body text-xs leading-relaxed text-[var(--warn)]">
                    {tr("lowConfidenceNote")}
                  </p>
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
                        <span className="metric w-5 shrink-0 text-sm text-muted/60 font-bold">
                          {nf.format(i + 1)}.
                        </span>
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
                        <span className="metric w-5 shrink-0 text-sm text-muted/60 font-bold">
                          {nf.format(i + 1)}.
                        </span>
                        {a}
                      </li>
                    ))}
                  </ol>
                </ReportBlock>
              )}

              <ReportBlock title={tr("safety")}>
                <div className="flex gap-3 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-4 py-3">
                  <span className="text-[var(--warn)] text-base flex-shrink-0 mt-0.5">⚠</span>
                  <p className="font-body text-sm leading-relaxed text-[var(--warn)]">
                    {report.safetyNote}
                  </p>
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
      <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-2.5">
        {title}
      </h3>
      {children}
    </div>
  );
}
