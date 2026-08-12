// PHASE 101 — TIA-05, the automotive body-shop robotic spot-welding cell.
//
// TIA-05 exists to prove two boundaries, and almost everything asserted below
// is a consequence of one of them.
//
// THE SAFETY-CONTROLLER BOUNDARY
//   - Every safety-controller object is safety-critical and carries no inbound
//     control path. The gate, its guard lock, the light curtain, the E-stop
//     chain, zone clearance and the robot motion enable are read-only evidence.
//   - `PRM_SAFETY_GRANTED` is a VIEW of the motion grant, assembled from that
//     evidence. The grant itself is an input, and the source withdraws the weld
//     request when it is lost — with no partial fallback.
//   - A safe stop drops the cell to idle and leaves it there; the startup block
//     resets no stop and raises a restart review instead of assuming the cell
//     is empty.
//
// WELD QUALITY IS MEASURED, NEVER INFERRED
//   - A missing measurement and a stale parameter link both WITHDRAW confidence
//     rather than being carried forward as a good weld.
//   - The verified-spot counter advances only while confidence holds, and the
//     cell will not release a body until the verified count reaches the target.
//   - The schedule is immutable once a spot has been made on the body, and the
//     electrode wear counter is cleared only by a completed dress.

import { describe, it, expect } from "vitest";
import { CORPUS, corpusIndex, resolveSymbol, sourceAgreementReport } from "../corpus";
import { diagnose } from "../diagnostics";
import { governanceFor, neighbours, traverse } from "../graph";
import { extractScl } from "../extractors/scl";
import { isHumanInvokable, isReviewOnly } from "../types";
import type { KnowledgeEdge, ReferenceSystem } from "../types";

const system = CORPUS.find((s) => s.id === "TIA-05") as ReferenceSystem;
const index = corpusIndex();

const nodeId = (kind: string, local: string) => `TIA-05:${kind}:${local}`;

const CONTROL_RELATIONS = ["COMMANDS", "WRITES", "ACTUATES"] as const;
const isControl = (e: KnowledgeEdge) =>
  (CONTROL_RELATIONS as readonly string[]).includes(e.relation);

const artifact = (local: string) => system.artifacts.find((x) => x.local === local)!;

describe("PHASE 101 — TIA-05 registration and provenance", () => {
  it("is registered in the corpus as a sealed TIA reference", () => {
    expect(system).toBeDefined();
    expect(system.sourceType).toBe("TIA_REFERENCE");
    expect(system.origin).toBe("SYNTHETIC_ORIGINAL");
    expect(system.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(system.nodes.length).toBe(295);
    expect(system.edges.length).toBe(612);
    expect(system.artifacts.length).toBe(14);
    expect(system.scenarios.length).toBeGreaterThanOrEqual(9);
    expect(system.scenarios.length).toBe(13);
  });

  it("declares the complete block architecture the platform expects", () => {
    const blocks = system.nodes.filter((n) => n.kind === "PLC_BLOCK");
    expect(blocks.length).toBe(24);
    const byType = (type: string) => blocks.filter((b) => b.attributes.blockType === type).length;
    expect(byType("OB")).toBe(2);
    expect(byType("FB")).toBe(7);
    expect(byType("FC")).toBe(4);
    expect(byType("DB")).toBe(5);
    expect(byType("UDT")).toBe(6);
  });

  it("models the cell from the shuttle to the safety fence", () => {
    for (const local of [
      "SHUTTLE_CONVEYOR",
      "GEO_FIXTURE",
      "CLAMP_GROUP_A",
      "CLAMP_GROUP_B",
      "LOCATING_PINS",
      "ROBOT_R1",
      "ROBOT_R2",
      "ROBOT_R3",
      "ROBOT_R4",
      "WELD_GUN_R1",
      "WELD_GUN_R2",
      "WELD_GUN_R3",
      "WELD_GUN_R4",
      "TIP_DRESSER",
      "WELD_WATER_CIRCUIT",
      "AIR_SUPPLY",
      "SAFETY_FENCE_GATE",
      "LOAD_LIGHT_CURTAIN",
      "EMERGENCY_STOP_CHAIN",
    ]) {
      expect(index.nodes.get(nodeId("EQUIPMENT", local))?.kind).toBe("EQUIPMENT");
    }
    const count = (kind: string) => system.nodes.filter((n) => n.kind === kind).length;
    expect(count("FAULT_MODE")).toBe(13);
    expect(count("SAFE_ACTION")).toBe(13);
    expect(count("ALARM")).toBe(18);
    expect(count("PERMISSIVE")).toBe(5);
    expect(count("INTERLOCK")).toBe(5);
    expect(count("KPI")).toBe(5);
  });

  it("stamps complete provenance and a deterministic checksum on every node and artefact", () => {
    for (const node of system.nodes) {
      expect(node.provenance.projectId).toBe("TIA-05");
      expect(node.provenance.checksum).toBe(system.checksum);
      expect(node.provenance.sourceId.length).toBeGreaterThan(0);
      expect(node.provenance.subsystem.length).toBeGreaterThan(0);
      expect(node.provenance.version).toBe(system.version);
      expect(node.provenance.revision).toBe(system.revision);
    }
    for (const art of system.artifacts) {
      expect(art.id).toBe(`TIA-05:SRC:${art.local}`);
      expect(art.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(art.lineCount).toBeGreaterThan(0);
      expect(art.content).not.toContain("\r");
      expect(art.provenance.projectId).toBe("TIA-05");
      expect(art.provenance.checksum).toBe(system.checksum);
    }
  });

  it("derives every KPI from named tags", () => {
    const kpis = system.nodes.filter((n) => n.kind === "KPI");
    for (const kpi of kpis) {
      const derived = system.edges.filter((e) => e.relation === "DERIVED_FROM" && e.source === kpi.id);
      expect(derived.length, `${kpi.id} must be derived from a tag`).toBeGreaterThan(0);
      for (const edge of derived) expect(index.nodes.get(edge.target)?.kind).toBe("TAG");
    }
  });

  it("authors every label in both languages, in Persian rather than transliteration", () => {
    for (const node of system.nodes) {
      expect(node.label.en.trim().length, node.id).toBeGreaterThan(0);
      expect(node.label.fa.trim().length, node.id).toBeGreaterThan(0);
      expect(node.label.fa, node.id).toMatch(/[؀-ۿ]/);
      // Arabic yeh and kaf are a different letter from the Persian ones.
      expect(node.label.fa, node.id).not.toMatch(/[يك]/);
    }
  });
});

describe("PHASE 101 — TIA-05 carries real, parseable SCL", () => {
  const sclArtifacts = system.artifacts.filter((x) => x.language === "SCL");

  it("ships twelve SCL artefacts and two structured graphical artefacts", () => {
    expect(sclArtifacts.length).toBe(12);
    expect(system.artifacts.filter((x) => x.language === "LAD_XML").length).toBe(1);
    expect(system.artifacts.filter((x) => x.language === "FBD_XML").length).toBe(1);
    const sclLines = sclArtifacts.reduce((sum, x) => sum + x.lineCount, 0);
    expect(sclLines).toBeGreaterThanOrEqual(500);
  });

  it("parses to exactly the twenty-four declared units, with no stub block", () => {
    const units = sclArtifacts.flatMap((x) => extractScl(x.content).units);
    expect(units.length).toBe(24);
    for (const unit of units) {
      expect(resolveSymbol(system, unit.name)?.kind, unit.name).toBe("PLC_BLOCK");
    }
    // Every executable unit states real relationships; a block that parsed to
    // nothing would be a stub wearing a block's name.
    const executable = units.filter((u) => !["DATA_BLOCK", "TYPE"].includes(u.kind));
    expect(executable.length).toBe(13);
    for (const unit of executable) {
      expect(unit.relations.length, `${unit.name} must state relationships`).toBeGreaterThan(0);
    }
  });

  it("contains every language construct the subset requires", () => {
    const all = sclArtifacts.map((x) => x.content).join("\n");
    expect(all).toMatch(/\bCASE\b[\s\S]*\bEND_CASE\b/);
    expect(all).toMatch(/:\s*TON\s*;/);
    expect(all).toMatch(/NOT\s+"GUN_R2_DRIVE_FAULT_PREV"/);
    expect(all).toMatch(/NOT\s+"CLAMPS_CLOSED_ALL"/);
    expect(all).toMatch(/SPOT_TARGET_MIN|SPOT_TARGET_MAX|TIP_LIFE_SPOTS|COUNT_MAX/);
    expect(all).toMatch(/Array\[1\.\.4\] of "UDT_ROBOT"/);
    expect(all).toMatch(/"MODE_AUTO"/);
    expect(all).toMatch(/"MODE_REMOTE"/);
    expect(all).toMatch(/ORGANIZATION_BLOCK "OB_STARTUP"/);
    // No dynamic execution, no vendor-archive claim, no placeholder.
    expect(all).not.toMatch(/\beval\b/i);
    expect(all).not.toMatch(/\.apXX|\.zapXX|\.ap1[0-9]|\.zap1[0-9]/i);
    expect(all).not.toMatch(/TODO|FIXME|placeholder|pseudocode/i);
  });

  it("names TIA Portal only to disclaim it, never to claim compilation", () => {
    for (const local of ["LAD_CELL_PERMISSIVE", "FBD_WELD_ENABLE"]) {
      expect(artifact(local).content).toMatch(/not produced, compiled or\s+validated by TIA Portal/i);
    }
    expect(system.platform).toMatch(/no vendor project archive is produced or claimed/i);
  });
});

describe("PHASE 101 — TIA-05 agrees with its own source", () => {
  const report = sourceAgreementReport(system);

  it("checks every SCL artefact and skips only the graphical ones", () => {
    expect(report.checked.length).toBe(12);
    expect(report.skipped).toEqual([
      { artifact: "LAD_CELL_PERMISSIVE", language: "LAD_XML", reason: "NO_RELATION_MAPPING" },
      { artifact: "FBD_WELD_ENABLE", language: "FBD_XML", reason: "NO_RELATION_MAPPING" },
    ]);
  });

  it("states its verdict as PARTIAL, with zero disagreements", () => {
    expect(report.issues).toEqual([]);
    expect(report.status).toBe("PARTIAL");
  });

  it("represents every relationship the source states as a graph edge", () => {
    const edgeKeys = new Set(system.edges.map((e) => `${e.relation}|${e.source}|${e.target}`));
    let checked = 0;
    for (const art of system.artifacts.filter((x) => x.language === "SCL")) {
      for (const unit of extractScl(art.content).units) {
        const owner = resolveSymbol(system, unit.name)!;
        for (const relation of unit.relations) {
          const target = resolveSymbol(system, relation.symbol);
          expect(target, `${unit.name} → ${relation.symbol}`).toBeTruthy();
          expect(
            edgeKeys.has(`${relation.relation}|${owner.id}|${target!.id}`),
            `${unit.name} ${relation.relation} ${relation.symbol}`,
          ).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(200);
  });
});

describe("PHASE 101 — TIA-05 safety-controller boundary", () => {
  const SAFETY_SURFACE = [
    ["DEVICE", "SAFETY_CONTROLLER"],
    ["EQUIPMENT", "SAFETY_FENCE_GATE"],
    ["EQUIPMENT", "LOAD_LIGHT_CURTAIN"],
    ["EQUIPMENT", "EMERGENCY_STOP_CHAIN"],
    ["TAG", "SAFETY_ZONE_CLEAR"],
    ["TAG", "FENCE_GATE_CLOSED"],
    ["TAG", "FENCE_GATE_LOCKED"],
    ["TAG", "LIGHT_CURTAIN_INTACT"],
    ["TAG", "ESTOP_CHAIN_HEALTHY"],
    ["TAG", "SAFE_STOP_ACTIVE"],
    ["TAG", "ROBOT_MOTION_ENABLE"],
    ["TAG", "SAFETY_ACK_REQUIRED"],
    ["IO_POINT", "FS_FENCE_GATE_CLOSED"],
    ["IO_POINT", "FS_LIGHT_CURTAIN"],
    ["IO_POINT", "FS_ESTOP_CHAIN"],
    ["INTERLOCK", "ILK_SAFETY_STOP"],
    ["INTERLOCK", "ILK_ZONE_NOT_CLEAR"],
    ["EVIDENCE_SOURCE", "HIST_SAFETY_EVENT_LOG"],
  ] as const;

  it("classifies the entire safety boundary as safety-critical", () => {
    for (const [kind, local] of SAFETY_SURFACE) {
      const node = index.nodes.get(nodeId(kind, local));
      expect(node, `${kind}:${local} must exist`).toBeDefined();
      expect(node!.provenance.safetyClass).toBe("SAFETY_CRITICAL");
      expect(isReviewOnly(node!.provenance.safetyClass)).toBe(true);
    }
  });

  it("has no incoming control path onto any safety-controller object", () => {
    for (const [kind, local] of SAFETY_SURFACE) {
      const id = nodeId(kind, local);
      expect(
        system.edges.filter((e) => isControl(e) && (e.source === id || e.target === id)),
        `${local} must have no control path`,
      ).toEqual([]);
    }
  });

  it("carries no command, write or actuation path onto ANY safety-classified object", () => {
    const safety = new Set(
      system.nodes.filter((n) => n.provenance.safetyClass !== "NON_SAFETY").map((n) => n.id),
    );
    expect(safety.size).toBeGreaterThan(0);
    expect(
      system.edges.filter((e) => isControl(e) && (safety.has(e.source) || safety.has(e.target))),
    ).toEqual([]);
    expect(system.edges.filter((e) => e.relation === "ACTUATES")).toEqual([]);
  });

  it("generates no mute, guard-release, stop-reset or robot-enable logic anywhere in its source", () => {
    const all = system.artifacts.map((x) => x.content).join("\n");
    // The safety terms appear only as READS in the SCL, never on the left of an
    // assignment: the program consults them and writes none of them.
    for (const symbol of [
      "SAFETY_ZONE_CLEAR",
      "FENCE_GATE_CLOSED",
      "FENCE_GATE_LOCKED",
      "LIGHT_CURTAIN_INTACT",
      "ESTOP_CHAIN_HEALTHY",
      "SAFE_STOP_ACTIVE",
      "ROBOT_MOTION_ENABLE",
      "SAFETY_ACK_REQUIRED",
    ]) {
      expect(all).not.toMatch(new RegExp(`"${symbol}"\\s*:=`));
    }
    expect(all).not.toMatch(
      /CURTAIN_MUTE|MUTE_ON|ESTOP_RESET|SAFETY_RESET|GUARD_UNLOCK|MOTION_ENABLE_CMD|SAFETY_OVERRIDE/i,
    );
  });

  it("withdraws the weld request the moment the safety view is lost", () => {
    const safety = artifact("FB_SAFETY_STATUS").content;
    // The permissive is assembled from read-only safety evidence…
    expect(safety).toMatch(
      /"PRM_SAFETY_GRANTED" := "SAFETY_ZONE_CLEAR"[\s\S]*AND "ROBOT_MOTION_ENABLE"[\s\S]*AND NOT "SAFE_STOP_ACTIVE";/,
    );
    // …a safe stop withdraws the request in this block…
    expect(safety).toMatch(/IF "SAFE_STOP_ACTIVE" THEN[\s\S]*"WELD_ENABLE" := FALSE;[\s\S]*END_IF;/);
    // …and the ELSE branch of the weld request is an unconditional withdrawal.
    expect(artifact("FB_WELD_SUPERVISION").content).toMatch(
      /IF "PRM_SAFETY_GRANTED"[\s\S]*THEN[\s\S]*"WELD_ENABLE" := TRUE;[\s\S]*ELSE[\s\S]*"WELD_ENABLE" := FALSE;[\s\S]*END_IF;/,
    );
    // The trip path in the sequence block does the same thing independently.
    expect(artifact("FB_CELL_SEQUENCE").content).toMatch(
      /IF "SAFE_STOP_ACTIVE" OR NOT "ROBOT_MOTION_ENABLE" THEN[\s\S]*"WELD_ENABLE" := FALSE;[\s\S]*END_IF;/,
    );
  });

  it("keeps the weld enable a request rather than an energisation", () => {
    const enable = index.nodes.get(nodeId("TAG", "WELD_ENABLE"))!;
    expect(enable.attributes.accessMode).toBe("READ");
    expect(enable.provenance.safetyClass).toBe("NON_SAFETY");
    // Wired to no gun object: it drives nothing and is bound to nothing.
    expect(
      system.edges.filter(
        (e) =>
          ["ACTUATES", "BOUND_TO", "COMMANDS"].includes(e.relation) &&
          (e.source === enable.id || e.target === enable.id),
      ),
    ).toEqual([]);
    // …and the force reference collapses to zero with it.
    expect(artifact("FB_WELD_SUPERVISION").content).toMatch(
      /IF NOT "SCHEDULE_VALID" OR NOT "WELD_ENABLE" THEN[\s\S]*"GUN_R2_FORCE_REF" := 0\.0;/,
    );
  });
});

describe("PHASE 101 — TIA-05 weld verification integrity", () => {
  it("withdraws confidence on a missing measurement and on staleness alike", () => {
    const quality = artifact("FC_LIBRARY").content;
    expect(quality).toMatch(
      /IF NOT "WELD_LOG_LINK_OK" OR "WELD_TELEMETRY_AGE" > "DB_CONFIG"\.StaleThresholdS THEN[\s\S]*"WELD_DATA_STALE" := TRUE;[\s\S]*END_IF;/,
    );
    expect(quality).toMatch(
      /IF NOT "WELD_MEASURED" OR "WELD_DATA_STALE" THEN[\s\S]*"WELD_QUALITY_CONFIDENCE_OK" := FALSE;[\s\S]*END_IF;/,
    );
  });

  it("advances the verified counter only while confidence holds", () => {
    expect(artifact("FC_LIBRARY").content).toMatch(
      /IF "WELD_QUALITY_CONFIDENCE_OK" THEN[\s\S]*"SPOTS_VERIFIED" := "SPOTS_VERIFIED" \+ 1;[\s\S]*END_IF;/,
    );
  });

  it("makes confidence a condition of releasing the body, not a comment", () => {
    expect(artifact("FB_CELL_SEQUENCE").content).toMatch(
      /40:[\s\S]*IF "WELD_QUALITY_CONFIDENCE_OK" AND "SPOTS_VERIFIED" >= "SPOT_TARGET_COUNT" THEN/,
    );
  });

  it("never reads an unmeasured or stale cycle as a good weld", () => {
    for (const [scenarioId, expectedFm] of [
      ["TIA-05-FS-12", "FM_WELD_TELEMETRY_STALE"],
      ["TIA-05-FS-07", "FM_ELECTRODE_WEAR_CURRENT_DECAY"],
    ] as const) {
      const scenario = system.scenarios.find((s) => s.id === scenarioId)!;
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(result.hypotheses[0].faultModeId).toBe(nodeId("FAULT_MODE", expectedFm));
      // No hypothesis reaches full confidence on evidence nobody can vouch for.
      expect(result.confidence).toBeLessThan(1);
      // …and the engine names what it was not given rather than assuming it.
      expect(result.missingEvidence.length).toBeGreaterThan(0);
    }
  });
});

describe("PHASE 101 — TIA-05 sequence, trip and restart behaviour", () => {
  const steps = [
    "C00_IDLE",
    "C10_BODY_INFEED",
    "C20_CLAMP_CLOSE",
    "C30_WELD_EXECUTION",
    "C40_WELD_VERIFY",
    "C50_CLAMP_OPEN",
    "C60_BODY_OUTFEED",
  ].map((local) => nodeId("STATE", local));

  it("reaches every state from idle and closes the cycle", () => {
    const transitions = system.edges.filter((e) => e.relation === "TRANSITIONS_TO");
    for (let i = 0; i < steps.length - 1; i += 1) {
      expect(
        transitions.some((e) => e.source === steps[i] && e.target === steps[i + 1]),
        `${steps[i]} must reach ${steps[i + 1]}`,
      ).toBe(true);
    }
    expect(transitions.some((e) => e.source === steps[6] && e.target === steps[0])).toBe(true);
    const reached = traverse(index, [steps[0]], { relations: ["TRANSITIONS_TO"], maxDepth: 7 });
    for (const step of steps.slice(1)) {
      expect(reached.map((r) => r.node.id), `${step} must be reachable`).toContain(step);
    }
  });

  it("walks the normal path infeed → clamp → weld → verify → open → outfeed in source", () => {
    const seq = artifact("FB_CELL_SEQUENCE").content;
    expect(seq).toMatch(/0:[\s\S]*IF "START_REQUEST"[\s\S]*"SEQ_STEP" := 10;/);
    expect(seq).toMatch(/10:[\s\S]*IF "SHUTTLE_IN_POSITION" AND "PART_SEATED_OK" THEN[\s\S]*"SEQ_STEP" := 20;/);
    expect(seq).toMatch(/20:[\s\S]*IF "PRM_FIXTURE_READY" THEN[\s\S]*"SEQ_STEP" := 30;/);
    expect(seq).toMatch(/30:[\s\S]*"ROBOT_CYCLE_DONE" AND "SPOT_COUNT_CYCLE" >= "SPOT_TARGET_COUNT"[\s\S]*"SEQ_STEP" := 40;/);
    expect(seq).toMatch(/40:[\s\S]*"WELD_QUALITY_CONFIDENCE_OK"[\s\S]*"SEQ_STEP" := 50;/);
    expect(seq).toMatch(/50:[\s\S]*IF "CLAMP_A_OPEN_FB" AND "CLAMP_B_OPEN_FB" THEN[\s\S]*"SEQ_STEP" := 60;/);
    expect(seq).toMatch(/60:[\s\S]*"CELL_RUNNING" := FALSE;[\s\S]*"SEQ_STEP" := 0;/);
  });

  it("returns the cell to a safe idle on a trip and never restarts by itself", () => {
    const seq = artifact("FB_CELL_SEQUENCE").content;
    expect(seq).toMatch(
      /IF "SAFE_STOP_ACTIVE" OR NOT "ROBOT_MOTION_ENABLE" THEN[\s\S]*"SEQ_STEP" := 0;[\s\S]*"CELL_RUNNING" := FALSE;[\s\S]*"WELD_ENABLE" := FALSE;[\s\S]*"CLAMP_CLOSE_CMD" := FALSE;/,
    );
    // Leaving idle requires an explicit operator start request every time.
    expect(seq).toMatch(/0:[\s\S]*IF "START_REQUEST"/);
    // The startup block initialises to a safe idle state, resets no stop and
    // starts nothing.
    const startup = artifact("OB_STARTUP").content;
    expect(startup).toMatch(/"WELD_ENABLE" := FALSE;/);
    expect(startup).toMatch(/"CELL_RUNNING" := FALSE;/);
    expect(startup).toMatch(/"RESTART_REVIEW_REQUIRED" := TRUE;/);
    expect(startup).not.toMatch(/"START_REQUEST"|"CELL_RUNNING" := TRUE|SAFE_STOP|MOTION_ENABLE/);
    // …and an ambiguous body picture blocks the automatic start until a human
    // has reconciled it.
    expect(seq).toMatch(/AND NOT "RESTART_REVIEW_REQUIRED"/);
    // A safety acknowledgement demand raises the same review rather than
    // answering it.
    expect(artifact("FB_SAFETY_STATUS").content).toMatch(
      /IF "SAFETY_ACK_REQUIRED" THEN[\s\S]*"RESTART_REVIEW_REQUIRED" := TRUE;/,
    );
  });

  it("refuses an automatic start while a pendant is still enabled", () => {
    expect(artifact("FB_CELL_SEQUENCE").content).toMatch(/AND NOT "TEACH_MODE_ACTIVE"/);
  });

  it("reads every interlock and writes none of them", () => {
    const interlocks = system.nodes.filter((n) => n.kind === "INTERLOCK");
    expect(interlocks.length).toBe(5);
    for (const interlock of interlocks) {
      expect(
        system.edges.filter((e) => isControl(e) && e.target === interlock.id),
        `${interlock.id} must never be written`,
      ).toEqual([]);
      // …and each is genuinely observed: it is read by something, or it stands
      // as declared evidence for a fault mode. An interlock nothing looks at
      // would be a safety object the diagnosis could never cite.
      expect(
        system.edges.some(
          (e) =>
            (e.relation === "READS" && e.target === interlock.id) ||
            (e.relation === "EVIDENCE_FOR" && e.source === interlock.id),
        ),
        `${interlock.id} must be observed as evidence`,
      ).toBe(true);
      expect(
        system.edges.some((e) => e.relation === "BLOCKS" && e.source === interlock.id),
        `${interlock.id} must block a step`,
      ).toBe(true);
      expect(isReviewOnly(interlock.provenance.safetyClass)).toBe(true);
    }
  });

  it("closes the fixture on both groups and both limits, never on one", () => {
    const fixture = artifact("FB_FIXTURE_CONTROL").content;
    expect(fixture).toMatch(
      /"PART_SEATED_OK" := "PART_PRESENT_1" AND "PART_PRESENT_2" AND "GEO_PIN_ENGAGED";/,
    );
    expect(fixture).toMatch(
      /"CLAMPS_CLOSED_ALL" := "CLAMP_A_CLOSED_FB" AND "CLAMP_B_CLOSED_FB"[\s\S]*AND NOT "CLAMP_A_OPEN_FB" AND NOT "CLAMP_B_OPEN_FB";/,
    );
    expect(fixture).toMatch(/CLAMP_TIME_MAX/);
    // A clamp that reports both positions is a discrepancy, not a preference.
    expect(artifact("FB_CELL_SEQUENCE").content).toMatch(
      /IF "CLAMP_B_OPEN_FB" AND "CLAMP_B_CLOSED_FB" THEN[\s\S]*"ALM_CLAMP_DISCREPANCY" := TRUE;/,
    );
  });

  it("withdraws robot readiness rather than carrying a stale frame forward", () => {
    expect(artifact("FB_ROBOT_COORDINATION").content).toMatch(
      /IF NOT "R3_LINK_OK" OR "R3_TELEMETRY_AGE" > STALE_LIMIT_S THEN[\s\S]*"ROBOTS_READY_ALL" := FALSE;[\s\S]*END_IF;/,
    );
    expect(artifact("FB_ROBOT_COORDINATION").content).toMatch(
      /"PRM_ROBOTS_READY" := "ROBOTS_READY_ALL" AND "ROBOTS_AT_HOME" AND "PRM_SAFETY_GRANTED";/,
    );
  });
});

describe("PHASE 101 — TIA-05 schedule integrity and electrode life", () => {
  it("bounds every schedule parameter and refuses to invent a default", () => {
    const variant = artifact("FB_VARIANT_MANAGEMENT").content;
    expect(variant).toMatch(/SPOT_TARGET_MIN/);
    expect(variant).toMatch(/SPOT_TARGET_MAX/);
    expect(variant).toMatch(/FORCE_MIN/);
    expect(variant).toMatch(/FORCE_MAX/);
    expect(variant).toMatch(
      /"SCHEDULE_CHECKSUM_OK" := "SCHEDULE_CHECKSUM_ACT" = "DB_SCHEDULE"\.RevisionChecksum;/,
    );
    expect(variant).toMatch(/"SCHEDULE_MATCHES_VARIANT" := "SCHEDULE_ID_LOADED" = "VARIANT_ID_ACT";/);
    // A missing or invalid schedule prevents the automatic start.
    expect(artifact("FB_CELL_SEQUENCE").content).toMatch(/AND "PRM_SCHEDULE_READY"/);
    // The stored schedule carries its own revision identity.
    expect(artifact("DB_DEFINITIONS").content).toMatch(/RevisionChecksum\s*:\s*DWord/);
  });

  it("locks the schedule once a spot has been made and refers a change for review", () => {
    const variant = artifact("FB_VARIANT_MANAGEMENT").content;
    expect(variant).toMatch(
      /IF "CELL_RUNNING" AND "SPOT_COUNT_CYCLE" > 0 THEN[\s\S]*"SCHEDULE_LOCKED" := TRUE;/,
    );
    expect(variant).toMatch(
      /IF "SCHEDULE_CHANGE_REQUEST" AND "SCHEDULE_LOCKED" THEN[\s\S]*"SCHEDULE_CHANGE_REVIEW" := TRUE;/,
    );
    // Nothing writes the schedule data block: the profile is read, never edited
    // by the running program.
    expect(
      system.edges.filter((e) => isControl(e) && e.target === nodeId("PLC_BLOCK", "DB_SCHEDULE")),
    ).toEqual([]);
  });

  it("clears the electrode wear counter only on a completed dress", () => {
    const tip = artifact("FB_TIP_MANAGEMENT").content;
    expect(tip).toMatch(/"TIP_WEAR_COUNT" := "TIP_WEAR_COUNT" \+ "SPOT_COUNT_CYCLE";/);
    expect(tip).toMatch(/IF "TIP_DRESS_DONE" THEN[\s\S]*"TIP_WEAR_COUNT" := 0;/);
    // A jammed or faulted dresser has not dressed anything.
    expect(tip).toMatch(
      /IF "DRESSER_BLADE_JAM" OR "DRESSER_MOTOR_FAULT" THEN[\s\S]*"TIP_DRESS_DONE" := FALSE;/,
    );
    // The only assignment of zero to the counter is the one guarded by the
    // completed dress — the startup block never clears it.
    expect(tip.match(/"TIP_WEAR_COUNT" := 0;/g)!.length).toBe(1);
    expect(artifact("OB_STARTUP").content).not.toMatch(/TIP_WEAR/);
  });

  it("demands both utilities before anything asks to weld", () => {
    expect(artifact("FC_LIBRARY").content).toMatch(
      /"PRM_UTILITY_READY" := "WELD_WATER_FLOW_OK" AND "AIR_PRESSURE_OK";/,
    );
    expect(artifact("FB_WELD_SUPERVISION").content).toMatch(/AND "PRM_UTILITY_READY"/);
  });
});

describe("PHASE 101 — TIA-05 governance", () => {
  const SCRIPTS = {
    start: nodeId("SCRIPT", "OnCycleStartIntent"),
    schedule: nodeId("SCRIPT", "OnScheduleSelectIntent"),
    tipDress: nodeId("SCRIPT", "OnTipDressIntent"),
    ack: nodeId("SCRIPT", "OnAlarmAcknowledge"),
    kpi: nodeId("SCRIPT", "OnKpiPublish"),
  };

  it("requires role, permission and confirmation on every human-invokable action", () => {
    const human = system.nodes.filter((n) => n.kind === "SCRIPT" && isHumanInvokable(n));
    expect(human.length).toBe(4);
    for (const script of human) {
      expect(governanceFor(index, script.id).roles.length).toBe(1);
      const written = system.edges
        .filter((e) => e.relation === "WRITES" && e.source === script.id)
        .map((e) => index.nodes.get(e.target)!);
      expect(written.length).toBeGreaterThan(0);
      for (const tag of written) {
        expect(tag.attributes.accessMode).toBe("WRITE");
        expect(tag.attributes.requiredPermission).toBeTruthy();
        expect(tag.attributes.requiresConfirmation).toBe(true);
      }
    }
    expect(governanceFor(index, SCRIPTS.tipDress).roles[0].id).toBe(
      nodeId("ROLE", "Role_MaintenanceTechnician"),
    );
    expect(governanceFor(index, SCRIPTS.schedule).roles[0].id).toBe(
      nodeId("ROLE", "Role_WeldEngineer"),
    );
  });

  it("backs the start intent with evidence a permissive also reads", () => {
    const gatingReaders = new Set(
      system.edges
        .filter((e) => e.relation === "READS")
        .filter((e) => {
          const source = index.nodes.get(e.source);
          return source?.kind === "PERMISSIVE" || source?.kind === "INTERLOCK";
        })
        .map((e) => e.target),
    );
    const consulted = system.edges
      .filter((e) => e.relation === "READS" && e.source === SCRIPTS.start)
      .map((e) => e.target);
    expect(
      consulted.filter((id) =>
        system.edges.some(
          (e) => e.relation === "MIRRORS" && e.source === id && gatingReaders.has(e.target),
        ),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("gives the scheduled routine no role and still an audit record", () => {
    const node = index.nodes.get(SCRIPTS.kpi)!;
    expect(isHumanInvokable(node)).toBe(false);
    expect(node.attributes.humanInvokable).toBeUndefined();
    expect(governanceFor(index, SCRIPTS.kpi).roles).toEqual([]);
    expect(governanceFor(index, SCRIPTS.kpi).auditEventTypes.length).toBe(1);
  });

  it("declares no operator command anywhere on the safety surface", () => {
    const indicator = nodeId("HMI_OBJECT", "Ind_SafetyStatus");
    expect(system.edges.filter((e) => e.relation === "COMMANDS" && e.source === indicator)).toEqual([]);
    // The panel mirrors the motion grant read-only, and nothing writes it back.
    const mirror = nodeId("SCADA_TAG", "HMI_Safety_Granted");
    expect(index.nodes.get(mirror)!.attributes.accessMode).toBe("READ");
    expect(system.edges.filter((e) => e.relation === "WRITES" && e.target === mirror)).toEqual([]);
  });

  it("keeps the governance layer out of every diagnostic walk", () => {
    for (const origin of [
      nodeId("ALARM", "ALM_SAFETY_STOP_ACTIVE"),
      nodeId("ALARM", "ALM_WELD_QUALITY_UNVERIFIED"),
      nodeId("ALARM", "ALM_CLAMP_POSITION_DISCREPANCY"),
    ]) {
      const reached = traverse(index, [origin], { direction: "both", maxDepth: 6 });
      const kinds = new Set(reached.map((r) => r.node.kind));
      expect(kinds.has("ROLE")).toBe(false);
      expect(kinds.has("AUDIT_EVENT_TYPE")).toBe(false);
    }
    const plain = neighbours(index, SCRIPTS.schedule, { direction: "out" }).map((n) => n.node.kind);
    expect(plain).not.toContain("ROLE");
    expect(plain).not.toContain("AUDIT_EVENT_TYPE");
  });
});

describe("PHASE 101 — TIA-05 diagnosis", () => {
  it("ranks the true root cause, subsystem and fault class first on all thirteen scenarios", () => {
    for (const scenario of system.scenarios) {
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(result.hypotheses[0]?.faultModeId, scenario.id).toBe(scenario.groundTruth.faultModeId);
      expect(result.hypotheses[0]?.subsystem, scenario.id).toBe(scenario.groundTruth.subsystem);
      expect(result.hypotheses[0]?.faultClass, scenario.id).toBe(scenario.groundTruth.faultClass);
    }
  });

  it("separates the two drive faults by the drive that actually reports one", () => {
    for (const [scenarioId, expectedFm] of [
      ["TIA-05-FS-04", "FM_SERVO_GUN_DRIVE_TRIP"],
      ["TIA-05-FS-13", "FM_SHUTTLE_DRIVE_TRIP"],
    ] as const) {
      const scenario = system.scenarios.find((s) => s.id === scenarioId)!;
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(result.hypotheses[0].faultModeId, scenarioId).toBe(nodeId("FAULT_MODE", expectedFm));
      // The other drive fault is reachable and is genuinely ranked below it,
      // rather than being absent because the corpus cannot see it.
      const other = expectedFm === "FM_SERVO_GUN_DRIVE_TRIP" ? "FM_SHUTTLE_DRIVE_TRIP" : "FM_SERVO_GUN_DRIVE_TRIP";
      const rival = result.hypotheses.find((h) => h.faultModeId === nodeId("FAULT_MODE", other));
      expect(rival, `${other} must be considered`).toBeDefined();
      expect(rival!.score).toBeLessThan(result.hypotheses[0].score);
    }
  });

  it("escalates the safety, utility, gun-trip and clamp scenarios", () => {
    for (const [scenarioId, actionLocal] of [
      ["TIA-05-FS-02", "SA_ESCALATE_SAFETY_INTERLOCK_REVIEW"],
      ["TIA-05-FS-03", "SA_ESCALATE_WELD_UTILITY_REVIEW"],
      ["TIA-05-FS-04", "SA_READ_SERVO_GUN_DRIVE_FAULT_HISTORY"],
      ["TIA-05-FS-09", "SA_INSPECT_CLAMP_VALVE_AND_LIMIT_SWITCHES"],
    ] as const) {
      const scenario = system.scenarios.find((s) => s.id === scenarioId)!;
      expect(scenario.groundTruth.requiresEscalation).toBe(true);
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(result.escalationConditions.length, `${scenarioId} must escalate`).toBeGreaterThan(0);
      const action = result.safeVerificationActions.find(
        (x) => x.nodeId === nodeId("SAFE_ACTION", actionLocal),
      );
      expect(action, `${actionLocal} must be offered`).toBeDefined();
    }
    // Each of those actions that touches a safety object is review-only.
    for (const local of [
      "SA_ESCALATE_SAFETY_INTERLOCK_REVIEW",
      "SA_ESCALATE_WELD_UTILITY_REVIEW",
      "SA_INSPECT_CLAMP_VALVE_AND_LIMIT_SWITCHES",
    ]) {
      expect(isReviewOnly(index.nodes.get(nodeId("SAFE_ACTION", local))!.provenance.safetyClass)).toBe(
        true,
      );
    }
  });

  it("offers the expected safe action on every scenario", () => {
    for (const scenario of system.scenarios) {
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      for (const expected of scenario.groundTruth.expectedSafeActionIds) {
        expect(
          result.safeVerificationActions.map((x) => x.nodeId),
          `${scenario.id} must offer ${expected}`,
        ).toContain(expected);
      }
    }
  });

  it("makes no unsupported claim and no unsafe recommendation on any scenario", () => {
    for (const scenario of system.scenarios) {
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(result.unresolvedObservations).toEqual([]);
      for (const citation of result.citations) expect(index.nodes.has(citation)).toBe(true);
      for (const action of result.safeVerificationActions) {
        const node = index.nodes.get(action.nodeId)!;
        expect(node.kind).toBe("SAFE_ACTION");
        if (isReviewOnly(node.provenance.safetyClass)) expect(action.reviewOnly).toBe(true);
      }
    }
  });

  it("names the evidence it was not given rather than assuming it", () => {
    for (const scenario of system.scenarios) {
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      const missing = result.missingEvidence.map((c) => c.nodeId);
      for (const expected of scenario.groundTruth.expectedMissingNodeIds) {
        expect(missing, `${scenario.id} must report ${expected} as missing`).toContain(expected);
      }
    }
  });

  it("covers every canonical fault class in one reference system", () => {
    const classes = new Set(system.scenarios.map((s) => s.groundTruth.faultClass));
    for (const expected of [
      "SENSOR_FAILURE",
      "ACTUATOR_FAILURE",
      "DRIVE_FAULT",
      "COMMUNICATION_LOSS",
      "PERMISSIVE_MISSING",
      "INTERLOCK_ACTIVE",
      "INCORRECT_MODE",
      "SEQUENCE_TIMEOUT",
      "PROCESS_DEVIATION",
      "RECIPE_MISMATCH",
      "BLOCKAGE",
      "STALE_TELEMETRY",
    ]) {
      expect(classes.has(expected as never), `${expected} must be covered`).toBe(true);
    }
  });

  it("is deterministic: the same observations produce byte-identical results", () => {
    for (const scenario of system.scenarios) {
      const first = diagnose(index, { observations: scenario.observations, locale: "en" });
      const second = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    }
  });

  it("answers in Persian when asked to, from authored text rather than transliteration", () => {
    const scenario = system.scenarios.find((s) => s.id === "TIA-05-FS-02")!;
    const fa = diagnose(index, { observations: scenario.observations, locale: "fa" });
    const en = diagnose(index, { observations: scenario.observations, locale: "en" });
    expect(fa.hypotheses[0].label).not.toBe(en.hypotheses[0].label);
    expect(fa.hypotheses[0].label).toMatch(/[؀-ۿ]/);
    expect(fa.hypotheses[0].label).not.toMatch(/[يك]/);
  });
});

describe("PHASE 101 — the TIA corpus is complete and everything before it is unchanged", () => {
  it("keeps every earlier reference system byte-identical to its pinned digest", () => {
    const FROZEN: Record<string, { checksum: string; scenarios: number }> = {
      "TIA-01": { checksum: "8693ed4bb55bca5a2d2560424917d3fa12e8c2fbb16b6781fa589cfc568091a4", scenarios: 6 },
      "TIA-02": { checksum: "9516eba346ab2305e48d87ee7fb600c6ac8ed0392334955cb0f4aa2c464fb2c3", scenarios: 7 },
      "TIA-03": { checksum: "662854026c489eba57c3f220b5f6216922a21f541b0284dcab620187bea13162", scenarios: 9 },
      "TIA-04": { checksum: "960d0af6d8cfacee766e83354ec6ea2c17d6e2bbac4d544661cc7e674396f7c7", scenarios: 11 },
      "SCADA-01": { checksum: "e6f53bf2dd97b3a23852cafbb0b6b417c9aaad85ad7fc98c5ff2f1fbcfa97bb1", scenarios: 7 },
      "SCADA-02": { checksum: "89092a2f24b9e6527c5d45742ddc51ce91c8d058571d33fae3344b76e1a0f8e7", scenarios: 6 },
      "SCADA-03": { checksum: "3f8504e6f7d408259993a65b094e33ba9290ed31a847c8d3bba580a4e84da9e2", scenarios: 7 },
      "SCADA-04": { checksum: "f2f9ce5b48c8be4a0c462446a579cf15ae1eeefcdf9cd1a4b1117ae714ad4a64", scenarios: 8 },
      "SCADA-05": { checksum: "ee8c0488d34ba8b00c8626eefac38d09c38d7b99413db371ee42688b7090e73f", scenarios: 11 },
    };

    const frozenIds = Object.keys(FROZEN);
    const selected = CORPUS.filter((s) => frozenIds.includes(s.id));
    expect(selected.map((s) => s.id).sort()).toEqual([...frozenIds].sort());

    const actual = Object.fromEntries(
      selected.map((s) => [s.id, { checksum: s.checksum, scenarios: s.scenarios.length }]),
    );
    expect(actual).toEqual(FROZEN);
  });

  it("registers ten reference systems: five TIA and five SCADA", () => {
    expect(CORPUS.map((s) => s.id)).toEqual([
      "TIA-01",
      "TIA-02",
      "TIA-03",
      "TIA-04",
      "TIA-05",
      "SCADA-01",
      "SCADA-02",
      "SCADA-03",
      "SCADA-04",
      "SCADA-05",
    ]);
    expect(CORPUS.filter((s) => s.sourceType === "TIA_REFERENCE").length).toBe(5);
    expect(CORPUS.filter((s) => s.sourceType === "SCADA_REFERENCE").length).toBe(5);
    for (const s of CORPUS) {
      expect(s.scenarios.length, `${s.id} must carry at least six scenarios`).toBeGreaterThanOrEqual(6);
    }
  });
});
