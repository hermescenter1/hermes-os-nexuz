// PHASE 101 — SCADA-01, the supervisory reference system.
//
// SCADA-01 is the first reference whose SUBJECT is the supervisory layer, and
// the first to carry the SCRIPT / ROLE / AUDIT_EVENT_TYPE slice. What has to be
// true of it is therefore more than "it seals":
//
//   - Its graph agrees with its own supervisory source and its own screen
//     definition, in both of those languages, not just in one of them.
//   - Its declarative server configuration is reported as SKIPPED rather than
//     quietly counted as clean, so the verdict over the system is PARTIAL and
//     says so.
//   - Its governance is complete where it should be and absent where it should
//     be: three operator-invoked scripts each demand a role, and the automatic
//     watchdog demands none while still emitting a record.
//   - Diagnosis never walks through any of that.

import { describe, it, expect } from "vitest";
import { CORPUS, corpusIndex, resolveSymbol, sourceAgreementReport } from "../corpus";
import { diagnose } from "../diagnostics";
import { governanceFor, neighbours, traverse } from "../graph";
import { unguardedCommands } from "../extractors/hmi";
import { isHumanInvokable, isReviewOnly } from "../types";
import type { ReferenceSystem } from "../types";

const system = CORPUS.find((s) => s.id === "SCADA-01") as ReferenceSystem;
const index = corpusIndex();

const nodeId = (kind: string, local: string) => `SCADA-01:${kind}:${local}`;

describe("PHASE 101 — SCADA-01 registration and provenance", () => {
  it("is registered in the corpus as a sealed supervisory reference", () => {
    expect(system).toBeDefined();
    expect(system.sourceType).toBe("SCADA_REFERENCE");
    expect(system.origin).toBe("SYNTHETIC_ORIGINAL");
    expect(system.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(system.scenarios.length).toBe(7);
    expect(system.artifacts.length).toBe(3);
  });

  it("carries the supervisory layer as its subject, not as an epilogue", () => {
    const count = (kind: string) => system.nodes.filter((n) => n.kind === kind).length;
    expect(count("SCADA_TAG")).toBeGreaterThanOrEqual(10);
    expect(count("HMI_SCREEN")).toBe(4);
    expect(count("SCRIPT")).toBe(4);
    expect(count("EVIDENCE_SOURCE")).toBeGreaterThanOrEqual(5);
  });

  it("stamps complete provenance and a content checksum onto every artefact", () => {
    for (const artifact of system.artifacts) {
      expect(artifact.id).toBe(`SCADA-01:SRC:${artifact.local}`);
      expect(artifact.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.lineCount).toBeGreaterThan(0);
      expect(artifact.content).not.toContain("\r");
      expect(artifact.provenance.projectId).toBe("SCADA-01");
      expect(artifact.provenance.checksum).toBe(system.checksum);
    }
  });

  it("keeps every safety-classified object review-only", () => {
    const safety = system.nodes.filter((n) => n.provenance.safetyClass !== "NON_SAFETY");
    expect(safety.length).toBeGreaterThan(0);
    for (const n of safety) expect(isReviewOnly(n.provenance.safetyClass)).toBe(true);
  });
});

describe("PHASE 101 — SCADA-01 agrees with its own source", () => {
  const report = sourceAgreementReport(system);

  it("checks both the supervisory script and the screen definition", () => {
    expect([...report.checked].sort()).toEqual(["OperatorScreens", "SupervisoryScripts"]);
  });

  it("reports the declarative server configuration as skipped, not as clean", () => {
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
      "OnPumpStartRequest",
      "OnManualPurgeRequest",
      "OnTelemetryWatchdog",
      "OnAlarmAcknowledge",
    ]) {
      expect(resolveSymbol(system, local)?.id).toBe(nodeId("SCRIPT", local));
    }
  });

  it("keeps the operator-command design guarded, and names its one deliberate exception", () => {
    // Reviewing the DESIGN, never fixing it. Both plant commands require a
    // permission AND a confirmation. Alarm acknowledgement requires a permission
    // and deliberately no confirmation: it records that a human saw the alarm
    // and clears no condition, so a dialogue in front of it would buy nothing
    // and would train operators to click through dialogues.
    const screens = system.artifacts.find((x) => x.local === "OperatorScreens");
    const findings = unguardedCommands(screens!.content);
    expect(findings).toEqual([
      {
        screen: "Screen_AlarmList",
        object: "Banner_ActiveAlarms",
        tag: "SYS_Alarm_Ack_Cmd",
        reason: "NO_CONFIRMATION",
      },
    ]);
  });
});

describe("PHASE 101 — SCADA-01 governance", () => {
  const SCRIPTS = {
    pumpStart: nodeId("SCRIPT", "OnPumpStartRequest"),
    purge: nodeId("SCRIPT", "OnManualPurgeRequest"),
    alarmAck: nodeId("SCRIPT", "OnAlarmAcknowledge"),
    watchdog: nodeId("SCRIPT", "OnTelemetryWatchdog"),
  };

  it("gives every operator-invoked script an explicit role", () => {
    for (const [scriptId, role] of [
      [SCRIPTS.pumpStart, "Role_PlantOperator"],
      [SCRIPTS.purge, "Role_ShiftSupervisor"],
      [SCRIPTS.alarmAck, "Role_PlantOperator"],
    ] as const) {
      const node = index.nodes.get(scriptId)!;
      expect(isHumanInvokable(node)).toBe(true);
      expect(governanceFor(index, scriptId).roles.map((r) => r.id)).toEqual([nodeId("ROLE", role)]);
    }
  });

  it("gives the automatic watchdog no role and still an audit record", () => {
    // The asymmetry is the point. There is no operator to authorise a scheduled
    // routine, but an audit trail is about what happened, not about who asked.
    const watchdog = index.nodes.get(SCRIPTS.watchdog)!;
    expect(isHumanInvokable(watchdog)).toBe(false);
    expect(watchdog.attributes.humanInvokable).toBeUndefined();

    const view = governanceFor(index, SCRIPTS.watchdog);
    expect(view.roles).toEqual([]);
    expect(view.auditEventTypes.map((e) => e.id)).toEqual([
      nodeId("AUDIT_EVENT_TYPE", "Audit_TelemetryWatchdogRecord"),
    ]);
  });

  it("keeps the governance layer out of every diagnostic walk", () => {
    const reached = traverse(index, [nodeId("ALARM", "ALM_TELEMETRY_STALE")], {
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
    const plain = neighbours(index, SCRIPTS.purge, { direction: "out" }).map((n) => n.node.kind);
    expect(plain).not.toContain("ROLE");
    expect(plain).not.toContain("AUDIT_EVENT_TYPE");
  });
});

describe("PHASE 101 — SCADA-01 diagnosis", () => {
  it("separates a broken picture from a broken plant", () => {
    // Every remote value froze at once and nothing in the field changed. The
    // answer must be the link, not the pump — this is the failure family that
    // only exists at the supervisory level.
    const scenario = system.scenarios.find((s) => s.id === "SCADA-01-FS-02")!;
    const result = diagnose(index, { observations: scenario.observations, locale: "en" });

    expect(result.hypotheses[0].faultModeId).toBe(nodeId("FAULT_MODE", "FM_TELEMETRY_LINK_LOSS"));
    expect(result.hypotheses[0].subsystem).toBe("NETWORK");
    expect(result.safeVerificationActions.map((x) => x.nodeId)).toContain(
      nodeId("SAFE_ACTION", "SA_VERIFY_TELEMETRY_GATEWAY_LINK"),
    );
  });

  it("names the evidence it was not given rather than assuming it", () => {
    const scenario = system.scenarios.find((s) => s.id === "SCADA-01-FS-03")!;
    const result = diagnose(index, { observations: scenario.observations, locale: "en" });
    const missing = result.missingEvidence.map((c) => c.nodeId);
    for (const expected of scenario.groundTruth.expectedMissingNodeIds) {
      expect(missing).toContain(expected);
    }
  });

  it("escalates the safety-related interlock and marks its action review-only", () => {
    const scenario = system.scenarios.find((s) => s.id === "SCADA-01-FS-04")!;
    const result = diagnose(index, { observations: scenario.observations, locale: "en" });

    expect(result.escalationConditions.length).toBeGreaterThan(0);
    const review = result.safeVerificationActions.find(
      (x) => x.nodeId === nodeId("SAFE_ACTION", "SA_ESCALATE_SURGE_PROTECTION_REVIEW"),
    );
    expect(review?.reviewOnly).toBe(true);
  });

  it("cites only corpus nodes, on every one of its scenarios", () => {
    for (const scenario of system.scenarios) {
      const result = diagnose(index, { observations: scenario.observations, locale: "en" });
      expect(result.unresolvedObservations).toEqual([]);
      for (const citation of result.citations) expect(index.nodes.has(citation)).toBe(true);
    }
  });

  it("answers in Persian when asked to, from authored text rather than transliteration", () => {
    const scenario = system.scenarios.find((s) => s.id === "SCADA-01-FS-01")!;
    const fa = diagnose(index, { observations: scenario.observations, locale: "fa" });
    const en = diagnose(index, { observations: scenario.observations, locale: "en" });
    expect(fa.hypotheses[0].label).not.toBe(en.hypotheses[0].label);
    expect(fa.hypotheses[0].label).toMatch(/[؀-ۿ]/);
    // Arabic yeh / kaf must never appear in authored Persian.
    expect(fa.hypotheses[0].label).not.toMatch(/[يك]/);
  });
});
