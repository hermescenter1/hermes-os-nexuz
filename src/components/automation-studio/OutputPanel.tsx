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
import type { DiagnosticFinding, SymbolEntry, TestScenario, ValidationRun } from "@/lib/automation-studio";

export type OutputTab = "problems" | "validation" | "references" | "tests" | "output";

const TABS: readonly OutputTab[] = ["problems", "validation", "references", "tests", "output"];

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
                    <span className="ms-2 text-white/50">{r.access}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-3 text-xs text-white/50">{t("inspector.noSelection")}</p>
          )
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
