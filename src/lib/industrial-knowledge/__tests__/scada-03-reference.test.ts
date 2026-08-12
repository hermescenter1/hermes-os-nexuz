// PHASE 101 — SCADA-03, the petrochemical compression-train supervisory
// reference.
//
// SCADA-03 extends the supervisory family with redundant CONNECTIVITY and a
// monitored ESD boundary. What has to be true of it, beyond "it seals":
//
//   - Its graph agrees with its own supervisory source and its own screen
//     definition, in both of those languages, not just in one of them.
//   - Its declarative redundancy/aggregation/alarm-philosophy configuration is
//     reported as SKIPPED rather than quietly counted as clean, so the verdict
//     over the system is PARTIAL and says so.
//   - The corpus contract is AT_LEAST_6_VALID_FAULT_SCENARIOS per reference
//     system; SCADA-03 carries SEVEN, and that actual count is pinned honestly.
//   - The ESD / flare interface is a monitored safety boundary ONLY: nothing
//     commands toward it, its objects are SAFETY_CRITICAL / SAFETY_RELATED and
//     therefore review-only, and its scenario escalates.
//   - Governance is complete where it should be and absent where it should be:
//     three operator-invoked scripts each demand a role, and the automatic
//     OPC UA watchdog demands none while still emitting a record.
//   - Diagnosis never walks through any of that.

import { describe, it, expect } from "vitest";
import { CORPUS, corpusIndex, resolveSymbol, sourceAgreementReport } from "../corpus";
import { diagnose } from "../diagnostics";
import { governanceFor, neighbours, traverse } from "../graph";
import { unguardedCommands } from "../extractors/hmi";
import { isHumanInvokable, isReviewOnly } from "../types";
import type { ReferenceSystem } from "../types";

const system = CORPUS.find((s) => s.id === "SCADA-03") as ReferenceSystem;
const index = corpusIndex();

const nodeId = (kind: string, local: string) => `SCADA-03:${kind}:${local}`;

describe("PHASE 101 — SCADA-03 registration and provenance", () => {
  it("is registered in the corpus as a sealed supervisory reference", () => {
    expect(system).toBeDefined();
    expect(system.sourceType).toBe("SCADA_REFERENCE");
    expect(system.origin).toBe("SYNTHETIC_ORIGINAL");
    expect(system.checksum).toMatch(/^[0-9a-f]{64}$/);
    // Contract: AT_LEAST_6_VALID_FAULT_SCENARIOS. The actual count is seven,
    // pinned honestly rather than rounded to the contract minimum.
    expect(system.scenarios.length).toBeGreaterThanOrEqual(6);
    expect(system.scenarios.length).toBe(7);
    expect(system.artifacts.length).toBe(3);
  });

  it("models the full compression and fractionation train as its subject", () => {
    const count = (kind: string) => system.nodes.filter((n) => n.kind === kind).length;
    expect(count("SCADA_TAG")).toBeGreaterThanOrEqual(10);
    expect(count("HMI_SCREEN")).toBe(5);
    expect(count("SCRIPT")).toBe(4);
    expect(count("KPI")).toBe(4);
    expect(count("EVIDENCE_SOURCE")).toBeGreaterThanOrEqual(5);
    for (const local of [
      "FEED_SEPARATOR",
      "PG_COMPRESSOR",
      "ANTISURGE_RECYCLE_VALVE",
      "LUBE_OIL_SYSTEM",
      "SEAL_GAS_SYSTEM",
      "INTERSTAGE_COOLER",
      "FRACTIONATION_COLUMN",
      "FLARE_HEADER",
    ]) {
      expect(index.nodes.get(nodeId("EQUIPMENT", local))?.kind).toBe("EQUIPMENT");
    }
  });

  it("declares redundancy twice: the server pair and the OPC UA gateway pair", () => {
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
          e.source === nodeId("DEVICE", "OPCUA_GATEWAY_B") &&
          e.target === nodeId("DEVICE", "OPCUA_GATEWAY_A"),
      ),
    ).toBe(true);
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
      expect(
        transitions.some((e) => e.source === states[i] && e.target === states[i + 1]),
      ).toBe(true);
    }
    expect(
      transitions.some((e) => e.source === states[3] && e.target === states[0]),
    ).toBe(true);
  });

  it("stamps complete provenance and a content checksum onto every artefact", () => {
    for (const artifact of system.artifacts) {
      expect(artifact.id).toBe(`SCADA-03:SRC:${artifact.local}`);
      expect(artifact.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.lineCount).toBeGreaterThan(0);
      expect(artifact.content).not.toContain("\r");
      expect(artifact.provenance.projectId).toBe("SCADA-03");
      expect(artifact.provenance.checksum).toBe(system.checksum);
    }
  });

  it("keeps every safety-classified object review-only", () => {
    const safety = system.nodes.filter((n) => n.provenance.safetyClass !== "NON_SAFETY");
    expect(safety.length).toBeGreaterThan(0);
    for (const n of safety) expect(isReviewOnly(n.provenance.safetyClass)).toBe(true);
  });
});

describe("PHASE 101 — SCADA-03 monitored ESD boundary", () => {
  it("classifies the boundary objects as safety-critical or safety-related", () => {
    for (const [kind, local] of [
      ["DEVICE", "ESD_SYSTEM"],
      ["TAG", "ESD_TRIP_ACTIVE"],
      ["INTERLOCK", "ILK_ESD_TRIP"],
      ["ALARM", "ALM_ESD_TRIP"],
      ["FAULT_MODE", "FM_ESD_BOUNDARY_TRIP"],
      ["SAFE_ACTION", "SA_ESCALATE_ESD_BOUNDARY_REVIEW"],
    ] as const) {
      const node = index.nodes.get(nodeId(kind, local))!;
      expect(node.provenance.safetyClass).not.toBe("NON_SAFETY");
      expect(isReviewOnly(node.provenance.safetyClass)).toBe(true);
    }
  });

  it("declares no command toward the boundary, anywhere in the graph", () => {
    // Monitored only. Nothing commands, writes toward or actuates the ESD
    // status, the flare pressure, their mirrors, the ESD system or the flare
    // header — from any node of any kind.
    const boundary = new Set([
      nodeId("DEVICE", "ESD_SYSTEM"),
      nodeId("EQUIPMENT", "FLARE_HEADER"),
      nodeId("TAG", "ESD_TRIP_ACTIVE"),
      nodeId("TAG", "FLARE_HEADER_PRESSURE"),
      nodeId("SCADA_TAG", "PCT_Esd_Trip_Active"),
      nodeId("SCADA_TAG", "PCT_Flare_Header_Press"),
      nodeId("INTERLOCK", "ILK_ESD_TRIP"),
    ]);
    const offending = system.edges.filter(
      (e) =>
        ["COMMANDS", "WRITES", "ACTUATES"].includes(e.relation) &&
        (boundary.has(e.target) || boundary.has(e.source)),
    );
    expect(offending).toEqual([]);
  });

  it("keeps the safety-boundary screen display-only in its own source", () => {
    const screens = system.artifacts.find((x) => x.local === "OperatorScreens")!;
    const definition = JSON.parse(screens.content) as {
      screens: Array<{ name: string; objects?: Array<{ commands?: string[] }> }>;
    };
    const safetyScreen = definition.screens.find((s) => s.name === "Screen_SafetyBoundary")!;
    for (const object of safetyScreen.objects ?? []) {
      expect(object.commands ?? []).toEqual([]);
    }
  });
});

describe("PHASE 101 — SCADA-03 agrees with its own source", () => {
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
      "OnTrainStartRequest",
      "OnColumnTrimRequest",
      "OnOpcUaWatchdog",
      "OnAlarmAcknowledge",
    ]) {
      expect(resolveSymbol(system, local)?.id).toBe(nodeId("SCRIPT", local));
    }
  });

  it("keeps the operator-command design guarded, and names its one deliberate exception", () => {
    // Reviewing the DESIGN, never fixing it. Both plant commands require a
    // permission AND a confirmation. ISA-18.2 acknowledgement requires a
    // permission and deliberately no confirmation: it records that a human saw
    // the alarm and clears no condition.
    const screens = system.artifacts.find((x) => x.local === "OperatorScreens");
    const findings = unguardedCommands(screens!.content);
    expect(findings).toEqual([
      {
        screen: "Screen_Alarms",
        object: "Banner_ActiveAlarms",
        tag: "PCT_Alarm_Ack_Cmd",
        reason: "NO_CONFIRMATION",
      },
    ]);
  });
});

describe("PHASE 101 — SCADA-03 governance", () => {
  const SCRIPTS = {
    trainStart: nodeId("SCRIPT", "OnTrainStartRequest"),
    columnTrim: nodeId("SCRIPT", "OnColumnTrimRequest"),
    alarmAck: nodeId("SCRIPT", "OnAlarmAcknowledge"),
    watchdog: nodeId("SCRIPT", "OnOpcUaWatchdog"),
  };

  it("gives every operator-invoked script an explicit role", () => {
    for (const [scriptId, role] of [
      [SCRIPTS.trainStart, "Role_TrainOperator"],
      [SCRIPTS.columnTrim, "Role_TrainSupervisor"],
      [SCRIPTS.alarmAck, "Role_TrainOperator"],
    ] as const) {
      const node = index.nodes.get(scriptId)!;
      expect(isHumanInvokable(node)).toBe(true);
      expect(governanceFor(index, scriptId).roles.map((r) => r.id)).toEqual([nodeId("ROLE", role)]);
    }
  });

  it("gives the automatic watchdog no role and still an audit record", () => {
    const watchdog = index.nodes.get(SCRIPTS.watchdog)!;
    expect(isHumanInvokable(watchdog)).toBe(false);
    expect(watchdog.attributes.humanInvokable).toBeUndefined();

    const view = governanceFor(index, SCRIPTS.watchdog);
    expect(view.roles).toEqual([]);
    expect(view.auditEventTypes.map((e) => e.id)).toEqual([
      nodeId("AUDIT_EVENT_TYPE", "Audit_OpcUaWatchdogRecord"),
    ]);
  });

  it("keeps the governance layer out of every diagnostic walk", () => {
    const reached = traverse(index, [nodeId("ALARM", "ALM_OPCUA_STALE")], {
      direction: "both",
      maxDepth: 6,
    });
    const kinds = new Set(reached.map((r) => r.node.kind));
    expect(kinds.has("ROLE")).toBe(false);
    expect(kinds.has("AUDIT_EVENT_TYPE")).toBe(false);
    // …while the supervisory script that writes the stale flag stays visible.
    expect(reached.map((r) => r.node.id)).toContain(SCRIPTS.watchdog);
  });

  it("shows a role only to a caller that asks for the governance view", () => {
    const plain = neighbours(index, SCRIPTS.columnTrim, { direction: "out" }).map(
      (n) => n.node.kind,
    );
    expect(plain).not.toContain("ROLE");
    expect(plain).not.toContain("AUDIT_EVENT_TYPE");
  });
});

describe("PHASE 101 — SCADA-03 diagnosis", () => {
  it("blames the redundant aggregation, not the plant, when the whole picture freezes", () => {
    const scenario = system.scenarios.find((s) => s.id === "SCADA-03-FS-04")!;
    const result = diagnose(index, { observations: scenario.observations, locale: "en" });

    expect(result.hypotheses[0].faultModeId).toBe(
      nodeId("FAULT_MODE", "FM_OPCUA_REDUNDANCY_LOSS"),
    );
    expect(result.hypotheses[0].subsystem).toBe("TELEMETRY");
    expect(result.safeVerificationActions.map((x) => x.nodeId)).toContain(
      nodeId("SAFE_ACTION", "SA_VERIFY_OPCUA_GATEWAY_SESSIONS"),
    );
  });

  it("separates the stuck recycle valve from a drive fault", () => {
    // The anti-surge family: the machine is healthy, the margin is real, and
    // the explanation is the actuator that stopped following its demand.
    const scenario = system.scenarios.find((s) => s.id === "SCADA-03-FS-03")!;
    const result = diagnose(index, { observations: scenario.observations, locale: "en" });

    expect(result.hypotheses[0].faultModeId).toBe(nodeId("FAULT_MODE", "FM_RECYCLE_VALVE_STUCK"));
    expect(result.hypotheses[0].faultClass).toBe("ACTUATOR_FAILURE");
  });

  it("names the evidence it was not given rather than assuming it", () => {
    const scenario = system.scenarios.find((s) => s.id === "SCADA-03-FS-01")!;
    const result = diagnose(index, { observations: scenario.observations, locale: "en" });
    const missing = result.missingEvidence.map((c) => c.nodeId);
    for (const expected of scenario.groundTruth.expectedMissingNodeIds) {
      expect(missing).toContain(expected);
    }
  });

  it("escalates the ESD boundary and marks its action review-only", () => {
    const scenario = system.scenarios.find((s) => s.id === "SCADA-03-FS-05")!;
    const result = diagnose(index, { observations: scenario.observations, locale: "en" });

    expect(result.escalationConditions.length).toBeGreaterThan(0);
    const review = result.safeVerificationActions.find(
      (x) => x.nodeId === nodeId("SAFE_ACTION", "SA_ESCALATE_ESD_BOUNDARY_REVIEW"),
    );
    expect(review?.reviewOnly).toBe(true);
  });

  it("ranks the true root cause first on every one of its seven scenarios", () => {
    for (const scenario of system.scenarios) {
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(result.hypotheses[0]?.faultModeId).toBe(scenario.groundTruth.faultModeId);
      expect(result.hypotheses[0]?.subsystem).toBe(scenario.groundTruth.subsystem);
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
    const scenario = system.scenarios.find((s) => s.id === "SCADA-03-FS-07")!;
    const fa = diagnose(index, { observations: scenario.observations, locale: "fa" });
    const en = diagnose(index, { observations: scenario.observations, locale: "en" });
    expect(fa.hypotheses[0].label).not.toBe(en.hypotheses[0].label);
    expect(fa.hypotheses[0].label).toMatch(/[؀-ۿ]/);
    // Arabic yeh / kaf must never appear in authored Persian.
    expect(fa.hypotheses[0].label).not.toMatch(/[يك]/);
  });
});
