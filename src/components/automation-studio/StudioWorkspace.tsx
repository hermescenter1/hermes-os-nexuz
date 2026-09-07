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

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/components/ds/cn";
import { FOCUS_RING } from "@/components/ds/a11y";
import {
  allFolderIds,
  applyEdit,
  buildArtifactDossier,
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
  KIND_MESSAGE_KEY,
  querySymbols,
  redo as redoIn,
  saveLocally,
  saveState as saveStateOf,
  sourceOf,
  undo as undoIn,
  validateProject,
  workspaceSaveState,
  type ArtifactDossier,
  type DiagnosticFinding,
  type EditModel,
  type EngineeringArtifact,
  type SymbolScope,
  type WorkspaceMode,
} from "@/lib/automation-studio";
import type { WorkspaceSourceDescriptor } from "@/lib/automation-studio";

import { ArtifactSurface } from "./ArtifactSurface";
import { CommandPalette, type PaletteCommand } from "./CommandPalette";
import { FALLBACK_EDITOR_ADAPTER } from "./editor-adapter";
import { SYMBOL_SEARCH_TARGETS, focusFirstVisible } from "./focus-target";
import { Inspector, type InspectorTab } from "./Inspector";
import { OutputPanel, type OutputTab } from "./OutputPanel";
import { ProjectExplorer } from "./ProjectExplorer";
import { SourceView } from "./SourceView";
import { rendersCompanion, rendersWorkspace, useViewportMode } from "./viewport-mode";

/** The inspector column's stable id. The toggle points `aria-controls` here. */
const INSPECTOR_COLUMN_ID = "studio-inspector-column";

/**
 * The drawer's close control.
 *
 * It carries `xl:hidden`, so it is PAINTED exactly when the inspector is a
 * drawer and absent from layout when the inspector is an inline column. That
 * makes it the honest test for "is this a drawer right now" — a CSS fact asked
 * of the DOM rather than re-derived from a breakpoint the product would then
 * have to track with a second media query.
 */
const INSPECTOR_CLOSE_ID = "studio-inspector-close";

/**
 * Is the element PAINTED right now?
 *
 * `offsetParent` is null for anything in a `display: none` subtree, which is
 * exactly how the inspector's breakpoint default is expressed. Read only from
 * effects and event handlers, never during render.
 *
 * Deliberately NOT a second `matchMedia` call. The Studio's contract — pinned by
 * `phase109c1-viewport-mode`, which this stage may not edit — is that the
 * product consults EXACTLY ONE media query, the `lg` one that decides which
 * responsive branch mounts. Adding an `xl` query to learn something CSS already
 * knows would have broken that contract to re-derive a fact the DOM can be asked
 * for directly.
 */
function isPainted(id: string): boolean {
  if (typeof document === "undefined") return false;
  const node = document.getElementById(id) as HTMLElement | null;
  return Boolean(node && node.offsetParent !== null);
}

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
  /**
   * Whether the inspector column is shown. `null` means "let the breakpoint
   * decide" and is the state until the engineer says otherwise.
   *
   * Round 1 gated the column on `xl:` alone, so between 1024 and 1279 px the
   * inspector was not narrow — it was ABSENT, and with it the properties,
   * cross-reference, diagnostics and AI-review surfaces. A width is not a
   * reason to REMOVE a panel; it is a reason to let the engineer close it.
   *
   * The first correction opened it unconditionally, and measurement at 1024
   * showed why that was wrong too: explorer + inspector left the source pane
   * about 300 px wide, with the meta bar wrapped onto three rows and roughly one
   * line of code visible. Reachable is not the same as usable.
   *
   * The second correction was the layout itself. Below `xl` the panel now
   * OVERLAYS the workspace instead of taking a share of it: at 1024 px the app
   * content is about 784 px, the explorer takes about 240, and an inline
   * inspector took 288 more — leaving the centre around 256 px. Defaulting it
   * closed only postponed that until the reader pressed the button. As a drawer
   * it costs the centre nothing at any width, and above `xl`, where there is
   * room, it is the same inline column it always was.
   *
   * The DEFAULT stays the breakpoint's, expressed in CSS, which is what keeps
   * the server HTML, the hydrated tree and the painted layout identical — no
   * flash, no layout shift. Once the engineer toggles, their choice wins.
   */
  const [inspectorOpen, setInspectorOpen] = useState<boolean | null>(null);
  /**
   * What the breakpoint default resolves to, measured once after mount.
   *
   * Only `aria-expanded` consumes it. The LAYOUT is CSS's throughout, so this
   * value can never make the panel appear or disappear — at worst it makes the
   * toggle announce a stale state to assistive technology after the reader has
   * dragged the window across 1280 px without ever pressing it. The ACTION is
   * never stale: the toggle re-measures at click time.
   */
  const [inspectorAutoOpen, setInspectorAutoOpen] = useState(false);
  useEffect(() => {
    // The engineer's own choice wins; there is nothing to read while it stands.
    if (inspectorOpen !== null) return;

    const sync = () => setInspectorAutoOpen(isPainted(INSPECTOR_COLUMN_ID));
    sync();

    /*
      R1 read this ONCE at mount, so dragging the window across 1280 px without
      touching the toggle left `aria-expanded` describing the old width — the
      panel appeared or vanished and the control kept announcing the previous
      state. A `resize` listener is the smallest thing that fixes it: no second
      media query (the Studio's contract, pinned by `phase109c1-viewport-mode`,
      is that it consults exactly one), no ResizeObserver, no polling, no
      dependency. It is also removed the moment the engineer expresses a choice,
      because from then on there is no breakpoint left to track.
    */
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [inspectorOpen]);

  /** What is on screen: the engineer's choice, else the breakpoint's. */
  const inspectorVisible = inspectorOpen ?? inspectorAutoOpen;

  /**
   * Who opened the drawer, so focus can be given back to them.
   *
   * A ref rather than state: it must not cause a render, and it is read in the
   * same tick it is written.
   */
  const inspectorOpenerRef = useRef<HTMLElement | null>(null);
  /** Bumped on every OPEN request, so two opens in a row both move focus. */
  const [inspectorFocusNonce, setInspectorFocusNonce] = useState(0);

  /**
   * Open the inspector and remember who asked.
   *
   * The opener is `document.activeElement`, which is the control the engineer
   * just operated — a real click focuses the button it lands on, and a keyboard
   * activation never leaves it. Reading it here rather than taking it as a
   * parameter is what lets the artifact surface's rows participate without
   * changing their contract.
   */
  const openInspector = useCallback(() => {
    const active = typeof document === "undefined" ? null : document.activeElement;
    inspectorOpenerRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    setInspectorOpen(true);
    setInspectorFocusNonce((n) => n + 1);
  }, []);

  /**
   * Close the inspector and give focus back to the exact control that opened it.
   *
   * Synchronously, inside the handler: the drawer is still painted at this
   * moment, so moving focus out of it before React hides it is what stops focus
   * falling to `<body>`. Without this, closing with Escape stranded a keyboard
   * user at the top of the document.
   */
  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    const opener = inspectorOpenerRef.current;
    inspectorOpenerRef.current = null;
    if (opener && opener.isConnected) opener.focus();
  }, []);

  const toggleInspector = useCallback(() => {
    // Measured at press time, so the first press always does the obvious thing
    // whatever the width and whatever the reader resized to.
    const visible = inspectorOpen ?? isPainted(INSPECTOR_COLUMN_ID);
    if (visible) closeInspector();
    else openInspector();
  }, [inspectorOpen, closeInspector, openInspector]);

  /**
   * Move focus INTO the drawer when it opens.
   *
   * Only when it is a drawer: at `xl` the inspector is a column of the
   * workspace, and yanking focus into a panel that was already on screen would
   * be a worse defect than the one this fixes. `INSPECTOR_CLOSE_ID` is painted
   * exactly in drawer mode, so it is both the test and the destination.
   *
   * R1 opened the drawer and left focus wherever it was — usually on the status
   * bar toggle, outside the panel — so a keyboard user had to tab through the
   * whole workspace to reach what they had just opened, and Escape did nothing
   * because no descendant had focus.
   */
  useEffect(() => {
    if (inspectorFocusNonce === 0) return;
    if (typeof document === "undefined") return;
    const close = document.getElementById(INSPECTOR_CLOSE_ID) as HTMLElement | null;
    if (!close || close.offsetParent === null) return;
    close.focus();
  }, [inspectorFocusNonce]);
  const [symbolQuery, setSymbolQuery] = useState("");
  /**
   * Scope, data-type and problems-only filters.
   *
   * `querySymbols` has supported all three since Round 1 and the catalogue
   * already carried every label for them; nothing on screen offered them. A
   * capability the product has, translated in three languages, and unreachable
   * is the same defect as a control that does nothing — just pointing the other
   * way.
   */
  const [symbolScope, setSymbolScope] = useState<SymbolScope | "any">("any");
  const [symbolType, setSymbolType] = useState<string>("any");
  const [symbolOnlyProblems, setSymbolOnlyProblems] = useState(false);
  /** Which right-hand surface the palette last opened. */
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  /**
   * Which artifact the COMPANION is inspecting, or null for the list.
   *
   * Deliberately separate from `state.activeId`. The companion is read-only and
   * has no editor, so letting it drive the workspace's active artifact would
   * mean a phone visit silently changed which file the desktop session had open
   * the next time the viewport widened.
   */
  const [companionArtifactId, setCompanionArtifactId] = useState<string | null>(null);

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

  /**
   * The projection for the active artifact when it has NO textual source.
   *
   * Null for a block: the source branch is the right surface there, and
   * building a dossier nobody renders would be work done to be discarded. Also
   * null when nothing is selected.
   */
  const activeDossier: ArtifactDossier | null = useMemo(() => {
    if (!activeArtifact || activeBaseline !== null) return null;
    return buildArtifactDossier(project, activeArtifact, workspace.tests);
  }, [activeArtifact, activeBaseline, project, workspace.tests]);

  const artifactFindings = useMemo(
    () => (activeArtifact ? (findingsByArtifactId.get(activeArtifact.id) ?? []) : []),
    [activeArtifact, findingsByArtifactId],
  );

  const symbolResults = useMemo(
    () =>
      querySymbols(index, {
        text: symbolQuery,
        scope: symbolScope,
        dataType: symbolType,
        onlyProblems: symbolOnlyProblems,
      }).slice(0, 200),
    [index, symbolQuery, symbolScope, symbolType, symbolOnlyProblems],
  );

  /** The data types this project actually declares. Never a hard-coded list. */
  const symbolDataTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const entry of index.entries) {
      for (const declaration of entry.declarations) seen.add(declaration.dataType);
    }
    return [...seen].sort();
  }, [index]);

  /** Artifacts edited in THIS session, for the changes surface. */
  const locallyModified = useMemo(
    () => dirtyArtifactIds(state.edits)
      .map((id) => artifactById.get(id))
      .filter((a): a is EngineeringArtifact => Boolean(a)),
    [state.edits, artifactById],
  );

  /**
   * Checksum of an artifact AS IT NOW STANDS — edits included for blocks.
   *
   * Keyed by ID rather than by the artifact object, because the companion holds
   * an allowlisted PROJECTION of the artifact, not the contract object.
   */
  const checksumOf = useCallback(
    (artifactId: string) => {
      const artifact = artifactById.get(artifactId);
      if (!artifact) return "";
      const block = blockById.get(artifactId);
      if (!block) return artifact.checksum;
      return currentChecksum(state.edits, artifact, sourceOf(block));
    },
    [artifactById, blockById, state.edits],
  );

  const companionArtifact = companionArtifactId
    ? (artifactById.get(companionArtifactId) ?? null)
    : null;
  const companionDossier = useMemo(
    () => (companionArtifact ? buildArtifactDossier(project, companionArtifact, workspace.tests) : null),
    [companionArtifact, project, workspace.tests],
  );

  const severity = countBySeverity(run);
  const activeSaveState = state.activeId ? saveStateOf(state.edits, state.activeId) : "unchanged";
  const workspaceSave = workspaceSaveState(state.edits);

  const navigate = useCallback((artifactId: string, line: number) => {
    dispatch({ type: "navigate", artifactId, line });
  }, []);

  /**
   * Inspect a symbol.
   *
   * Three things at once, because any one of them alone is what made the
   * artifact surface's rows look dead: SELECT the symbol, OPEN the inspector
   * (below `xl` it is closed by default, so the result of a press was off
   * screen), and switch to CROSS-REFERENCE (the default tab is Properties,
   * which shows the artifact and never mentions the symbol that was clicked).
   */
  const inspectSymbol = useCallback((name: string) => {
    dispatch({ type: "selectSymbol", name });
    setInspectorTab("crossReference");
    // Goes through the same opener as the toggle, so a symbol inspected from
    // the keyboard lands focus in the drawer and gets it back on Escape.
    openInspector();
  }, [openInspector]);

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
            <p className="truncate text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">
              {t("eyebrow")}
            </p>
            <h2 className="truncate text-[15px] font-semibold leading-tight text-white">
              {t("title")}
            </h2>
            <p className="truncate text-[11px] text-white/50">
              <span dir="ltr">{project.name}</span> · <span dir="ltr">{project.site}</span>
            </p>
          </div>

          {/*
            The instrument cluster. Round 1 ran the five facts together as one
            unbroken 11 px line, so target, version, mode, validation and save
            state read as a single sentence — the reader had to parse punctuation
            to find the number they came for. Each fact now has a label above its
            value and a rule between it and the next, which is how an engineering
            status strip is read at a glance.
          */}
          <dl className="flex flex-wrap items-stretch gap-y-1">
            {([
              ["commandBar.target", <span key="t" dir="ltr" className="font-mono">{project.target.name}</span>, false],
              ["commandBar.version", <span key="v" dir="ltr" className="font-mono">{workspace.workingVersion.label}</span>, false],
              ["mode.label", t(`mode.${state.mode === "read-only" ? "readOnly" : state.mode}`), false],
              [
                "commandBar.validation",
                <span key="s">
                  <span className={severity.error > 0 ? "text-rose-200" : undefined}>
                    {severity.error} {t("severity.error")}
                  </span>
                  {" · "}
                  <span className={severity.warning > 0 ? "text-amber-200" : undefined}>
                    {severity.warning} {t("severity.warning")}
                  </span>
                </span>,
                true,
              ],
              // Derived from content. It cannot claim "saved" for unsaved work.
              ["commandBar.saveState", t(`editor.save.${workspaceSave}`), false],
            ] as const).map(([key, value]) => (
              <div
                key={key}
                className="flex min-w-0 flex-col justify-center border-s border-white/10 px-3 first:border-s-0 first:ps-0"
              >
                <dt className="truncate text-[10px] uppercase tracking-wide text-white/50">
                  {t(key)}
                </dt>
                <dd className="truncate text-[12px] text-white/85">{value}</dd>
              </div>
            ))}
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
          {/*
            The classification, read as a LABEL and shown as a CODE — the same
            shape the product already uses for a diagnostic: a translated
            sentence beside its stable identifier. The raw token used to be the
            only visible text here, which put an English word in the Persian and
            German headers; it stays on screen because it IS the classification's
            name, and because `phase109c1-runtime` requires the descriptor's
            value to be readable, not merely present in an attribute.
          */}
          <span className="text-white/50">
            {t("classification.label")}:{" "}
            <span className="text-white/80">{t("classification.simulated")}</span>{" "}
            <span dir="ltr" className="font-mono text-white/50">{source.classification}</span>
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

          {/*
            ARTIFACT INSPECTION SITS HERE, second, directly after the project
            overview — not last.

            It used to follow eight findings and up to twenty-five symbol
            results, which put the start of the companion's only navigation
            roughly two screens down on a 390 px phone and off every screenshot
            in the matrix. A capability nobody scrolls to is not a capability.
            Problems and symbol lookup keep everything they had; only the order
            changed, and only in this branch — the desktop DOM is untouched.
          */}
          {/* ── artifact inspection ───────────────────────────────────── */}
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
            {t("companion.artifacts")}
          </h3>
          {companionDossier ? (
            <div>
              <button
                type="button"
                onClick={() => setCompanionArtifactId(null)}
                className={cn(
                  "mb-3 flex min-h-[44px] w-full items-center rounded border border-white/15 px-3 text-xs text-white/80 hover:bg-white/10",
                  FOCUS_RING,
                )}
              >
                {t("companion.backToList")}
              </button>
              <ArtifactSurface
                dossier={companionDossier}
                checksum={checksumOf(companionDossier.artifact.id)}
                findings={findingsByArtifactId.get(companionDossier.artifact.id) ?? []}
                translateFinding={translateFinding}
                artifactPathById={artifactPathById}
                variant="companion"
                /* No `onInspectSymbol`: the companion has no inspector to open,
                   so a control that promised to inspect would be a control that
                   does nothing. The rows render as text instead. */
                sourceNote={
                  blockById.has(companionDossier.artifact.id)
                    ? t("companion.note")
                    : t("editor.nonTextual")
                }
                noReferencesLabel={t("artifact.noReferencesOfKind")}
              />
            </div>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-white/50">{t("companion.artifactHint")}</p>
              <ul data-studio-companion-section="artifacts" className="mb-5 space-y-1">
                {project.artifacts.map((artifact) => (
                  <li key={artifact.id}>
                    <button
                      type="button"
                      onClick={() => setCompanionArtifactId(artifact.id)}
                      /* 44 px minimum hit area: this list is the companion's
                         primary navigation and it is used with a thumb. */
                      className={cn(
                        "flex min-h-[44px] w-full flex-col justify-center rounded border border-white/10 px-3 py-1.5 text-start hover:bg-white/[0.06]",
                        FOCUS_RING,
                      )}
                    >
                      <span dir="ltr" className="truncate font-mono text-[12px] text-white/85">
                        {artifact.name}
                      </span>
                      <span className="truncate text-[11px] text-white/50">
                        {t(`kinds.${KIND_MESSAGE_KEY[artifact.kind]}`)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

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
        {/* `relative` so the inspector can overlay this row below `xl` without
            taking a share of its width. */}
        <div className="relative flex min-h-0 flex-1">
          <nav
            data-studio-surface="explorer"
            aria-label={t("a11y.regionExplorer")}
            className="w-56 shrink-0 border-e border-white/10 bg-black/20 lg:w-60 xl:w-72"
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
                dossier={activeDossier}
                checksum={activeChecksum}
                artifactPathById={artifactPathById}
                onInspectSymbol={inspectSymbol}
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
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1">
                    <label htmlFor="studio-symbol-scope" className="text-white/50">
                      {t("symbols.scope")}
                    </label>
                    <select
                      id="studio-symbol-scope"
                      value={symbolScope}
                      onChange={(e) => setSymbolScope(e.target.value as SymbolScope | "any")}
                      className={cn(
                        "rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-white",
                        FOCUS_RING,
                      )}
                    >
                      <option value="any">{t("symbols.anyScope")}</option>
                      <option value="global">{t("symbols.scopeGlobal")}</option>
                      <option value="block-local">{t("symbols.scopeBlockLocal")}</option>
                      <option value="hmi">{t("symbols.scopeHmi")}</option>
                      <option value="scada">{t("symbols.scopeScada")}</option>
                    </select>
                  </span>

                  <span className="flex items-center gap-1">
                    <label htmlFor="studio-symbol-type" className="text-white/50">
                      {t("symbols.dataType")}
                    </label>
                    <select
                      id="studio-symbol-type"
                      value={symbolType}
                      onChange={(e) => setSymbolType(e.target.value)}
                      className={cn(
                        "rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-white",
                        FOCUS_RING,
                      )}
                    >
                      <option value="any">{t("symbols.anyType")}</option>
                      {/* Derived from the project, so a type the fixture does not
                          declare is never offered as a filter that finds nothing. */}
                      {symbolDataTypes.map((dataType) => (
                        <option key={dataType} value={dataType}>{dataType}</option>
                      ))}
                    </select>
                  </span>

                  <span className="flex items-center gap-1">
                    <input
                      id="studio-symbol-problems"
                      type="checkbox"
                      checked={symbolOnlyProblems}
                      onChange={(e) => setSymbolOnlyProblems(e.target.checked)}
                      className={cn("h-3.5 w-3.5 accent-cyan-400", FOCUS_RING)}
                    />
                    <label htmlFor="studio-symbol-problems" className="text-white/50">
                      {t("symbols.onlyProblems")}
                    </label>
                  </span>
                </div>
                <p
                  id="studio-symbol-result-count"
                  /* The count as a value beside the translated sentence, so a
                     harness never has to parse three locales' wording. */
                  data-result-count={symbolResults.length}
                  className="mt-1 text-[11px] text-white/50"
                >
                  {t("symbols.resultCount", { count: symbolResults.length })}
                </p>
                {symbolResults.length === 0 && (
                  <p className="mt-1 text-[11px] text-white/50">{t("symbols.none")}</p>
                )}
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
            id={INSPECTOR_COLUMN_ID}
            data-studio-surface="inspector"
            data-inspector-open={inspectorOpen === null ? "auto" : String(inspectorOpen)}
            /*
              Escape closes it, but only where it is a DRAWER. At `xl` the panel
              is a column of the workspace, not an overlay, and a column that
              vanished on Escape would be a surprise rather than an affordance.
              Which one it is, is a CSS fact — so it is asked of the DOM at key
              time (the close control is `xl:hidden`, so it is painted exactly
              when the panel is a drawer) rather than re-derived from a
              breakpoint the product would then have to track.
            */
            /*
              Escape closes it, but only where it is a DRAWER. At `xl` the panel
              is a column of the workspace, not an overlay, and a column that
              vanished on Escape would be a surprise rather than an affordance.
              Which one it is, is a CSS fact — so it is asked of the DOM at key
              time via the close control, which is painted exactly in drawer
              mode.

              The handler is on the container and fires for a keypress from ANY
              focused descendant, which is how a real keyboard user reaches it:
              the open moves focus to the close button INSIDE this element, so
              the event bubbles here from there.
            */
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              if (!isPainted(INSPECTOR_CLOSE_ID)) return;
              event.stopPropagation();
              closeInspector();
            }}
            className={cn(
              /*
                DRAWER below `xl`: absolutely positioned on the logical END edge,
                so it mirrors correctly under a Persian page and takes ZERO
                width from the centre. Opaque background and a border, because an
                overlay over source code has to be readable, not translucent.
                COLUMN at `xl`: `static` puts it back in the flex row exactly as
                before.
              */
              "absolute inset-y-0 end-0 z-30 w-72 border-s border-white/15",
              "bg-[#0b1220] shadow-[0_0_40px_rgba(0,0,0,0.55)]",
              "xl:static xl:z-auto xl:w-80 xl:shrink-0 xl:border-white/10 xl:bg-black/20 xl:shadow-none",
              inspectorOpen === null ? "hidden xl:block" : inspectorOpen ? "block" : "hidden",
            )}
          >
            <div className="flex h-full min-h-0 flex-col">
              {/* A keyboard-reachable way out of the drawer. At `xl` the panel
                  is a column and there is nothing to close, so the control is
                  not rendered rather than merely hidden. */}
              <div className="flex shrink-0 items-center justify-end border-b border-white/10 px-2 py-1 xl:hidden">
                <button
                  id={INSPECTOR_CLOSE_ID}
                  type="button"
                  onClick={closeInspector}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 hover:text-white",
                    FOCUS_RING,
                  )}
                >
                  {t("inspector.close")}
                </button>
              </div>
              <div className="min-h-0 flex-1">
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
          </div>
        </div>

        {outputOpen && (
          <div className="h-40 shrink-0 border-t border-white/10 bg-black/25 lg:h-48 xl:h-56">
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
              versions={workspace.versions}
              workingVersionId={workspace.workingVersion.id}
              baselineVersionId={workspace.baselineVersion.id}
              locallyModified={locallyModified}
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
          <button
            type="button"
            onClick={toggleInspector}
            aria-controls="studio-inspector-column"
            /*
              Determinate, and correct at every width: `inspectorVisible` is the
              engineer's choice when they have made one and the measured
              breakpoint answer otherwise. The earlier version could not say
              anything before the first press.
            */
            aria-expanded={inspectorVisible}
            className={cn("rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-white", FOCUS_RING)}
          >
            {t("inspector.toggle")}
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
