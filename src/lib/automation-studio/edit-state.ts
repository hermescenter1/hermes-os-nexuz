/**
 * PHASE 109-C1 (Round 1.1) — the local edit model.
 *
 * Round 1 shipped a read-only source view while the chrome said the draft "can
 * be edited" and the save indicator always read "saved". Both were false. This
 * module is the correction: a real, purely functional edit model that the UI
 * drives and the tests can exercise without a DOM.
 *
 * Design rules, each of which a negative control checks:
 *
 *   - DIRTY IS DERIVED, never stored. An artifact is dirty when its current
 *     content differs from its baseline content. A boolean flag can drift out of
 *     agreement with the text; a comparison cannot.
 *   - SAVE IS EXPLICIT AND IN-MEMORY. `unchanged` -> `modified` -> `locallySaved`
 *     -> `modified` again on the next edit. There is no timer, no persistence,
 *     no network, and nothing that would let the indicator claim "saved" for
 *     work that has not been saved.
 *   - EDITABILITY IS A PREDICATE over (workspace mode, approval state, artifact
 *     read-only). It is evaluated on every write, so a mode change takes effect
 *     immediately rather than only at the next render.
 *   - UNDO/REDO ARE CONTENT SNAPSHOTS, so undoing back to the baseline text
 *     genuinely clears the dirty state rather than leaving a flag behind.
 */

import {
  contentChecksum,
  isEditableApprovalState,
  type ApprovalState,
  type EngineeringArtifact,
  type ProgramBlock,
  type WorkspaceMode,
} from "./contract";

/** The save state of a single artifact, as the UI must report it. */
export type SaveState = "unchanged" | "modified" | "locallySaved";

export interface ArtifactEditState {
  readonly artifactId: string;
  /** The text this artifact had when the workspace opened. Never mutated. */
  readonly baseline: string;
  /** What the editor currently holds. */
  readonly current: string;
  /** The text at the last local save, or null when never saved. */
  readonly savedSnapshot: string | null;
  /** Content states BEFORE each edit, oldest first. */
  readonly undoStack: readonly string[];
  /** Content states undone, most recently undone last. */
  readonly redoStack: readonly string[];
}

export interface EditModel {
  readonly byArtifact: Readonly<Record<string, ArtifactEditState>>;
}

export const EMPTY_EDIT_MODEL: EditModel = Object.freeze({ byArtifact: Object.freeze({}) });

/** Newlines are normalised on entry so an edit cannot silently change the EOL. */
export function normaliseSource(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function sourceOf(block: ProgramBlock): string {
  return block.sourceLines.join("\n");
}

export function linesOf(source: string): readonly string[] {
  return source.split("\n");
}

function seed(artifactId: string, baseline: string): ArtifactEditState {
  const text = normaliseSource(baseline);
  return {
    artifactId,
    baseline: text,
    current: text,
    savedSnapshot: null,
    undoStack: [],
    redoStack: [],
  };
}

/** The state for an artifact, seeded from its baseline on first touch. */
export function stateFor(model: EditModel, artifactId: string, baseline: string): ArtifactEditState {
  return model.byArtifact[artifactId] ?? seed(artifactId, baseline);
}

/* ── editability ──────────────────────────────────────────────────────────── */

export interface EditabilityInput {
  readonly mode: WorkspaceMode;
  readonly approval: ApprovalState;
  readonly artifactReadOnly: boolean;
  readonly hasTextualSource: boolean;
}

export type EditRefusal =
  | "mode-not-simulation"
  | "version-not-draft"
  | "artifact-read-only"
  | "no-textual-source";

/**
 * Why an artifact may not be edited, or null when it may.
 *
 * Returning the REASON rather than a boolean is deliberate: the UI has to tell
 * the engineer which of the four gates is closed, and a bare `false` cannot.
 */
export function editRefusal(input: EditabilityInput): EditRefusal | null {
  if (!input.hasTextualSource) return "no-textual-source";
  if (input.artifactReadOnly) return "artifact-read-only";
  if (!isEditableApprovalState(input.approval)) return "version-not-draft";
  if (input.mode !== "simulation") return "mode-not-simulation";
  return null;
}

export function canEdit(input: EditabilityInput): boolean {
  return editRefusal(input) === null;
}

/* ── transitions ──────────────────────────────────────────────────────────── */

const MAX_HISTORY = 200;

function push(stack: readonly string[], value: string): readonly string[] {
  const next = [...stack, value];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

/**
 * Apply an edit.
 *
 * Refused edits return the model UNCHANGED — not a partially applied one, and
 * not a thrown error the UI would have to catch on every keystroke. A refusal is
 * an ordinary outcome here, because the reason is already shown in the chrome.
 */
export function applyEdit(
  model: EditModel,
  artifactId: string,
  baseline: string,
  nextText: string,
  editability: EditabilityInput,
): EditModel {
  if (!canEdit(editability)) return model;

  const prev = stateFor(model, artifactId, baseline);
  const text = normaliseSource(nextText);
  if (text === prev.current) return model;

  return {
    byArtifact: {
      ...model.byArtifact,
      [artifactId]: {
        ...prev,
        current: text,
        undoStack: push(prev.undoStack, prev.current),
        // A fresh edit invalidates the redo branch, as every editor does.
        redoStack: [],
      },
    },
  };
}

export function undo(model: EditModel, artifactId: string): EditModel {
  const prev = model.byArtifact[artifactId];
  if (!prev || prev.undoStack.length === 0) return model;
  const restored = prev.undoStack[prev.undoStack.length - 1];
  return {
    byArtifact: {
      ...model.byArtifact,
      [artifactId]: {
        ...prev,
        current: restored,
        undoStack: prev.undoStack.slice(0, -1),
        redoStack: push(prev.redoStack, prev.current),
      },
    },
  };
}

export function redo(model: EditModel, artifactId: string): EditModel {
  const prev = model.byArtifact[artifactId];
  if (!prev || prev.redoStack.length === 0) return model;
  const restored = prev.redoStack[prev.redoStack.length - 1];
  return {
    byArtifact: {
      ...model.byArtifact,
      [artifactId]: {
        ...prev,
        current: restored,
        redoStack: prev.redoStack.slice(0, -1),
        undoStack: push(prev.undoStack, prev.current),
      },
    },
  };
}

/** Record a local, in-memory save. No I/O of any kind. */
export function saveLocally(model: EditModel, artifactId: string): EditModel {
  const prev = model.byArtifact[artifactId];
  if (!prev) return model;
  return {
    byArtifact: {
      ...model.byArtifact,
      [artifactId]: { ...prev, savedSnapshot: prev.current },
    },
  };
}

export function canUndo(model: EditModel, artifactId: string): boolean {
  return (model.byArtifact[artifactId]?.undoStack.length ?? 0) > 0;
}

export function canRedo(model: EditModel, artifactId: string): boolean {
  return (model.byArtifact[artifactId]?.redoStack.length ?? 0) > 0;
}

/* ── derived state ────────────────────────────────────────────────────────── */

export function isDirty(model: EditModel, artifactId: string): boolean {
  const s = model.byArtifact[artifactId];
  return s ? s.current !== s.baseline : false;
}

/**
 * The save state, DERIVED from content every time.
 *
 * `locallySaved` requires the current text to equal the saved snapshot; the
 * moment a further edit lands the state falls back to `modified`, so the
 * indicator cannot claim work is saved when it is not.
 */
export function saveState(model: EditModel, artifactId: string): SaveState {
  const s = model.byArtifact[artifactId];
  if (!s) return "unchanged";
  if (s.current === s.baseline && s.savedSnapshot === null) return "unchanged";
  if (s.savedSnapshot !== null && s.current === s.savedSnapshot) return "locallySaved";
  return s.current === s.baseline ? "unchanged" : "modified";
}

/** Every artifact whose content differs from its baseline. Sorted, stable. */
export function dirtyArtifactIds(model: EditModel): readonly string[] {
  return Object.keys(model.byArtifact)
    .filter((id) => isDirty(model, id))
    .sort();
}

/** The workspace-level save state: the worst of the individual states. */
export function workspaceSaveState(model: EditModel): SaveState {
  const states = Object.keys(model.byArtifact).map((id) => saveState(model, id));
  if (states.includes("modified")) return "modified";
  if (states.includes("locallySaved")) return "locallySaved";
  return "unchanged";
}

/** The checksum of the CURRENT content, so the inspector reflects edits. */
export function currentChecksum(model: EditModel, artifact: EngineeringArtifact, baseline: string): string {
  const s = model.byArtifact[artifact.id];
  return contentChecksum(s ? s.current : normaliseSource(baseline));
}

export function currentSource(model: EditModel, artifactId: string, baseline: string): string {
  return model.byArtifact[artifactId]?.current ?? normaliseSource(baseline);
}

/**
 * The blocks as they currently stand, so validation runs against EDITED source
 * rather than the fixture. Without this the "Validate workspace" command would
 * re-report a stale result, which is exactly what Round 1 did.
 */
export function applyEditsToBlocks(
  model: EditModel,
  blocks: readonly ProgramBlock[],
): readonly ProgramBlock[] {
  return blocks.map((block) => {
    const s = model.byArtifact[block.id];
    if (!s || s.current === s.baseline) return block;
    const lines = linesOf(s.current);
    return { ...block, sourceLines: lines, checksum: contentChecksum(s.current) };
  });
}
