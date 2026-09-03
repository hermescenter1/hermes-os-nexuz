"use client";

/**
 * PHASE 109-C1 — the Automation Engineering Studio workspace.
 *
 * Desktop-first, multi-panel, keyboard-first. The layout is:
 *
 *   command bar          identity, target, version, mode, validation, palette
 *   explorer | source | inspector
 *   output panel
 *
 * At tablet width the inspector collapses; at phone width the workspace becomes
 * a COMPANION view — overview, findings and symbol lookup — rather than a
 * squeezed desktop IDE. Claiming a full engineering environment on a 320 px
 * screen would be the same kind of overclaim the product contract forbids
 * everywhere else.
 *
 * All state is local and synchronous. There is no fetch, no query client, no
 * polling and no persistence anywhere in this tree.
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/components/ds/cn";
import { FOCUS_RING } from "@/components/ds/a11y";
import {
  allFolderIds,
  applyEdit,
  applyEditsToBlocks,
  buildSymbolIndex,
  buildTree,
  canRedo as canRedoIn,
  canUndo as canUndoIn,
  countBySeverity,
  createLocalWorkspace,
  currentChecksum,
  currentSource,
  dirtyArtifactIds,
  editRefusal,
  EMPTY_EDIT_MODEL,
  findingsByArtifact,
  querySymbols,
  redo as redoIn,
  saveLocally,
  saveState as saveStateOf,
  sourceOf,
  undo as undoIn,
  validateProject,
  workspaceSaveState,
  type DiagnosticFinding,
  type EditModel,
  type EngineeringArtifact,
  type WorkspaceMode,
} from "@/lib/automation-studio";
import type { WorkspaceSourceDescriptor } from "@/lib/automation-studio";

import { CommandPalette, type PaletteCommand } from "./CommandPalette";
import { FALLBACK_EDITOR_ADAPTER } from "./editor-adapter";
import { SYMBOL_SEARCH_TARGETS, focusFirstVisible } from "./focus-target";
import { Inspector, type InspectorTab } from "./Inspector";
import { OutputPanel, type OutputTab } from "./OutputPanel";
import { ProjectExplorer } from "./ProjectExplorer";
import { SourceView } from "./SourceView";
import { rendersCompanion, rendersWorkspace, useViewportMode } from "./viewport-mode";

interface StudioWorkspaceProps {
  /** Resolved on the SERVER. The client cannot select a different source. */
  readonly source: WorkspaceSourceDescriptor;
}

type State = {
  readonly expanded: ReadonlySet<string>;
  readonly openIds: readonly string[];
  readonly activeId: string | null;
  readonly selectedSymbol: string | null;
  readonly highlightLine: number | null;
  /** Local, in-memory source edits. The single source of truth for dirtiness. */
  readonly edits: EditModel;
  /** The workspace mode lives HERE, not in a separate display variable: the
   *  edit gate reads it, so a disconnected copy would let a "read-only"
   *  workspace keep accepting edits. */
  readonly mode: WorkspaceMode;
  /** Bumped to force a fresh validation run over the edited source. */
  readonly validationEpoch: number;
};

type Action =
  | { type: "toggle"; id: string }
  | { type: "expandAll"; ids: readonly string[] }
  | { type: "collapseAll" }
  | { type: "open"; id: string }
  | { type: "activate"; id: string }
  | { type: "close"; id: string }
  | { type: "selectSymbol"; name: string | null }
  | { type: "navigate"; artifactId: string; line: number }
  | { type: "edit"; artifactId: string; baseline: string; text: string; gate: Parameters<typeof editRefusal>[0] }
  | { type: "undo"; artifactId: string }
  | { type: "redo"; artifactId: string }
  | { type: "save"; artifactId: string }
  | { type: "setMode"; mode: WorkspaceMode }
  | { type: "revalidate" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "toggle": {
      const next = new Set(state.expanded);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { ...state, expanded: next };
    }
    case "expandAll":
      return { ...state, expanded: new Set(action.ids) };
    case "collapseAll":
      return { ...state, expanded: new Set() };
    case "open":
      return {
        ...state,
        openIds: state.openIds.includes(action.id) ? state.openIds : [...state.openIds, action.id],
        activeId: action.id,
        highlightLine: null,
      };
    case "activate":
      return { ...state, activeId: action.id, highlightLine: null };
    case "close": {
      const openIds = state.openIds.filter((id) => id !== action.id);
      return {
        ...state,
        openIds,
        activeId: state.activeId === action.id ? (openIds[openIds.length - 1] ?? null) : state.activeId,
      };
    }
    case "selectSymbol":
      return { ...state, selectedSymbol: action.name };
    case "edit":
      return {
        ...state,
        edits: applyEdit(state.edits, action.artifactId, action.baseline, action.text, action.gate),
      };
    case "undo":
      return { ...state, edits: undoIn(state.edits, action.artifactId) };
    case "redo":
      return { ...state, edits: redoIn(state.edits, action.artifactId) };
    case "save":
      return { ...state, edits: saveLocally(state.edits, action.artifactId) };
    case "setMode":
      return { ...state, mode: action.mode };
    case "revalidate":
      return { ...state, validationEpoch: state.validationEpoch + 1 };
    case "navigate":
      return {
        ...state,
        openIds: state.openIds.includes(action.artifactId) ? state.openIds : [...state.openIds, action.artifactId],
        activeId: action.artifactId,
        highlightLine: action.line,
      };
    default:
      return state;
  }
}

export function StudioWorkspace({ source }: StudioWorkspaceProps) {
  const t = useTranslations("automationStudio");

  /**
   * Which responsive branch is MOUNTED. "unmeasured" on the server and during
   * hydration, when both branches render and CSS decides; after that, only the
   * branch the viewport calls for exists. The authenticated matrix found the
   * full editor's textarea in the DOM at 320 and 390 — hidden, not absent —
   * and a companion view that still contains an editor is not read-only.
   */
  const viewport = useViewportMode();

  // Built once. The demo adapter is deterministic, so this is a pure value and
  // rebuilding it per render would be waste, not freshness.
  const workspace = useMemo(() => createLocalWorkspace("simulation"), []);
  const { project } = workspace;
  const index = useMemo(() => buildSymbolIndex(project), [project]);
  const tree = useMemo(() => buildTree(project), [project]);
  const artifactById = useMemo(
    () => new Map(project.artifacts.map((a) => [a.id, a])),
    [project],
  );
  const artifactPathById = useMemo(
    () => new Map(project.artifacts.map((a) => [a.id, a.path])),
    [project],
  );
  const blockById = useMemo(
    () => new Map(project.blocks.map((b) => [b.id, b])),
    [project],
  );
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    expanded: new Set(allFolderIds(tree)),
    openIds: ["blk-fb-motor"],
    activeId: "blk-fb-motor",
    selectedSymbol: "Motor_101_RunFb",
    highlightLine: null,
    edits: EMPTY_EDIT_MODEL,
    mode: "simulation" as WorkspaceMode,
    validationEpoch: 0,
  }));

  /**
   * What is actually modified: the fixture's own working-version list PLUS
   * every artifact the engineer has edited in this session. Round 1 showed only
   * the constant, so an edit never appeared as a change.
   */
  const modifiedIds = useMemo(
    () => new Set([
      ...workspace.workingVersion.modifiedArtifactIds,
      ...dirtyArtifactIds(state.edits),
    ]),
    [workspace, state.edits],
  );

  /**
   * The project as it currently stands, edits included: the editor's text
   * replaces the fixture's source lines and the block checksum is recomputed.
   * This is what the validator is handed, so nothing downstream is reading a
   * stale copy of the workspace.
   */
  const editedProject = useMemo(
    () => ({ ...project, blocks: applyEditsToBlocks(state.edits, project.blocks) }),
    [project, state.edits],
  );

  /**
   * Validation is CONTINUOUS: this memo recomputes whenever the project it
   * validates changes, so what is on screen is always derived from the current
   * workspace. `state.validationEpoch` is listed as a dependency on top of
   * that, which the exhaustive-deps rule cannot justify and therefore flags:
   * the epoch is a deliberate cache-buster, so that a command labelled
   * "Validate workspace" genuinely performs a run rather than relabelling the
   * previous one. The cost is one pure pass of eleven rules — measured, not
   * assumed, in PERFORMANCE-EVIDENCE.txt — and the semantics stay correct when
   * a later round makes the rule set read source text.
   *
   * LIMIT OF ROUND 1, stated plainly because overstating it would be worse than
   * the limit itself: all eleven rules read the PROJECT MODEL — declared
   * symbols, references, provenance and origin — and none of them parse block
   * source text. Passing `editedProject` is correct and forward compatible, but
   * it does not yet mean a fault typed into the editor is detected. The
   * validation tab says so on screen (`bottom.scopeNote`), and `index` stays
   * derived from `project` on purpose: symbols and references are model-level
   * in Round 1, so rebuilding the index per keystroke would buy nothing and
   * would put O(project) work on the typing path.
   */
  const run = useMemo(
    () => validateProject(editedProject, workspace.workingVersion.createdAtEpochMs, index),
    // validationEpoch is an intentional cache-buster; see the note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editedProject, workspace.workingVersion.createdAtEpochMs, index, state.validationEpoch],
  );
  const findingsByArtifactId = useMemo(() => findingsByArtifact(run), [run]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("properties");
  const [outputTab, setOutputTab] = useState<OutputTab>("problems");
  const [outputOpen, setOutputOpen] = useState(true);
  const [symbolQuery, setSymbolQuery] = useState("");
  /** Which right-hand surface the palette last opened. */
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [showOverview, setShowOverview] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const translateFinding = useCallback(
    (finding: DiagnosticFinding) =>
      t(`diagnostics.${finding.messageKey}`, finding.params as Record<string, string>),
    [t],
  );

  const activeArtifact: EngineeringArtifact | null =
    state.activeId ? (artifactById.get(state.activeId) ?? null) : null;
  const activeBaseline = useMemo(() => {
    const block = state.activeId ? blockById.get(state.activeId) : undefined;
    return block ? sourceOf(block) : null;
  }, [state.activeId, blockById]);

  const activeSource =
    activeBaseline === null || !state.activeId
      ? null
      : currentSource(state.edits, state.activeId, activeBaseline);

  /** Re-evaluated on every render, so a mode change bites immediately. */
  const activeGate = {
    mode: state.mode,
    approval: workspace.workingVersion.approval,
    artifactReadOnly: activeArtifact?.readOnly ?? true,
    hasTextualSource: activeBaseline !== null,
  };
  const activeRefusal = editRefusal(activeGate);
  const selectedSymbolEntry = state.selectedSymbol
    ? (index.byName.get(state.selectedSymbol) ?? null)
    : null;

  /**
   * The checksum of what is on screen right now.
   *
   * A non-textual artifact has no baseline to edit, so its stored checksum IS
   * its current one; anything with source text is digested from the edited
   * content. The inspector must never show a digest that belongs to a version
   * the engineer can no longer see.
   */
  const activeChecksum = useMemo(() => {
    if (!activeArtifact) return "";
    if (activeBaseline === null) return activeArtifact.checksum;
    return currentChecksum(state.edits, activeArtifact, activeBaseline);
  }, [activeArtifact, activeBaseline, state.edits]);

  const artifactFindings = useMemo(
    () => (activeArtifact ? (findingsByArtifactId.get(activeArtifact.id) ?? []) : []),
    [activeArtifact, findingsByArtifactId],
  );

  const symbolResults = useMemo(
    () => querySymbols(index, { text: symbolQuery }).slice(0, 200),
    [index, symbolQuery],
  );

  const severity = countBySeverity(run);
  const activeSaveState = state.activeId ? saveStateOf(state.edits, state.activeId) : "unchanged";
  const workspaceSave = workspaceSaveState(state.edits);

  const navigate = useCallback((artifactId: string, line: number) => {
    dispatch({ type: "navigate", artifactId, line });
  }, []);

  /**
   * The pending focus move. The nonce makes two requests for the SAME id
   * distinct, so pressing "Search symbols" twice focuses the box twice.
   */
  const [focusRequest, setFocusRequest] = useState<{ ids: readonly string[]; nonce: number } | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    // Runs after commit, so a control the command just revealed exists by now.
    //
    // "Exists" is NOT the test. Until the viewport is measured, both responsive
    // branches are in the DOM and CSS decides which one is rendered, so the
    // symbol search can exist twice with one copy inside a display:none
    // subtree; once measured, only one branch is mounted and the other id is
    // simply absent. An earlier version took the first id that existed, which
    // at phone widths handed focus to a hidden desktop input: nothing threw,
    // nothing moved, and the command silently did nothing. focusFirstVisible
    // measures each candidate, skips the absent and the hidden, and confirms
    // the focus actually landed.
    focusFirstVisible(document, focusRequest.ids);
  }, [focusRequest]);

  /**
   * Move focus to a control by id.
   *
   * A command called "Search symbols" that only changes a tab has not done what
   * it says: the engineer still has to find the box. Focus IS the action.
   */
  const focusById = useCallback((...ids: readonly string[]) => {
    // A focus REQUEST, resolved in an effect below rather than in a frame
    // callback. requestAnimationFrame does not fire in a backgrounded tab, so
    // the rAF version silently dropped the focus for anyone who ran the command
    // and switched away — and it made the test depend on timer ordering, which
    // is the same defect wearing a different hat.
    setFocusRequest((prev) => ({ ids, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  /**
   * Leave the project overview.
   *
   * Every command that needs the source surface calls this FIRST. Round 1.1
   * shipped "Open artifact" and "Go to definition" without it: they updated the
   * artifact and then asked for focus on an editor that the overview branch had
   * kept unmounted, so from the overview both commands did nothing visible and
   * dropped the focus request on the floor.
   */
  const leaveOverview = useCallback(() => setShowOverview(false), []);

  const commands: readonly PaletteCommand[] = useMemo(
    () => [
      {
        id: "open-artifact",
        labelKey: "palette.openArtifact",
        enabled: true,
        run: () => {
          leaveOverview();
          dispatch({ type: "open", id: "blk-fb-motor" });
          focusById("studio-source-editor", "source-tabpanel");
        },
      },
      {
        id: "search-symbols",
        labelKey: "palette.searchSymbols",
        enabled: true,
        // Opens the symbols surface AND puts the caret in its search box.
        // Both responsive search inputs are named; the visible one wins.
        run: () => { leaveOverview(); setSymbolsOpen(true); focusById(...SYMBOL_SEARCH_TARGETS); },
      },
      {
        id: "show-diagnostics",
        labelKey: "palette.showDiagnostics",
        enabled: true,
        run: () => { setOutputOpen(true); setOutputTab("problems"); setInspectorTab("diagnostics"); },
      },
      {
        id: "go-to-definition",
        labelKey: "palette.goToDefinition",
        enabled: Boolean(selectedSymbolEntry?.declarations[0]?.declaredIn),
        disabledReasonKey: "palette.unavailableReason",
        run: () => {
          const declaration = selectedSymbolEntry?.declarations[0];
          if (!declaration?.declaredIn) return;
          leaveOverview();
          navigate(declaration.declaredIn, declaration.declaredAtLine ?? 1);
          focusById("studio-source-editor", "source-tabpanel");
        },
      },
      {
        id: "find-references",
        labelKey: "palette.findReferences",
        enabled: Boolean(selectedSymbolEntry),
        disabledReasonKey: "palette.unavailableReason",
        run: () => {
          // The overview is deliberately NOT dismissed here. The references
          // surfaces — the output panel's references tab and the inspector's
          // cross-reference tab — render outside the overview/source branch, so
          // they are already visible; closing the overview would throw away
          // context the engineer asked for a moment ago. The interaction tests
          // assert the surface is exposed from BOTH starting states.
          setOutputOpen(true);
          setOutputTab("references");
          setInspectorTab("crossReference");
        },
      },
      {
        id: "validate",
        labelKey: "palette.validateWorkspace",
        enabled: true,
        // Actually re-runs validation over the edited source before showing it.
        run: () => { dispatch({ type: "revalidate" }); setOutputOpen(true); setOutputTab("validation"); },
      },
      {
        id: "toggle-output",
        labelKey: "palette.toggleBottomPanel",
        enabled: true,
        run: () => setOutputOpen((v) => !v),
      },
      {
        id: "switch-mode",
        labelKey: "palette.switchMode",
        enabled: true,
        // Updates the AUTHORITATIVE mode the edit gate reads.
        run: () => dispatch({ type: "setMode", mode: state.mode === "simulation" ? "review" : "simulation" }),
      },
      {
        id: "overview",
        labelKey: "palette.projectOverview",
        enabled: true,
        run: () => { setSymbolsOpen(false); setShowOverview(true); },
      },
    ],
    [selectedSymbolEntry, navigate, focusById, leaveOverview, state.mode],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[#070b14] text-white"
      /*
        Machine-readable statements of the two facts a reviewer, a screenshot
        harness or a future integration must not have to infer from prose.
        `classification` comes from the SERVER-resolved descriptor, and
        `liveConnection` is `null` by type, so "none" here is derived rather
        than asserted — a live connection could not be represented without
        changing the contract type first.

        Prose alone was not enough: the browser harness previously searched the
        page text for "live controller" and matched the REQUIRED denial
        ("No live controller is connected"), turning a safety statement into a
        reported violation. The lesson is not to soften the denial; it is that a
        classification belongs in a field, not in a sentence.
      */
      data-studio-classification={source.classification}
      data-controller-connection={source.liveConnection === null ? "none" : "connected"}
    >
      <a
        href="#studio-workspace"
        className={cn(
          "sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-cyan-500 focus:px-3 focus:py-1.5 focus:text-sm focus:text-black",
          FOCUS_RING,
        )}
      >
        {t("a11y.skipToWorkspace")}
      </a>

      {/* ── command bar ─────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-white/10 bg-black/30">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <div className="min-w-0">
            {/* The engineering TopBar owns this page's single <h1>; the
                workspace identity sits one level below it. */}
            <h2 className="truncate text-sm font-semibold text-white">{t("title")}</h2>
            <p className="truncate text-[11px] text-white/50">
              <span dir="ltr">{project.name}</span> · <span dir="ltr">{project.site}</span>
            </p>
          </div>

          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <div className="flex items-center gap-1">
              <dt className="text-white/50">{t("commandBar.target")}:</dt>
              <dd dir="ltr" className="font-mono text-white/80">{project.target.name}</dd>
            </div>
            <div className="flex items-center gap-1">
              <dt className="text-white/50">{t("commandBar.version")}:</dt>
              <dd dir="ltr" className="font-mono text-white/80">{workspace.workingVersion.label}</dd>
            </div>
            <div className="flex items-center gap-1">
              <dt className="text-white/50">{t("mode.label")}:</dt>
              <dd className="text-white/80">{t(`mode.${state.mode === "read-only" ? "readOnly" : state.mode}`)}</dd>
            </div>
            <div className="flex items-center gap-1">
              <dt className="text-white/50">{t("commandBar.validation")}:</dt>
              <dd className="text-white/80">
                {severity.error} {t("severity.error")} · {severity.warning} {t("severity.warning")}
              </dd>
            </div>
            <div className="flex items-center gap-1">
              <dt className="text-white/50">{t("commandBar.saveState")}:</dt>
              {/* Derived from content. It cannot claim "saved" for unsaved work. */}
              <dd className="text-white/80">{t(`editor.save.${workspaceSave}`)}</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={cn(
              "ms-auto rounded border border-white/15 px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/10 hover:text-white",
              FOCUS_RING,
            )}
          >
            {t("commandBar.openPalette")}
            <kbd className="ms-2 rounded bg-white/10 px-1 text-[10px]" dir="ltr">
              {t("commandBar.paletteShortcut")}
            </kbd>
          </button>
        </div>

        {/* Disclosure. Stated in text, in every locale, on every render. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 bg-amber-300/[0.06] px-4 py-1.5 text-[11px]">
          <span className="rounded bg-amber-300/20 px-1.5 py-0.5 font-medium text-amber-100">
            {t("disclosure.simulationWorkspace")}
          </span>
          <span className="text-amber-100/85">{t("disclosure.noLiveController")}</span>
          <span className="text-amber-100/85">{t("disclosure.noDownload")}</span>
          <span className="text-white/50">
            {t("inspector.propertyOrigin")}: <span dir="ltr">{source.classification}</span>
          </span>
          <span className="ms-auto text-cyan-100/80">{t("authority.banner")}</span>
        </div>
      </header>

      {/* The skip target must exist on EVERY viewport, so it sits on this
          wrapper rather than on the phone-only branch inside it. */}
      <div id="studio-workspace" className="flex min-h-0 flex-1 flex-col">
      {/* ── companion view (phone) ──────────────────────────────────────── */}
      {/*
        `data-studio-surface` names each responsive surface, and the harness
        measures which one is visible rather than trusting a label.

        Which branch is MOUNTED follows the measured viewport (viewport-mode.ts,
        the same media query as Tailwind's `lg:`). Before it is measured — on
        the server, during hydration, in jsdom — both branches render and the
        `lg:hidden` / `hidden lg:flex` classes decide, so the server HTML and
        the first client render agree. After it is measured, the branch that
        does not apply is not in the tree: a phone view must not carry the
        desktop editor, hidden or otherwise.
      */}
      {rendersCompanion(viewport) && (
      <div data-studio-surface="companion" className="min-h-0 flex-1 lg:hidden">
        <div className="h-full overflow-y-auto px-4 py-4">
          <h2 className="mb-1 text-sm font-semibold">{t("companion.heading")}</h2>
          <p className="mb-4 text-xs text-white/55">{t("companion.note")}</p>

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">{t("overview.title")}</h3>
          <dl data-studio-companion-section="summary" className="mb-5 grid grid-cols-2 gap-2 text-xs">
            {([
              ["overview.artifacts", project.artifacts.length],
              ["overview.symbols", index.symbolCount],
              ["overview.references", index.referenceCount],
              ["overview.findings", run.findings.length],
            ] as const).map(([key, value]) => (
              <div key={key} className="rounded border border-white/10 p-2">
                <dt className="text-[10px] uppercase tracking-wide text-white/50">{t(key)}</dt>
                <dd className="text-lg font-semibold text-white">{value}</dd>
              </div>
            ))}
          </dl>

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">{t("bottom.problems")}</h3>
          <ul data-studio-companion-section="diagnostics" className="mb-5 space-y-1.5">
            {run.findings.slice(0, 8).map((f, i) => (
              <li key={`${f.code}-${i}`} className="rounded border border-white/10 p-2 text-[11px]">
                <p className="text-white/50">
                  {t(`severity.${f.severity}`)} · <span dir="ltr" className="font-mono">{f.code}</span>
                </p>
                <p className="text-white/85">{translateFinding(f)}</p>
              </li>
            ))}
          </ul>

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">{t("symbols.title")}</h3>
          <label htmlFor="studio-symbol-search-mobile" className="sr-only">{t("symbols.searchLabel")}</label>
          <input
            id="studio-symbol-search-mobile"
            data-studio-companion-section="symbolLookup"
            type="text"
            value={symbolQuery}
            maxLength={128}
            onChange={(e) => setSymbolQuery(e.target.value)}
            placeholder={t("symbols.searchPlaceholder")}
            className={cn("mb-2 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white placeholder:text-white/35", FOCUS_RING)}
          />
          <p className="mb-2 text-[11px] text-white/50">{t("symbols.resultCount", { count: symbolResults.length })}</p>
          <ul className="space-y-1">
            {symbolResults.slice(0, 25).map((entry) => (
              <li key={entry.name} className="rounded border border-white/10 px-2 py-1.5 text-[11px]">
                <span dir="ltr" className="font-mono text-white/85">{entry.name}</span>
                <span className="ms-2 text-white/50">
                  {entry.reads.length + entry.writes.length + entry.bindings.length + entry.alarms.length}
                </span>
                {entry.unresolved && <span className="ms-2 text-rose-200">{t("symbols.unresolved")}</span>}
                {entry.duplicate && <span className="ms-2 text-amber-200">{t("symbols.duplicate")}</span>}
                {entry.orphan && <span className="ms-2 text-white/50">{t("symbols.orphan")}</span>}
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded border border-white/10 p-3 text-[11px] text-white/55">
            <h3 className="mb-1 font-semibold text-white/75">{t("boundaries.heading")}</h3>
            <p>{t("boundaries.noCompile")}</p>
            <p>{t("boundaries.noDownload")}</p>
            <p>{t("boundaries.noOnline")}</p>
            <p className="mt-1 text-white/50">{t("boundaries.complement")}</p>
          </div>
        </div>
      </div>
      )}

      {/* ── desktop / tablet workspace ──────────────────────────────────── */}
      {rendersWorkspace(viewport) && (
      <div data-studio-surface="workspace" className="hidden min-h-0 flex-1 lg:flex lg:flex-col">
        <div className="flex min-h-0 flex-1">
          <nav
            data-studio-surface="explorer"
            aria-label={t("a11y.regionExplorer")}
            className="w-64 shrink-0 border-e border-white/10 bg-black/20 xl:w-72"
          >
            <ProjectExplorer
              tree={tree}
              expanded={state.expanded}
              onToggle={(id) => dispatch({ type: "toggle", id })}
              onExpandAll={() => dispatch({ type: "expandAll", ids: allFolderIds(tree) })}
              onCollapseAll={() => dispatch({ type: "collapseAll" })}
              selectedId={state.activeId}
              onSelect={(node) => node.artifact && dispatch({ type: "open", id: node.artifact.id })}
              findingsByArtifactId={findingsByArtifactId}
              modifiedArtifactIds={modifiedIds}
            />
          </nav>

          <main className="flex min-w-0 flex-1 flex-col">
            {showOverview ? (
              <section aria-label={t("overview.title")} className="min-h-0 flex-1 overflow-y-auto p-6">
                <h3 className="mb-4 text-sm font-semibold">{t("overview.title")}</h3>
                <dl className="grid max-w-2xl grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  {([
                    ["overview.artifacts", editedProject.artifacts.length],
                    ["overview.symbols", index.symbolCount],
                    ["overview.references", index.referenceCount],
                    ["overview.findings", run.findings.length],
                    ["overview.errors", severity.error],
                    ["overview.warnings", severity.warning],
                  ] as const).map(([key, value]) => (
                    <div key={key} className="rounded border border-white/10 p-3">
                      <dt className="text-[10px] uppercase tracking-wide text-white/50">{t(key)}</dt>
                      <dd className="text-lg font-semibold text-white">{value}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  onClick={() => setShowOverview(false)}
                  className={cn("mt-4 rounded border border-white/15 px-2.5 py-1 text-[11px] hover:bg-white/10", FOCUS_RING)}
                >
                  {t("overview.backToSource")}
                </button>
              </section>
            ) : (
              <SourceView
                openArtifacts={state.openIds.map((id) => artifactById.get(id)).filter(Boolean) as EngineeringArtifact[]}
                activeArtifact={activeArtifact}
                source={activeSource}
                findings={run.findings}
                translateFinding={translateFinding}
                onActivate={(id) => dispatch({ type: "activate", id })}
                onClose={(id) => dispatch({ type: "close", id })}
                highlightLine={state.highlightLine}
                refusal={activeRefusal}
                onChange={(text) => {
                  if (!state.activeId || activeBaseline === null) return;
                  dispatch({ type: "edit", artifactId: state.activeId, baseline: activeBaseline, text, gate: activeGate });
                }}
                onUndo={() => state.activeId && dispatch({ type: "undo", artifactId: state.activeId })}
                onRedo={() => state.activeId && dispatch({ type: "redo", artifactId: state.activeId })}
                onSave={() => state.activeId && dispatch({ type: "save", artifactId: state.activeId })}
                canUndo={Boolean(state.activeId) && canUndoIn(state.edits, state.activeId!)}
                canRedo={Boolean(state.activeId) && canRedoIn(state.edits, state.activeId!)}
                saveState={activeSaveState}
              />
            )}

            {symbolsOpen && (
              <section aria-label={t("symbols.title")} className="max-h-56 shrink-0 overflow-y-auto border-t border-white/10 bg-black/20 p-3">
                <label htmlFor="studio-symbol-search" className="mb-1 block text-[11px] text-white/50">
                  {t("symbols.searchLabel")}
                </label>
                <input
                  id="studio-symbol-search"
                  type="text"
                  value={symbolQuery}
                  maxLength={128}
                  onChange={(e) => setSymbolQuery(e.target.value)}
                  placeholder={t("symbols.searchPlaceholder")}
                  className={cn(
                    "w-full max-w-sm rounded border border-white/15 bg-black/30 px-2 py-1 text-sm text-white placeholder:text-white/35",
                    FOCUS_RING,
                  )}
                />
                <p className="mt-1 text-[11px] text-white/50">
                  {t("symbols.resultCount", { count: symbolResults.length })}
                </p>
                <ul className="mt-1">
                  {symbolResults.slice(0, 40).map((entry) => (
                    <li key={entry.name}>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "selectSymbol", name: entry.name })}
                        className={cn("w-full rounded px-1.5 py-0.5 text-start text-[11px] hover:bg-white/[0.06]", FOCUS_RING)}
                      >
                        <span dir="ltr" className="font-mono text-white/85">{entry.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </main>

          <div
            data-studio-surface="inspector"
            className="hidden w-72 shrink-0 border-s border-white/10 bg-black/20 xl:block"
          >
            <Inspector
              tab={inspectorTab}
              onTabChange={setInspectorTab}
              artifact={activeArtifact}
              checksum={activeChecksum}
              symbol={selectedSymbolEntry}
              findings={artifactFindings}
              translateFinding={translateFinding}
              artifactPathById={artifactPathById}
              onNavigate={navigate}
            />
          </div>
        </div>

        {outputOpen && (
          <div className="h-56 shrink-0 border-t border-white/10 bg-black/25">
            <OutputPanel
              tab={outputTab}
              onTabChange={setOutputTab}
              run={run}
              runIndex={state.validationEpoch + 1}
              translateFinding={translateFinding}
              tests={workspace.tests}
              symbol={selectedSymbolEntry}
              artifactPathById={artifactPathById}
              onNavigate={navigate}
            />
          </div>
        )}

        <div className="flex shrink-0 items-center gap-3 border-t border-white/10 bg-black/40 px-4 py-1 text-[11px] text-white/50">
          <button
            type="button"
            onClick={() => setOutputOpen((v) => !v)}
            className={cn("rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-white", FOCUS_RING)}
          >
            {t("bottom.toggle")}
          </button>
          <span>
            {activeRefusal === null ? t("versions.editableNotice") : t(`editor.refusal.${activeRefusal}`)}
          </span>
          {/*
            Read straight from the adapter, never re-declared here. The
            duplicate this replaced had drifted to a different string, so the
            status bar named an implementation that does not exist — and an
            identifier is exactly the field a reader trusts without checking.
          */}
          <span className="ms-auto" dir="ltr" id="studio-adapter-id">
            {FALLBACK_EDITOR_ADAPTER.id}
          </span>
        </div>
      </div>
      )}

      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}
