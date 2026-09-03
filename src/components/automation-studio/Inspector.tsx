"use client";

/**
 * PHASE 109-C1 — the inspector.
 *
 * Four tabs with real `tablist`/`tab`/`tabpanel` semantics. The AI review tab
 * renders deterministic, locally derived observations and states three things
 * every time it is shown: the output is AI-generated advisory, engineer
 * approval is required, and no change has been applied. No provider is called.
 */

import { useTranslations } from "next-intl";

import { cn } from "@/components/ds/cn";
import { FOCUS_RING } from "@/components/ds/a11y";
import type {
  DiagnosticFinding,
  EngineeringArtifact,
  SymbolEntry,
  SymbolReference,
} from "@/lib/automation-studio";

export type InspectorTab = "properties" | "crossReference" | "diagnostics" | "aiReview";

const TABS: readonly InspectorTab[] = ["properties", "crossReference", "diagnostics", "aiReview"];

interface InspectorProps {
  readonly tab: InspectorTab;
  readonly onTabChange: (tab: InspectorTab) => void;
  readonly artifact: EngineeringArtifact | null;
  /**
   * Checksum of the artifact AS IT NOW STANDS, edits included.
   *
   * Not read from `artifact.checksum`: that is the fixture's value and would
   * keep displaying the pre-edit digest after the engineer had changed the
   * source — an identity field that quietly lies is worse than no field.
   */
  readonly checksum: string;
  readonly symbol: SymbolEntry | null;
  readonly findings: readonly DiagnosticFinding[];
  readonly translateFinding: (finding: DiagnosticFinding) => string;
  readonly artifactPathById: ReadonlyMap<string, string>;
  readonly onNavigate: (artifactId: string, line: number) => void;
}

function ReferenceList({
  title,
  refs,
  artifactPathById,
  onNavigate,
  emptyLabel,
}: {
  title: string;
  refs: readonly SymbolReference[];
  artifactPathById: ReadonlyMap<string, string>;
  onNavigate: (artifactId: string, line: number) => void;
  emptyLabel: string;
}) {
  return (
    <div className="mb-3">
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/50">
        {title} <span className="text-white/35">({refs.length})</span>
      </h4>
      {refs.length === 0 ? (
        <p className="text-xs text-white/50">{emptyLabel}</p>
      ) : (
        <ul className="space-y-0.5">
          {refs.map((r, i) => (
            <li key={`${r.artifactId}-${r.line}-${i}`}>
              <button
                type="button"
                onClick={() => onNavigate(r.artifactId, r.line)}
                className={cn("w-full rounded px-1.5 py-1 text-start text-[11px] hover:bg-white/[0.06]", FOCUS_RING)}
              >
                <span dir="ltr" className="block truncate font-mono text-cyan-200/80">
                  {artifactPathById.get(r.artifactId) ?? r.artifactId}:{r.line}
                </span>
                <span dir="ltr" className="block truncate font-mono text-white/50">{r.context}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Inspector({
  tab,
  onTabChange,
  artifact,
  checksum,
  symbol,
  findings,
  translateFinding,
  artifactPathById,
  onNavigate,
}: InspectorProps) {
  const t = useTranslations("automationStudio");

  return (
    <section aria-label={t("a11y.regionInspector")} className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label={t("inspector.tabsLabel")} className="flex shrink-0 border-b border-white/10">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`inspector-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="inspector-panel"
            onClick={() => onTabChange(id)}
            className={cn(
              "flex-1 px-2 py-2 text-[11px]",
              tab === id ? "border-b-2 border-cyan-300 text-white" : "text-white/55 hover:text-white",
              FOCUS_RING,
            )}
          >
            {t(`inspector.${id === "crossReference" ? "crossReference" : id}`)}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="inspector-panel"
        aria-labelledby={`inspector-tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        {tab === "properties" && (
          artifact ? (
            <dl className="space-y-2 text-xs">
              {([
                ["inspector.propertyName", artifact.name],
                ["inspector.propertyPath", artifact.path],
                ["inspector.propertyKind", artifact.kind],
                ["inspector.propertyVersion", String(artifact.version)],
                ["inspector.propertyChecksum", checksum],
                ["inspector.propertyModifiedBy", artifact.modifiedBy],
              ] as const).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-[10px] uppercase tracking-wide text-white/50">{t(key)}</dt>
                  <dd dir="ltr" className="break-all font-mono text-white/85">{value}</dd>
                </div>
              ))}
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/50">{t("inspector.propertyOrigin")}</dt>
                <dd className="text-white/85">
                  {artifact.provenance
                    ? `${artifact.provenance.origin} — ${artifact.provenance.producer}`
                    : <span className="text-rose-200">{t("inspector.provenanceMissing")}</span>}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-white/50">{t("inspector.noSelection")}</p>
          )
        )}

        {tab === "crossReference" && (
          symbol ? (
            <div>
              <p className="mb-2">
                <span className="text-[10px] uppercase tracking-wide text-white/50">{t("inspector.symbolLabel")}</span>
                <br />
                <span dir="ltr" className="font-mono text-sm text-white">{symbol.name}</span>
              </p>
              <p className="mb-3 text-[11px] text-white/50">
                {symbol.declarations.length > 0
                  ? `${t("inspector.declaredIn")}: ${artifactPathById.get(symbol.declarations[0].declaredIn ?? "") ?? "—"}`
                  : t("inspector.notDeclared")}
              </p>
              <ReferenceList title={t("inspector.reads")} refs={symbol.reads} artifactPathById={artifactPathById} onNavigate={onNavigate} emptyLabel={t("inspector.noReferences")} />
              <ReferenceList title={t("inspector.writes")} refs={symbol.writes} artifactPathById={artifactPathById} onNavigate={onNavigate} emptyLabel={t("inspector.noReferences")} />
              <ReferenceList title={t("inspector.bindings")} refs={symbol.bindings} artifactPathById={artifactPathById} onNavigate={onNavigate} emptyLabel={t("inspector.noReferences")} />
              <ReferenceList title={t("inspector.alarms")} refs={symbol.alarms} artifactPathById={artifactPathById} onNavigate={onNavigate} emptyLabel={t("inspector.noReferences")} />
            </div>
          ) : (
            <p className="text-xs text-white/50">{t("inspector.noSelection")}</p>
          )
        )}

        {tab === "diagnostics" && (
          findings.length === 0 ? (
            <p className="text-xs text-white/50">{t("bottom.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {findings.map((f, i) => (
                <li key={`${f.code}-${i}`} className="rounded border border-white/10 p-2">
                  <p className="mb-0.5 text-[10px] uppercase tracking-wide text-white/50">
                    {t(`severity.${f.severity}`)} · <span dir="ltr" className="font-mono">{f.code}</span>
                  </p>
                  <p className="text-xs text-white/85">{translateFinding(f)}</p>
                </li>
              ))}
            </ul>
          )
        )}

        {tab === "aiReview" && (
          <div>
            {/* Stated every time, not once at first render. */}
            <div className="mb-3 rounded border border-amber-300/25 bg-amber-300/5 p-2">
              <p className="text-[11px] font-semibold text-amber-100">{t("ai.generated")}</p>
              <p className="text-[11px] text-amber-100/80">{t("ai.approval")}</p>
              <p className="text-[11px] text-amber-100/80">{t("ai.noChange")}</p>
            </div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">{t("ai.heading")}</h4>
            <ul className="mb-3 space-y-2 text-xs text-white/80">
              <li className="rounded border border-white/10 p-2">{t("ai.findingTimeout")}</li>
              <li className="rounded border border-white/10 p-2">{t("ai.findingInterlock")}</li>
              <li className="rounded border border-white/10 p-2">{t("ai.findingValve")}</li>
            </ul>
            <p className="text-[11px] text-white/50">{t("ai.note")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
