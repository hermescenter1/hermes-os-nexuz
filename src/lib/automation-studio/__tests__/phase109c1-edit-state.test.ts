/**
 * PHASE 109-C1 Round 1.1 — the local edit model.
 *
 * Round 1 claimed a draft "can be edited" while the source view was read-only
 * and the save indicator always said saved. These tests hold the replacement to
 * the ten behaviours the correction round names, plus the refusal reasons and
 * the determinism the whole workspace rests on.
 */

import { describe, expect, it } from "vitest";

import {
  applyEdit,
  applyEditsToBlocks,
  buildDemoProject,
  canEdit,
  canRedo,
  canUndo,
  contentChecksum,
  currentChecksum,
  currentSource,
  dirtyArtifactIds,
  editRefusal,
  EMPTY_EDIT_MODEL,
  isDirty,
  linesOf,
  normaliseSource,
  redo,
  saveLocally,
  saveState,
  sourceOf,
  undo,
  validateProject,
  workspaceSaveState,
  type EditabilityInput,
  type EditModel,
} from "..";

const project = buildDemoProject();
const MOTOR = project.blocks.find((b) => b.id === "blk-fb-motor")!;
const BASE = sourceOf(MOTOR);

const EDITABLE: EditabilityInput = {
  mode: "simulation",
  approval: "draft",
  artifactReadOnly: false,
  hasTextualSource: true,
};

/** Change one line, deterministically. */
function editedOnce(): string {
  const lines = linesOf(BASE);
  const i = lines.findIndex((l) => l.includes("VERSION : 0.1"));
  expect(i).toBeGreaterThan(-1);
  return [...lines.slice(0, i), "VERSION : 0.2", ...lines.slice(i + 1)].join("\n");
}

function edit(model: EditModel, text: string, editability = EDITABLE): EditModel {
  return applyEdit(model, MOTOR.id, BASE, text, editability);
}

describe("109-C1 · 1. editing one line changes the checksum", () => {
  it("recomputes from the edited content, not the fixture", () => {
    const before = currentChecksum(EMPTY_EDIT_MODEL, MOTOR, BASE);
    expect(before).toBe(contentChecksum(BASE));

    const model = edit(EMPTY_EDIT_MODEL, editedOnce());
    const after = currentChecksum(model, MOTOR, BASE);

    expect(after).not.toBe(before);
    expect(after).toBe(contentChecksum(editedOnce()));
  });
});

describe("109-C1 · 2. an edit marks exactly one artifact dirty", () => {
  it("dirties the edited artifact and nothing else", () => {
    const model = edit(EMPTY_EDIT_MODEL, editedOnce());
    expect(dirtyArtifactIds(model)).toEqual([MOTOR.id]);
    expect(isDirty(model, MOTOR.id)).toBe(true);
    expect(isDirty(model, "blk-fb-valve")).toBe(false);
  });

  it("derives dirtiness from content, so an identical rewrite is not dirty", () => {
    const model = edit(EMPTY_EDIT_MODEL, BASE);
    expect(dirtyArtifactIds(model)).toEqual([]);
  });
});

describe("109-C1 · 3+4. undo returns to the baseline, redo restores the edit", () => {
  it("undo clears the dirty state", () => {
    const edited = edit(EMPTY_EDIT_MODEL, editedOnce());
    expect(isDirty(edited, MOTOR.id)).toBe(true);
    expect(canUndo(edited, MOTOR.id)).toBe(true);

    const undone = undo(edited, MOTOR.id);
    expect(currentSource(undone, MOTOR.id, BASE)).toBe(BASE);
    expect(isDirty(undone, MOTOR.id)).toBe(false);
    expect(dirtyArtifactIds(undone)).toEqual([]);
  });

  it("redo restores the dirty state and the exact text", () => {
    const undone = undo(edit(EMPTY_EDIT_MODEL, editedOnce()), MOTOR.id);
    expect(canRedo(undone, MOTOR.id)).toBe(true);

    const redone = redo(undone, MOTOR.id);
    expect(currentSource(redone, MOTOR.id, BASE)).toBe(editedOnce());
    expect(isDirty(redone, MOTOR.id)).toBe(true);
  });

  it("a new edit after an undo discards the redo branch", () => {
    const undone = undo(edit(EMPTY_EDIT_MODEL, editedOnce()), MOTOR.id);
    const diverged = edit(undone, `${BASE}\n// a different direction`);
    expect(canRedo(diverged, MOTOR.id)).toBe(false);
  });

  it("undo and redo on an untouched artifact are no-ops, not errors", () => {
    expect(undo(EMPTY_EDIT_MODEL, MOTOR.id)).toBe(EMPTY_EDIT_MODEL);
    expect(redo(EMPTY_EDIT_MODEL, MOTOR.id)).toBe(EMPTY_EDIT_MODEL);
  });
});

describe("109-C1 · 5+6. the save state is derived, and never claims more than the truth", () => {
  it("unchanged -> modified -> locallySaved -> modified", () => {
    expect(saveState(EMPTY_EDIT_MODEL, MOTOR.id)).toBe("unchanged");

    const modified = edit(EMPTY_EDIT_MODEL, editedOnce());
    expect(saveState(modified, MOTOR.id)).toBe("modified");

    const saved = saveLocally(modified, MOTOR.id);
    expect(saveState(saved, MOTOR.id)).toBe("locallySaved");

    const again = edit(saved, `${editedOnce()}\n// a further change`);
    expect(saveState(again, MOTOR.id)).toBe("modified");
  });

  it("never reports locallySaved before a save has happened", () => {
    const modified = edit(EMPTY_EDIT_MODEL, editedOnce());
    expect(saveState(modified, MOTOR.id)).not.toBe("locallySaved");
    expect(workspaceSaveState(modified)).toBe("modified");
  });

  it("saving an untouched artifact does not invent a saved state", () => {
    expect(saveState(saveLocally(EMPTY_EDIT_MODEL, MOTOR.id), MOTOR.id)).toBe("unchanged");
  });

  it("the workspace state is the worst of the artifacts", () => {
    const saved = saveLocally(edit(EMPTY_EDIT_MODEL, editedOnce()), MOTOR.id);
    expect(workspaceSaveState(saved)).toBe("locallySaved");
    const alsoModified = applyEdit(saved, "blk-fb-valve", "A", "B", EDITABLE);
    expect(workspaceSaveState(alsoModified)).toBe("modified");
  });
});

describe("109-C1 · 7-9. every gate that refuses an edit", () => {
  it("7. a read-only artifact cannot be edited", () => {
    const gate = { ...EDITABLE, artifactReadOnly: true };
    expect(editRefusal(gate)).toBe("artifact-read-only");
    expect(canEdit(gate)).toBe(false);
    expect(edit(EMPTY_EDIT_MODEL, editedOnce(), gate)).toBe(EMPTY_EDIT_MODEL);
  });

  it("8. reviewed, approved and commissioned versions cannot be edited", () => {
    for (const approval of ["reviewed", "approved", "commissioned"] as const) {
      const gate = { ...EDITABLE, approval };
      expect(editRefusal(gate), approval).toBe("version-not-draft");
      expect(edit(EMPTY_EDIT_MODEL, editedOnce(), gate), approval).toBe(EMPTY_EDIT_MODEL);
    }
  });

  it("9. review and read-only workspace modes cannot edit", () => {
    for (const mode of ["review", "read-only"] as const) {
      const gate = { ...EDITABLE, mode };
      expect(editRefusal(gate), mode).toBe("mode-not-simulation");
      expect(edit(EMPTY_EDIT_MODEL, editedOnce(), gate), mode).toBe(EMPTY_EDIT_MODEL);
    }
  });

  it("an artifact with no textual source cannot be edited", () => {
    expect(editRefusal({ ...EDITABLE, hasTextualSource: false })).toBe("no-textual-source");
  });

  it("a mode change takes effect on the NEXT edit, not at some later render", () => {
    const model = edit(EMPTY_EDIT_MODEL, editedOnce());
    const afterModeChange = edit(model, `${editedOnce()}\n// more`, { ...EDITABLE, mode: "review" });
    // The earlier edit survives; the new one is refused outright.
    expect(currentSource(afterModeChange, MOTOR.id, BASE)).toBe(editedOnce());
  });

  it("the draft gate agrees with the demo workspace's own version", () => {
    expect(canEdit(EDITABLE)).toBe(true);
    expect(editRefusal(EDITABLE)).toBeNull();
  });
});

describe("109-C1 · 10. determinism", () => {
  it("two identical edit sequences produce identical state", () => {
    const run = () => {
      let m = edit(EMPTY_EDIT_MODEL, editedOnce());
      m = edit(m, `${editedOnce()}\n// second`);
      m = undo(m, MOTOR.id);
      m = saveLocally(m, MOTOR.id);
      m = edit(m, `${editedOnce()}\n// third`);
      return m;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("line endings are normalised, so an edit cannot silently change the EOL", () => {
    const crlf = editedOnce().replace(/\n/g, "\r\n");
    const model = edit(EMPTY_EDIT_MODEL, crlf);
    expect(currentSource(model, MOTOR.id, BASE)).toBe(editedOnce());
    expect(currentSource(model, MOTOR.id, BASE)).not.toContain("\r");
    expect(normaliseSource("a\r\nb\rc")).toBe("a\nb\nc");
  });
});

describe("109-C1 · edited blocks reach the validator", () => {
  it("an edited block arrives with new lines and a new checksum", () => {
    // Named for what it proves. The Round 1 rule set reads the project MODEL —
    // declared symbols, references, provenance, origin — and does not parse
    // block text, so no test here may claim that a fault typed into the editor
    // is detected. What IS provable, and what the next round builds on, is that
    // the block the validator receives is the edited one.
    const model = edit(EMPTY_EDIT_MODEL, `${BASE}\n// touched`);
    const blocks = applyEditsToBlocks(model, project.blocks);
    const motor = blocks.find((b) => b.id === MOTOR.id)!;
    expect(motor.sourceLines.at(-1)).toBe("// touched");
    expect(motor.checksum).not.toBe(MOTOR.checksum);
  });

  it("unedited blocks are returned by identity, so nothing is needlessly rebuilt", () => {
    const model = edit(EMPTY_EDIT_MODEL, editedOnce());
    const blocks = applyEditsToBlocks(model, project.blocks);
    const valve = blocks.find((b) => b.id === "blk-fb-valve")!;
    expect(valve).toBe(project.blocks.find((b) => b.id === "blk-fb-valve"));
  });

  it("a validation run over the edited project is still deterministic", () => {
    const model = edit(EMPTY_EDIT_MODEL, editedOnce());
    const edited = { ...project, blocks: applyEditsToBlocks(model, project.blocks) };
    expect(JSON.stringify(validateProject(edited, 0))).toBe(
      JSON.stringify(validateProject(edited, 0)),
    );
  });
});

describe("109-C1 · the edit model touches nothing outside itself", () => {
  it("does not mutate the demo project constants", () => {
    const snapshot = JSON.stringify(buildDemoProject());
    let m = edit(EMPTY_EDIT_MODEL, editedOnce());
    m = saveLocally(m, MOTOR.id);
    applyEditsToBlocks(m, project.blocks);
    expect(JSON.stringify(buildDemoProject())).toBe(snapshot);
  });

  it("leaves the original model untouched on every transition", () => {
    const first = edit(EMPTY_EDIT_MODEL, editedOnce());
    const second = edit(first, `${editedOnce()}\n// more`);
    expect(currentSource(first, MOTOR.id, BASE)).toBe(editedOnce());
    expect(currentSource(second, MOTOR.id, BASE)).not.toBe(editedOnce());
    expect(EMPTY_EDIT_MODEL.byArtifact).toEqual({});
  });
});
