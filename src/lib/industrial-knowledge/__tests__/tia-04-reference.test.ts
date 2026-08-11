// PHASE 101 — TIA-04, the continuous heat-treatment furnace and quench line.
//
// TIA-04 exists to prove one boundary in particular: a process controller may
// SCHEDULE heat, and only the burner-management system may DELIVER it. Almost
// everything asserted below is a consequence of that split.
//
//   - Every BMS object is safety-critical and carries no inbound control path.
//     Fuel, pilot, ignition, flame safeguard and purge are read-only evidence.
//   - The heat demand is a bounded REQUEST, and losing BMS readiness — or
//     losing confidence in the temperature evidence — forces it to zero in the
//     source itself, with no partial fallback.
//   - Stale or self-contradictory temperature evidence withdraws confidence
//     rather than being carried forward as a safe furnace temperature.
//   - A trip drops the line to idle and leaves it there; the startup block
//     resets no trip and raises a material-tracking review instead of assuming
//     the furnace is empty.
//   - The recipe is immutable while material is inside, and the material model
//     is never silently corrected.

import { describe, it, expect } from "vitest";
import { CORPUS, corpusIndex, resolveSymbol, sourceAgreementReport } from "../corpus";
import { diagnose } from "../diagnostics";
import { governanceFor, neighbours, traverse } from "../graph";
import { extractScl } from "../extractors/scl";
import { isHumanInvokable, isReviewOnly } from "../types";
import type { KnowledgeEdge, ReferenceSystem } from "../types";

const system = CORPUS.find((s) => s.id === "TIA-04") as ReferenceSystem;
const index = corpusIndex();

const nodeId = (kind: string, local: string) => `TIA-04:${kind}:${local}`;

const CONTROL_RELATIONS = ["COMMANDS", "WRITES", "ACTUATES"] as const;
const isControl = (e: KnowledgeEdge) =>
  (CONTROL_RELATIONS as readonly string[]).includes(e.relation);

const artifact = (local: string) => system.artifacts.find((x) => x.local === local)!;

describe("PHASE 101 — TIA-04 registration and provenance", () => {
  it("is registered in the corpus as a sealed TIA reference", () => {
    expect(system).toBeDefined();
    expect(system.sourceType).toBe("TIA_REFERENCE");
    expect(system.origin).toBe("SYNTHETIC_ORIGINAL");
    expect(system.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(system.nodes.length).toBe(229);
    expect(system.edges.length).toBe(448);
    expect(system.artifacts.length).toBe(12);
    expect(system.scenarios.length).toBeGreaterThanOrEqual(9);
    expect(system.scenarios.length).toBe(11);
  });

  it("declares the complete block architecture the platform expects", () => {
    const blocks = system.nodes.filter((n) => n.kind === "PLC_BLOCK");
    expect(blocks.length).toBe(23);
    const byType = (type: string) => blocks.filter((b) => b.attributes.blockType === type).length;
    expect(byType("OB")).toBe(2);
    expect(byType("FB")).toBe(6);
    expect(byType("FC")).toBe(4);
    expect(byType("DB")).toBe(5);
    expect(byType("UDT")).toBe(6);
  });

  it("models the line from the charge table to the exit conveyor", () => {
    for (const local of [
      "CHARGE_TABLE",
      "ENTRY_CONVEYOR",
      "FURNACE_ENTRY_DOOR",
      "HEATING_ZONE_1",
      "HEATING_ZONE_2",
      "HEATING_ZONE_3",
      "SOAKING_ZONE",
      "ROLLER_HEARTH",
      "FURNACE_DISCHARGE_DOOR",
      "QUENCH_TANK",
      "QUENCH_PUMP",
      "EXIT_CONVEYOR",
      "BURNER_TRAIN",
      "FUEL_TRAIN",
    ]) {
      expect(index.nodes.get(nodeId("EQUIPMENT", local))?.kind).toBe("EQUIPMENT");
    }
    const count = (kind: string) => system.nodes.filter((n) => n.kind === kind).length;
    expect(count("FAULT_MODE")).toBe(11);
    expect(count("SAFE_ACTION")).toBe(11);
    expect(count("ALARM")).toBe(11);
    expect(count("PERMISSIVE")).toBe(4);
    expect(count("INTERLOCK")).toBe(4);
    expect(count("KPI")).toBe(4);
  });

  it("stamps complete provenance and a deterministic checksum on every node and artefact", () => {
    for (const node of system.nodes) {
      expect(node.provenance.projectId).toBe("TIA-04");
      expect(node.provenance.checksum).toBe(system.checksum);
      expect(node.provenance.sourceId.length).toBeGreaterThan(0);
      expect(node.provenance.subsystem.length).toBeGreaterThan(0);
      expect(node.provenance.version).toBe(system.version);
      expect(node.provenance.revision).toBe(system.revision);
    }
    for (const art of system.artifacts) {
      expect(art.id).toBe(`TIA-04:SRC:${art.local}`);
      expect(art.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(art.lineCount).toBeGreaterThan(0);
      expect(art.content).not.toContain("\r");
      expect(art.provenance.projectId).toBe("TIA-04");
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
});

describe("PHASE 101 — TIA-04 carries real, parseable SCL", () => {
  const sclArtifacts = system.artifacts.filter((x) => x.language === "SCL");

  it("ships eleven SCL artefacts and one structured graphical artefact", () => {
    expect(sclArtifacts.length).toBe(11);
    expect(system.artifacts.filter((x) => x.language === "LAD_XML").length).toBe(1);
    const sclLines = sclArtifacts.reduce((sum, x) => sum + x.lineCount, 0);
    expect(sclLines).toBeGreaterThanOrEqual(500);
  });

  it("parses to exactly the twenty-three declared units, with no stub block", () => {
    const units = sclArtifacts.flatMap((x) => extractScl(x.content).units);
    expect(units.length).toBe(23);
    for (const unit of units) {
      expect(resolveSymbol(system, unit.name)?.kind, unit.name).toBe("PLC_BLOCK");
    }
    // Every executable unit states real relationships; a block that parsed to
    // nothing would be a stub wearing a block's name.
    const executable = units.filter((u) => !["DATA_BLOCK", "TYPE"].includes(u.kind));
    expect(executable.length).toBe(12);
    for (const unit of executable) {
      expect(unit.relations.length, `${unit.name} must state relationships`).toBeGreaterThan(0);
    }
  });

  it("contains every language construct the subset requires", () => {
    const all = sclArtifacts.map((x) => x.content).join("\n");
    expect(all).toMatch(/\bCASE\b[\s\S]*\bEND_CASE\b/);
    expect(all).toMatch(/:\s*TON\s*;/);
    expect(all).toMatch(/NOT\s+"ROLLER_DRIVE_FAULT_PREV"/);
    expect(all).toMatch(/NOT\s+"ENTRY_PHOTOCELL_PREV"/);
    expect(all).toMatch(/PIECES_MAX|ID_MAX|COUNT_MAX|RESIDENCE_MAX/);
    expect(all).toMatch(/Array\[1\.\.40\] of "UDT_WORKPIECE"/);
    expect(all).toMatch(/"MODE_AUTO"/);
    expect(all).toMatch(/"MODE_REMOTE"/);
    expect(all).toMatch(/ORGANIZATION_BLOCK "OB_STARTUP"/);
    // No dynamic execution, no vendor-archive claim, no placeholder.
    expect(all).not.toMatch(/\beval\b/i);
    expect(all).not.toMatch(/\.apXX|\.zapXX|\.ap1[0-9]|\.zap1[0-9]/i);
    expect(all).not.toMatch(/TODO|FIXME|placeholder|pseudocode/i);
  });

  it("names TIA Portal only to disclaim it, never to claim compilation", () => {
    expect(artifact("LAD_SUPERVISORY_PERMISSIVE").content).toMatch(
      /not produced, compiled or\s+validated by TIA Portal/i,
    );
    expect(system.platform).toMatch(/no vendor project archive is produced or claimed/i);
  });
});

describe("PHASE 101 — TIA-04 agrees with its own source", () => {
  const report = sourceAgreementReport(system);

  it("checks every SCL artefact and skips only the graphical one", () => {
    expect(report.checked.length).toBe(11);
    expect(report.skipped).toEqual([
      { artifact: "LAD_SUPERVISORY_PERMISSIVE", language: "LAD_XML", reason: "NO_RELATION_MAPPING" },
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
    expect(checked).toBeGreaterThanOrEqual(150);
  });
});

describe("PHASE 101 — TIA-04 burner-management boundary", () => {
  const BMS_SURFACE = [
    ["DEVICE", "BMS_CONTROLLER"],
    ["EQUIPMENT", "BURNER_TRAIN"],
    ["EQUIPMENT", "FUEL_TRAIN"],
    ["TAG", "BMS_READY"],
    ["TAG", "BMS_FLAME_OK"],
    ["TAG", "BMS_PURGE_COMPLETE"],
    ["TAG", "BMS_COMBUSTION_TRIP"],
    ["TAG", "BMS_FUEL_VALVE_POSITION"],
    ["TAG", "BMS_PILOT_VALVE_POSITION"],
    ["TAG", "BMS_IGNITION_ACTIVE"],
    ["INTERLOCK", "ILK_BMS_COMBUSTION_TRIP"],
    ["EVIDENCE_SOURCE", "HIST_BMS_EVENT_LOG"],
  ] as const;

  it("classifies the entire combustion boundary as safety-critical", () => {
    for (const [kind, local] of BMS_SURFACE) {
      const node = index.nodes.get(nodeId(kind, local));
      expect(node, `${kind}:${local} must exist`).toBeDefined();
      expect(node!.provenance.safetyClass).toBe("SAFETY_CRITICAL");
      expect(isReviewOnly(node!.provenance.safetyClass)).toBe(true);
    }
  });

  it("has no incoming actuation path onto any BMS object", () => {
    for (const [kind, local] of BMS_SURFACE) {
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

  it("generates no purge, ignition or trip-reset logic anywhere in its source", () => {
    const all = system.artifacts.map((x) => x.content).join("\n");
    // The BMS terms appear only as READS in the SCL, never on the left of an
    // assignment: the program consults them and writes none of them.
    for (const symbol of [
      "BMS_READY",
      "BMS_FLAME_OK",
      "BMS_PURGE_COMPLETE",
      "BMS_COMBUSTION_TRIP",
    ]) {
      expect(all).not.toMatch(new RegExp(`"${symbol}"\\s*:=`));
    }
    expect(all).not.toMatch(/PURGE_START|IGNITION_ON|TRIP_RESET|BMS_RESET|FLAME_OVERRIDE/i);
  });

  it("forces the heat demand to zero when BMS readiness is lost", () => {
    const zone = artifact("FB_ZONE_PROFILE_CONTROL").content;
    // The permissive is assembled from read-only BMS evidence…
    expect(zone).toMatch(
      /"PRM_BMS_READY" := "BMS_READY" AND "BMS_PURGE_COMPLETE" AND NOT "BMS_COMBUSTION_TRIP";/,
    );
    // …and the ELSE branch of the demand is an unconditional zero.
    expect(zone).toMatch(
      /IF "PRM_BMS_READY" AND "BMS_FLAME_OK" AND "TEMP_CONFIDENCE_OK" AND "RECIPE_VALID" THEN[\s\S]*ELSE[\s\S]*"HEAT_DEMAND_PCT" := 0\.0;[\s\S]*END_IF;/,
    );
    // The trip path in the state block does the same thing independently.
    expect(artifact("FB_STATE_SUPERVISION").content).toMatch(
      /IF "BMS_COMBUSTION_TRIP" OR NOT "BMS_READY" THEN[\s\S]*"HEAT_DEMAND_PCT" := 0\.0;[\s\S]*END_IF;/,
    );
  });

  it("keeps the heat demand a bounded request rather than an actuation", () => {
    const demand = index.nodes.get(nodeId("TAG", "HEAT_DEMAND_PCT"))!;
    expect(demand.attributes.accessMode).toBe("READ");
    expect(demand.provenance.safetyClass).toBe("NON_SAFETY");
    // Bounded in source…
    expect(artifact("FB_ZONE_PROFILE_CONTROL").content).toMatch(
      /IF "HEAT_DEMAND_PCT" > DEMAND_MAX THEN[\s\S]*"HEAT_DEMAND_PCT" := DEMAND_MAX;/,
    );
    // …and wired to no burner object: it drives nothing and is bound to nothing.
    expect(
      system.edges.filter(
        (e) =>
          ["ACTUATES", "BOUND_TO", "COMMANDS"].includes(e.relation) &&
          (e.source === demand.id || e.target === demand.id),
      ),
    ).toEqual([]);
  });
});

describe("PHASE 101 — TIA-04 temperature evidence integrity", () => {
  it("withdraws confidence on a disagreement and on staleness alike", () => {
    const sensor = artifact("FC_LIBRARY").content;
    expect(sensor).toMatch(
      /IF NOT "TEMP_EVIDENCE_AGREES" THEN[\s\S]*"TEMP_CONFIDENCE_OK" := FALSE;[\s\S]*END_IF;/,
    );
    expect(sensor).toMatch(
      /IF NOT "PYRO_LINK_OK" OR "TEMP_DATA_STALE" THEN[\s\S]*"TEMP_CONFIDENCE_OK" := FALSE;[\s\S]*END_IF;/,
    );
  });

  it("makes confidence a condition of heating and of demand, not a comment", () => {
    expect(artifact("FB_STATE_SUPERVISION").content).toMatch(
      /IF "TEMP_CONFIDENCE_OK" AND "SOAK_READY" THEN/,
    );
    expect(artifact("FB_ZONE_PROFILE_CONTROL").content).toMatch(/AND "TEMP_CONFIDENCE_OK" AND/);
  });

  it("never reads stale or conflicting evidence as a healthy furnace", () => {
    for (const [scenarioId, expectedFm] of [
      ["TIA-04-FS-08", "FM_PYROMETER_COMMS_LOSS"],
      ["TIA-04-FS-02", "FM_TEMPERATURE_EVIDENCE_CONFLICT"],
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

describe("PHASE 101 — TIA-04 sequence, trip and restart behaviour", () => {
  const steps = ["F00_IDLE", "F10_LOAD", "F20_HEAT", "F30_SOAK", "F40_QUENCH", "F50_DISCHARGE"].map(
    (local) => nodeId("STATE", local),
  );

  it("reaches every state from idle and closes the cycle", () => {
    const transitions = system.edges.filter((e) => e.relation === "TRANSITIONS_TO");
    for (let i = 0; i < steps.length - 1; i += 1) {
      expect(
        transitions.some((e) => e.source === steps[i] && e.target === steps[i + 1]),
        `${steps[i]} must reach ${steps[i + 1]}`,
      ).toBe(true);
    }
    expect(transitions.some((e) => e.source === steps[5] && e.target === steps[0])).toBe(true);
    const reached = traverse(index, [steps[0]], { relations: ["TRANSITIONS_TO"], maxDepth: 6 });
    for (const step of steps.slice(1)) {
      expect(reached.map((r) => r.node.id), `${step} must be reachable`).toContain(step);
    }
  });

  it("walks the normal path load → heat → soak → quench → discharge in source", () => {
    const state = artifact("FB_STATE_SUPERVISION").content;
    expect(state).toMatch(/0:[\s\S]*IF "START_REQUEST"[\s\S]*"SEQ_STEP" := 10;/);
    expect(state).toMatch(/10:[\s\S]*IF "ENTRY_DOOR_OPEN_FB" THEN[\s\S]*"SEQ_STEP" := 20;/);
    expect(state).toMatch(/20:[\s\S]*"TEMP_CONFIDENCE_OK" AND "SOAK_READY"[\s\S]*"SEQ_STEP" := 30;/);
    expect(state).toMatch(/30:[\s\S]*IF "PRM_QUENCH_READY" THEN[\s\S]*"SEQ_STEP" := 40;/);
    expect(state).toMatch(/40:[\s\S]*IF "DISCHARGE_DOOR_OPEN_FB" THEN[\s\S]*"SEQ_STEP" := 50;/);
    expect(state).toMatch(/50:[\s\S]*"LINE_RUNNING" := FALSE;[\s\S]*"SEQ_STEP" := 0;/);
  });

  it("returns the demand to a safe zero on a trip and never restarts by itself", () => {
    const state = artifact("FB_STATE_SUPERVISION").content;
    expect(state).toMatch(
      /IF "BMS_COMBUSTION_TRIP" OR NOT "BMS_READY" THEN[\s\S]*"SEQ_STEP" := 0;[\s\S]*"LINE_RUNNING" := FALSE;[\s\S]*"HEAT_DEMAND_PCT" := 0\.0;/,
    );
    // Leaving idle requires an explicit operator start request every time.
    expect(state).toMatch(/0:[\s\S]*IF "START_REQUEST"/);
    // The startup block initialises to a safe cold state, resets no trip and
    // starts nothing.
    const startup = artifact("OB_STARTUP").content;
    expect(startup).toMatch(/"HEAT_DEMAND_PCT" := 0\.0;/);
    expect(startup).toMatch(/"LINE_RUNNING" := FALSE;/);
    expect(startup).toMatch(/"TRACK_RECOVERY_REVIEW" := TRUE;/);
    expect(startup).not.toMatch(/"START_REQUEST"|"LINE_RUNNING" := TRUE|BMS_/);
    // …and an ambiguous material picture blocks the automatic start until a
    // human has reconciled it.
    expect(state).toMatch(/AND NOT "TRACK_RECOVERY_REVIEW"/);
  });

  it("blocks the quench transition when the quench is unavailable", () => {
    expect(artifact("FB_STATE_SUPERVISION").content).toMatch(
      /30:[\s\S]*IF "PRM_QUENCH_READY" THEN/,
    );
    expect(
      system.edges.some(
        (e) =>
          e.relation === "BLOCKS" &&
          e.source === nodeId("INTERLOCK", "ILK_QUENCH_NOT_READY") &&
          e.target === nodeId("STATE", "F40_QUENCH"),
      ),
    ).toBe(true);
    expect(
      system.edges.some(
        (e) =>
          e.relation === "GATES" &&
          e.source === nodeId("PERMISSIVE", "PRM_QUENCH_READY") &&
          e.target === nodeId("STATE", "F40_QUENCH"),
      ),
    ).toBe(true);
  });

  it("reads every interlock and writes none of them", () => {
    const interlocks = system.nodes.filter((n) => n.kind === "INTERLOCK");
    expect(interlocks.length).toBe(4);
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

  it("keeps the conveyor synchronisation bounded by the recipe", () => {
    const conveyor = artifact("FB_CONVEYOR_SYNC").content;
    expect(conveyor).toMatch(/"CONVEYOR_SPEED_REF" := "DB_RECIPE"\.ConveyorSpeed;/);
    expect(conveyor).toMatch(
      /IF NOT "RECIPE_VALID" OR NOT "LINE_RUNNING" THEN[\s\S]*"CONVEYOR_SPEED_REF" := 0\.0;/,
    );
    expect(conveyor).toMatch(/SYNC_TOLERANCE/);
    // A drive trip stops the line; it does not retry.
    expect(conveyor).toMatch(
      /IF "ROLLER_DRIVE_FAULT" AND NOT "ROLLER_DRIVE_FAULT_PREV" THEN[\s\S]*"LINE_RUNNING" := FALSE;/,
    );
  });
});

describe("PHASE 101 — TIA-04 material tracking and recipe integrity", () => {
  it("detects overflow, impossible movement, duplicates and lost pieces", () => {
    const tracking = artifact("FB_MATERIAL_TRACKING").content;
    expect(tracking).toMatch(/IF "PIECES_IN_FURNACE" < PIECES_MAX THEN[\s\S]*ELSE[\s\S]*"ALM_TRACK_OVERFLOW" := TRUE;/);
    expect(tracking).toMatch(/IF "PIECES_IN_FURNACE" > 0 THEN[\s\S]*ELSE[\s\S]*"ALM_TRACK_IMPOSSIBLE_MOVE" := TRUE;/);
    expect(tracking).toMatch(/IF "ZONE_OCCUPANCY_DUPLICATE" THEN[\s\S]*"ALM_TRACK_DUPLICATE" := TRUE;/);
    expect(tracking).toMatch(
      /IF "PIECES_IN_FURNACE" > "ZONE_PIECES_DETECTED" THEN[\s\S]*"ALM_TRACK_LOST_PIECE" := TRUE;/,
    );
  });

  it("gives every piece a deterministic bounded identity and never resets the model silently", () => {
    const tracking = artifact("FB_MATERIAL_TRACKING").content;
    expect(tracking).toMatch(/"PIECE_ID_COUNTER" := "PIECE_ID_COUNTER" \+ 1;/);
    expect(tracking).toMatch(/IF "PIECE_ID_COUNTER" > ID_MAX THEN[\s\S]*"PIECE_ID_COUNTER" := 0;/);
    // The piece count is only ever adjusted by a detected entry or discharge —
    // there is no unconditional reset of the material model in the cyclic path.
    expect(tracking).not.toMatch(/"PIECES_IN_FURNACE" := 0;/);
  });

  it("locks the recipe while material is inside and refers a change for review", () => {
    const recipe = artifact("FB_RECIPE_MANAGEMENT").content;
    expect(recipe).toMatch(
      /IF "LINE_RUNNING" AND "PIECES_IN_FURNACE" > 0 THEN[\s\S]*"RECIPE_LOCKED" := TRUE;/,
    );
    expect(recipe).toMatch(
      /IF "RECIPE_CHANGE_REQUEST" AND "RECIPE_LOCKED" THEN[\s\S]*"RECIPE_CHANGE_REVIEW" := TRUE;/,
    );
    // Nothing writes the recipe data block: the profile is read, never edited
    // by the running program.
    expect(
      system.edges.filter((e) => isControl(e) && e.target === nodeId("PLC_BLOCK", "DB_RECIPE")),
    ).toEqual([]);
  });

  it("bounds every recipe parameter and refuses to invent a default", () => {
    const recipe = artifact("FB_RECIPE_MANAGEMENT").content;
    expect(recipe).toMatch(/ZONE_TARGET_MIN/);
    expect(recipe).toMatch(/ZONE_TARGET_MAX/);
    expect(recipe).toMatch(/SPEED_MIN/);
    expect(recipe).toMatch(/SPEED_MAX/);
    expect(recipe).toMatch(/"RECIPE_CHECKSUM_OK" := "RECIPE_CHECKSUM_ACT" = "DB_RECIPE"\.RevisionChecksum;/);
    expect(recipe).toMatch(
      /"RECIPE_VALID" := "RECIPE_BOUNDS_OK" AND "RECIPE_CHECKSUM_OK" AND "RECIPE_SELECTED";/,
    );
    // A missing or invalid recipe prevents the automatic start.
    expect(artifact("FB_STATE_SUPERVISION").content).toMatch(/AND "PRM_RECIPE_READY"/);
    // The stored profile carries its own revision identity.
    expect(artifact("DB_DEFINITIONS").content).toMatch(/RevisionChecksum\s*:\s*DWord/);
  });
});

describe("PHASE 101 — TIA-04 governance", () => {
  const SCRIPTS = {
    start: nodeId("SCRIPT", "OnLineStartIntent"),
    recipe: nodeId("SCRIPT", "OnRecipeSelectIntent"),
    ack: nodeId("SCRIPT", "OnAlarmAcknowledge"),
    kpi: nodeId("SCRIPT", "OnKpiPublish"),
  };

  it("requires role, permission and confirmation on every human-invokable action", () => {
    const human = system.nodes.filter((n) => n.kind === "SCRIPT" && isHumanInvokable(n));
    expect(human.length).toBe(3);
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

  it("keeps the governance layer out of every diagnostic walk", () => {
    for (const origin of [
      nodeId("ALARM", "ALM_BMS_NOT_READY"),
      nodeId("ALARM", "ALM_ZONE_OVERTEMPERATURE"),
      nodeId("ALARM", "ALM_MATERIAL_TRACKING_MISMATCH"),
    ]) {
      const reached = traverse(index, [origin], { direction: "both", maxDepth: 6 });
      const kinds = new Set(reached.map((r) => r.node.kind));
      expect(kinds.has("ROLE")).toBe(false);
      expect(kinds.has("AUDIT_EVENT_TYPE")).toBe(false);
    }
    const plain = neighbours(index, SCRIPTS.recipe, { direction: "out" }).map((n) => n.node.kind);
    expect(plain).not.toContain("ROLE");
    expect(plain).not.toContain("AUDIT_EVENT_TYPE");
  });
});

describe("PHASE 101 — TIA-04 diagnosis", () => {
  it("ranks the true root cause, subsystem and fault class first on all eleven scenarios", () => {
    for (const scenario of system.scenarios) {
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(result.hypotheses[0]?.faultModeId, scenario.id).toBe(scenario.groundTruth.faultModeId);
      expect(result.hypotheses[0]?.subsystem, scenario.id).toBe(scenario.groundTruth.subsystem);
      expect(result.hypotheses[0]?.faultClass, scenario.id).toBe(scenario.groundTruth.faultClass);
    }
  });

  it("escalates the combustion, overtemperature, door and quench scenarios", () => {
    for (const [scenarioId, actionLocal] of [
      ["TIA-04-FS-03", "SA_ESCALATE_ZONE_OVERTEMPERATURE_REVIEW"],
      ["TIA-04-FS-04", "SA_ESCALATE_BMS_COMBUSTION_REVIEW"],
      ["TIA-04-FS-07", "SA_INSPECT_DISCHARGE_DOOR_LIMITS"],
      ["TIA-04-FS-09", "SA_ESCALATE_QUENCH_AVAILABILITY_REVIEW"],
    ] as const) {
      const scenario = system.scenarios.find((s) => s.id === scenarioId)!;
      expect(scenario.groundTruth.requiresEscalation).toBe(true);
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(result.escalationConditions.length, `${scenarioId} must escalate`).toBeGreaterThan(0);
      const action = result.safeVerificationActions.find(
        (x) => x.nodeId === nodeId("SAFE_ACTION", actionLocal),
      );
      expect(action?.reviewOnly, `${actionLocal} must be review-only`).toBe(true);
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
    for (const scenarioId of ["TIA-04-FS-01", "TIA-04-FS-06", "TIA-04-FS-09"]) {
      const scenario = system.scenarios.find((s) => s.id === scenarioId)!;
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      const missing = result.missingEvidence.map((c) => c.nodeId);
      for (const expected of scenario.groundTruth.expectedMissingNodeIds) {
        expect(missing, `${scenarioId} must report ${expected} as missing`).toContain(expected);
      }
    }
  });

  it("covers a genuine spread of canonical fault classes", () => {
    const classes = new Set(system.scenarios.map((s) => s.groundTruth.faultClass));
    for (const expected of [
      "SENSOR_FAILURE",
      "PROCESS_DEVIATION",
      "INTERLOCK_ACTIVE",
      "DRIVE_FAULT",
      "SEQUENCE_TIMEOUT",
      "ACTUATOR_FAILURE",
      "COMMUNICATION_LOSS",
      "PERMISSIVE_MISSING",
      "RECIPE_MISMATCH",
      "INCORRECT_MODE",
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
    const scenario = system.scenarios.find((s) => s.id === "TIA-04-FS-04")!;
    const fa = diagnose(index, { observations: scenario.observations, locale: "fa" });
    const en = diagnose(index, { observations: scenario.observations, locale: "en" });
    expect(fa.hypotheses[0].label).not.toBe(en.hypotheses[0].label);
    expect(fa.hypotheses[0].label).toMatch(/[؀-ۿ]/);
    expect(fa.hypotheses[0].label).not.toMatch(/[يك]/);
  });
});

describe("PHASE 101 — registering TIA-04 changes nothing that came before", () => {
  it("keeps every earlier reference system byte-identical to its pinned digest", () => {
    const FROZEN: Record<string, { checksum: string; scenarios: number }> = {
      "TIA-01": { checksum: "8693ed4bb55bca5a2d2560424917d3fa12e8c2fbb16b6781fa589cfc568091a4", scenarios: 6 },
      "TIA-02": { checksum: "9516eba346ab2305e48d87ee7fb600c6ac8ed0392334955cb0f4aa2c464fb2c3", scenarios: 7 },
      "TIA-03": { checksum: "662854026c489eba57c3f220b5f6216922a21f541b0284dcab620187bea13162", scenarios: 9 },
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

  it("registers nine reference systems: four TIA and five SCADA", () => {
    expect(CORPUS.map((s) => s.id)).toEqual([
      "TIA-01",
      "TIA-02",
      "TIA-03",
      "TIA-04",
      "SCADA-01",
      "SCADA-02",
      "SCADA-03",
      "SCADA-04",
      "SCADA-05",
    ]);
    for (const s of CORPUS) {
      expect(s.scenarios.length, `${s.id} must carry at least six scenarios`).toBeGreaterThanOrEqual(6);
    }
  });
});
