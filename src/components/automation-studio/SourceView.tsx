"use client";

/**
 * PHASE 109-C1 (Round 1.1) — the source surface.
 *
 * Round 1 rendered source into an <ol> and could not be typed into, while the
 * chrome claimed the draft was editable. This is the honest version: a real,
 * labelled, keyboard-accessible textarea for artifacts that may be edited, and
 * a read-only presentation for those that may not — with the REASON shown.
 *
 * It is still not an IDE, and says so. See `editor-adapter.ts` for why Monaco is
 * deferred (no editor dependency in the repository, and `worker-src 'none'` in
 * the platform CSP).
 *
 * The source region is `dir="ltr"` unconditionally. Under a Persian page the
 * chrome is right-to-left, but SCL, line numbers and identifiers must not be
 * bidirectionally reordered — an engineer reading `#Motor_101_RunFb` mirrored
 * would be reading a different symbol.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/components/ds/cn";
import { FOCUS_RING } from "@/components/ds/a11y";
import type {
  DiagnosticFinding,
  EditRefusal,
  EngineeringArtifact,
  SaveState,
} from "@/lib/automation-studio";
import { linesOf } from "@/lib/automation-studio";
import {
  FALLBACK_EDITOR_ADAPTER,
  findInDocument,
  markersForArtifact,
  type EditorDocument,
} from "./editor-adapter";

interface SourceViewProps {
  readonly openArtifacts: readonly EngineeringArtifact[];
  readonly activeArtifact: EngineeringArtifact | null;
  /** Current source, already carrying any local edits. Null when non-textual. */
  readonly source: string | null;
  readonly findings: readonly DiagnosticFinding[];
  readonly translateFinding: (finding: DiagnosticFinding) => string;
  readonly onActivate: (artifactId: string) => void;
  readonly onClose: (artifactId: string) => void;
  readonly highlightLine: number | null;
  /** null when the artifact may be edited; otherwise why it may not. */
  readonly refusal: EditRefusal | null;
  readonly onChange: (next: string) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onSave: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly saveState: SaveState;
}

export function SourceView({
  openArtifacts,
  activeArtifact,
  source,
  findings,
  translateFinding,
  onActivate,
  onClose,
  highlightLine,
  refusal,
  onChange,
  onUndo,
  onRedo,
  onSave,
  canUndo,
  canRedo,
  saveState,
}: SourceViewProps) {
  const t = useTranslations("automationStudio");
  const [query, setQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const doc: EditorDocument | null = useMemo(() => {
    if (!activeArtifact || source === null) return null;
    return {
      artifactId: activeArtifact.id,
      name: activeArtifact.name,
      path: activeArtifact.path,
      language: "scl",
      lines: linesOf(source),
      readOnly: refusal !== null,
    };
  }, [activeArtifact, source, refusal]);

  const markers = useMemo(
    () => (activeArtifact ? markersForArtifact(findings, activeArtifact.id, translateFinding) : []),
    [findings, activeArtifact, translateFinding],
  );
  const markerByLine = useMemo(() => {
    const map = new Map<number, (typeof markers)[number]>();
    for (const m of markers) if (!map.has(m.line)) map.set(m.line, m);
    return map;
  }, [markers]);

  const hits = useMemo(() => (doc ? findInDocument(doc, query) : []), [doc, query]);

  /* Scroll the requested line into view when a diagnostic or reference is
     followed. Textareas cannot anchor to a child, so the caret is placed at the
     start of that line, which also puts the keyboard user where they asked. */
  useEffect(() => {
    if (highlightLine === null || !doc || refusal !== null) return;
    const area = textareaRef.current;
    if (!area) return;
    const offset = doc.lines.slice(0, highlightLine - 1).reduce((n, l) => n + l.length + 1, 0);
    area.setSelectionRange(offset, offset);
  }, [highlightLine, doc, refusal]);

  const caps = FALLBACK_EDITOR_ADAPTER.capabilities;
  const editable = refusal === null && doc !== null;

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) { event.preventDefault(); onUndo(); }
    else if ((key === "z" && event.shiftKey) || key === "y") { event.preventDefault(); onRedo(); }
    else if (key === "s") { event.preventDefault(); onSave(); }
  };

  return (
    <section aria-label={t("a11y.regionEditor")} className="flex h-full min-h-0 flex-col">
      {openArtifacts.length > 0 && (
        <div
          role="tablist"
          aria-label={t("editor.tabsLabel")}
          className="flex shrink-0 items-stretch gap-px overflow-x-auto border-b border-white/10 bg-black/20"
        >
          {openArtifacts.map((artifact) => {
            const active = artifact.id === activeArtifact?.id;
            return (
              <div key={artifact.id} className="flex items-stretch">
                <button
                  type="button"
                  role="tab"
                  id={`source-tab-${artifact.id}`}
                  aria-selected={active}
                  aria-controls="source-tabpanel"
                  onClick={() => onActivate(artifact.id)}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap px-3 py-1.5 text-xs",
                    active ? "bg-white/[0.08] text-white" : "text-white/60 hover:text-white",
                    FOCUS_RING,
                  )}
                >
                  <span dir="ltr">{artifact.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onClose(artifact.id)}
                  aria-label={`${t("editor.closeTab")}: ${artifact.name}`}
                  className={cn("px-1.5 text-xs text-white/50 hover:text-white", FOCUS_RING)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!doc ? (
        <p className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-white/50">
          {activeArtifact ? t("editor.nonTextual") : t("editor.noSelection")}
        </p>
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 px-3 py-1.5 text-[11px] text-white/50">
            <span dir="ltr" className="font-mono">{doc.path}</span>

            {/* The save state is DERIVED from content; it never says "saved"
                for work that has not been saved. */}
            <span
              id="studio-save-state"
              /*
                The save state as a VALUE beside the translated label. A harness
                that had to read the label would need every locale's wording,
                and would go green the day a translation changed. The label is
                for the engineer; this attribute is for anything that has to
                check the state mechanically.
              */
              data-save-state={saveState}
              data-artifact-id={activeArtifact?.id}
              className={cn(
                "rounded px-1.5 py-0.5",
                saveState === "modified" && "bg-amber-400/15 text-amber-100",
                saveState === "locallySaved" && "bg-emerald-400/15 text-emerald-100",
                saveState === "unchanged" && "text-white/50",
              )}
            >
              {t(`editor.save.${saveState}`)}
            </span>

            {refusal && (
              <span className="text-amber-200">{t(`editor.refusal.${refusal}`)}</span>
            )}

            {editable && (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className={cn("rounded px-1.5 py-0.5 hover:bg-white/10 disabled:opacity-40", FOCUS_RING)}
                >
                  {t("editor.undo")}
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className={cn("rounded px-1.5 py-0.5 hover:bg-white/10 disabled:opacity-40", FOCUS_RING)}
                >
                  {t("editor.redo")}
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  className={cn("rounded px-1.5 py-0.5 hover:bg-white/10", FOCUS_RING)}
                >
                  {t("editor.saveLocally")}
                </button>
              </span>
            )}

            <span className="ms-auto flex items-center gap-2">
              <label htmlFor="studio-find" className="sr-only">{t("editor.findLabel")}</label>
              <input
                id="studio-find"
                type="text"
                value={query}
                maxLength={128}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("editor.findPlaceholder")}
                className={cn(
                  "w-32 rounded border border-white/15 bg-black/30 px-2 py-0.5 text-[11px] text-white placeholder:text-white/30",
                  FOCUS_RING,
                )}
              />
              {query.trim().length > 0 && (
                <span aria-live="polite">{t("editor.findResults", { count: hits.length })}</span>
              )}
            </span>
          </div>

          <div
            id="source-tabpanel"
            role="tabpanel"
            aria-labelledby={activeArtifact ? `source-tab-${activeArtifact.id}` : undefined}
            /*
              Focusable only when it has to be. The editable branch contains a
              textarea, so a tab stop on the panel itself would just be an extra
              press on the way to the code. The read-only branch contains nothing
              focusable, so without this a keyboard user could reach the tabs and
              then have no way to scroll the source they name — and it gives
              "go to definition" somewhere real to land when the declaration
              lives in an artifact with no editable source.
            */
            tabIndex={editable ? -1 : 0}
            className="min-h-0 flex-1 overflow-auto bg-black/30"
            dir="ltr"
          >
            {editable ? (
              <div className="flex min-h-full">
                {/* Line numbers as a separate, decorative column. They are
                    aria-hidden: the textarea already exposes the text, and a
                    screen reader announcing every number would be noise. */}
                <ol
                  aria-hidden="true"
                  className="shrink-0 select-none border-e border-white/5 px-2 py-2 text-end font-mono text-[12.5px] leading-[1.55] text-white/30"
                >
                  {doc.lines.map((_, i) => {
                    const n = i + 1;
                    const marker = markerByLine.get(n);
                    return (
                      <li key={n} className={cn(marker && (marker.severity === "error" ? "text-rose-300" : "text-amber-300"))}>
                        {marker ? (marker.severity === "error" ? "✕ " : "! ") : ""}{n}
                      </li>
                    );
                  })}
                </ol>
                <textarea
                  ref={textareaRef}
                  id="studio-source-editor"
                  aria-label={`${t("editor.label")}: ${doc.name}`}
                  aria-describedby="studio-editor-capabilities"
                  spellCheck={false}
                  wrap="off"
                  dir="ltr"
                  value={source ?? ""}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  className={cn(
                    "min-h-full w-full resize-none bg-transparent px-3 py-2 font-mono text-[12.5px]",
                    "leading-[1.55] text-white/85 outline-none",
                    FOCUS_RING,
                  )}
                />
              </div>
            ) : (
              <ol className="min-w-max py-2 font-mono text-[12.5px] leading-[1.55]">
                {doc.lines.map((line, i) => {
                  const n = i + 1;
                  const marker = markerByLine.get(n);
                  return (
                    <li
                      key={n}
                      id={`studio-line-${n}`}
                      className={cn("flex items-start gap-3 px-3", highlightLine === n && "bg-cyan-400/10")}
                    >
                      <span className="w-10 shrink-0 select-none text-end text-white/30" aria-hidden="true">{n}</span>
                      <span className="w-4 shrink-0 select-none text-center" aria-hidden="true">
                        {marker ? (marker.severity === "error" ? "✕" : "!") : ""}
                      </span>
                      <code className="whitespace-pre text-white/85">{line === "" ? " " : line}</code>
                      {marker && (
                        <span className="sr-only">
                          {t(`severity.${marker.severity}`)} {marker.code}: {marker.message}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <p id="studio-editor-capabilities" className="shrink-0 border-t border-white/10 px-3 py-1.5 text-[11px] text-white/50">
            <span className="font-medium text-white/60">{t("editor.capabilities")}: </span>
            {t("editor.adapterDescription")}
            <span className="sr-only">
              {" "}
              {caps.editable ? t("editor.available") : t("editor.unavailable")}
            </span>
          </p>
        </>
      )}
    </section>
  );
}
