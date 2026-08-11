// PHASE 101 — SCADA-05, the mining and mineral processing reference, and the
// fifth and final SCADA reference of this phase.
//
// What has to be true of it, beyond "it seals":
//
//   - Nothing in the corpus can command, write toward or actuate a crusher, a
//     conveyor, a mill, a pump, a valve, reagent equipment or any safety
//     object. That is asserted over every safety-classified node at once and
//     over the named process surface, not over a hand-picked list alone.
//   - There is no automatic restart path: the two scheduled routines write
//     exactly one staleness flag and one calculated value between them, and the
//     configuration declares MANUAL_ONLY / NONE for every restart trigger.
//   - There is no bypass around a safety interlock, because no interlock has an
//     inbound control edge of any kind.
//   - A human command intent carries a role, a permission and a confirmation,
//     and the script that writes it first consults evidence a permissive also
//     reads.
//   - Losing both gateway paths is answered by the communication fault mode,
//     and no process hypothesis draws supporting evidence from a frozen mirror.
//   - The corpus contract is AT_LEAST_6_VALID_FAULT_SCENARIOS; SCADA-05 carries
//     ELEVEN, one per fault mode, and that actual count is pinned honestly.
//   - Registering it changes nothing about the six references before it.

import { describe, it, expect } from "vitest";
import { CORPUS, corpusIndex, resolveSymbol, sourceAgreementReport } from "../corpus";
import { diagnose } from "../diagnostics";
import { governanceFor, neighbours, traverse } from "../graph";
import { unguardedCommands } from "../extractors/hmi";
import { isHumanInvokable, isReviewOnly } from "../types";
import type { KnowledgeEdge, ReferenceSystem } from "../types";

const system = CORPUS.find((s) => s.id === "SCADA-05") as ReferenceSystem;
const index = corpusIndex();

const nodeId = (kind: string, local: string) => `SCADA-05:${kind}:${local}`;

/** Relations by which one object could ever drive another. */
const CONTROL_RELATIONS = ["COMMANDS", "WRITES", "ACTUATES"] as const;
const isControl = (e: KnowledgeEdge) =>
  (CONTROL_RELATIONS as readonly string[]).includes(e.relation);

describe("PHASE 101 — SCADA-05 registration and provenance", () => {
  it("is registered in the corpus as a sealed supervisory reference", () => {
    expect(system).toBeDefined();
    expect(system.sourceType).toBe("SCADA_REFERENCE");
    expect(system.origin).toBe("SYNTHETIC_ORIGINAL");
    expect(system.checksum).toMatch(/^[0-9a-f]{64}$/);
    // Contract: AT_LEAST_6_VALID_FAULT_SCENARIOS. The actual count is eleven —
    // one per fault mode — pinned honestly rather than rounded to the minimum.
    expect(system.scenarios.length).toBeGreaterThanOrEqual(6);
    expect(system.scenarios.length).toBe(11);
    expect(system.artifacts.length).toBe(3);
  });

  it("models the plant from the ROM hopper to the tailings boundary", () => {
    const count = (kind: string) => system.nodes.filter((n) => n.kind === kind).length;
    expect(count("DEVICE")).toBe(17);
    expect(count("EQUIPMENT")).toBe(25);
    expect(count("TAG")).toBe(91);
    expect(count("SCADA_TAG")).toBe(39);
    expect(count("HMI_SCREEN")).toBe(9);
    expect(count("SCRIPT")).toBe(5);
    expect(count("KPI")).toBe(5);
    expect(count("EVIDENCE_SOURCE")).toBe(7);
    expect(count("PERMISSIVE")).toBe(7);
    expect(count("INTERLOCK")).toBe(5);
    expect(count("ALARM")).toBe(14);
    expect(count("FAULT_MODE")).toBe(11);
    expect(count("SAFE_ACTION")).toBe(11);
    for (const local of [
      "ROM_HOPPER",
      "APRON_FEEDER_AF01",
      "GRIZZLY_FEEDER_GF01",
      "PRIMARY_JAW_CRUSHER_CR01",
      "SECONDARY_CONE_CRUSHER_CR02",
      "VIBRATING_SCREEN_SC01",
      "CONVEYOR_CV01",
      "CONVEYOR_CV02",
      "CONVEYOR_CV03",
      "METAL_DETECTOR_MD01",
      "MAGNETIC_SEPARATOR_MS01",
      "COARSE_ORE_STOCKPILE",
      "SAG_MILL_ML01",
      "BALL_MILL_ML02",
      "MILL_DISCHARGE_SUMP",
      "CYCLONE_FEED_PUMP_PU01",
      "HYDROCYCLONE_CLUSTER_CY01",
      "FLOTATION_ROW_FL01",
      "REAGENT_SYSTEM_RG01",
      "CONCENTRATE_THICKENER_TH01",
      "CONCENTRATE_FILTER_FP01",
      "TAILINGS_THICKENER_TH02",
      "TAILINGS_PUMP_PU02",
      "DUST_SUPPRESSION_DS01",
      "PROCESS_WATER_TANK_PW01",
    ]) {
      expect(index.nodes.get(nodeId("EQUIPMENT", local))?.kind).toBe("EQUIPMENT");
    }
  });

  it("declares redundancy twice, and mirrors the PLC telemetry it supervises", () => {
    const mirrors = system.edges.filter((e) => e.relation === "MIRRORS");
    expect(
      mirrors.some(
        (e) =>
          e.source === nodeId("DEVICE", "SCADA_SERVER_STANDBY") &&
          e.target === nodeId("DEVICE", "SCADA_SERVER_PRIMARY"),
      ),
    ).toBe(true);
    expect(
      mirrors.some(
        (e) =>
          e.source === nodeId("DEVICE", "COMMS_GATEWAY_B") &&
          e.target === nodeId("DEVICE", "COMMS_GATEWAY_A"),
      ),
    ).toBe(true);
    const mirroredSupervisory = mirrors.filter((e) => e.source.startsWith("SCADA-05:SCADA_TAG:"));
    expect(mirroredSupervisory.length).toBeGreaterThanOrEqual(20);
    for (const edge of mirroredSupervisory) {
      expect(edge.target.startsWith("SCADA-05:TAG:")).toBe(true);
    }
  });

  it("derives every KPI from named plant tags", () => {
    const kpis = system.nodes.filter((n) => n.kind === "KPI");
    expect(kpis.length).toBe(5);
    for (const kpi of kpis) {
      const derived = system.edges.filter(
        (e) => e.relation === "DERIVED_FROM" && e.source === kpi.id,
      );
      expect(derived.length, `${kpi.id} must be derived from at least one tag`).toBeGreaterThan(0);
      for (const edge of derived) expect(index.nodes.get(edge.target)?.kind).toBe("TAG");
    }
  });

  it("authors the ISA-18.2 alarm lifecycle as a declared, closed state chain", () => {
    const lifecycle = nodeId("SEQUENCE", "ALARM_LIFECYCLE");
    const states = ["AL00_NORMAL", "AL10_UNACK_ALARM", "AL20_ACK_ALARM", "AL30_RTN_UNACK"].map(
      (local) => nodeId("STATE", local),
    );
    for (const id of states) {
      expect(
        system.edges.some(
          (e) => e.relation === "CONTAINS" && e.source === lifecycle && e.target === id,
        ),
      ).toBe(true);
    }
    const transitions = system.edges.filter((e) => e.relation === "TRANSITIONS_TO");
    for (let i = 0; i < states.length - 1; i += 1) {
      expect(transitions.some((e) => e.source === states[i] && e.target === states[i + 1])).toBe(
        true,
      );
    }
    expect(transitions.some((e) => e.source === states[3] && e.target === states[0])).toBe(true);
  });

  it("stamps complete provenance and a deterministic checksum on every node and artefact", () => {
    for (const node of system.nodes) {
      expect(node.provenance.projectId).toBe("SCADA-05");
      expect(node.provenance.checksum).toBe(system.checksum);
      expect(node.provenance.sourceId.length).toBeGreaterThan(0);
      expect(node.provenance.subsystem.length).toBeGreaterThan(0);
      expect(node.provenance.version).toBe(system.version);
      expect(node.provenance.revision).toBe(system.revision);
    }
    for (const artifact of system.artifacts) {
      expect(artifact.id).toBe(`SCADA-05:SRC:${artifact.local}`);
      expect(artifact.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.lineCount).toBeGreaterThan(0);
      expect(artifact.content).not.toContain("\r");
      expect(artifact.provenance.projectId).toBe("SCADA-05");
      expect(artifact.provenance.checksum).toBe(system.checksum);
    }
  });
});

describe("PHASE 101 — SCADA-05 plant safety invariants", () => {
  /** The process and safety surface nothing may drive. */
  const PROCESS_SURFACE = [
    ["EQUIPMENT", "PRIMARY_JAW_CRUSHER_CR01"],
    ["EQUIPMENT", "SECONDARY_CONE_CRUSHER_CR02"],
    ["EQUIPMENT", "CONVEYOR_CV01"],
    ["EQUIPMENT", "CONVEYOR_CV02"],
    ["EQUIPMENT", "CONVEYOR_CV03"],
    ["EQUIPMENT", "SAG_MILL_ML01"],
    ["EQUIPMENT", "BALL_MILL_ML02"],
    ["EQUIPMENT", "CYCLONE_FEED_PUMP_PU01"],
    ["EQUIPMENT", "TAILINGS_PUMP_PU02"],
    ["EQUIPMENT", "REAGENT_SYSTEM_RG01"],
    ["EQUIPMENT", "TAILINGS_THICKENER_TH02"],
    ["INTERLOCK", "ILK_CONVEYOR_SAFETY_CIRCUIT"],
    ["INTERLOCK", "ILK_CRUSHER_PROTECTION"],
    ["INTERLOCK", "ILK_MILL_PROTECTION"],
    ["INTERLOCK", "ILK_METAL_DETECTOR_STOP"],
    ["INTERLOCK", "ILK_TAILINGS_LINE_PROTECTION"],
    ["TAG", "CV02_PULLCORD_HEALTHY"],
    ["TAG", "CV02_ESTOP_HEALTHY"],
    ["TAG", "CV02_BELT_ALIGN_HEALTHY"],
    ["TAG", "CV03_ZERO_SPEED_TRIP"],
    ["TAG", "CR01_GUARD_CLOSED"],
    ["TAG", "RG01_COLLECTOR_FLOW"],
    ["TAG", "RG01_BUND_LEAK_DETECTED"],
    ["TAG", "TH02_RAKE_TORQUE"],
    ["TAG", "MD01_METAL_DETECTED"],
  ] as const;

  it("drives nothing on the process or safety surface", () => {
    for (const [kind, local] of PROCESS_SURFACE) {
      const id = nodeId(kind, local);
      expect(index.nodes.get(id), `${kind}:${local} must exist`).toBeDefined();
      const driving = system.edges.filter(
        (e) => isControl(e) && (e.source === id || e.target === id),
      );
      expect(driving, `${kind}:${local} must have no control path`).toEqual([]);
    }
  });

  it("carries no command, write or actuation path onto ANY safety-classified object", () => {
    // Derived over the whole system rather than over a list, so a future edit
    // cannot add a control path to an object the list happened to miss.
    const safety = new Set(
      system.nodes.filter((n) => n.provenance.safetyClass !== "NON_SAFETY").map((n) => n.id),
    );
    expect(safety.size).toBeGreaterThan(0);
    expect(
      system.edges.filter((e) => isControl(e) && (safety.has(e.source) || safety.has(e.target))),
    ).toEqual([]);
  });

  it("actuates nothing at all: this reference drives no plant object", () => {
    expect(system.edges.filter((e) => e.relation === "ACTUATES")).toEqual([]);
  });

  it("leaves no bypass around any interlock", () => {
    const interlocks = system.nodes.filter((n) => n.kind === "INTERLOCK");
    expect(interlocks.length).toBe(5);
    for (const interlock of interlocks) {
      // Nothing writes to, commands or actuates an interlock…
      expect(
        system.edges.filter((e) => isControl(e) && e.target === interlock.id),
        `${interlock.id} must have no inbound control path`,
      ).toEqual([]);
      // …every one of them actually blocks a step, so the absence of a control
      // path is a guarantee about live protection rather than about a stub…
      expect(
        system.edges.some((e) => e.relation === "BLOCKS" && e.source === interlock.id),
        `${interlock.id} must block a state`,
      ).toBe(true);
      // …and each is safety-classified, so anything touching it is review-only.
      expect(isReviewOnly(interlock.provenance.safetyClass)).toBe(true);
    }
  });

  it("lets the scheduled routines calculate only, and never restart anything", () => {
    const automatic = system.nodes.filter((n) => n.kind === "SCRIPT" && !isHumanInvokable(n));
    expect(automatic.map((n) => n.id).sort()).toEqual(
      [
        nodeId("SCRIPT", "OnPlantWatchdog"),
        nodeId("SCRIPT", "OnSpecificEnergyCalculation"),
      ].sort(),
    );

    const written = system.edges
      .filter((e) => isControl(e) && automatic.some((n) => n.id === e.source))
      .map((e) => `${e.relation}|${e.target}`)
      .sort();
    expect(written).toEqual(
      [
        `WRITES|${nodeId("SCADA_TAG", "MPP_Telemetry_Stale")}`,
        `WRITES|${nodeId("SCADA_TAG", "MPP_Specific_Energy_Value")}`,
      ].sort(),
    );

    // Neither written value is a command intent: no permission, no
    // confirmation, and no binding to a plant object.
    for (const local of ["MPP_Telemetry_Stale", "MPP_Specific_Energy_Value"]) {
      const tag = index.nodes.get(nodeId("SCADA_TAG", local))!;
      expect(tag.attributes.requiredPermission).toBeUndefined();
      expect(tag.attributes.requiresConfirmation).toBeUndefined();
      expect(
        system.edges.filter(
          (e) =>
            ["BOUND_TO", "ACTUATES", "MONITORS", "MIRRORS"].includes(e.relation) &&
            (e.source === tag.id || e.target === tag.id),
        ),
      ).toEqual([]);
    }

    // …and each still leaves an audit record, while demanding no role.
    for (const script of automatic) {
      expect(governanceFor(index, script.id).roles).toEqual([]);
      expect(governanceFor(index, script.id).auditEventTypes.length).toBe(1);
    }
  });

  it("declares no automatic restart and no interlock bypass anywhere in its configuration", () => {
    const config = system.artifacts.find((x) => x.local === "SupervisoryConfiguration")!;
    const parsed = JSON.parse(config.content) as {
      controlPolicy: { mode: string; supervisoryExecution: string; automaticActuation: string };
      restartPolicy: {
        afterTrip: string;
        afterCommunicationRecovery: string;
        afterPowerRestoration: string;
        automaticRestart: string;
      };
      interlockPolicy: { bypass: string; reset: string; simulation: string; protectedFunctions: string[] };
      reagentPolicy: { supervisoryControl: string; dosingCommands: string; disposition: string };
      tailingsPolicy: { supervisoryControl: string; disposition: string };
      staleDataSupervision: { redundantPathRule: string; interpretation: string };
      fieldCommunications: { direction: string; commands: string; note: string };
    };
    expect(parsed.controlPolicy.mode).toBe("ADVISORY_ONLY");
    expect(parsed.controlPolicy.supervisoryExecution).toBe("NONE");
    expect(parsed.controlPolicy.automaticActuation).toBe("NONE");
    expect(parsed.restartPolicy.automaticRestart).toBe("NONE");
    expect(parsed.restartPolicy.afterTrip).toBe("MANUAL_ONLY");
    expect(parsed.restartPolicy.afterCommunicationRecovery).toBe("MANUAL_ONLY");
    expect(parsed.restartPolicy.afterPowerRestoration).toBe("MANUAL_ONLY");
    expect(parsed.interlockPolicy.bypass).toBe("NONE");
    expect(parsed.interlockPolicy.reset).toBe("NONE");
    expect(parsed.interlockPolicy.simulation).toBe("NONE");
    for (const fn of ["EMERGENCY_STOP", "CONVEYOR_PULL_CORD", "MACHINE_GUARD", "TAILINGS_LINE_PROTECTION"]) {
      expect(parsed.interlockPolicy.protectedFunctions).toContain(fn);
    }
    expect(parsed.reagentPolicy.supervisoryControl).toBe("NONE");
    expect(parsed.reagentPolicy.dosingCommands).toBe("NONE");
    expect(parsed.reagentPolicy.disposition).toBe("REVIEW_ONLY");
    expect(parsed.tailingsPolicy.supervisoryControl).toBe("NONE");
    expect(parsed.tailingsPolicy.disposition).toBe("ESCALATE");
    // A stale picture is unknown, never healthy.
    expect(parsed.staleDataSupervision.interpretation).toBe("UNKNOWN_NOT_HEALTHY");
    expect(parsed.staleDataSupervision.redundantPathRule).toBe(
      "STALE_ONLY_WHEN_NEITHER_GATEWAY_CARRIES_DATA",
    );
    // …and no claim that a vendor tool produced or validated any of it.
    expect(parsed.fieldCommunications.direction).toBe("MONITORING_ONLY");
    expect(parsed.fieldCommunications.commands).toBe("NONE");
    expect(parsed.fieldCommunications.note).toContain(
      "Nothing here was produced, compiled or validated by any proprietary mining or SCADA vendor engineering tool",
    );
  });

  it("requires role, permission and confirmation on every human command intent", () => {
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

  it("backs each plant intent with evidence a permissive or interlock also reads", () => {
    // Proven hop by hop: script --READS--> SCADA_TAG --MIRRORS--> TAG
    // <--READS-- PERMISSIVE/INTERLOCK. An intent offered without consulting the
    // evidence the plant's own gating logic consults is an intent formed blind.
    const gatingReaders = new Set(
      system.edges
        .filter((e) => e.relation === "READS")
        .filter((e) => {
          const source = index.nodes.get(e.source);
          return source?.kind === "PERMISSIVE" || source?.kind === "INTERLOCK";
        })
        .map((e) => e.target),
    );

    for (const local of ["OnFeederRateSetpointIntent", "OnMillFeedTrimIntent"]) {
      const scriptId = nodeId("SCRIPT", local);
      const consulted = system.edges
        .filter((e) => e.relation === "READS" && e.source === scriptId)
        .map((e) => e.target);
      const backed = consulted.filter((supervisoryId) =>
        system.edges.some(
          (e) =>
            e.relation === "MIRRORS" && e.source === supervisoryId && gatingReaders.has(e.target),
        ),
      );
      expect(backed.length, `${local} must consult gated evidence`).toBeGreaterThan(0);
    }
  });

  it("distinguishes indication, command intent, permissive, interlock and consequence", () => {
    const indication = index.nodes.get(nodeId("SCADA_TAG", "MPP_Cv03_Belt_Speed"))!;
    const intent = index.nodes.get(nodeId("SCADA_TAG", "MPP_Mill_Feed_Trim_Intent"))!;
    const permissive = index.nodes.get(nodeId("PERMISSIVE", "PRM_SUMP_LEVEL_ADEQUATE"))!;
    const interlock = index.nodes.get(nodeId("INTERLOCK", "ILK_CONVEYOR_SAFETY_CIRCUIT"))!;

    expect(indication.attributes.accessMode).toBe("READ");
    expect(system.edges.some((e) => e.relation === "MIRRORS" && e.source === indication.id)).toBe(
      true,
    );

    expect(intent.attributes.accessMode).toBe("WRITE");
    expect(intent.attributes.requiredPermission).toBe("MILL_FEED_CONTROL");
    expect(intent.attributes.requiresConfirmation).toBe(true);
    expect(
      system.edges.filter(
        (e) =>
          ["MIRRORS", "BOUND_TO", "ACTUATES", "MONITORS"].includes(e.relation) &&
          (e.source === intent.id || e.target === intent.id),
      ),
    ).toEqual([]);

    expect(system.edges.some((e) => e.relation === "GATES" && e.source === permissive.id)).toBe(
      true,
    );
    expect(system.edges.some((e) => e.relation === "BLOCKS" && e.source === permissive.id)).toBe(
      false,
    );
    expect(system.edges.some((e) => e.relation === "BLOCKS" && e.source === interlock.id)).toBe(
      true,
    );
    expect(system.edges.some((e) => e.relation === "GATES" && e.source === interlock.id)).toBe(
      false,
    );

    // The consequence: the safety circuit raises its own alarm, and the belt
    // stopping raises a different one. Cause and consequence are separate
    // objects with separate fault modes, which is what lets a diagnosis rank
    // them instead of collapsing them.
    expect(
      system.edges.some(
        (e) =>
          e.relation === "RAISES" &&
          e.source === interlock.id &&
          e.target === nodeId("ALARM", "ALM_CV02_PULLCORD_OPERATED"),
      ),
    ).toBe(true);
    expect(
      system.edges.some(
        (e) =>
          e.relation === "RAISES" &&
          e.source === nodeId("TAG", "CV03_ZERO_SPEED_TRIP") &&
          e.target === nodeId("ALARM", "ALM_CV03_BELT_SLIP"),
      ),
    ).toBe(true);
  });

  it("keeps every reagent, tailings and safety action review-only or escalate-only", () => {
    for (const local of [
      "SA_ESCALATE_REAGENT_CONTAINMENT_REVIEW",
      "SA_ESCALATE_TAILINGS_AND_WATER_BALANCE_REVIEW",
      "SA_ESCALATE_CONVEYOR_SAFETY_CIRCUIT_REVIEW",
      "SA_INSPECT_CRUSHER_CAVITY_AND_FEED_PRESENTATION",
      "SA_REVIEW_CV03_BELT_TENSION_AND_LAGGING",
    ]) {
      const node = index.nodes.get(nodeId("SAFE_ACTION", local))!;
      expect(isReviewOnly(node.provenance.safetyClass), `${local} must be review-only`).toBe(true);
    }
  });
});

describe("PHASE 101 — SCADA-05 agrees with its own source", () => {
  const report = sourceAgreementReport(system);

  it("checks both the supervisory script and the screen definition", () => {
    expect([...report.checked].sort()).toEqual(["OperatorScreens", "SupervisoryScripts"]);
  });

  it("reports the declarative configuration as skipped, not as clean", () => {
    expect(report.skipped).toEqual([
      {
        artifact: "SupervisoryConfiguration",
        language: "SCADA_JSON",
        reason: "NO_RELATION_MAPPING",
      },
    ]);
  });

  it("states its verdict as PARTIAL — measured where it could be, honest about the rest", () => {
    expect(report.issues).toEqual([]);
    expect(report.status).toBe("PARTIAL");
  });

  it("resolves every script name in the source to exactly one corpus node", () => {
    for (const local of [
      "OnFeederRateSetpointIntent",
      "OnMillFeedTrimIntent",
      "OnAlarmAcknowledge",
      "OnPlantWatchdog",
      "OnSpecificEnergyCalculation",
    ]) {
      expect(resolveSymbol(system, local)?.id).toBe(nodeId("SCRIPT", local));
    }
  });

  it("leaves no unguarded command anywhere in the screen definition", () => {
    const screens = system.artifacts.find((x) => x.local === "OperatorScreens");
    expect(unguardedCommands(screens!.content)).toEqual([]);
  });

  it("keeps the conveyor, cyclone and reagent surfaces display-only in their own source", () => {
    const screens = system.artifacts.find((x) => x.local === "OperatorScreens")!;
    const definition = JSON.parse(screens.content) as {
      screens: Array<{ name: string; objects?: Array<{ name: string; commands?: string[] }> }>;
    };
    const byObject = new Map<string, string[]>();
    for (const screen of definition.screens) {
      for (const object of screen.objects ?? []) byObject.set(object.name, object.commands ?? []);
    }
    for (const object of [
      "Trend_Cv03BeltSpeed",
      "Ind_Cv02SafetyCircuit",
      "Ind_MetalDetector",
      "Fp_CycloneFeed",
      "Ind_ReagentMonitor",
      "Trend_ThickenerTorque",
    ]) {
      expect(byObject.get(object), `${object} must declare no command`).toEqual([]);
    }
  });
});

describe("PHASE 101 — SCADA-05 governance", () => {
  const SCRIPTS = {
    feederRate: nodeId("SCRIPT", "OnFeederRateSetpointIntent"),
    millFeedTrim: nodeId("SCRIPT", "OnMillFeedTrimIntent"),
    alarmAck: nodeId("SCRIPT", "OnAlarmAcknowledge"),
    watchdog: nodeId("SCRIPT", "OnPlantWatchdog"),
    kpiCalc: nodeId("SCRIPT", "OnSpecificEnergyCalculation"),
  };

  it("gives every operator-invoked script an explicit role", () => {
    for (const [scriptId, role] of [
      [SCRIPTS.feederRate, "Role_ConcentratorSupervisor"],
      [SCRIPTS.millFeedTrim, "Role_ConcentratorOperator"],
      [SCRIPTS.alarmAck, "Role_ConcentratorOperator"],
    ] as const) {
      const node = index.nodes.get(scriptId)!;
      expect(isHumanInvokable(node)).toBe(true);
      expect(governanceFor(index, scriptId).roles.map((r) => r.id)).toEqual([nodeId("ROLE", role)]);
    }
  });

  it("gives both scheduled routines no role and still an audit record", () => {
    for (const [scriptId, audit] of [
      [SCRIPTS.watchdog, "Audit_PlantWatchdogRecord"],
      [SCRIPTS.kpiCalc, "Audit_SpecificEnergyCalculationRecord"],
    ] as const) {
      const node = index.nodes.get(scriptId)!;
      expect(isHumanInvokable(node)).toBe(false);
      expect(node.attributes.humanInvokable).toBeUndefined();
      const view = governanceFor(index, scriptId);
      expect(view.roles).toEqual([]);
      expect(view.auditEventTypes.map((e) => e.id)).toEqual([nodeId("AUDIT_EVENT_TYPE", audit)]);
    }
  });

  it("keeps the governance layer out of every diagnostic walk", () => {
    for (const origin of [
      nodeId("ALARM", "ALM_PLANT_COMMS_STALE"),
      nodeId("ALARM", "ALM_CV02_PULLCORD_OPERATED"),
      nodeId("ALARM", "ALM_TAILINGS_RAKE_TORQUE_HIGH"),
      nodeId("ALARM", "ALM_REAGENT_BUND_LEAK"),
    ]) {
      const reached = traverse(index, [origin], { direction: "both", maxDepth: 6 });
      const kinds = new Set(reached.map((r) => r.node.kind));
      expect(kinds.has("ROLE")).toBe(false);
      expect(kinds.has("AUDIT_EVENT_TYPE")).toBe(false);
    }
    const fromStale = traverse(index, [nodeId("ALARM", "ALM_PLANT_COMMS_STALE")], {
      direction: "both",
      maxDepth: 6,
    });
    expect(fromStale.map((r) => r.node.id)).toContain(SCRIPTS.watchdog);
  });

  it("shows a role only to a caller that asks for the governance view", () => {
    const plain = neighbours(index, SCRIPTS.millFeedTrim, { direction: "out" }).map(
      (n) => n.node.kind,
    );
    expect(plain).not.toContain("ROLE");
    expect(plain).not.toContain("AUDIT_EVENT_TYPE");
  });
});

describe("PHASE 101 — SCADA-05 diagnosis", () => {
  it("separates a slipping belt from a belt a person stopped", () => {
    // Both end with a stationary belt. The evidence is what tells them apart,
    // and confusing them would send a fitter to a belt somebody stopped on
    // purpose.
    const slip = system.scenarios.find((s) => s.id === "SCADA-05-FS-03")!;
    const slipResult = diagnose(index, { observations: slip.observations, locale: "en" });
    expect(slipResult.hypotheses[0].faultModeId).toBe(nodeId("FAULT_MODE", "FM_CV03_BELT_SLIP"));

    const stop = system.scenarios.find((s) => s.id === "SCADA-05-FS-08")!;
    const stopResult = diagnose(index, { observations: stop.observations, locale: "en" });
    expect(stopResult.hypotheses[0].faultModeId).toBe(
      nodeId("FAULT_MODE", "FM_CV02_PULLCORD_INTERLOCK"),
    );
    // The belt-slip hypothesis may still be reachable there, but never first:
    // the safety stop is the cause and the stopped belt is its consequence.
    const slipRank = stopResult.hypotheses.findIndex(
      (h) => h.faultModeId === nodeId("FAULT_MODE", "FM_CV03_BELT_SLIP"),
    );
    expect(slipRank).not.toBe(0);
  });

  it("never reads a frozen picture as a healthy plant", () => {
    const scenario = system.scenarios.find((s) => s.id === "SCADA-05-FS-07")!;
    const result = diagnose(index, { observations: scenario.observations, locale: "en" });

    const commsId = nodeId("FAULT_MODE", "FM_PLANT_COMMS_LOSS");
    expect(result.hypotheses[0].faultModeId).toBe(commsId);
    expect(result.hypotheses[0].subsystem).toBe("TELEMETRY");
    for (const hypothesis of result.hypotheses.filter((h) => h.faultModeId !== commsId)) {
      expect(
        hypothesis.supporting,
        `${hypothesis.faultModeId} must draw no support from a stale picture`,
      ).toEqual([]);
      expect(hypothesis.confidence).toBe(0);
    }
    expect(result.missingEvidence.map((c) => c.nodeId)).toContain(
      nodeId("EVIDENCE_SOURCE", "HIST_COMMS_LINK_LOG"),
    );
    expect(result.confidence).toBeLessThan(1);
  });

  it("names the evidence it was not given rather than assuming it", () => {
    for (const scenarioId of ["SCADA-05-FS-05", "SCADA-05-FS-06", "SCADA-05-FS-10"]) {
      const scenario = system.scenarios.find((s) => s.id === scenarioId)!;
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      const missing = result.missingEvidence.map((c) => c.nodeId);
      for (const expected of scenario.groundTruth.expectedMissingNodeIds) {
        expect(missing, `${scenarioId} must report ${expected} as missing`).toContain(expected);
      }
    }
  });

  it("escalates the safety, tailings and reagent scenarios with review-only actions", () => {
    for (const [scenarioId, actionLocal] of [
      ["SCADA-05-FS-08", "SA_ESCALATE_CONVEYOR_SAFETY_CIRCUIT_REVIEW"],
      ["SCADA-05-FS-10", "SA_ESCALATE_TAILINGS_AND_WATER_BALANCE_REVIEW"],
      ["SCADA-05-FS-11", "SA_ESCALATE_REAGENT_CONTAINMENT_REVIEW"],
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

  it("recommends only safe actions, and marks every safety-classified one review-only", () => {
    for (const scenario of system.scenarios) {
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      for (const action of result.safeVerificationActions) {
        const node = index.nodes.get(action.nodeId)!;
        expect(node.kind).toBe("SAFE_ACTION");
        if (isReviewOnly(node.provenance.safetyClass)) expect(action.reviewOnly).toBe(true);
      }
    }
  });

  it("ranks the true root cause, subsystem and fault class first on all eleven scenarios", () => {
    for (const scenario of system.scenarios) {
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(result.hypotheses[0]?.faultModeId, scenario.id).toBe(scenario.groundTruth.faultModeId);
      expect(result.hypotheses[0]?.subsystem, scenario.id).toBe(scenario.groundTruth.subsystem);
      expect(result.hypotheses[0]?.faultClass, scenario.id).toBe(scenario.groundTruth.faultClass);
    }
  });

  it("covers a genuine spread of fault classes rather than one easy family", () => {
    const classes = new Set(system.scenarios.map((s) => s.groundTruth.faultClass));
    expect(classes.size).toBeGreaterThanOrEqual(8);
    for (const expected of [
      "BLOCKAGE",
      "SEQUENCE_TIMEOUT",
      "ACTUATOR_FAILURE",
      "DRIVE_FAULT",
      "PROCESS_DEVIATION",
      "SENSOR_FAILURE",
      "COMMUNICATION_LOSS",
      "INTERLOCK_ACTIVE",
      "INCORRECT_MODE",
    ]) {
      expect(classes.has(expected as never), `${expected} must be covered`).toBe(true);
    }
  });

  it("cites only corpus nodes, on every one of its scenarios", () => {
    for (const scenario of system.scenarios) {
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(result.unresolvedObservations).toEqual([]);
      for (const citation of result.citations) expect(index.nodes.has(citation)).toBe(true);
    }
  });

  it("answers in Persian when asked to, from authored text rather than transliteration", () => {
    const scenario = system.scenarios.find((s) => s.id === "SCADA-05-FS-10")!;
    const fa = diagnose(index, { observations: scenario.observations, locale: "fa" });
    const en = diagnose(index, { observations: scenario.observations, locale: "en" });
    expect(fa.hypotheses[0].label).not.toBe(en.hypotheses[0].label);
    expect(fa.hypotheses[0].label).toMatch(/[؀-ۿ]/);
    // Arabic yeh / kaf must never appear in authored Persian.
    expect(fa.hypotheses[0].label).not.toMatch(/[يك]/);
  });
});

describe("PHASE 101 — the SCADA corpus is complete and everything before it is untouched", () => {
  it("keeps every earlier reference system byte-identical to its pinned digest", () => {
    // The owner froze TIA-01/02 and SCADA-01..04. A content checksum is the
    // mechanical form of that instruction: any edit to one of those systems
    // moves its digest and fails here.
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
    };

    const frozenIds = Object.keys(FROZEN);
    const selected = CORPUS.filter((s) => frozenIds.includes(s.id));
    expect(selected.map((s) => s.id).sort()).toEqual([...frozenIds].sort());

    const actual = Object.fromEntries(
      selected.map((s) => [s.id, { checksum: s.checksum, scenarios: s.scenarios.length }]),
    );
    expect(actual).toEqual(FROZEN);
  });

  it("registers every reference system, each satisfying the AT_LEAST_6 contract", () => {
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
    for (const s of CORPUS) {
      expect(s.scenarios.length, `${s.id} must carry at least six scenarios`).toBeGreaterThanOrEqual(
        6,
      );
    }
  });
});
