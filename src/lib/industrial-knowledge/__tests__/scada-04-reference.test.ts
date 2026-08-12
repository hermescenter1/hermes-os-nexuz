// PHASE 101 — SCADA-04, the power distribution and substation automation
// reference.
//
// SCADA-04 is the first reference whose subject is an electrical network, and
// the first that has to prove a SWITCHING SAFETY contract rather than only a
// process one. What has to be true of it, beyond "it seals":
//
//   - Nothing in the corpus can command, write toward or actuate a breaker, an
//     isolator, the bus coupler, a protection relay or a trip circuit. That is
//     asserted over every safety-classified node at once, not over a hand-
//     picked list, and the switching surface is separately proven to be inside
//     that set.
//   - A human command intent is engineering metadata: it carries a role, a
//     permission and a confirmation, and the script that writes it first
//     consults evidence a permissive or interlock also reads.
//   - The automatic watchdog writes exactly one supervisory flag, holds no
//     role, and touches no plant object.
//   - Losing both gateway paths is answered by the communication fault mode,
//     and no electrical hypothesis draws a single item of supporting evidence
//     from the frozen mirrors.
//   - The corpus contract is AT_LEAST_6_VALID_FAULT_SCENARIOS per reference
//     system; SCADA-04 carries EIGHT, and that actual count is pinned honestly.
//   - Registering it changes nothing about the five references that came
//     before: their content checksums and scenario counts are pinned here, so
//     an accidental edit to any of them fails this file.

import { describe, it, expect } from "vitest";
import { CORPUS, corpusIndex, resolveSymbol, sourceAgreementReport } from "../corpus";
import { diagnose } from "../diagnostics";
import { governanceFor, neighbours, traverse } from "../graph";
import { unguardedCommands } from "../extractors/hmi";
import { isHumanInvokable, isReviewOnly } from "../types";
import type { KnowledgeEdge, ReferenceSystem } from "../types";

const system = CORPUS.find((s) => s.id === "SCADA-04") as ReferenceSystem;
const index = corpusIndex();

const nodeId = (kind: string, local: string) => `SCADA-04:${kind}:${local}`;

/** Relations by which one object could ever drive another. */
const CONTROL_RELATIONS = ["COMMANDS", "WRITES", "ACTUATES"] as const;

describe("PHASE 101 — SCADA-04 registration and provenance", () => {
  it("is registered in the corpus as a sealed supervisory reference", () => {
    expect(system).toBeDefined();
    expect(system.sourceType).toBe("SCADA_REFERENCE");
    expect(system.origin).toBe("SYNTHETIC_ORIGINAL");
    expect(system.checksum).toMatch(/^[0-9a-f]{64}$/);
    // Contract: AT_LEAST_6_VALID_FAULT_SCENARIOS. The actual count is eight,
    // pinned honestly rather than rounded to the contract minimum.
    expect(system.scenarios.length).toBeGreaterThanOrEqual(6);
    expect(system.scenarios.length).toBe(8);
    expect(system.artifacts.length).toBe(3);
  });

  it("models the substation from incoming feeder to MCC incomer", () => {
    const count = (kind: string) => system.nodes.filter((n) => n.kind === kind).length;
    expect(count("SCADA_TAG")).toBeGreaterThanOrEqual(20);
    expect(count("HMI_SCREEN")).toBe(7);
    expect(count("SCRIPT")).toBe(4);
    expect(count("KPI")).toBe(5);
    expect(count("EVIDENCE_SOURCE")).toBe(7);
    expect(count("FAULT_MODE")).toBe(8);
    for (const local of [
      "HV_FEEDER_INCOMER_A",
      "HV_FEEDER_INCOMER_B",
      "POWER_TRANSFORMER_T1",
      "MV_BUSBAR_A",
      "MV_BUSBAR_B",
      "MV_BUS_COUPLER",
      "CB_INCOMER_A",
      "CB_FEEDER_F3",
      "ISOLATOR_INCOMER_A",
      "OUTGOING_FEEDER_F3",
      "MCC_INCOMER_M1",
      "CAPACITOR_BANK",
      "STATION_DC_SYSTEM",
      "STATION_UPS",
    ]) {
      expect(index.nodes.get(nodeId("EQUIPMENT", local))?.kind).toBe("EQUIPMENT");
    }
  });

  it("declares redundancy twice: the server pair and the station gateway pair", () => {
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
          e.source === nodeId("DEVICE", "STATION_GATEWAY_B") &&
          e.target === nodeId("DEVICE", "STATION_GATEWAY_A"),
      ),
    ).toBe(true);
    // …and every supervisory measurement mirrors a bay-side tag rather than
    // standing on its own, which is what makes a frozen picture detectable.
    const mirroredSupervisory = mirrors.filter((e) =>
      e.source.startsWith("SCADA-04:SCADA_TAG:"),
    );
    expect(mirroredSupervisory.length).toBeGreaterThanOrEqual(15);
    for (const edge of mirroredSupervisory) {
      expect(edge.target.startsWith("SCADA-04:TAG:")).toBe(true);
    }
  });

  it("derives every KPI from named station tags", () => {
    const kpis = system.nodes.filter((n) => n.kind === "KPI");
    expect(kpis.length).toBe(5);
    for (const kpi of kpis) {
      const derived = system.edges.filter(
        (e) => e.relation === "DERIVED_FROM" && e.source === kpi.id,
      );
      expect(derived.length).toBeGreaterThan(0);
      for (const edge of derived) {
        expect(index.nodes.get(edge.target)?.kind).toBe("TAG");
      }
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

  it("stamps complete provenance and a content checksum onto every node and artefact", () => {
    for (const node of system.nodes) {
      expect(node.provenance.projectId).toBe("SCADA-04");
      expect(node.provenance.checksum).toBe(system.checksum);
      expect(node.provenance.sourceId.length).toBeGreaterThan(0);
      expect(node.provenance.subsystem.length).toBeGreaterThan(0);
    }
    for (const artifact of system.artifacts) {
      expect(artifact.id).toBe(`SCADA-04:SRC:${artifact.local}`);
      expect(artifact.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.lineCount).toBeGreaterThan(0);
      expect(artifact.content).not.toContain("\r");
      expect(artifact.provenance.projectId).toBe("SCADA-04");
      expect(artifact.provenance.checksum).toBe(system.checksum);
    }
  });
});

describe("PHASE 101 — SCADA-04 electrical safety invariants", () => {
  /** The switching and protection surface, named explicitly. */
  const SWITCHING_SURFACE = [
    ["DEVICE", "PROT_RELAY_INCOMER_A"],
    ["DEVICE", "PROT_RELAY_TRANSFORMER_T1"],
    ["DEVICE", "PROT_RELAY_FEEDER_F3"],
    ["EQUIPMENT", "MV_BUS_COUPLER"],
    ["EQUIPMENT", "CB_INCOMER_A"],
    ["EQUIPMENT", "CB_INCOMER_B"],
    ["EQUIPMENT", "CB_BUS_COUPLER"],
    ["EQUIPMENT", "CB_FEEDER_F3"],
    ["EQUIPMENT", "ISOLATOR_INCOMER_A"],
    ["TAG", "CB_INCOMER_A_CLOSED"],
    ["TAG", "CB_INCOMER_A_OPEN"],
    ["TAG", "CB_COUPLER_CLOSED"],
    ["TAG", "CB_FEEDER_F3_CLOSED"],
    ["TAG", "ISOLATOR_A_CLOSED"],
    ["TAG", "TRIP_CIRCUIT_HEALTHY"],
    ["TAG", "F3_OVERCURRENT_TRIP"],
    ["TAG", "F3_EARTH_FAULT_TRIP"],
    ["TAG", "T1_DIFF_PROTECTION_TRIP"],
    ["INTERLOCK", "ILK_BUS_COUPLER"],
    ["INTERLOCK", "ILK_FEEDER_PROTECTION"],
    ["INTERLOCK", "ILK_TRANSFORMER_PROTECTION"],
  ] as const;

  it("classifies the whole switching and protection surface as safety-related", () => {
    for (const [kind, local] of SWITCHING_SURFACE) {
      const node = index.nodes.get(nodeId(kind, local));
      expect(node, `${kind}:${local} must exist`).toBeDefined();
      expect(node!.provenance.safetyClass).not.toBe("NON_SAFETY");
      expect(isReviewOnly(node!.provenance.safetyClass)).toBe(true);
    }
  });

  it("carries no command, write or actuation path onto ANY safety-classified object", () => {
    // Derived over the whole system rather than over a list, so a future edit
    // cannot add a switching path to an object the list happened to miss.
    const safety = new Set(
      system.nodes.filter((n) => n.provenance.safetyClass !== "NON_SAFETY").map((n) => n.id),
    );
    expect(safety.size).toBeGreaterThan(0);
    const offending = system.edges.filter(
      (e: KnowledgeEdge) =>
        (CONTROL_RELATIONS as readonly string[]).includes(e.relation) &&
        (safety.has(e.source) || safety.has(e.target)),
    );
    expect(offending).toEqual([]);
  });

  it("actuates nothing at all: this reference drives no plant object", () => {
    expect(system.edges.filter((e) => e.relation === "ACTUATES")).toEqual([]);
  });

  it("keeps protection relays and trip paths as read-only diagnostic evidence", () => {
    for (const local of [
      "F3_OVERCURRENT_TRIP",
      "F3_EARTH_FAULT_TRIP",
      "T1_DIFF_PROTECTION_TRIP",
      "T1_BUCHHOLZ_ALARM",
      "TRIP_CIRCUIT_HEALTHY",
      "PROTECTION_RELAY_HEALTHY",
    ]) {
      const id = nodeId("TAG", local);
      const node = index.nodes.get(id)!;
      expect(node.attributes.accessMode).toBe("READ");
      expect(
        system.edges.some(
          (e) => (CONTROL_RELATIONS as readonly string[]).includes(e.relation) && e.target === id,
        ),
      ).toBe(false);
    }
    // …and the protection signals are wired into the corpus as evidence, so
    // they inform a diagnosis instead of merely existing.
    const evidenceEdges = system.edges.filter(
      (e) => e.relation === "EVIDENCE_FOR" && e.source === nodeId("TAG", "F3_EARTH_FAULT_TRIP"),
    );
    expect(evidenceEdges.length).toBeGreaterThan(0);
  });

  it("lets the automatic script write exactly one supervisory flag and nothing else", () => {
    const watchdog = nodeId("SCRIPT", "OnStationWatchdog");
    expect(isHumanInvokable(index.nodes.get(watchdog)!)).toBe(false);
    const writes = system.edges.filter(
      (e) => (CONTROL_RELATIONS as readonly string[]).includes(e.relation) && e.source === watchdog,
    );
    expect(writes.map((e) => `${e.relation}|${e.target}`)).toEqual([
      `WRITES|${nodeId("SCADA_TAG", "PDS_Telemetry_Stale")}`,
    ]);
  });

  it("gives no automatic script a role, and every human-invokable one exactly one", () => {
    const scripts = system.nodes.filter((n) => n.kind === "SCRIPT");
    expect(scripts.length).toBe(4);
    for (const script of scripts) {
      const roles = governanceFor(index, script.id).roles;
      if (isHumanInvokable(script)) {
        expect(roles.length, `${script.id} must demand exactly one role`).toBe(1);
      } else {
        expect(roles, `${script.id} is automatic and must demand no role`).toEqual([]);
      }
      // Every script leaves a record, human-invoked or not.
      expect(governanceFor(index, script.id).auditEventTypes.length).toBe(1);
    }
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

  it("backs each switching intent with evidence a permissive or interlock also reads", () => {
    // The chain proven here is structural, hop by hop:
    //   script --READS--> SCADA_TAG --MIRRORS--> TAG <--READS-- PERMISSIVE/INTERLOCK
    // An intent offered without consulting the same evidence the station's own
    // gating logic consults would be an intent formed in the dark.
    const gatingReaders = new Set(
      system.edges
        .filter((e) => e.relation === "READS")
        .filter((e) => {
          const source = index.nodes.get(e.source);
          return source?.kind === "PERMISSIVE" || source?.kind === "INTERLOCK";
        })
        .map((e) => e.target),
    );

    for (const local of ["OnBusCouplerCloseIntent", "OnCapacitorBankStepIntent"]) {
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

  it("distinguishes indication, command intent, permissive, interlock and protection trip", () => {
    const indication = index.nodes.get(nodeId("SCADA_TAG", "PDS_CB_Incomer_A_Closed"))!;
    const intent = index.nodes.get(nodeId("SCADA_TAG", "PDS_Bus_Coupler_Close_Intent"))!;
    const permissive = index.nodes.get(nodeId("PERMISSIVE", "PRM_SYNCHRONISM_OK"))!;
    const interlock = index.nodes.get(nodeId("INTERLOCK", "ILK_BUS_COUPLER"))!;
    const trip = index.nodes.get(nodeId("TAG", "F3_EARTH_FAULT_TRIP"))!;

    // An indication is read-only and mirrors a bay tag.
    expect(indication.attributes.accessMode).toBe("READ");
    expect(
      system.edges.some((e) => e.relation === "MIRRORS" && e.source === indication.id),
    ).toBe(true);

    // A command intent is write-mode, guarded, and wired to no plant object:
    // it mirrors nothing, is bound to nothing and actuates nothing.
    expect(intent.attributes.accessMode).toBe("WRITE");
    expect(intent.attributes.requiredPermission).toBe("COUPLER_SWITCHING");
    expect(intent.attributes.requiresConfirmation).toBe(true);
    expect(
      system.edges.filter(
        (e) =>
          ["MIRRORS", "BOUND_TO", "ACTUATES", "MONITORS"].includes(e.relation) &&
          (e.source === intent.id || e.target === intent.id),
      ),
    ).toEqual([]);

    // A permissive gates; an interlock blocks. Neither is the other.
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

    // A protection trip is read-only evidence and is never gating logic.
    expect(trip.attributes.accessMode).toBe("READ");
    expect(trip.kind).toBe("TAG");
    expect(
      system.edges.some((e) => e.relation === "EVIDENCE_FOR" && e.source === trip.id),
    ).toBe(true);
  });

  it("keeps every HV/MV safe action review-only", () => {
    for (const local of [
      "SA_REVIEW_VT_CIRCUIT_AND_FUSE_SUPERVISION",
      "SA_REVIEW_TRANSFORMER_COOLING_AND_TREND",
      "SA_REVIEW_SOE_AND_INSPECT_BREAKER_MECHANISM",
      "SA_ESCALATE_BUS_COUPLER_INTERLOCK_REVIEW",
      "SA_ESCALATE_FEEDER_PROTECTION_REVIEW",
      "SA_INSPECT_STATION_DC_CHARGER_AND_BATTERY",
    ]) {
      const node = index.nodes.get(nodeId("SAFE_ACTION", local))!;
      expect(isReviewOnly(node.provenance.safetyClass), `${local} must be review-only`).toBe(true);
    }
  });
});

describe("PHASE 101 — SCADA-04 agrees with its own source", () => {
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
      "OnBusCouplerCloseIntent",
      "OnCapacitorBankStepIntent",
      "OnStationWatchdog",
      "OnAlarmAcknowledge",
    ]) {
      expect(resolveSymbol(system, local)?.id).toBe(nodeId("SCRIPT", local));
    }
  });

  it("leaves no unguarded command anywhere in the screen definition", () => {
    // Stricter than SCADA-01..03 on purpose, and stated rather than silent:
    // this banner carries protection-trip alarms, so acknowledgement is
    // confirmed here too and the design review finds nothing at all.
    const screens = system.artifacts.find((x) => x.local === "OperatorScreens");
    expect(unguardedCommands(screens!.content)).toEqual([]);
  });

  it("declares the station bus without claiming a vendor tool compiled anything", () => {
    const config = system.artifacts.find((x) => x.local === "SupervisoryConfiguration")!;
    const parsed = JSON.parse(config.content) as {
      stationBus: { standard: string; services: string[]; note: string };
      northbound: { standard: string; direction: string; commands: string };
      switchingPolicy: { mode: string; supervisoryExecution: string };
    };
    expect(parsed.stationBus.standard).toBe("IEC 61850");
    expect(parsed.stationBus.services).toEqual(["MMS", "GOOSE"]);
    expect(parsed.stationBus.note).toContain("No SCL, ICD or CID file was produced");
    expect(parsed.northbound.standard).toBe("IEC 60870-5-104");
    expect(parsed.northbound.direction).toBe("MONITORING_ONLY");
    expect(parsed.northbound.commands).toBe("NONE");
    expect(parsed.switchingPolicy.mode).toBe("ADVISORY_ONLY");
    expect(parsed.switchingPolicy.supervisoryExecution).toBe("NONE");
  });

  it("keeps the breaker faceplate display-only in its own source", () => {
    const screens = system.artifacts.find((x) => x.local === "OperatorScreens")!;
    const definition = JSON.parse(screens.content) as {
      screens: Array<{ name: string; objects?: Array<{ name: string; commands?: string[] }> }>;
    };
    const incomers = definition.screens.find((s) => s.name === "Screen_Incomers")!;
    for (const object of incomers.objects ?? []) {
      expect(object.commands ?? []).toEqual([]);
    }
  });
});

describe("PHASE 101 — SCADA-04 governance", () => {
  const SCRIPTS = {
    coupler: nodeId("SCRIPT", "OnBusCouplerCloseIntent"),
    capBank: nodeId("SCRIPT", "OnCapacitorBankStepIntent"),
    alarmAck: nodeId("SCRIPT", "OnAlarmAcknowledge"),
    watchdog: nodeId("SCRIPT", "OnStationWatchdog"),
  };

  it("gives every operator-invoked script an explicit role", () => {
    for (const [scriptId, role] of [
      [SCRIPTS.coupler, "Role_StationSupervisor"],
      [SCRIPTS.capBank, "Role_StationOperator"],
      [SCRIPTS.alarmAck, "Role_StationOperator"],
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
      nodeId("AUDIT_EVENT_TYPE", "Audit_StationWatchdogRecord"),
    ]);
  });

  it("keeps the governance layer out of every diagnostic walk", () => {
    for (const origin of [
      nodeId("ALARM", "ALM_STATION_COMMS_STALE"),
      nodeId("ALARM", "ALM_CB_POSITION_DISCREPANCY"),
      nodeId("ALARM", "ALM_COUPLER_INTERLOCK_BLOCKED"),
    ]) {
      const reached = traverse(index, [origin], { direction: "both", maxDepth: 6 });
      const kinds = new Set(reached.map((r) => r.node.kind));
      expect(kinds.has("ROLE")).toBe(false);
      expect(kinds.has("AUDIT_EVENT_TYPE")).toBe(false);
    }
    // …while the supervisory script that writes the stale flag stays visible.
    const fromStale = traverse(index, [nodeId("ALARM", "ALM_STATION_COMMS_STALE")], {
      direction: "both",
      maxDepth: 6,
    });
    expect(fromStale.map((r) => r.node.id)).toContain(SCRIPTS.watchdog);
  });

  it("shows a role only to a caller that asks for the governance view", () => {
    const plain = neighbours(index, SCRIPTS.coupler, { direction: "out" }).map((n) => n.node.kind);
    expect(plain).not.toContain("ROLE");
    expect(plain).not.toContain("AUDIT_EVENT_TYPE");
  });
});

describe("PHASE 101 — SCADA-04 diagnosis", () => {
  it("blames the measurement, not the busbar, when only the picture collapsed", () => {
    const scenario = system.scenarios.find((s) => s.id === "SCADA-04-FS-01")!;
    const result = diagnose(index, { observations: scenario.observations, locale: "en" });

    expect(result.hypotheses[0].faultModeId).toBe(nodeId("FAULT_MODE", "FM_VT_CIRCUIT_FAILURE"));
    expect(result.hypotheses[0].subsystem).toBe("FIELD_DEVICE");
    expect(result.safeVerificationActions.map((x) => x.nodeId)).toContain(
      nodeId("SAFE_ACTION", "SA_REVIEW_VT_CIRCUIT_AND_FUSE_SUPERVISION"),
    );
  });

  it("never reads a frozen picture as a healthy electrical state", () => {
    // Both gateway paths are gone and the supervisory mirrors are stale. The
    // answer must be the communication fault — and, more strongly, no other
    // hypothesis may draw a single item of SUPPORTING evidence from the frozen
    // picture. Silence is not agreement.
    const scenario = system.scenarios.find((s) => s.id === "SCADA-04-FS-04")!;
    const result = diagnose(index, { observations: scenario.observations, locale: "en" });

    const commsId = nodeId("FAULT_MODE", "FM_STATION_COMMS_LOSS");
    expect(result.hypotheses[0].faultModeId).toBe(commsId);
    expect(result.hypotheses[0].subsystem).toBe("TELEMETRY");
    for (const hypothesis of result.hypotheses.filter((h) => h.faultModeId !== commsId)) {
      expect(
        hypothesis.supporting,
        `${hypothesis.faultModeId} must draw no support from a stale picture`,
      ).toEqual([]);
      expect(hypothesis.confidence).toBe(0);
    }
    // The engine also states what it was not given rather than assuming it.
    expect(result.missingEvidence.map((c) => c.nodeId)).toContain(
      nodeId("EVIDENCE_SOURCE", "HIST_COMMS_LINK_LOG"),
    );
    expect(result.confidence).toBeLessThan(1);
  });

  it("names the evidence it was not given rather than assuming it", () => {
    const scenario = system.scenarios.find((s) => s.id === "SCADA-04-FS-03")!;
    const result = diagnose(index, { observations: scenario.observations, locale: "en" });
    const missing = result.missingEvidence.map((c) => c.nodeId);
    for (const expected of scenario.groundTruth.expectedMissingNodeIds) {
      expect(missing).toContain(expected);
    }
  });

  it("escalates the interlock and protection scenarios and keeps their actions review-only", () => {
    for (const [scenarioId, actionLocal] of [
      ["SCADA-04-FS-03", "SA_REVIEW_SOE_AND_INSPECT_BREAKER_MECHANISM"],
      ["SCADA-04-FS-05", "SA_ESCALATE_BUS_COUPLER_INTERLOCK_REVIEW"],
      ["SCADA-04-FS-06", "SA_ESCALATE_FEEDER_PROTECTION_REVIEW"],
      ["SCADA-04-FS-07", "SA_INSPECT_STATION_DC_CHARGER_AND_BATTERY"],
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

  it("recommends only safe actions, and never an action on the switching surface", () => {
    for (const scenario of system.scenarios) {
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      for (const action of result.safeVerificationActions) {
        const node = index.nodes.get(action.nodeId)!;
        expect(node.kind).toBe("SAFE_ACTION");
        if (isReviewOnly(node.provenance.safetyClass)) expect(action.reviewOnly).toBe(true);
      }
    }
  });

  it("ranks the true root cause first on every one of its eight scenarios", () => {
    for (const scenario of system.scenarios) {
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(result.hypotheses[0]?.faultModeId, scenario.id).toBe(scenario.groundTruth.faultModeId);
      expect(result.hypotheses[0]?.subsystem, scenario.id).toBe(scenario.groundTruth.subsystem);
      expect(result.hypotheses[0]?.faultClass, scenario.id).toBe(scenario.groundTruth.faultClass);
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
    const scenario = system.scenarios.find((s) => s.id === "SCADA-04-FS-05")!;
    const fa = diagnose(index, { observations: scenario.observations, locale: "fa" });
    const en = diagnose(index, { observations: scenario.observations, locale: "en" });
    expect(fa.hypotheses[0].label).not.toBe(en.hypotheses[0].label);
    expect(fa.hypotheses[0].label).toMatch(/[؀-ۿ]/);
    // Arabic yeh / kaf must never appear in authored Persian.
    expect(fa.hypotheses[0].label).not.toMatch(/[يك]/);
  });
});

describe("PHASE 101 — registering SCADA-04 changes nothing that came before", () => {
  it("keeps every earlier reference system byte-identical to its pinned digest", () => {
    // The owner froze TIA-01, TIA-02, SCADA-01, SCADA-02 and SCADA-03. A
    // content checksum is the mechanical form of that instruction: any edit to
    // one of those systems — a label, an edge, a scenario — moves its digest
    // and fails here, which is exactly the alarm that should ring.
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
    };

    // Selected by the pinned ids themselves rather than by "everything except
    // SCADA-04", so registering a later reference cannot make this test look
    // like a failure of the five it actually froze.
    const frozenIds = Object.keys(FROZEN);
    const selected = CORPUS.filter((s) => frozenIds.includes(s.id));
    expect(selected.map((s) => s.id).sort()).toEqual([...frozenIds].sort());

    const actual = Object.fromEntries(
      selected.map((s) => [s.id, { checksum: s.checksum, scenarios: s.scenarios.length }]),
    );
    expect(actual).toEqual(FROZEN);
  });

  it("satisfies the AT_LEAST_6 scenario contract on every registered system", () => {
    // Exact, not "at least": the corpus size is a fact worth pinning, and a
    // system appearing or disappearing should fail a test rather than pass one.
    expect(CORPUS.length).toBe(10);
    for (const s of CORPUS) {
      expect(s.scenarios.length, `${s.id} must carry at least six scenarios`).toBeGreaterThanOrEqual(
        6,
      );
    }
  });
});
