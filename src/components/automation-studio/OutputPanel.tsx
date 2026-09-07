"use client";

/**
 * PHASE 109-C1 — the bottom output panel.
 *
 * Every problem row carries severity, code, message, source path and line — the
 * five things an engineer needs to act. Severity is a word, not a colour.
 */

import { useTranslations } from "next-intl";

import { cn } from "@/components/ds/cn";
import { FOCUS_RING } from "@/components/ds/a11y";
import type {
  DiagnosticFinding,
  EngineeringArtifact,
  ProjectVersion,
  SymbolEntry,
  TestScenario,
  ValidationRun,
} from "@/lib/automation-studio";

export type OutputTab = "problems" | "validation" | "references" | "changes" | "tests" | "output";

const TABS: readonly OutputTab[] = ["problems", "validation", "references", "changes", "tests", "output"];

/** Approval state to its message key. Exhaustive over the contract's union. */
const APPROVAL_KEY = {
  draft: "draft",
  reviewed: "reviewed",
  approved: "approved",
  commissioned: "commissioned",
} as const;

interface OutputPanelProps {
  readonly tab: OutputTab;
  readonly onTabChange: (tab: OutputTab) => void;
  readonly run: ValidationRun;
  /**
   * Which validation run is on screen, counting from 1.
   *
   * The Studio deliberately has no clock — the fixture is deterministic and a
   * timestamp would break that — so this counter is the only signal an engineer
   * has that pressing Validate produced a FRESH result rather than redisplaying
   * the previous one.
   */
  readonly runIndex: number;
  readonly translateFinding: (finding: DiagnosticFinding) => string;
  readonly tests: readonly TestScenario[];
  readonly symbol: SymbolEntry | null;
  readonly artifactPathById: ReadonlyMap<string, string>;
  readonly onNavigate: (artifactId: string, line: number) => void;
  /**
   * Every version the workspace knows, newest last, plus what THIS session has
   * changed. Round 1 rendered neither: the catalogue already carried the whole
   * versions vocabulary and nothing on screen used it, so an engineer could not
   * see which artifacts differ from the baseline without opening each one.
   */
  readonly versions: readonly ProjectVersion[];
  readonly workingVersionId: string;
  readonly baselineVersionId: string;
  /** Artifacts edited in this browser session, from the edit model. */
  readonly locallyModified: readonly EngineeringArtifact[];
}

export function OutputPanel({
  tab,
  onTabChange,
  run,
  runIndex,
  translateFinding,
  tests,
  symbol,
  artifactPathById,
  onNavigate,
  versions,
  workingVersionId,
  baselineVersionId,
  locallyModified,
}: OutputPanelProps) {
  const t = useTranslations("automationStudio");

  return (
    <section aria-label={t("a11y.regionOutput")} className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label={t("bottom.tabsLabel")} className="flex shrink-0 gap-px border-b border-white/10 bg-black/20">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`output-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="output-panel"
            onClick={() => onTabChange(id)}
            className={cn(
              "px-3 py-1.5 text-[11px]",
              tab === id ? "bg-white/[0.08] text-white" : "text-white/55 hover:text-white",
              FOCUS_RING,
            )}
          >
            {t(`bottom.${id}`)}
            {id === "problems" && run.findings.length > 0 && (
              <span className="ms-1.5 rounded bg-rose-500/20 px-1 text-[10px] text-rose-200">
                {run.findings.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="output-panel"
        aria-labelledby={`output-tab-${tab}`}
        className="min-h-0 flex-1 overflow-auto"
      >
        {tab === "problems" && (
          run.findings.length === 0 ? (
            <p className="p-3 text-xs text-white/50">{t("bottom.empty")}</p>
          ) : (
            <table className="w-full text-start text-[11px]">
              <caption className="sr-only">{t("bottom.problems")}</caption>
              <thead className="sticky top-0 bg-black/40 text-white/50">
                <tr>
                  <th scope="col" className="px-3 py-1 text-start font-medium">{t("bottom.columnSeverity")}</th>
                  <th scope="col" className="px-2 py-1 text-start font-medium">{t("bottom.columnCode")}</th>
                  <th scope="col" className="px-2 py-1 text-start font-medium">{t("bottom.columnMessage")}</th>
                  <th scope="col" className="px-2 py-1 text-start font-medium">{t("bottom.columnSource")}</th>
                  <th scope="col" className="px-2 py-1 text-start font-medium">{t("bottom.columnLine")}</th>
                </tr>
              </thead>
              <tbody>
                {run.findings.map((f, i) => (
                  <tr key={`${f.code}-${i}`} className="border-t border-white/5 hover:bg-white/[0.04]">
                    <td className="whitespace-nowrap px-3 py-1">
                      <span className={cn(f.severity === "error" ? "text-rose-200" : "text-amber-200")}>
                        {t(`severity.${f.severity}`)}
                      </span>
                    </td>
                    <td dir="ltr" className="whitespace-nowrap px-2 py-1 font-mono text-white/55">{f.code}</td>
                    <td className="px-2 py-1 text-white/85">{translateFinding(f)}</td>
                    <td dir="ltr" className="px-2 py-1 font-mono text-white/50">
                      {f.artifactId && f.line ? (
                        <button
                          type="button"
                          onClick={() => onNavigate(f.artifactId!, f.line!)}
                          className={cn("text-cyan-200/80 underline-offset-2 hover:underline", FOCUS_RING)}
                        >
                          {f.artifactPath ?? f.artifactId}
                        </button>
                      ) : (
                        f.artifactPath ?? "—"
                      )}
                    </td>
                    <td dir="ltr" className="px-2 py-1 font-mono text-white/50">{f.line ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === "validation" && (
          <div className="space-y-2 p-3 text-xs text-white/70">
            <p id="validation-run-index" className="font-medium text-white/80">
              {t("bottom.runLabel", { run: runIndex })}
            </p>
            <p>
              {t("bottom.checked", {
                artifacts: run.checkedArtifacts,
                symbols: run.checkedSymbols,
                references: run.checkedReferences,
              })}
            </p>
            {run.passedCodes.length > 0 && (
              <p dir="ltr" className="font-mono text-[11px] text-emerald-200/80">
                {t("bottom.passedChecks", { codes: run.passedCodes.join(", ") })}
              </p>
            )}
            {/*
              Stated in the product, not only in the report: the Round 1 rule
              set reads the project model. An engineer who types a fault into
              the editor and sees no new problem must be able to tell that from
              the tool itself rather than concluding the code is clean.
            */}
            <p id="validation-scope-note" className="text-white/50">
              {t("bottom.scopeNote")}
            </p>
          </div>
        )}

        {tab === "references" && (
          symbol ? (
            <ul className="p-2">
              {symbol.all.map((r, i) => (
                <li key={`${r.artifactId}-${r.line}-${i}`}>
                  <button
                    type="button"
                    onClick={() => onNavigate(r.artifactId, r.line)}
                    className={cn("w-full rounded px-2 py-1 text-start text-[11px] hover:bg-white/[0.06]", FOCUS_RING)}
                  >
                    <span dir="ltr" className="font-mono text-cyan-200/80">
                      {artifactPathById.get(r.artifactId) ?? r.artifactId}:{r.line}
                    </span>
                    {/* Translated. The raw union member was an English
                        identifier rendered verbatim in all three locales. */}
                    <span className="ms-2 text-white/50">{t(`access.${r.access}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-3 text-xs text-white/50">{t("inspector.noSelection")}</p>
          )
        )}

        {tab === "changes" && (
          <div className="space-y-4 p-3">
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">
                {t("versions.title")}
              </h3>
              <ul className="space-y-1.5">
                {[...versions].reverse().map((version) => (
                  <li key={version.id} className="rounded border border-white/10 p-2 text-[11px]">
                    <p className="flex flex-wrap items-center gap-2">
                      <span dir="ltr" className="font-mono text-white/85">{version.label}</span>
                      <span className="rounded bg-white/10 px-1 text-[10px] text-white/80">
                        {t(`versions.${APPROVAL_KEY[version.approval]}`)}
                      </span>
                      {version.id === workingVersionId && (
                        <span className="rounded bg-cyan-400/15 px-1 text-[10px] text-cyan-100">
                          {t("versions.working")}
                        </span>
                      )}
                      {version.id === baselineVersionId && (
                        <span className="rounded bg-white/[0.07] px-1 text-[10px] text-white/80">
                          {t("versions.baseline")}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-white/70">{t(version.summaryKey)}</p>
                    <p className="mt-0.5 text-white/50">
                      {t("versions.author")}: <span dir="ltr">{version.author}</span>
                      {" · "}
                      {t("versions.modifiedCount", { count: version.modifiedArtifactIds.length })}
                    </p>
                    {version.modifiedArtifactIds.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {version.modifiedArtifactIds.map((artifactId) => (
                          <li key={artifactId}>
                            <button
                              type="button"
                              onClick={() => onNavigate(artifactId, 1)}
                              className={cn(
                                "w-full truncate rounded px-1.5 py-0.5 text-start font-mono text-[11px] text-cyan-200/80 hover:bg-white/[0.06]",
                                FOCUS_RING,
                              )}
                            >
                              <span dir="ltr">{artifactPathById.get(artifactId) ?? artifactId}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">
                {t("versions.locallyModified")}{" "}
                <span className="text-white/50">({locallyModified.length})</span>
              </h3>
              {locallyModified.length === 0 ? (
                <p className="text-[11px] text-white/50">{t("versions.noLocalChanges")}</p>
              ) : (
                <ul className="space-y-0.5">
                  {locallyModified.map((artifact) => (
                    <li key={artifact.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate(artifact.id, 1)}
                        className={cn(
                          "w-full truncate rounded px-1.5 py-0.5 text-start text-[11px] hover:bg-white/[0.06]",
                          FOCUS_RING,
                        )}
                      >
                        <span dir="ltr" className="font-mono text-cyan-200/80">{artifact.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === "tests" && (
          <ul className="space-y-1 p-2">
            {tests.map((test) => (
              <li key={test.id} className="rounded border border-white/10 p-2 text-[11px]">
                <p className="flex items-center gap-2">
                  <span dir="ltr" className="font-mono text-white/85">{test.name}</span>
                  <span
                    className={cn(
                      "rounded px-1 text-[10px]",
                      test.status === "passed" && "bg-emerald-400/15 text-emerald-200",
                      test.status === "failed" && "bg-rose-500/20 text-rose-200",
                      test.status === "not-run" && "bg-white/10 text-white/60",
                    )}
                  >
                    {t(`tests.${test.status === "not-run" ? "notRun" : test.status}`)}
                  </span>
                </p>
                <p className="mt-0.5 text-white/60">{t(test.description)}</p>
                <p className="mt-0.5 text-white/50">{t("tests.covers", { count: test.coveredSymbols.length })}</p>
              </li>
            ))}
          </ul>
        )}

        {tab === "output" && (
          <p dir="ltr" className="p-3 font-mono text-[11px] text-white/60">{t("bottom.outputLine")}</p>
        )}
      </div>
    </section>
  );
}
