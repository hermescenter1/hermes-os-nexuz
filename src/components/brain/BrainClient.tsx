"use client";

import { useEffect, useState } from "react";
import { useLocale, useMessages, useTranslations } from "next-intl";
import { brainService } from "@/lib/services/brain-service";
import type { BrainAnalysis, BrainMemoryStats } from "@/lib/services/types";
import { useSafeKnowledge } from "./useSafeKnowledge";

const EXAMPLES = ["e1", "e2", "e3"] as const;

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-5 first:border-t-0 first:pt-0">
      <h3 className="font-mono text-xs uppercase tracking-widest text-muted">{label}</h3>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

export function BrainClient() {
  const t = useTranslations("brain");
  const k = useSafeKnowledge(); // safe accessor: never renders raw i18n keys
  const locale = useLocale();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BrainAnalysis | null>(null);
  const [memStats, setMemStats] = useState<BrainMemoryStats | null>(null);

  const msgs = useMessages() as { brain?: { cases?: Record<string, string> } };
  /** safe case-title lookup: falls back to the case id, never a raw key */
  const caseTitle = (id: string): string =>
    typeof msgs.brain?.cases?.[id] === "string" ? t(`cases.${id}`) : id;

  async function refreshMemory() {
    const r = await brainService.memory(5);
    if (r.ok) setMemStats(r.data.stats);
  }
  useEffect(() => {
    refreshMemory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pct = locale === "fa" ? "\u066A" : "%";

  async function analyze(q: string) {
    const text = q.trim();
    if (text.length < 8) {
      setError(t("errors.tooShort"));
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    const r = await brainService.analyze(text, locale);
    setBusy(false);
    if (r.ok) {
      setResult(r.data);
      refreshMemory();
    } else setError(t("errors.generic"));
  }

  const confLevel = (c: number) => (c >= 0.7 ? "high" : c >= 0.4 ? "medium" : "low");

  return (
    <div className="mx-auto max-w-4xl px-6 pb-20 pt-12">
      {/* input */}
      <div className="rounded-2xl border border-line bg-surface p-5">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("placeholder")}
          rows={3}
          className="w-full resize-y rounded-lg border border-line bg-bg px-4 py-3 font-body text-base text-ink placeholder:text-muted/60 focus:border-signal focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-body text-xs text-muted">{t("examplesTitle")}:</span>
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setQuestion(t(`examples.${e}`));
                  analyze(t(`examples.${e}`));
                }}
                className="rounded-full border border-line px-3 py-1 font-body text-xs text-muted transition-colors hover:border-signal/50 hover:text-ink"
              >
                {t(`examples.${e}`).slice(0, 38)}…
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => analyze(question)}
            disabled={busy}
            className="rounded-md bg-signal px-6 py-2.5 font-body text-sm font-semibold text-bg transition-opacity disabled:opacity-50"
          >
            {busy ? t("analyzing") : t("analyze")}
          </button>
        </div>
        {error && (
          <p className="mt-3 font-body text-sm text-[var(--danger)]">{error}</p>
        )}
      </div>

      {result && (
        <div className="mt-8 space-y-6">
          {/* mode badge */}
          <p className="font-mono text-xs text-muted">
            <span className="me-2 inline-block h-1.5 w-1.5 rounded-full bg-signal align-middle" />
            {t(`mode.${result.mode === "future-rag" ? "futureRag" : result.mode}`)}
          </p>

          {result.guardrail && (
            <p className="rounded-lg border border-[var(--danger)]/50 bg-[var(--danger)]/5 px-4 py-3 font-body text-sm leading-relaxed text-[var(--danger)]">
              {t(`guardrails.${result.guardrail}`)}
            </p>
          )}

          {/* Step 7 — pipeline intelligence strip: vendors, risk, evidence */}
          {(result.vendors?.length || result.riskLevel || result.evidence) && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-surface p-4">
                <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
                  {t("intel.vendorsTitle")}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.vendors && result.vendors.length > 0 ? (
                    result.vendors.map((v) => (
                      <span
                        key={v}
                        className="rounded-full border border-signalDim bg-bg/60 px-3 py-1 font-body text-xs text-ink"
                      >
                        {t(`vendors.${v}`)}
                      </span>
                    ))
                  ) : (
                    <span className="font-body text-xs text-muted">—</span>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4">
                <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
                  {t("intel.riskTitle")}
                </h2>
                {result.riskLevel && (
                  <span
                    className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-body text-xs ${
                      result.riskLevel === "high"
                        ? "border-[var(--danger)]/50 text-[var(--danger)]"
                        : result.riskLevel === "medium"
                          ? "border-[var(--warn)]/50 text-[var(--warn)]"
                          : "border-signalDim text-signal"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        result.riskLevel === "high"
                          ? "bg-[var(--danger)]"
                          : result.riskLevel === "medium"
                            ? "bg-[var(--warn)]"
                            : result.riskLevel === "unknown"
                              ? "bg-muted/60"
                              : "bg-signal"
                      }`}
                    />
                    {t(`risk.${result.riskLevel}`)}
                  </span>
                )}
              </div>
              <div className="rounded-xl border border-line bg-surface p-4">
                <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
                  {t("intel.evidenceTitle")}
                </h2>
                {result.evidence && (
                  <div className="mt-3">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 rounded bg-line">
                        <div
                          className="h-1.5 rounded bg-signal"
                          style={{ inlineSize: `${Math.round(result.evidence.score * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-ink">
                        {nf.format(Math.round(result.evidence.score * 100))}{pct}
                      </span>
                    </div>
                    <p className="mt-2 font-body text-[0.7rem] leading-relaxed text-muted">
                      {t("intel.evidenceNote")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Unknown layer: warning card replaces classifier, sources, and
              report when evidence is insufficient for classification. */}
          {result.unknown && (
            <div className="rounded-xl border border-[var(--warn)]/50 bg-[var(--warn)]/5 p-5">
              <h2 className="font-display text-base font-bold text-[var(--warn)]">
                {t("unknown.title")}
              </h2>
              <p className="mt-2 font-body text-sm leading-relaxed text-ink">
                {t("unknown.message")}
              </p>
              <p className="mt-2 font-body text-sm leading-relaxed text-muted">
                {t("unknown.assessment")}
              </p>
              <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted">
                {t("unknown.provide")}
              </p>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {(["equipment", "vendor", "alarms", "symptoms", "maintenance", "impact", "time"] as const).map((it) => (
                  <li key={it} className="flex gap-2.5 font-body text-sm leading-relaxed text-ink">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--warn)]" />
                    {t(`unknown.items.${it}`)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* domain classifier visual */}
          {!result.unknown && (
          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
              {t("domainsTitle")}
            </h2>
            <div className="mt-4 space-y-2.5">
              {result.domains.map((d) => (
                <div key={d.id} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 font-body text-sm text-ink">
                    {t(`domains.${d.id}`)}
                  </span>
                  <div className="h-1.5 flex-1 rounded bg-line">
                    <div
                      className="h-1.5 rounded bg-signal"
                      style={{ inlineSize: `${Math.round(d.score * 100)}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-end font-mono text-xs text-muted">
                    {nf.format(Math.round(d.score * 100))}{pct}
                  </span>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Phase 10 — Evidence Ranking (hybrid retrieval) */}
          {result.retrieval && result.retrieval.ranking.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-5">
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
                {t("evidence.rankingTitle")}
              </h2>
              <ol className="mt-4 space-y-2.5">
                {result.retrieval.ranking.map((e, i) => (
                  <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3">
                    <span className="metric flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-signalDim text-[0.65rem] text-signal">
                      {nf.format(i + 1)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-body text-sm text-ink">
                      {e.kind === "case" ? caseTitle(e.id) : k(e.id, "name")}
                    </span>
                    <span className="shrink-0 rounded-full border border-line px-2 py-0.5 font-body text-[0.6rem] text-muted">
                      {e.kind === "case" ? t("evidence.caseTag") : t("evidence.knowledgeTag")}
                    </span>
                    <span className="metric shrink-0 text-sm text-signal">
                      {nf.format(e.score)}{pct}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Phase 10 — Top Evidence Sources (cases + knowledge, linked) */}
          {result.retrieval &&
            (result.retrieval.topCases.length > 0 || result.retrieval.topKnowledge.length > 0) && (
              <div className="rounded-xl border border-line bg-surface p-5">
                <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
                  {t("evidence.sourcesTitle")}
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {result.retrieval.topCases.map((c) => (
                    <a
                      key={c.id}
                      href={`/${locale}/library/cases/${c.id}`}
                      className="group rounded-lg border border-line bg-bg p-3 transition-colors hover:border-signal/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.6rem] text-muted">
                          {t("evidence.caseTag")}
                        </span>
                        <span className="metric text-sm text-signal">{nf.format(c.score)}{pct}</span>
                      </div>
                      <p className="mt-1.5 font-body text-sm text-ink group-hover:text-signal">{caseTitle(c.id)}</p>
                    </a>
                  ))}
                  {result.retrieval.topKnowledge.map((kk) => (
                    <a
                      key={kk.id}
                      href={`/${locale}/library/${kk.id}`}
                      className="group rounded-lg border border-line bg-bg p-3 transition-colors hover:border-signal/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.6rem] text-muted">
                          {t("evidence.knowledgeTag")}
                        </span>
                        <span className="metric text-sm text-signal">{nf.format(kk.score)}{pct}</span>
                      </div>
                      <p className="mt-1.5 font-body text-sm text-ink group-hover:text-signal">{k(kk.id, "name")}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}

          {/* Step 7 — reasoning pipeline trace */}
          {result.pipeline?.steps && result.pipeline.steps.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-5">
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
                {t("intel.pipelineTitle")}
              </h2>
              <ol className="mt-4 flex flex-wrap gap-x-2 gap-y-3">
                {result.pipeline.steps.map((st, i) => (
                  <li key={st.id} className="flex items-center gap-2">
                    <span className="metric flex h-5 w-5 items-center justify-center rounded-full border border-signalDim text-[0.65rem] text-signal">
                      {nf.format(i + 1)}
                    </span>
                    <span className="font-body text-xs text-ink">
                      {t(`pipelineSteps.${st.id}`)}
                    </span>
                    {i < result.pipeline!.steps.length - 1 && (
                      <span className="text-muted/50" aria-hidden="true">·</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Step 7 — matched engineering cases (compact) */}
          {result.evidence?.cases && result.evidence.cases.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-5">
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
                {t("intel.casesTitle")}
              </h2>
              <ul className="mt-3 space-y-2">
                {result.evidence.cases.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-body text-sm text-ink">{caseTitle(c.id)}</span>
                    <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.65rem] text-muted">
                      {t(`vendors.${c.vendor}`)}
                    </span>
                    <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.65rem] text-muted">
                      {t(`domains.${c.category}`)}
                    </span>
                    <span className="font-mono text-[0.6rem] text-muted/60" dir="ltr">{c.id}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* knowledge sources */}
          {!result.unknown && (
          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
              {t("sourcesTitle")}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(result.citations?.length
                ? result.citations
                : result.libraries.map((id, i) => ({
                    id: String(i + 1),
                    sourceId: id,
                  }))
              ).map((c) => (
                <div key={c.sourceId} className="rounded-lg border border-line bg-bg/60 p-3.5">
                  <div className="flex items-baseline gap-2">
                    <span className="metric rounded border border-line px-1.5 text-xs text-signal">
                      {nf.format(Number(c.id))}
                    </span>
                    <h3 className="font-display text-sm font-semibold text-ink">
                      {k(c.sourceId, "name")}
                    </h3>
                  </div>
                  <p className="mt-1.5 font-body text-xs leading-relaxed text-muted">
                    {k(c.sourceId, "summary")}
                  </p>
                </div>
              ))}
            </div>
          </div>

          )}

          {/* structured analysis */}
          {!result.unknown && (
          <div className="rounded-xl border border-line bg-surface p-6">
            <Section label={t("sections.summary")}>
              <p className="font-body text-sm leading-relaxed text-ink">
                {result.mode === "llm" && result.llm
                  ? result.llm.summary
                  : t("fallback.summary", {
                      domains: result.domains.map((d) => t(`domains.${d.id}`)).join("، "),
                    })}
              </p>
            </Section>

            {result.rootCause ? (
              /* Step 8: case-driven Root Cause Analysis replaces Likely
                 Cause when an engineering case matched. */
              <Section label={t("rootCause.title")}>
                <p className="font-body text-sm leading-relaxed text-ink">
                  <span className="font-semibold">{t("rootCause.primaryLabel")}: </span>
                  {result.rootCause.primary}
                </p>
                {result.rootCause.relatedCase?.lowConfidence && (
                  <p className="mt-2 font-body text-xs text-muted">
                    {t("rootCause.relatedCaseLow")}{" "}
                    <span className="font-mono" dir="ltr">
                      {result.rootCause.relatedCase.caseId}
                    </span>
                  </p>
                )}
                {result.rootCause.secondary.length > 0 && (
                  <div className="mt-3">
                    <p className="font-mono text-xs uppercase tracking-widest text-muted">
                      {t("rootCause.secondaryLabel")}
                    </p>
                    <ul className="mt-1.5 space-y-1.5">
                      {result.rootCause.secondary.map((c, i) => (
                        <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-ink">
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-signal" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-3">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted">
                    {t("rootCause.verificationLabel")}
                  </p>
                  <ol className="mt-1.5 space-y-1.5">
                    {result.rootCause.verification.map((v, i) => (
                      <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-ink">
                        <span className="metric w-4 shrink-0 text-sm text-muted">{nf.format(i + 1)}</span>
                        {v}
                      </li>
                    ))}
                  </ol>
                </div>
                {result.rootCause.alternative && result.rootCause.alternative.length > 0 && (
                  <div className="mt-3">
                    <p className="font-mono text-xs uppercase tracking-widest text-muted">
                      {t("rootCause.alternativeLabel")}
                    </p>
                    <ul className="mt-1.5 space-y-1.5">
                      {result.rootCause.alternative.map((c, i) => (
                        <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-muted">
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted/60" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.rootCause.correctiveActions && result.rootCause.correctiveActions.length > 0 && (
                  <div className="mt-3">
                    <p className="font-mono text-xs uppercase tracking-widest text-muted">
                      {t("rootCause.correctiveLabel")}
                    </p>
                    <ul className="mt-1.5 space-y-1.5">
                      {result.rootCause.correctiveActions.map((a, i) => (
                        <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-ink">
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-signal" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>
            ) : (
              <Section label={t("sections.cause")}>
                {result.mode === "llm" && result.llm ? (
                  <p className="font-body text-sm leading-relaxed text-ink">{result.llm.cause}</p>
                ) : (
                  <p className="font-body text-sm leading-relaxed text-ink">
                    {t("fallback.causeIntro", { lib: k(result.libraries[0], "name") })}{" "}
                    <span className="text-muted">{k(result.libraries[0], "summary")}</span>
                  </p>
                )}
              </Section>
            )}

            <Section label={t("sections.analysis")}>
              <ul className="space-y-2.5">
                {(result.mode === "llm" && result.llm
                  ? result.llm.analysis
                  : result.libraries.slice(0, 2).flatMap((id) =>
                      (["p1", "p2", "p3"] as const).map((p) => k(id, p))
                    )
                ).map((line, i) => (
                  <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-ink">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-signal" />
                    {line}
                  </li>
                ))}
              </ul>
            </Section>

            <Section label={t("sections.checks")}>
              <ol className="space-y-2.5">
                {(result.mode === "llm" && result.llm
                  ? result.llm.checks
                  : result.libraries.slice(0, 3).flatMap((id) =>
                      (["c1", "c2"] as const).map((c) => k(id, c))
                    )
                ).map((line, i) => (
                  <li key={i} className="flex gap-3 font-body text-sm leading-relaxed text-ink">
                    <span className="metric w-5 shrink-0 text-sm text-muted">{nf.format(i + 1)}</span>
                    {line}
                  </li>
                ))}
              </ol>
            </Section>

            <Section label={t("sections.safety")}>
              <p className="rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-4 py-3 font-body text-sm leading-relaxed text-[var(--warn)]">
                {t(`safety.${result.safety}`)}
              </p>
            </Section>

            <Section label={t("sections.confidence")}>
              <div className="flex items-center gap-4">
                <div className="h-1.5 w-40 rounded bg-line">
                  <div
                    className="h-1.5 rounded bg-signal"
                    style={{ inlineSize: `${Math.round(result.confidence * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-sm text-ink">
                  {nf.format(Math.round(result.confidence * 100))}{pct}
                </span>
                <span className="font-body text-xs text-muted">
                  {t(`confidenceLevels.${confLevel(result.confidence)}`)}
                </span>
              </div>
            </Section>

            <Section label={t("sections.approval")}>
              <p className="rounded-lg border border-signalDim bg-bg/60 px-4 py-3 font-body text-sm leading-relaxed text-muted">
                {t("approvalNote")}
              </p>
            </Section>
          </div>
          )}
        </div>
      )}

      {/* Step 7 — Analysis Memory Engine stats (session-scoped, no database) */}
      <div className="mt-10 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
          {t("intel.memoryTitle")}
        </h2>
        {memStats && memStats.count > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-5">
            <p className="font-body text-xs text-muted">
              {t("intel.memoryKnown")}
              <span className="metric mt-0.5 block text-xl text-ink">
                {nf.format(memStats.knownCount ?? memStats.count)}
              </span>
            </p>
            <p className="font-body text-xs text-muted">
              {t("intel.memoryUnknown")}
              <span className="metric mt-0.5 block text-xl text-ink">
                {nf.format(memStats.unknownCount ?? 0)}
              </span>
            </p>
            <p className="font-body text-xs text-muted">
              {t("intel.memoryAvgConfidence")}
              <span className="metric mt-0.5 block text-xl text-ink">
                {nf.format(Math.round(memStats.avgConfidence * 100))}{pct}
              </span>
            </p>
            <p className="font-body text-xs text-muted">
              {t("intel.memoryTopDomains")}
              <span className="mt-1 flex flex-wrap gap-1.5">
                {Object.entries(memStats.byDomain)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([d, n]) => (
                    <span
                      key={d}
                      className="rounded-full border border-line px-2 py-0.5 font-body text-[0.65rem] text-ink"
                    >
                      {t(`domains.${d}`)} <span className="font-mono text-muted">{nf.format(n)}</span>
                    </span>
                  ))}
              </span>
            </p>
            <p className="font-body text-xs text-muted">
              {t("intel.memoryGuardrails")}
              <span className="metric mt-0.5 block text-xl text-ink">
                {nf.format(memStats.guardrailHits)}
              </span>
            </p>
          </div>
        ) : (
          <p className="mt-3 font-body text-xs text-muted">{t("intel.memoryEmpty")}</p>
        )}
        <p className="mt-4 border-t border-line pt-3 font-body text-[0.7rem] text-muted/70">
          {t("intel.memoryNote")}
        </p>
      </div>
    </div>
  );
}
