// PHASE 101 — TIA-03, the water treatment and reverse-osmosis skid.
//
// TIA-03 is the first reference to carry a COMPLETE block architecture in real
// SCL rather than a slice of one, so what has to be true of it goes beyond "it
// seals":
//
//   - Every OB, FB, FC, DB and UDT the corpus claims exists as a parsed unit in
//     source the extractor actually reads, and every READS / WRITES / CALLS
//     that source states exists as a graph edge. The agreement gate re-derives
//     them; it is not a regex spot-check and it has no silent fallback.
//   - The graphical artefact is reported as SKIPPED, so the verdict is PARTIAL
//     and says so rather than being rounded up to PASS.
//   - The state machine is reachable end to end and returns to idle.
//   - Duty and standby demands are mutually exclusive by construction, and no
//     interlock is ever written, only read.
//   - A trip leaves the sequence at idle: there is no automatic restart path.
//   - The CIP / chemical boundary is monitored only.
//   - ROLE and AUDIT_EVENT_TYPE never enter a diagnostic traversal.

import { describe, it, expect } from "vitest";
import { CORPUS, corpusIndex, resolveSymbol, sourceAgreementReport } from "../corpus";
import { diagnose } from "../diagnostics";
import { governanceFor, neighbours, traverse } from "../graph";
import { extractScl } from "../extractors/scl";
import { isHumanInvokable, isReviewOnly } from "../types";
import type { KnowledgeEdge, ReferenceSystem } from "../types";

const system = CORPUS.find((s) => s.id === "TIA-03") as ReferenceSystem;
const index = corpusIndex();

const nodeId = (kind: string, local: string) => `TIA-03:${kind}:${local}`;

const CONTROL_RELATIONS = ["COMMANDS", "WRITES", "ACTUATES"] as const;
const isControl = (e: KnowledgeEdge) =>
  (CONTROL_RELATIONS as readonly string[]).includes(e.relation);

describe("PHASE 101 — TIA-03 registration and provenance", () => {
  it("is registered in the corpus as a sealed TIA reference", () => {
    expect(system).toBeDefined();
    expect(system.sourceType).toBe("TIA_REFERENCE");
    expect(system.origin).toBe("SYNTHETIC_ORIGINAL");
    expect(system.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(system.nodes.length).toBe(181);
    expect(system.edges.length).toBe(322);
    expect(system.artifacts.length).toBe(10);
    // Contract: AT_LEAST_6_VALID_FAULT_SCENARIOS. The actual count is nine —
    // one per fault mode — pinned honestly rather than rounded to the minimum.
    expect(system.scenarios.length).toBeGreaterThanOrEqual(6);
    expect(system.scenarios.length).toBe(9);
  });

  it("declares the complete block architecture the platform expects", () => {
    const blocks = system.nodes.filter((n) => n.kind === "PLC_BLOCK");
    expect(blocks.length).toBe(17);
    const byType = (type: string) => blocks.filter((b) => b.attributes.blockType === type).length;
    expect(byType("OB")).toBe(2);
    expect(byType("FB")).toBe(4);
    expect(byType("FC")).toBe(3);
    expect(byType("DB")).toBe(4);
    expect(byType("UDT")).toBe(4);
    for (const local of [
      "OB_MAIN",
      "OB_STARTUP",
      "FB_ANALOG_VALIDATION",
      "FB_PUMP_SUPERVISION",
      "FB_VALVE_SUPERVISION",
      "FB_RO_SEQUENCE",
      "FC_SCALE_ANALOG",
      "FC_QUALITY_CALC",
      "FC_KPI_CALC",
      "DB_INSTANCE",
      "DB_CONFIG",
      "DB_ALARMS",
      "DB_RECIPE",
      "UDT_PUMP",
      "UDT_VALVE",
      "UDT_ANALOG",
      "UDT_SEQ_STATE",
    ]) {
      expect(index.nodes.get(nodeId("PLC_BLOCK", local))?.kind).toBe("PLC_BLOCK");
    }
  });

  it("models the skid from the raw-water tank to the permeate and reject paths", () => {
    for (const local of [
      "RAW_WATER_TANK",
      "FEED_PUMP_P1",
      "FEED_PUMP_P2",
      "MULTIMEDIA_FILTER",
      "CARTRIDGE_FILTER",
      "HIGH_PRESSURE_PUMP",
      "RO_STAGE_1",
      "RO_STAGE_2",
      "PERMEATE_TANK",
      "REJECT_LINE",
      "CIP_CHEMICAL_SKID",
      "VALVE_MATRIX",
    ]) {
      expect(index.nodes.get(nodeId("EQUIPMENT", local))?.kind).toBe("EQUIPMENT");
    }
  });

  it("stamps complete provenance and a deterministic checksum on every node and artefact", () => {
    for (const node of system.nodes) {
      expect(node.provenance.projectId).toBe("TIA-03");
      expect(node.provenance.checksum).toBe(system.checksum);
      expect(node.provenance.sourceId.length).toBeGreaterThan(0);
      expect(node.provenance.subsystem.length).toBeGreaterThan(0);
      expect(node.provenance.version).toBe(system.version);
      expect(node.provenance.revision).toBe(system.revision);
    }
    for (const artifact of system.artifacts) {
      expect(artifact.id).toBe(`TIA-03:SRC:${artifact.local}`);
      expect(artifact.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.lineCount).toBeGreaterThan(0);
      expect(artifact.content).not.toContain("\r");
      expect(artifact.provenance.projectId).toBe("TIA-03");
      expect(artifact.provenance.checksum).toBe(system.checksum);
    }
  });

  it("derives every KPI from named tags", () => {
    const kpis = system.nodes.filter((n) => n.kind === "KPI");
    expect(kpis.length).toBe(4);
    for (const kpi of kpis) {
      const derived = system.edges.filter(
        (e) => e.relation === "DERIVED_FROM" && e.source === kpi.id,
      );
      expect(derived.length, `${kpi.id} must be derived from a tag`).toBeGreaterThan(0);
      for (const edge of derived) expect(index.nodes.get(edge.target)?.kind).toBe("TAG");
    }
  });
});

describe("PHASE 101 — TIA-03 carries real, parseable SCL", () => {
  const sclArtifacts = system.artifacts.filter((x) => x.language === "SCL");

  it("ships nine SCL artefacts and one structured graphical artefact", () => {
    expect(sclArtifacts.length).toBe(9);
    expect(system.artifacts.filter((x) => x.language === "FBD_XML").length).toBe(1);
    const sclLines = sclArtifacts.reduce((sum, x) => sum + x.lineCount, 0);
    expect(sclLines).toBeGreaterThanOrEqual(350);
  });

  it("parses to exactly the seventeen declared units, with no pseudocode placeholder", () => {
    const units = sclArtifacts.flatMap((x) => extractScl(x.content).units);
    expect(units.length).toBe(17);
    expect(units.map((u) => u.name).sort()).toEqual(
      [
        "OB_MAIN",
        "OB_STARTUP",
        "FB_ANALOG_VALIDATION",
        "FB_PUMP_SUPERVISION",
        "FB_VALVE_SUPERVISION",
        "FB_RO_SEQUENCE",
        "FC_SCALE_ANALOG",
        "FC_QUALITY_CALC",
        "FC_KPI_CALC",
        "DB_INSTANCE",
        "DB_CONFIG",
        "DB_ALARMS",
        "DB_RECIPE",
        "UDT_PUMP",
        "UDT_VALVE",
        "UDT_ANALOG",
        "UDT_SEQ_STATE",
      ].sort(),
    );
    // Every unit name is a corpus block, and every executable unit actually
    // states relationships — a block that parsed to nothing would be a stub
    // wearing a block's name.
    for (const unit of units) {
      expect(resolveSymbol(system, unit.name)?.kind, unit.name).toBe("PLC_BLOCK");
    }
    const executable = units.filter((u) => !["DATA_BLOCK", "TYPE"].includes(u.kind));
    expect(executable.length).toBe(9);
    for (const unit of executable) {
      expect(unit.relations.length, `${unit.name} must state relationships`).toBeGreaterThan(0);
    }
  });

  it("contains the engineering constructs the subset requires", () => {
    const all = sclArtifacts.map((x) => x.content).join("\n");
    // State machine, timers, edge detection, bounded counters, explicit modes.
    expect(all).toMatch(/\bCASE\b[\s\S]*\bEND_CASE\b/);
    expect(all).toMatch(/:\s*TON\s*;/);
    expect(all).toMatch(/NOT\s+"FEED_PRESSURE_VALID_PREV"/);
    expect(all).toMatch(/NOT\s+"P1_FAULT_PREV"/);
    expect(all).toMatch(/HOURS_MAX/);
    expect(all).toMatch(/COUNT_MAX/);
    expect(all).toMatch(/"MODE_AUTO"/);
    expect(all).toMatch(/"MODE_REMOTE"/);
    // Deterministic initialisation lives in its own startup block.
    const startup = system.artifacts.find((x) => x.local === "OB_STARTUP")!;
    expect(startup.content).toMatch(/ORGANIZATION_BLOCK "OB_STARTUP"/);
    expect(startup.content).toMatch(/"SEQ_STEP" := 0;/);
    // …and no dynamic execution or vendor-archive claim anywhere.
    expect(all).not.toMatch(/\beval\b/i);
    expect(all).not.toMatch(/\.apXX|\.zapXX|\.ap1[0-9]|\.zap1[0-9]/i);
    expect(all).not.toMatch(/TODO|FIXME|placeholder|pseudocode/i);
  });

  it("names TIA Portal only to disclaim it, never to claim compilation", () => {
    const fbd = system.artifacts.find((x) => x.language === "FBD_XML")!;
    expect(fbd.content).toMatch(/not produced, compiled or\s+validated by TIA Portal/i);
    // …and the reference header says the same thing about the whole slice.
    expect(system.platform).toMatch(/no vendor project archive is produced or claimed/i);
  });
});

describe("PHASE 101 — TIA-03 agrees with its own source", () => {
  const report = sourceAgreementReport(system);

  it("checks every SCL artefact and skips only the graphical one", () => {
    expect([...report.checked].sort()).toEqual(
      [
        "OB_STARTUP",
        "OB_MAIN",
        "FB_ANALOG_VALIDATION",
        "FB_PUMP_SUPERVISION",
        "FB_VALVE_SUPERVISION",
        "FB_RO_SEQUENCE",
        "FC_LIBRARY",
        "DB_DEFINITIONS",
        "UDT_DEFINITIONS",
      ].sort(),
    );
    expect(report.skipped).toEqual([
      { artifact: "FBD_VALVE_MATRIX", language: "FBD_XML", reason: "NO_RELATION_MAPPING" },
    ]);
  });

  it("states its verdict as PARTIAL, with zero disagreements", () => {
    expect(report.issues).toEqual([]);
    expect(report.status).toBe("PARTIAL");
  });

  it("represents every relationship the source states as a graph edge", () => {
    // The agreement gate already asserts this, but proving the volume matters:
    // a mapping that recovered two relations and passed would be worthless.
    const edgeKeys = new Set(system.edges.map((e) => `${e.relation}|${e.source}|${e.target}`));
    let checked = 0;
    for (const artifact of system.artifacts.filter((x) => x.language === "SCL")) {
      for (const unit of extractScl(artifact.content).units) {
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
    expect(checked).toBeGreaterThanOrEqual(100);
  });
});

describe("PHASE 101 — TIA-03 control and safety invariants", () => {
  it("walks the state machine from idle to stop and back to idle", () => {
    const steps = [
      "R00_IDLE",
      "R10_PERMISSIVE_CHECK",
      "R20_PRESSURISE",
      "R30_PRODUCE",
      "R40_FLUSH",
      "R50_STOP",
    ].map((local) => nodeId("STATE", local));
    const transitions = system.edges.filter((e) => e.relation === "TRANSITIONS_TO");
    for (let i = 0; i < steps.length - 1; i += 1) {
      expect(
        transitions.some((e) => e.source === steps[i] && e.target === steps[i + 1]),
        `${steps[i]} must reach ${steps[i + 1]}`,
      ).toBe(true);
    }
    // The cycle closes: stop returns to idle, and idle is where a trip leaves it.
    expect(transitions.some((e) => e.source === steps[5] && e.target === steps[0])).toBe(true);
    // Every step is reachable from idle by walking the chain.
    const reached = traverse(index, [steps[0]], { relations: ["TRANSITIONS_TO"], maxDepth: 6 });
    for (const step of steps.slice(1)) {
      expect(reached.map((r) => r.node.id), `${step} must be reachable`).toContain(step);
    }
  });

  it("makes the duty and standby demands mutually exclusive in the source itself", () => {
    const pump = system.artifacts.find((x) => x.local === "FB_PUMP_SUPERVISION")!;
    expect(pump.content).toMatch(/"P1_DEMAND" := "SKID_RUNNING" AND "DUTY_SELECT" = 1;/);
    expect(pump.content).toMatch(/"P2_DEMAND" := "SKID_RUNNING" AND "DUTY_SELECT" = 2;/);
    // One selector drives both demands, so both can never be true at once.
    for (const local of ["P1_DEMAND", "P2_DEMAND"]) {
      const writers = system.edges.filter(
        (e) => e.relation === "WRITES" && e.target === nodeId("TAG", local),
      );
      expect(writers.map((e) => e.source)).toEqual([nodeId("PLC_BLOCK", "FB_PUMP_SUPERVISION")]);
    }
  });

  it("changes over only when the standby is genuinely available", () => {
    const pump = system.artifacts.find((x) => x.local === "FB_PUMP_SUPERVISION")!;
    expect(pump.content).toMatch(/IF "P2_AVAILABLE" THEN[\s\S]*"DUTY_SELECT" := 2;/);
    expect(pump.content).toMatch(/ELSE[\s\S]*"ALM_NO_STANDBY_PUMP" := TRUE;[\s\S]*"SKID_RUNNING" := FALSE;/);
  });

  it("reads every interlock and writes none of them", () => {
    const interlocks = system.nodes.filter((n) => n.kind === "INTERLOCK");
    expect(interlocks.length).toBe(3);
    for (const interlock of interlocks) {
      expect(
        system.edges.filter((e) => isControl(e) && e.target === interlock.id),
        `${interlock.id} must never be written`,
      ).toEqual([]);
      expect(
        system.edges.some((e) => e.relation === "READS" && e.target === interlock.id),
        `${interlock.id} must be read as evidence`,
      ).toBe(true);
      expect(
        system.edges.some((e) => e.relation === "BLOCKS" && e.source === interlock.id),
        `${interlock.id} must block a step`,
      ).toBe(true);
      expect(isReviewOnly(interlock.provenance.safetyClass)).toBe(true);
    }
  });

  it("leaves the sequence at idle after a trip, with no automatic restart", () => {
    const seq = system.artifacts.find((x) => x.local === "FB_RO_SEQUENCE")!;
    // The trip branch sets the step to 0 and clears running…
    expect(seq.content).toMatch(
      /IF "ILK_LOW_SUCTION" OR "ILK_HP_OVERPRESSURE" THEN[\s\S]*"SEQ_STEP" := 0;[\s\S]*"SKID_RUNNING" := FALSE;[\s\S]*END_IF;/,
    );
    // …and leaving step 0 requires an explicit operator start request.
    expect(seq.content).toMatch(/0:[\s\S]*IF "START_REQUEST"[\s\S]*"SEQ_STEP" := 10;/);
    // The startup block re-initialises without clearing a latched trip or
    // starting anything: it writes no demand, no request and no running flag
    // other than the deliberate FALSE.
    const startup = system.artifacts.find((x) => x.local === "OB_STARTUP")!;
    // It initialises to the SAFE state: not running, and diverting product.
    expect(startup.content).toMatch(/"SKID_RUNNING" := FALSE;/);
    expect(startup.content).toMatch(/"DIVERT_ACTIVE" := TRUE;/);
    // It requests nothing and demands nothing — a start after a power cycle is
    // an operator act, not a consequence of initialisation.
    expect(startup.content).not.toMatch(/"START_REQUEST"|"P1_DEMAND"|"P2_DEMAND"|"SKID_RUNNING" := TRUE/);
  });

  it("carries no command, write or actuation path onto the CIP and chemical boundary", () => {
    for (const [kind, local] of [
      ["EQUIPMENT", "CIP_CHEMICAL_SKID"],
      ["TAG", "CIP_CHEM_FLOW"],
      ["TAG", "CIP_TANK_LEVEL"],
      ["INTERLOCK", "ILK_CIP_ACTIVE"],
    ] as const) {
      const id = nodeId(kind, local);
      expect(index.nodes.get(id), `${local} must exist`).toBeDefined();
      expect(
        system.edges.filter((e) => isControl(e) && (e.source === id || e.target === id)),
        `${local} must have no control path`,
      ).toEqual([]);
      expect(isReviewOnly(index.nodes.get(id)!.provenance.safetyClass)).toBe(true);
    }
    // The reference actuates nothing at all.
    expect(system.edges.filter((e) => e.relation === "ACTUATES")).toEqual([]);
  });

  it("never writes a safety-classified object from an operator surface", () => {
    // The program writes process tags; nothing on the operator side, and nothing
    // at all, writes a safety-classified node.
    const safety = new Set(
      system.nodes.filter((n) => n.provenance.safetyClass !== "NON_SAFETY").map((n) => n.id),
    );
    expect(safety.size).toBeGreaterThan(0);
    expect(
      system.edges.filter((e) => isControl(e) && (safety.has(e.source) || safety.has(e.target))),
    ).toEqual([]);
  });

  it("requires role, permission and confirmation on every human-invokable action", () => {
    const human = system.nodes.filter((n) => n.kind === "SCRIPT" && isHumanInvokable(n));
    expect(human.length).toBe(2);
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
    // The start intent consults evidence a permissive also reads, hop by hop:
    // script --READS--> SCADA_TAG --MIRRORS--> TAG <--READS-- PERMISSIVE.
    const gatingReaders = new Set(
      system.edges
        .filter((e) => e.relation === "READS" && index.nodes.get(e.source)?.kind === "PERMISSIVE")
        .map((e) => e.target),
    );
    const consulted = system.edges
      .filter((e) => e.relation === "READS" && e.source === nodeId("SCRIPT", "OnStartRequestIntent"))
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
    const scriptId = nodeId("SCRIPT", "OnKpiPublish");
    const node = index.nodes.get(scriptId)!;
    expect(isHumanInvokable(node)).toBe(false);
    expect(node.attributes.humanInvokable).toBeUndefined();
    expect(governanceFor(index, scriptId).roles).toEqual([]);
    expect(governanceFor(index, scriptId).auditEventTypes.length).toBe(1);
  });

  it("keeps the governance layer out of every diagnostic walk", () => {
    for (const origin of [
      nodeId("ALARM", "ALM_CIP_LOCKOUT_ACTIVE"),
      nodeId("ALARM", "ALM_DUTY_PUMP_TRIPPED"),
      nodeId("ALARM", "ALM_PROFINET_COMMS_LOST"),
    ]) {
      const reached = traverse(index, [origin], { direction: "both", maxDepth: 6 });
      const kinds = new Set(reached.map((r) => r.node.kind));
      expect(kinds.has("ROLE")).toBe(false);
      expect(kinds.has("AUDIT_EVENT_TYPE")).toBe(false);
    }
    const plain = neighbours(index, nodeId("SCRIPT", "OnStartRequestIntent"), {
      direction: "out",
    }).map((n) => n.node.kind);
    expect(plain).not.toContain("ROLE");
    expect(plain).not.toContain("AUDIT_EVENT_TYPE");
  });
});

describe("PHASE 101 — TIA-03 diagnosis", () => {
  it("ranks the true root cause, subsystem and fault class first on all nine scenarios", () => {
    for (const scenario of system.scenarios) {
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(result.hypotheses[0]?.faultModeId, scenario.id).toBe(scenario.groundTruth.faultModeId);
      expect(result.hypotheses[0]?.subsystem, scenario.id).toBe(scenario.groundTruth.subsystem);
      expect(result.hypotheses[0]?.faultClass, scenario.id).toBe(scenario.groundTruth.faultClass);
    }
  });

  it("separates a broken instrument from a plant that is actually low", () => {
    // The level reads above the tank. The answer is the transmitter, and the
    // permissive derived from it must not be treated as a process finding.
    const scenario = system.scenarios.find((s) => s.id === "TIA-03-FS-01")!;
    const result = diagnose(index, { observations: scenario.observations, locale: "en" });
    expect(result.hypotheses[0].faultModeId).toBe(nodeId("FAULT_MODE", "FM_FEED_LEVEL_TX_FAILURE"));
    expect(result.hypotheses[0].subsystem).toBe("FIELD_DEVICE");
  });

  it("names the evidence it was not given rather than assuming it", () => {
    for (const scenarioId of ["TIA-03-FS-01", "TIA-03-FS-05", "TIA-03-FS-08"]) {
      const scenario = system.scenarios.find((s) => s.id === scenarioId)!;
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      const missing = result.missingEvidence.map((c) => c.nodeId);
      for (const expected of scenario.groundTruth.expectedMissingNodeIds) {
        expect(missing, `${scenarioId} must report ${expected} as missing`).toContain(expected);
      }
    }
  });

  it("escalates the CIP interlock with a review-only action", () => {
    const scenario = system.scenarios.find((s) => s.id === "TIA-03-FS-08")!;
    expect(scenario.groundTruth.requiresEscalation).toBe(true);
    const result = diagnose(index, { observations: scenario.observations, locale: "en" });
    expect(result.escalationConditions.length).toBeGreaterThan(0);
    const action = result.safeVerificationActions.find(
      (x) => x.nodeId === nodeId("SAFE_ACTION", "SA_ESCALATE_CIP_CHEMICAL_REVIEW"),
    );
    expect(action?.reviewOnly).toBe(true);
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

  it("covers a genuine spread of fault classes", () => {
    const classes = new Set(system.scenarios.map((s) => s.groundTruth.faultClass));
    for (const expected of [
      "SENSOR_FAILURE",
      "DRIVE_FAULT",
      "PERMISSIVE_MISSING",
      "BLOCKAGE",
      "ACTUATOR_FAILURE",
      "PROCESS_DEVIATION",
      "COMMUNICATION_LOSS",
      "INTERLOCK_ACTIVE",
      "INCORRECT_MODE",
    ]) {
      expect(classes.has(expected as never), `${expected} must be covered`).toBe(true);
    }
  });

  it("answers in Persian when asked to, from authored text rather than transliteration", () => {
    const scenario = system.scenarios.find((s) => s.id === "TIA-03-FS-06")!;
    const fa = diagnose(index, { observations: scenario.observations, locale: "fa" });
    const en = diagnose(index, { observations: scenario.observations, locale: "en" });
    expect(fa.hypotheses[0].label).not.toBe(en.hypotheses[0].label);
    expect(fa.hypotheses[0].label).toMatch(/[؀-ۿ]/);
    expect(fa.hypotheses[0].label).not.toMatch(/[يك]/);
  });
});

describe("PHASE 101 — registering TIA-03 changes nothing that came before", () => {
  it("keeps every earlier reference system byte-identical to its pinned digest", () => {
    const FROZEN: Record<string, { checksum: string; scenarios: number }> = {
      "TIA-01": {
        checksum: "8693ed4bb55bca5a2d2560424917d3fa12e8c2fbb16b6781fa589cfc568091a4",
        scenarios: 6,
      },
      "TIA-02": {
        checksum: "9516eba346ab2305e48d87ee7fb600c6ac8ed0392334955cb0f4aa2c464fb2c3",
        scenarios: 7,
      },
      "SCADA-01": {
        checksum: "e6f53bf2dd97b3a23852cafbb0b6b417c9aaad85ad7fc98c5ff2f1fbcfa97bb1",
        scenarios: 7,
      },
      "SCADA-02": {
        checksum: "89092a2f24b9e6527c5d45742ddc51ce91c8d058571d33fae3344b76e1a0f8e7",
        scenarios: 6,
      },
      "SCADA-03": {
        checksum: "3f8504e6f7d408259993a65b094e33ba9290ed31a847c8d3bba580a4e84da9e2",
        scenarios: 7,
      },
      "SCADA-04": {
        checksum: "f2f9ce5b48c8be4a0c462446a579cf15ae1eeefcdf9cd1a4b1117ae714ad4a64",
        scenarios: 8,
      },
      "SCADA-05": {
        checksum: "ee8c0488d34ba8b00c8626eefac38d09c38d7b99413db371ee42688b7090e73f",
        scenarios: 11,
      },
    };

    const frozenIds = Object.keys(FROZEN);
    const selected = CORPUS.filter((s) => frozenIds.includes(s.id));
    expect(selected.map((s) => s.id).sort()).toEqual([...frozenIds].sort());

    const actual = Object.fromEntries(
      selected.map((s) => [s.id, { checksum: s.checksum, scenarios: s.scenarios.length }]),
    );
    expect(actual).toEqual(FROZEN);
  });

  it("registers eight reference systems: three TIA and five SCADA", () => {
    expect(CORPUS.map((s) => s.id)).toEqual([
      "TIA-01",
      "TIA-02",
      "TIA-03",
      "SCADA-01",
      "SCADA-02",
      "SCADA-03",
      "SCADA-04",
      "SCADA-05",
    ]);
    for (const s of CORPUS) {
      expect(s.scenarios.length, `${s.id} must carry at least six scenarios`).toBeGreaterThanOrEqual(
        6,
      );
    }
  });
});
