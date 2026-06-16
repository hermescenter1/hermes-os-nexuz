"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { brainService } from "@/lib/services/brain-service";
import type { BrainAnalysis } from "@/lib/services/types";
import { buildEngineeringReport } from "@/lib/industrial/engineering-report";
import { ResultSection, Chip } from "@/components/copilot/ResultSection";

/** Confidence band → tone, matching the Brain confidence model. */
function confTone(c: number): string {
  if (c >= 0.7) return "text-signal";
  if (c >= 0.4) return "text-[var(--warn)]";
  return "text-muted";
}

export function CopilotClient() {
  const t = useTranslations("copilot");
  const tDomain = useTranslations("brain.domains");
  const tVendor = useTranslations("brain.vendors");
  const tCase = useTranslations("brain.cases");
  const k = useTranslations("knowledge");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pct = locale === "fa" ? "\u066A" : "%";

  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<BrainAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const cases = result?.evidence?.cases ?? [];
  const sources = result?.citations?.length
    ? result.citations.map((c) => c.sourceId)
    : (result?.libraries ?? []);

  // Phase 9B: deterministic engineering report assembled from existing data.
  const tr = useTranslations("copilot.report");
  const report = result
    ? buildEngineeringReport(
        question,
        result,
        {
          maintenanceEvent: tr("ev.maintenance"),
          domainDetected: (d) => tr("ev.domain", { domain: tDomain(d) }),
          vendorDetected: (v) => tr("ev.vendor", { vendor: tVendor(v) }),
          casesFound: (n) => tr("ev.cases", { n: nf.format(n) }),
          relatedCaseLow: tr("ev.relatedLow"),
          evidenceScore: (n) => tr("ev.score", { n: nf.format(n) }),
        },
        tr("safetyGeneric")
      )
    : null;

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-8">
      {/* input */}
      <div className="rounded-xl border border-line bg-surface p-5">
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
          className="w-full resize-y rounded-lg border border-line bg-bg px-4 py-3 font-body text-sm leading-relaxed text-ink placeholder:text-muted/60 focus:border-signal/50 focus:outline-none"
        />
        <div className="mt-3 flex justify-end">
          <button
            onClick={analyze}
            disabled={busy || question.trim() === ""}
            className="rounded-lg bg-signal px-5 py-2.5 font-body text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? t("analyzing") : t("analyze")}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-[var(--danger)]/40 bg-surface px-4 py-3 font-mono text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      {!result && !error && (
        <p className="mt-8 text-center font-body text-sm text-muted/70">{t("emptyHint")}</p>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          {/* confidence band */}
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-5 py-4">
            <span className="font-mono text-xs uppercase tracking-widest text-muted">
              {t("confidence")}
            </span>
            <span className={`metric text-2xl ${confTone(result.confidence)}`}>
              {nf.format(Math.round(result.confidence * 100))}
              {pct}
            </span>
          </div>

          {result.unknown && (
            <p className="rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-4 py-3 font-body text-sm leading-relaxed text-[var(--warn)]">
              {t("unknownNote")}
            </p>
          )}

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
                  <span className="font-mono text-muted">{nf.format(Math.round(d.score * 100))}{pct}</span>
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
                <Chip key={v} ltr>
                  {tVendor(v)}
                </Chip>
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
                    className="group flex items-center justify-between gap-3 rounded-lg border border-line bg-bg px-3 py-2 transition-colors hover:border-signal/40"
                  >
                    <span className="font-body text-sm text-ink group-hover:text-signal">
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
                  className="group rounded-lg border border-line bg-bg p-3 transition-colors hover:border-signal/40"
                >
                  <p className="font-display text-sm font-semibold text-ink group-hover:text-signal">
                    {k(`${id}.name`)}
                  </p>
                  <p className="mt-0.5 font-body text-xs leading-relaxed text-muted">
                    {k(`${id}.summary`)}
                  </p>
                </a>
              ))}
            </div>
          </ResultSection>

          <p className="rounded-lg border border-signalDim bg-bg/60 px-4 py-3 font-body text-xs leading-relaxed text-muted">
            {t("approvalNote")}
          </p>

          {/* Phase 9B — deterministic engineering report */}
          {report?.available && (
            <section className="rounded-xl border border-signalDim bg-surface p-6">
              <h2 className="font-display text-xl font-bold text-ink">{tr("title")}</h2>

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
                  <ul className="space-y-1.5">
                    {report.supportingEvidence.map((e, i) => (
                      <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-ink">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-signal" />
                        {e}
                      </li>
                    ))}
                  </ul>
                </ReportBlock>
              )}

              {report.verificationSteps.length > 0 && (
                <ReportBlock title={tr("verification")}>
                  <ol className="space-y-1.5">
                    {report.verificationSteps.map((v, i) => (
                      <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-ink">
                        <span className="metric w-5 shrink-0 text-sm text-muted">{nf.format(i + 1)}</span>
                        {v}
                      </li>
                    ))}
                  </ol>
                </ReportBlock>
              )}

              {report.correctiveActions.length > 0 && (
                <ReportBlock title={tr("corrective")}>
                  <ol className="space-y-1.5">
                    {report.correctiveActions.map((a, i) => (
                      <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-ink">
                        <span className="metric w-5 shrink-0 text-sm text-muted">{nf.format(i + 1)}</span>
                        {a}
                      </li>
                    ))}
                  </ol>
                </ReportBlock>
              )}

              <ReportBlock title={tr("safety")}>
                <p className="rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-4 py-3 font-body text-sm leading-relaxed text-[var(--warn)]">
                  {report.safetyNote}
                </p>
              </ReportBlock>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** Titled sub-section within the engineering report. */
function ReportBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="font-mono text-xs uppercase tracking-widest text-muted">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}
