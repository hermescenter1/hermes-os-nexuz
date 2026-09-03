/**
 * PHASE 109-C1 — domain contract, demo adapter, symbol index and validation.
 *
 * These are the tests that make the Studio's claims checkable rather than
 * asserted: the origin boundary, the determinism of the demo adapter, the exact
 * cross-reference of every sentinel symbol, and the exact set of findings the
 * validator produces on a fixture whose defects are declared in advance.
 */

import { describe, expect, it } from "vitest";

import {
  ALL_DATA_ORIGINS,
  assertPermittedOrigin,
  AutomationStudioOriginError,
  AutomationStudioPathError,
  buildDemoProject,
  buildSymbolIndex,
  buildTree,
  countBySeverity,
  createLocalWorkspace,
  crossReference,
  definitionOf,
  DEMO_EPOCH_MS,
  DIAGNOSTIC_CODES,
  duplicateSymbols,
  EXPECTED_PASSING_CODES,
  isEditableApprovalState,
  isLiveOrigin,
  isPermittedOrigin,
  LIVE_ORIGINS,
  normaliseArtifactPath,
  orphanSymbols,
  PERMITTED_ORIGINS_ROUND_1,
  querySymbols,
  resolveWorkspaceSource,
  SEEDED_DEFECT_CODES,
  unresolvedSymbols,
  validateProject,
  visibleNodes,
  workspaceIsEditable,
  type DiagnosticCode,
} from "..";

const SENTINELS = [
  "Motor_101_StartCmd",
  "Motor_101_RunFb",
  "Motor_101_Overload",
  "Motor_101_Reset",
  "Motor_101_RunTimeout",
  "Line_01_AutoMode",
] as const;

describe("109-C1 · origin boundary", () => {
  it("permits only simulated and authored in Round 1", () => {
    expect([...PERMITTED_ORIGINS_ROUND_1]).toEqual(["simulated", "authored"]);
  });

  it("classifies both live origins as live", () => {
    expect([...LIVE_ORIGINS]).toEqual(["live-readonly", "live-controlled"]);
    for (const origin of LIVE_ORIGINS) {
      expect(isLiveOrigin(origin)).toBe(true);
      expect(isPermittedOrigin(origin)).toBe(false);
    }
  });

  it("refuses every live origin, and refuses it by throwing", () => {
    for (const origin of LIVE_ORIGINS) {
      expect(() => assertPermittedOrigin(origin)).toThrow(AutomationStudioOriginError);
    }
  });

  it("fails closed on an origin outside the union entirely", () => {
    // What an untrusted payload looks like.
    expect(() => assertPermittedOrigin("live" as never)).toThrow(AutomationStudioOriginError);
    expect(() => assertPermittedOrigin("" as never)).toThrow(AutomationStudioOriginError);
  });

  it("models imported but does not yet permit it", () => {
    expect(ALL_DATA_ORIGINS).toContain("imported");
    expect(isPermittedOrigin("imported")).toBe(false);
  });
});

describe("109-C1 · artifact path safety", () => {
  it("normalises separators and keeps a relative path", () => {
    expect(normaliseArtifactPath("PLC\\ProgramBlocks\\FB_Motor.scl")).toBe(
      "PLC/ProgramBlocks/FB_Motor.scl",
    );
  });

  it("rejects traversal rather than sanitising it", () => {
    for (const bad of ["../secrets", "PLC/../../etc/passwd", "./PLC/x", "PLC/./x"]) {
      expect(() => normaliseArtifactPath(bad), bad).toThrow(AutomationStudioPathError);
    }
  });

  it("rejects absolute and drive-qualified paths", () => {
    expect(() => normaliseArtifactPath("/etc/passwd")).toThrow(AutomationStudioPathError);
    expect(() => normaliseArtifactPath("C:/Windows/System32")).toThrow(AutomationStudioPathError);
  });

  it("rejects a NUL byte, an empty path and an over-long path", () => {
    expect(() => normaliseArtifactPath("PLC/\0evil")).toThrow(AutomationStudioPathError);
    expect(() => normaliseArtifactPath("")).toThrow(AutomationStudioPathError);
    expect(() => normaliseArtifactPath("a/".repeat(400))).toThrow(AutomationStudioPathError);
  });
});

describe("109-C1 · local demo adapter", () => {
  it("declares SIMULATED literally and has no live connection", () => {
    const source = resolveWorkspaceSource();
    expect(source.classification).toBe("SIMULATED");
    expect(source.origin).toBe("simulated");
    expect(source.liveConnection).toBeNull();
    expect(source.disclosureKeys.length).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic — two builds are structurally identical", () => {
    expect(JSON.stringify(buildDemoProject())).toBe(JSON.stringify(buildDemoProject()));
  });

  it("does not read the wall clock", () => {
    // Pinned to the LITERAL instant, not to DEMO_EPOCH_MS: comparing the
    // constant against itself stays true even if it becomes Date.now(), which
    // is precisely the regression this is meant to catch.
    const FIXED = 1_768_464_000_000;
    expect(DEMO_EPOCH_MS).toBe(FIXED);
    const project = buildDemoProject();
    expect(project.provenance.recordedAtEpochMs).toBe(FIXED);
    for (const artifact of project.artifacts) {
      expect(artifact.modifiedAtEpochMs).toBe(FIXED);
    }
  });

  it("builds a workspace with no live connection and a draft working version", () => {
    const workspace = createLocalWorkspace();
    expect(workspace.liveConnection).toBeNull();
    expect(workspace.mode).toBe("simulation");
    expect(workspace.workingVersion.approval).toBe("draft");
    expect(workspaceIsEditable(workspace)).toBe(true);
  });

  it("treats every non-draft approval state as read-only", () => {
    expect(isEditableApprovalState("draft")).toBe(true);
    for (const state of ["reviewed", "approved", "commissioned"] as const) {
      expect(isEditableApprovalState(state), state).toBe(false);
    }
  });

  it("every artifact that HAS provenance carries a permitted origin", () => {
    for (const artifact of buildDemoProject().artifacts) {
      if (!artifact.provenance) continue;
      expect(isPermittedOrigin(artifact.provenance.origin), artifact.name).toBe(true);
    }
  });
});

describe("109-C1 · symbol index and cross-reference", () => {
  const index = buildSymbolIndex(buildDemoProject());

  it("resolves every sentinel symbol", () => {
    for (const name of SENTINELS) {
      const entry = index.byName.get(name);
      expect(entry, `${name} missing from the index`).toBeDefined();
      expect(entry!.declarations.length, `${name} undeclared`).toBeGreaterThan(0);
    }
  });

  it("Motor_101_StartCmd: exact reads, writes and bindings", () => {
    const entry = index.byName.get("Motor_101_StartCmd")!;
    // 1 in OB1 wiring + 3 in the FB_Motor body.
    expect(entry.reads.length).toBe(4);
    expect(entry.writes.length).toBe(0);
    expect(entry.bindings.length).toBe(2);
    expect(entry.unresolved).toBe(false);
    expect(entry.orphan).toBe(false);
  });

  it("Motor_101_RunFb is declared read-only yet written by the SCADA area", () => {
    const entry = index.byName.get("Motor_101_RunFb")!;
    expect(entry.declarations[0].writable).toBe(false);
    expect(entry.writes.length).toBe(1);
    expect(entry.writes[0].artifactId).toBe("art-scada-area");
  });

  it("Motor_101_RunTimeout is a Time quantity with no unit", () => {
    const entry = index.byName.get("Motor_101_RunTimeout")!;
    expect(entry.declarations[0].dataType).toBe("Time");
    expect(entry.declarations[0].engineeringUnit).toBeNull();
  });

  it("Line_01_AutoMode is declared twice and used widely", () => {
    const entry = index.byName.get("Line_01_AutoMode")!;
    expect(entry.duplicate).toBe(true);
    expect(entry.declarations.length).toBe(2);
    expect(entry.all.length).toBeGreaterThanOrEqual(5);
  });

  it("Motor_101_Overload and Motor_101_Reset resolve to FB_Motor", () => {
    expect(definitionOf(index, "Motor_101_Overload")!.declaredIn).toBe("blk-fb-motor");
    expect(definitionOf(index, "Motor_101_Reset")!.declaredIn).toBe("blk-fb-motor");
  });

  it("detects the orphan, the unresolved and the duplicate exactly", () => {
    expect(orphanSymbols(index).map((e) => e.name)).toEqual(["Line_01_SpareTag"]);
    expect(unresolvedSymbols(index).map((e) => e.name).sort()).toEqual([
      "Line_01_EStop",
      "Motor_102_RunFb",
    ]);
    expect(duplicateSymbols(index).map((e) => e.name)).toEqual(["Line_01_AutoMode"]);
  });

  it("cross-reference is ordered by artifact then line", () => {
    const refs = crossReference(index, "Motor_101_RunFb");
    expect(refs.length).toBeGreaterThan(0);
    for (let i = 1; i < refs.length; i += 1) {
      const prev = refs[i - 1];
      const cur = refs[i];
      const ordered =
        prev.artifactId < cur.artifactId ||
        (prev.artifactId === cur.artifactId && prev.line <= cur.line);
      expect(ordered, `${prev.artifactId}:${prev.line} then ${cur.artifactId}:${cur.line}`).toBe(true);
    }
  });

  it("cross-reference of an unknown symbol is empty, not an error", () => {
    expect(crossReference(index, "No_Such_Symbol")).toEqual([]);
    expect(definitionOf(index, "No_Such_Symbol")).toBeNull();
  });

  it("search is literal, case-insensitive, and never compiles a regex", () => {
    expect(querySymbols(index, { text: "motor_101" }).length).toBeGreaterThan(4);
    expect(querySymbols(index, { text: "MOTOR_101_RUNFB" }).map((e) => e.name)).toEqual([
      "Motor_101_RunFb",
    ]);
    // A regex metacharacter is matched as a literal, so it finds nothing —
    // rather than matching everything, or throwing.
    expect(querySymbols(index, { text: ".*" })).toEqual([]);
    expect(querySymbols(index, { text: "(((" })).toEqual([]);
  });

  it("refuses an over-long query instead of scanning with it", () => {
    expect(querySymbols(index, { text: "a".repeat(500) })).toEqual([]);
  });

  it("filters by scope, by data type and by problem state", () => {
    expect(querySymbols(index, { scope: "scada" }).map((e) => e.name)).toEqual([
      "Line_01_AutoMode",
    ]);
    expect(querySymbols(index, { dataType: "Time" }).map((e) => e.name)).toEqual([
      "Motor_101_RunTimeout",
    ]);
    const problems = querySymbols(index, { onlyProblems: true }).map((e) => e.name).sort();
    expect(problems).toEqual([
      "Line_01_AutoMode",
      "Line_01_EStop",
      "Line_01_SpareTag",
      "Motor_102_RunFb",
    ]);
  });

  it("orders entries independently of the viewer's locale", () => {
    const names = index.entries.map((e) => e.name);
    expect([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(names);
  });
});

describe("109-C1 · validation engine", () => {
  const project = buildDemoProject();
  const run = validateProject(project, DEMO_EPOCH_MS);
  const codes = new Set(run.findings.map((f) => f.code));

  it("fires exactly the seeded defect codes", () => {
    for (const code of SEEDED_DEFECT_CODES) {
      expect(codes.has(code as DiagnosticCode), `${code} did not fire`).toBe(true);
    }
  });

  it("leaves the two disclosure codes green — the baseline is not all-red", () => {
    for (const code of EXPECTED_PASSING_CODES) {
      expect(codes.has(code as DiagnosticCode), `${code} fired unexpectedly`).toBe(false);
      expect(run.passedCodes).toContain(code);
    }
  });

  it("names the unresolved symbol and its location", () => {
    const f = run.findings.find((x) => x.code === DIAGNOSTIC_CODES.UNRESOLVED_SYMBOL && x.symbolName === "Line_01_EStop");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("error");
    expect(f!.artifactPath).toBe("PLC/ProgramBlocks/FC_Interlocks.scl");
    expect(f!.line).toBe(10);
  });

  it("names the duplicate, the orphan and the read-only write", () => {
    expect(run.findings.some((f) => f.code === DIAGNOSTIC_CODES.DUPLICATE_SYMBOL && f.symbolName === "Line_01_AutoMode")).toBe(true);
    expect(run.findings.some((f) => f.code === DIAGNOSTIC_CODES.UNUSED_SYMBOL && f.symbolName === "Line_01_SpareTag")).toBe(true);
    expect(run.findings.some((f) => f.code === DIAGNOSTIC_CODES.WRITE_TO_READ_ONLY_SYMBOL && f.symbolName === "Motor_101_RunFb")).toBe(true);
  });

  it("finds the HMI binding with no PLC symbol", () => {
    const f = run.findings.find((x) => x.code === DIAGNOSTIC_CODES.HMI_BINDING_WITHOUT_PLC_SYMBOL);
    expect(f!.symbolName).toBe("Motor_102_RunFb");
    expect(f!.artifactPath).toBe("HMI/Screens/Line01_Overview.screen");
  });

  it("finds the alarm without a priority, and NOT the one with one", () => {
    const alarms = run.findings.filter((f) => f.code === DIAGNOSTIC_CODES.ALARM_WITHOUT_PRIORITY);
    expect(alarms.map((f) => f.symbolName)).toEqual(["Motor_101_Overload"]);
  });

  it("finds the command with no feedback, and NOT the motor command that has one", () => {
    const cmds = run.findings.filter((f) => f.code === DIAGNOSTIC_CODES.COMMAND_WITHOUT_FEEDBACK);
    expect(cmds.map((f) => f.symbolName)).toEqual(["Valve_201_OpenCmd"]);
  });

  it("finds the quantity without a unit and the artifact without provenance", () => {
    expect(run.findings.some((f) => f.code === DIAGNOSTIC_CODES.QUANTITY_WITHOUT_UNIT && f.symbolName === "Motor_101_RunTimeout")).toBe(true);
    const prov = run.findings.find((f) => f.code === DIAGNOSTIC_CODES.ARTIFACT_WITHOUT_PROVENANCE);
    expect(prov!.artifactPath).toBe("SCADA/Reports/Shift_Report.report");
  });

  it("returns message KEYS, never display prose", () => {
    for (const f of run.findings) {
      expect(f.messageKey, f.code).toMatch(/^[a-zA-Z]+$/);
      expect(f.messageKey).not.toContain(" ");
    }
  });

  it("is pure — the same input yields byte-identical output", () => {
    expect(JSON.stringify(validateProject(project, DEMO_EPOCH_MS))).toBe(
      JSON.stringify(validateProject(buildDemoProject(), DEMO_EPOCH_MS)),
    );
  });

  it("orders errors before warnings", () => {
    const rank = { error: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < run.findings.length; i += 1) {
      expect(rank[run.findings[i - 1].severity]).toBeLessThanOrEqual(rank[run.findings[i].severity]);
    }
  });

  it("reports both errors and warnings, so the baseline is realistic", () => {
    const counts = countBySeverity(run);
    expect(counts.error).toBeGreaterThan(0);
    expect(counts.warning).toBeGreaterThan(0);
  });

  it("counts what it actually checked", () => {
    expect(run.checkedArtifacts).toBe(project.artifacts.length);
    expect(run.checkedReferences).toBe(project.references.length);
    expect(run.checkedSymbols).toBeGreaterThan(0);
  });

  it("fires the live-origin rule when an artifact claims one", () => {
    const poisoned = {
      ...project,
      artifacts: project.artifacts.map((a, i) =>
        i === 0 ? { ...a, provenance: { ...a.provenance, origin: "live-controlled" as const } } : a,
      ),
    };
    const poisonedRun = validateProject(poisoned, DEMO_EPOCH_MS);
    expect(poisonedRun.findings.some((f) => f.code === DIAGNOSTIC_CODES.FORBIDDEN_LIVE_ORIGIN)).toBe(true);
  });

  it("fires the disclosure rule when a simulated artifact hides its origin", () => {
    const poisoned = {
      ...project,
      // A SIMULATED artifact: the blocks are "authored", so poisoning one of
      // those would not exercise this rule at all.
      artifacts: project.artifacts.map((a) =>
        a.id === "art-hmi-alarms" ? { ...a, provenance: { ...a.provenance, disclosure: "" } } : a,
      ),
    };
    const poisonedRun = validateProject(poisoned, DEMO_EPOCH_MS);
    expect(poisonedRun.findings.some((f) => f.code === DIAGNOSTIC_CODES.SIMULATED_VALUE_WITHOUT_DISCLOSURE)).toBe(true);
  });
});

describe("109-C1 · project tree", () => {
  const project = buildDemoProject();
  const tree = buildTree(project);

  it("contains every artifact exactly once", () => {
    const artifactNodes = tree.filter((n) => n.kind === "artifact");
    expect(artifactNodes.length).toBe(project.artifacts.length);
    expect(new Set(artifactNodes.map((n) => n.id)).size).toBe(project.artifacts.length);
  });

  it("synthesises the discipline folders from paths alone", () => {
    const roots = tree.filter((n) => n.kind === "folder" && n.depth === 0).map((n) => n.label);
    expect(roots.sort()).toEqual(["Documentation", "HMI", "PLC", "SCADA", "Tests"]);
  });

  it("gives every node a parent that exists, except the roots", () => {
    const ids = new Set(tree.map((n) => n.id));
    for (const node of tree) {
      if (node.parentId === null) continue;
      expect(ids.has(node.parentId), `${node.id} has a dangling parent`).toBe(true);
    }
  });

  it("hides descendants of a collapsed folder", () => {
    const expandedAll = new Set(tree.filter((n) => n.kind === "folder").map((n) => n.id));
    expect(visibleNodes(tree, expandedAll).length).toBe(tree.length);

    const withoutPlc = new Set([...expandedAll].filter((id) => id !== "folder:PLC"));
    const visible = visibleNodes(tree, withoutPlc);
    expect(visible.length).toBeLessThan(tree.length);
    expect(visible.some((n) => n.path.startsWith("PLC/"))).toBe(false);
    expect(visible.some((n) => n.id === "folder:PLC")).toBe(true);
  });
});
