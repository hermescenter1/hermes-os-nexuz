"use client";

/**
 * PHASE 109-C-UI.1 — the artifact surface.
 *
 * The central pane for an artifact that has no textual source: HMI screens,
 * faceplates, alarm and trend lists, SCADA areas, historians and reports, tag
 * tables, data blocks, UDTs, test scenarios and documents. Fourteen of the
 * eighteen artifacts in the project are in that set, and until now selecting any
 * of them produced one centred sentence in an empty pane.
 *
 * WHAT IS RENDERED IS WHAT THE MODEL HOLDS
 * ----------------------------------------
 * Identity, provenance, the symbols the artifact declares, the references it
 * makes (read / write / binding / alarm), the tests that cover what it touches,
 * and the findings against it. Every one of those is read from
 * `buildArtifactDossier`, which is a projection of committed fixture data.
 *
 * There is no process value here, no equipment state, no live alarm list, no
 * trend curve and no screen mimic — because none of those exist in the contract.
 * A trend artifact shows the points it binds, not a plotted series; an alarm
 * list shows the alarm references and whether each carries a priority, not an
 * active-alarm queue. Drawing the picture an engineer expects from a runtime,
 * from data that is not there, is exactly the overclaim the product contract
 * forbids everywhere else.
 *
 * The artifact NAME, PATH, symbol names and reference context are identifiers
 * and stay `dir="ltr"` under the Persian page, for the same reason the source
 * view does: a mirrored identifier is a different identifier.
 */

import { useTranslations } from "next-intl";

import { cn } from "@/components/ds/cn";
import { FOCUS_RING } from "@/components/ds/a11y";
import type {
  ArtifactDossier,
  DiagnosticFinding,
  SymbolReference,
} from "@/lib/automation-studio";
import { KIND_MESSAGE_KEY, ORIGIN_MESSAGE_KEY } from "@/lib/automation-studio";

interface ArtifactSurfaceProps {
  readonly dossier: ArtifactDossier;
  /** Checksum of the artifact as it now stands. */
  readonly checksum: string;
  readonly findings: readonly DiagnosticFinding[];
  readonly translateFinding: (finding: DiagnosticFinding) => string;
  readonly artifactPathById: ReadonlyMap<string, string>;
  /**
   * Inspect a symbol: select it, open the inspector, and show its
   * cross-reference.
   *
   * THE DEFECT THIS REPLACES. These rows used to call a "navigate to
   * artifact + line" handler. Every reference in this dossier belongs to THIS
   * artifact — that is what the projection selects — and this artifact has no
   * textual source, so the navigation re-selected the pane the reader was
   * already looking at and highlighted a line that is never rendered. The
   * control moved nothing, and from the default Properties tab it changed
   * nothing visible either. A row that looks like a control must do what it
   * looks like it does; the honest action here is "inspect this symbol".
   *
   * Absent on the companion, where there is no inspector to open — so the same
   * row renders as text rather than as a control that would do nothing.
   */
  readonly onInspectSymbol?: (name: string) => void;
  /** Companion trades the two-column grid for a single column and taller rows. */
  readonly variant?: "workspace" | "companion";
  /**
   * Why there is no editor here, in the reader's language.
   *
   * It is a PROP rather than a constant because the two callers have different
   * true answers: in the workspace the artifact genuinely has no textual source,
   * while on the companion a program block does have source and simply cannot be
   * edited on a phone. One hard-coded sentence would have been wrong for one of
   * them, and the wrong one is the kind of small false statement this product
   * spends the rest of its effort avoiding.
   */
  readonly sourceNote: string;
  /** Empty-state label for a reference group. Artifact-scoped, not symbol-scoped. */
  readonly noReferencesLabel: string;
}

/** Section heading. One level below the artifact name. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">
      {children}
    </h4>
  );
}

function ReferenceGroup({
  title,
  refs,
  emptyLabel,
  onInspectSymbol,
  inspectLabel,
  touchClass,
}: {
  title: string;
  refs: readonly SymbolReference[];
  emptyLabel: string;
  onInspectSymbol?: (name: string) => void;
  inspectLabel: string;
  touchClass: string;
}) {
  if (refs.length === 0) {
    return (
      <div className="mb-4">
        <SectionHeading>
          {title} <span className="text-white/50">(0)</span>
        </SectionHeading>
        <p className="text-[11px] text-white/50">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <SectionHeading>
        {title} <span className="text-white/50">({refs.length})</span>
      </SectionHeading>
      <ul className="space-y-0.5">
        {refs.map((reference, i) => {
          const body = (
            <>
              <span dir="ltr" className="block truncate font-mono text-[12px] text-cyan-200/85">
                {reference.symbolName}
                <span className="text-white/50"> · {reference.line}</span>
              </span>
              <span dir="ltr" className="block truncate font-mono text-[11px] text-white/50">
                {reference.context}
              </span>
            </>
          );
          const key = `${reference.symbolName}-${reference.line}-${i}`;
          // A row is a control only when pressing it does something. On the
          // companion there is no inspector to open, so the same row is text.
          return (
            <li key={key}>
              {onInspectSymbol ? (
                <button
                  type="button"
                  // Named for what it does, not for where the row sits.
                  aria-label={`${inspectLabel}: ${reference.symbolName}`}
                  onClick={() => onInspectSymbol(reference.symbolName)}
                  className={cn(
                    "w-full rounded px-2 py-1 text-start hover:bg-white/[0.06]",
                    touchClass,
                    FOCUS_RING,
                  )}
                >
                  {body}
                </button>
              ) : (
                <div className={cn("rounded px-2 py-1", touchClass)}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ArtifactSurface({
  dossier,
  checksum,
  findings,
  translateFinding,
  artifactPathById,
  onInspectSymbol,
  variant = "workspace",
  sourceNote,
  noReferencesLabel,
}: ArtifactSurfaceProps) {
  const t = useTranslations("automationStudio");
  const { artifact, declaredSymbols, reads, writes, bindings, alarms, relatedTests } = dossier;
  const companion = variant === "companion";
  // 44 px minimum hit area on touch; the desktop rows stay dense on purpose.
  const touchClass = companion ? "flex min-h-[44px] flex-col justify-center" : "";
  const provenance = artifact.provenance;

  return (
    <div
      data-studio-artifact-surface={artifact.id}
      data-artifact-kind={artifact.kind}
      data-artifact-discipline={dossier.discipline}
      className={cn("min-h-0", companion ? "text-xs" : "px-5 py-4 text-xs")}
    >
      {/* ── identity ─────────────────────────────────────────────────────── */}
      <p className="mb-1 text-[11px] uppercase tracking-wide text-cyan-200/80">
        {t(`kinds.${KIND_MESSAGE_KEY[artifact.kind]}`)}
      </p>
      <h3 dir="ltr" className="mb-1 font-mono text-base font-semibold text-white">
        {artifact.name}
      </h3>
      <p dir="ltr" className="mb-3 break-all font-mono text-[11px] text-white/50">
        {artifact.path}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {artifact.readOnly && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/80">
            {t("artifact.readOnlyBadge")}
          </span>
        )}
        {!provenance && (
          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] text-rose-100">
            {t("inspector.provenanceMissing")}
          </span>
        )}
        <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-white/80">
          {t("artifact.referenceTotal", { count: dossier.referenceCount })}
        </span>
      </div>

      {/*
        Stated plainly rather than implied by the absence of an editor: this
        artifact kind carries no textual source in this round, which is why
        there is nothing to type into.
      */}
      <p className="mb-5 rounded border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-white/70">
        {sourceNote}
      </p>

      <div className={cn(companion ? "space-y-5" : "grid gap-x-8 gap-y-1 md:grid-cols-2")}>
        <div>
          <SectionHeading>{t("artifact.identityHeading")}</SectionHeading>
          <dl className="mb-4 space-y-2">
            {([
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
              <dt className="text-[10px] uppercase tracking-wide text-white/50">
                {t("inspector.propertyOrigin")}
              </dt>
              {/*
                The ORIGIN is a word and is translated; the PRODUCER is an
                adapter identifier and stays LTR and untranslated. Rendering the
                pair inside one `dir="ltr"` span put the Persian and German
                origin label into a left-to-right run beside an English
                identifier — and before that, the raw union member `simulated`
                was the visible text in all three locales.
              */}
              <dd className="text-white/85" data-origin={provenance?.origin ?? "none"}>
                {provenance ? (
                  <>
                    <span>{t(`origins.${ORIGIN_MESSAGE_KEY[provenance.origin]}`)}</span>
                    <span className="text-white/50"> · </span>
                    <span dir="ltr" className="font-mono">{provenance.producer}</span>
                  </>
                ) : (
                  <span className="text-rose-200">{t("inspector.provenanceMissing")}</span>
                )}
              </dd>
            </div>
            {provenance && provenance.disclosure.trim().length > 0 && (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/50">
                  {t("artifact.disclosureLabel")}
                </dt>
                {/*
                  The record's disclosure is adapter-authored data and it is
                  written in English by the local demo adapter. Rendering it
                  verbatim put an English paragraph in the middle of the Persian
                  and German pages — measured, not supposed: it is visible in
                  `screenshots/after-fa-1440x900-hmiScreen.png` from the run
                  before this correction.

                  So the READER gets the product's own disclosure in their
                  language, shown only when the record actually carries one, and
                  the record's exact text stays machine-readable on the
                  attribute. The condition is what preserves the meaning: an
                  artifact with an empty disclosure (AES-C1-010) still shows
                  nothing here rather than borrowing a sentence it never had.
                */}
                <dd
                  className="text-white/70"
                  data-provenance-disclosure={provenance.disclosure}
                >
                  {t("disclosure.body")}
                </dd>
              </div>
            )}
          </dl>

          <div className="mb-4">
            <SectionHeading>
              {t("artifact.declaredSymbols")}{" "}
              <span className="text-white/50">({declaredSymbols.length})</span>
            </SectionHeading>
            {declaredSymbols.length === 0 ? (
              <p className="text-[11px] text-white/50">{t("artifact.noDeclaredSymbols")}</p>
            ) : (
              <ul className="space-y-0.5">
                {declaredSymbols.map((declaration) => {
                  const body = (
                    <>
                      <span dir="ltr" className="block truncate font-mono text-[12px] text-white/85">
                        {declaration.name}
                        <span className="text-white/50"> : {declaration.dataType}</span>
                      </span>
                      <span className="block truncate text-[11px] text-white/50">
                        {t(`symbols.scope${
                          declaration.scope === "global" ? "Global"
                          : declaration.scope === "block-local" ? "BlockLocal"
                          : declaration.scope === "hmi" ? "Hmi" : "Scada"
                        }`)}
                        {" · "}
                        {declaration.engineeringUnit
                          ? `${t("symbols.unit")}: ${declaration.engineeringUnit}`
                          : t("symbols.noUnit")}
                        {declaration.writable ? "" : ` · ${t("artifact.readOnlyBadge")}`}
                      </span>
                    </>
                  );
                  return (
                    <li key={declaration.id}>
                      {onInspectSymbol ? (
                        <button
                          type="button"
                          aria-label={`${t("artifact.inspectSymbol")}: ${declaration.name}`}
                          onClick={() => onInspectSymbol(declaration.name)}
                          className={cn(
                            "w-full rounded px-2 py-1 text-start hover:bg-white/[0.06]",
                            touchClass,
                            FOCUS_RING,
                          )}
                        >
                          {body}
                        </button>
                      ) : (
                        <div className={cn("rounded px-2 py-1", touchClass)}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div>
          {([
            [t("inspector.bindings"), bindings],
            [t("inspector.alarms"), alarms],
            [t("inspector.reads"), reads],
            [t("inspector.writes"), writes],
          ] as const).map(([title, refs]) => (
            <ReferenceGroup
              key={title}
              title={title}
              refs={refs}
              emptyLabel={noReferencesLabel}
              onInspectSymbol={onInspectSymbol}
              inspectLabel={t("artifact.inspectSymbol")}
              touchClass={touchClass}
            />
          ))}
        </div>
      </div>

      {/* ── findings and tests ───────────────────────────────────────────── */}
      <div className={cn(companion ? "space-y-5" : "grid gap-x-8 md:grid-cols-2")}>
        <div className="mb-4">
          <SectionHeading>
            {t("artifact.findingsHeading")} <span className="text-white/50">({findings.length})</span>
          </SectionHeading>
          {findings.length === 0 ? (
            <p className="text-[11px] text-white/50">{t("artifact.noFindings")}</p>
          ) : (
            <ul className="space-y-1.5">
              {findings.map((f, i) => (
                <li key={`${f.code}-${i}`} className="rounded border border-white/10 p-2">
                  <p className="mb-0.5 text-[10px] uppercase tracking-wide text-white/50">
                    {t(`severity.${f.severity}`)} · <span dir="ltr" className="font-mono">{f.code}</span>
                  </p>
                  <p className="text-[11px] text-white/85">{translateFinding(f)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mb-4">
          <SectionHeading>
            {t("artifact.relatedTests")} <span className="text-white/50">({relatedTests.length})</span>
          </SectionHeading>
          {relatedTests.length === 0 ? (
            <p className="text-[11px] text-white/50">{t("artifact.noRelatedTests")}</p>
          ) : (
            <ul className="space-y-1.5">
              {relatedTests.map((test) => (
                <li key={test.id} className="rounded border border-white/10 p-2 text-[11px]">
                  <p className="flex flex-wrap items-center gap-2">
                    <span dir="ltr" className="font-mono text-white/85">{test.name}</span>
                    <span
                      className={cn(
                        "rounded px-1 text-[10px]",
                        test.status === "passed" && "bg-emerald-400/15 text-emerald-200",
                        test.status === "failed" && "bg-rose-500/20 text-rose-200",
                        test.status === "not-run" && "bg-white/10 text-white/70",
                      )}
                    >
                      {t(`tests.${test.status === "not-run" ? "notRun" : test.status}`)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-white/70">{t(test.description)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Where this artifact sits. Path-derived, so it cannot disagree with the
          explorer, which derives its folders from the same string. */}
      <p className="text-[11px] text-white/50">
        <span className="uppercase tracking-wide">{t("artifact.locationLabel")}: </span>
        <span dir="ltr" className="font-mono">
          {artifactPathById.get(artifact.id) ?? artifact.path}
        </span>
      </p>
    </div>
  );
}
