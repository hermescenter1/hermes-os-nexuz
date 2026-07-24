import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ImportEnvelopeSchema, type ImportEnvelope } from "../import-envelope";
import {
  analyzeEnvelope,
  summarizeFindings,
  RULE_IDS,
  RULE_VERSION,
  type AnalysisContext,
  type Finding,
} from "../analysis-rules";

/**
 * PHASE 94 — deterministic analysis rules.
 *
 * Each rule gets a fixture that triggers it and, where the distinction matters,
 * a near-miss fixture that must NOT trigger it. Findings are advisory: the last
 * block proves the engine cannot emit anything that reads as a device command.
 */

const BASE = {
  schemaVersion: "1.0" as const,
  sourceType: "GENERIC" as const,
  project: { name: "Test Line", revision: 2, vendor: "Siemens", platform: "TIA Portal" },
  devices: [] as unknown[],
  tags: [] as unknown[],
  alarms: [] as unknown[],
  networkNodes: [] as unknown[],
};

function env(patch: Record<string, unknown>): ImportEnvelope {
  const r = ImportEnvelopeSchema.safeParse({ ...BASE, ...patch });
  if (!r.success) throw new Error(`bad fixture: ${JSON.stringify(r.error.issues[0])}`);
  return r.data;
}

const CTX: AnalysisContext = { readOnlyProfile: true };

const ids = (f: Finding[]) => f.map((x) => x.ruleId);
const run = (patch: Record<string, unknown>, ctx: AnalysisContext = CTX) => analyzeEnvelope(env(patch), ctx);

/** A complete, clean device so device rules don't fire incidentally. */
const OK_DEVICE = {
  engineeringId: "PLC_1", name: "CPU", category: "PLC",
  model: "6ES7", firmwareVersion: "V2.9", networkZone: "CONTROL", safetyClass: "NON_SAFETY",
};

describe("94 — every rule id is reachable and stable", () => {
  it("declares 20 unique rule ids at a single version", () => {
    expect(new Set(RULE_IDS).size).toBe(RULE_IDS.length);
    expect(RULE_IDS.length).toBe(20);
    expect(RULE_VERSION).toMatch(/^\d+\.\d+$/);
  });

  it("every emitted finding carries a declared rule id and the current version", () => {
    const findings = run({
      devices: [{ engineeringId: "D1", name: "d", category: "PLC", safetyClass: "SAFETY_CRITICAL" }],
      tags: [
        { name: "A", dataType: "WEIRD", address: "X1", accessMode: "WRITE", safetyClass: "SAFETY_RELATED" },
        { name: "A", dataType: "REAL", address: "X1" },
      ],
      alarms: [{ code: "C1", severity: "CRITICAL" }, { code: "C1", severity: "LOW" }],
      networkNodes: [{ nodeName: "N1", address: "10.0.0.1" }, { nodeName: "N2", address: "10.0.0.1" }],
    });
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(RULE_IDS as readonly string[]).toContain(f.ruleId);
      expect(f.ruleVersion).toBe(RULE_VERSION);
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.recommendation.length).toBeGreaterThan(0);
      expect(Array.isArray(f.evidenceRefs)).toBe(true);
    }
  });
});

describe("94 — tag rules", () => {
  it("OT-TAG-DUPLICATE-NAME fires on separator/case variants of one identity", () => {
    const f = run({ tags: [{ name: "Motor Run", dataType: "BOOL" }, { name: "motor_run", dataType: "BOOL" }] });
    expect(ids(f)).toContain("OT-TAG-DUPLICATE-NAME");
    expect(f.find((x) => x.ruleId === "OT-TAG-DUPLICATE-NAME")!.artifactRef).toBe("MOTOR_RUN");
  });

  it("OT-TAG-DUPLICATE-NAME does not fire on distinct names", () => {
    expect(ids(run({ tags: [{ name: "A", dataType: "BOOL" }, { name: "B", dataType: "BOOL" }] })))
      .not.toContain("OT-TAG-DUPLICATE-NAME");
  });

  it("OT-TAG-DUPLICATE-ADDRESS escalates to CRITICAL when a safety tag is involved", () => {
    const plain = run({ tags: [
      { name: "A", dataType: "BOOL", address: "DB1.DBX0.0" },
      { name: "B", dataType: "BOOL", address: "DB1.DBX0.0" },
    ] }).find((x) => x.ruleId === "OT-TAG-DUPLICATE-ADDRESS")!;
    expect(plain.severity).toBe("HIGH");

    const safety = run({ tags: [
      { name: "A", dataType: "BOOL", address: "DB1.DBX0.0", safetyClass: "SAFETY_CRITICAL" },
      { name: "B", dataType: "BOOL", address: "DB1.DBX0.0" },
    ] }).find((x) => x.ruleId === "OT-TAG-DUPLICATE-ADDRESS")!;
    expect(safety.severity).toBe("CRITICAL");
  });

  it("address duplicates ignore tags with no address at all", () => {
    expect(ids(run({ tags: [{ name: "A", dataType: "BOOL" }, { name: "B", dataType: "BOOL" }] })))
      .not.toContain("OT-TAG-DUPLICATE-ADDRESS");
  });

  it("OT-TAG-MISSING-DESCRIPTION fires only for safety or writable tags", () => {
    expect(ids(run({ tags: [{ name: "S", dataType: "BOOL", safetyClass: "SAFETY_RELATED" }] })))
      .toContain("OT-TAG-MISSING-DESCRIPTION");
    // a plain read tag without a description is not "engineering-critical"
    expect(ids(run({ tags: [{ name: "P", dataType: "BOOL", accessMode: "READ" }] })))
      .not.toContain("OT-TAG-MISSING-DESCRIPTION");
  });

  it("OT-TAG-MISSING-UNIT fires for analogue types only", () => {
    expect(ids(run({ tags: [{ name: "A", dataType: "REAL" }] }))).toContain("OT-TAG-MISSING-UNIT");
    expect(ids(run({ tags: [{ name: "A", dataType: "REAL", unit: "bar" }] }))).not.toContain("OT-TAG-MISSING-UNIT");
    expect(ids(run({ tags: [{ name: "B", dataType: "BOOL" }] }))).not.toContain("OT-TAG-MISSING-UNIT");
  });

  it("OT-TAG-INVALID-TYPE flags an unknown type but still imports the tag", () => {
    const f = run({ tags: [{ name: "A", dataType: "FLOAT64" }] });
    expect(ids(f)).toContain("OT-TAG-INVALID-TYPE");
    expect(ids(run({ tags: [{ name: "A", dataType: "real" }] }))).not.toContain("OT-TAG-INVALID-TYPE");
  });

  it("OT-TAG-WRITABLE-IN-READONLY fires only under a read-only profile", () => {
    const tags = [{ name: "W", dataType: "BOOL", accessMode: "READ_WRITE" }];
    expect(ids(run({ tags }, { readOnlyProfile: true }))).toContain("OT-TAG-WRITABLE-IN-READONLY");
    expect(ids(run({ tags }, { readOnlyProfile: false }))).not.toContain("OT-TAG-WRITABLE-IN-READONLY");
  });

  it("OT-NAME-MALFORMED fires on unsupported characters and over-length names", () => {
    expect(ids(run({ tags: [{ name: "Bad\u0000Name", dataType: "BOOL" }] }))).toContain("OT-NAME-MALFORMED");
    expect(ids(run({ tags: [{ name: "x".repeat(129), dataType: "BOOL" }] }))).toContain("OT-NAME-MALFORMED");
    expect(ids(run({ tags: [{ name: "Line3/Filler.Motor_Run-1", dataType: "BOOL" }] })))
      .not.toContain("OT-NAME-MALFORMED");
  });
});

describe("94 — alarm rules", () => {
  it("OT-ALARM-DUPLICATE-CODE fires on repeated codes", () => {
    // case and separator folding: "A1"/"a1" are one identity, "A-1" is not
    expect(ids(run({ alarms: [{ code: "A1" }, { code: "a1" }] }))).toContain("OT-ALARM-DUPLICATE-CODE");
    expect(ids(run({ alarms: [{ code: "A1" }, { code: "A-1" }] }))).not.toContain("OT-ALARM-DUPLICATE-CODE");
  });

  it("OT-ALARM-NO-CONDITION fires when the trigger cannot be traced", () => {
    expect(ids(run({ alarms: [{ code: "A1" }] }))).toContain("OT-ALARM-NO-CONDITION");
    expect(ids(run({ alarms: [{ code: "A1", conditionReference: "DB1.DBX0.0" }] })))
      .not.toContain("OT-ALARM-NO-CONDITION");
  });

  it("OT-ALARM-CRITICAL-NO-MESSAGE fires for HIGH and CRITICAL only", () => {
    expect(ids(run({ alarms: [{ code: "A1", severity: "CRITICAL" }] }))).toContain("OT-ALARM-CRITICAL-NO-MESSAGE");
    expect(ids(run({ alarms: [{ code: "A2", severity: "HIGH", message: "Pump overload tripped" }] })))
      .not.toContain("OT-ALARM-CRITICAL-NO-MESSAGE");
    // a stub message is still no message
    expect(ids(run({ alarms: [{ code: "A4", severity: "HIGH", message: "ok" }] })))
      .toContain("OT-ALARM-CRITICAL-NO-MESSAGE");
    expect(ids(run({ alarms: [{ code: "A3", severity: "LOW" }] }))).not.toContain("OT-ALARM-CRITICAL-NO-MESSAGE");
  });
});

describe("94 — device rules", () => {
  it("OT-DEVICE-UNREFERENCED fires when nothing points at the device", () => {
    expect(ids(run({ devices: [OK_DEVICE] }))).toContain("OT-DEVICE-UNREFERENCED");
    expect(ids(run({ devices: [OK_DEVICE], tags: [{ name: "T", dataType: "BOOL", deviceRef: "PLC_1" }] })))
      .not.toContain("OT-DEVICE-UNREFERENCED");
  });

  it("OT-DEVICE-MISSING-METADATA fires when model or firmware is absent", () => {
    expect(ids(run({ devices: [{ engineeringId: "D", name: "d", category: "PLC" }] })))
      .toContain("OT-DEVICE-MISSING-METADATA");
    expect(ids(run({ devices: [OK_DEVICE] }))).not.toContain("OT-DEVICE-MISSING-METADATA");
  });

  it("OT-DEVICE-UNLINKED-ASSET fires only when link context is supplied", () => {
    expect(ids(run({ devices: [OK_DEVICE] }, { readOnlyProfile: true })))
      .not.toContain("OT-DEVICE-UNLINKED-ASSET");
    expect(ids(run({ devices: [OK_DEVICE] }, { readOnlyProfile: true, linkedDeviceRefs: new Set() })))
      .toContain("OT-DEVICE-UNLINKED-ASSET");
    expect(ids(run({ devices: [OK_DEVICE] }, { readOnlyProfile: true, linkedDeviceRefs: new Set(["PLC_1"]) })))
      .not.toContain("OT-DEVICE-UNLINKED-ASSET");
  });

  it("OT-SAFETY-REVIEW-REQUIRED always demands human approval", () => {
    const f = run({ devices: [{ ...OK_DEVICE, safetyClass: "SAFETY_CRITICAL" }] })
      .find((x) => x.ruleId === "OT-SAFETY-REVIEW-REQUIRED")!;
    expect(f.humanApprovalRequired).toBe(true);
    expect(f.severity).toBe("HIGH");
    expect(ids(run({ devices: [OK_DEVICE] }))).not.toContain("OT-SAFETY-REVIEW-REQUIRED");
  });
});

describe("94 — network rules", () => {
  it("OT-NET-DUPLICATE-ADDRESS is CRITICAL", () => {
    const f = run({ networkNodes: [
      { nodeName: "N1", address: "192.168.1.5" },
      { nodeName: "N2", address: "192.168.1.5" },
    ] }).find((x) => x.ruleId === "OT-NET-DUPLICATE-ADDRESS")!;
    expect(f.severity).toBe("CRITICAL");
    expect(f.humanApprovalRequired).toBe(true);
  });

  it("OT-NET-ZONE-CONFLICT fires when node and device zones disagree", () => {
    const patch = {
      devices: [{ ...OK_DEVICE, networkZone: "CONTROL" }],
      networkNodes: [{ nodeName: "N1", deviceRef: "PLC_1", zone: "ENTERPRISE" }],
    };
    expect(ids(run(patch))).toContain("OT-NET-ZONE-CONFLICT");
    expect(ids(run({ ...patch, networkNodes: [{ nodeName: "N1", deviceRef: "PLC_1", zone: "CONTROL" }] })))
      .not.toContain("OT-NET-ZONE-CONFLICT");
  });

  it("an UNKNOWN zone on either side is not treated as a conflict", () => {
    expect(ids(run({
      devices: [{ ...OK_DEVICE, networkZone: "UNKNOWN" }],
      networkNodes: [{ nodeName: "N1", deviceRef: "PLC_1", zone: "CONTROL" }],
    }))).not.toContain("OT-NET-ZONE-CONFLICT");
  });
});

describe("94 — project rules", () => {
  it("OT-PROJECT-NO-REVISION fires when the export omits a revision", () => {
    expect(ids(run({ project: { name: "P" } }))).toContain("OT-PROJECT-NO-REVISION");
  });

  it("OT-PROJECT-STALE-REVISION fires only for an older revision", () => {
    expect(ids(run({ project: { name: "P", revision: 2 } }, { readOnlyProfile: true, latestKnownRevision: 5 })))
      .toContain("OT-PROJECT-STALE-REVISION");
    expect(ids(run({ project: { name: "P", revision: 7 } }, { readOnlyProfile: true, latestKnownRevision: 5 })))
      .not.toContain("OT-PROJECT-STALE-REVISION");
  });

  it("OT-PROJECT-DUPLICATE-CHECKSUM is informational", () => {
    const f = run({}, { readOnlyProfile: true, checksumAlreadySeen: true })
      .find((x) => x.ruleId === "OT-PROJECT-DUPLICATE-CHECKSUM")!;
    expect(f.severity).toBe("INFO");
    expect(f.humanApprovalRequired).toBe(false);
  });

  it("OT-PROJECT-UNSUPPORTED-PLATFORM tolerates a known pairing", () => {
    expect(ids(run({ project: { name: "P", revision: 1, vendor: "Siemens", platform: "TIA Portal V17" } })))
      .not.toContain("OT-PROJECT-UNSUPPORTED-PLATFORM");
    expect(ids(run({ project: { name: "P", revision: 1, vendor: "AcmeCorp", platform: "MysteryStudio" } })))
      .toContain("OT-PROJECT-UNSUPPORTED-PLATFORM");
  });
});

describe("94 — determinism and idempotency", () => {
  const BIG = {
    devices: [OK_DEVICE, { engineeringId: "HMI_1", name: "hmi", category: "HMI", safetyClass: "SAFETY_RELATED" }],
    tags: [
      { name: "A", dataType: "REAL", address: "DB1.DBD0" },
      { name: "a", dataType: "REAL", address: "DB1.DBD0" },
      { name: "W", dataType: "BOOL", accessMode: "WRITE" },
    ],
    alarms: [{ code: "X1", severity: "CRITICAL" }, { code: "X1" }],
    networkNodes: [{ nodeName: "N1", address: "1.1.1.1" }, { nodeName: "N2", address: "1.1.1.1" }],
  };

  it("produces byte-identical output across repeated runs", () => {
    expect(JSON.stringify(run(BIG))).toBe(JSON.stringify(run(BIG)));
  });

  it("is independent of input ordering for the findings it reports", () => {
    const a = run(BIG);
    const b = run({ ...BIG, tags: [...BIG.tags].reverse(), alarms: [...BIG.alarms].reverse() });
    expect(ids(b).sort()).toEqual(ids(a).sort());
  });

  it("emits at most one finding per (rule, artifact) so re-analysis is idempotent", () => {
    const seen = new Set(run(BIG).map((f) => `${f.ruleId}::${f.artifactRef}`));
    expect(seen.size).toBe(run(BIG).length);
  });

  it("summarizeFindings counts every severity bucket", () => {
    const s = summarizeFindings(run(BIG));
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(run(BIG).length);
  });
});

describe("94 — findings are advisory, never actuation", () => {
  const ALL = run({
    devices: [{ ...OK_DEVICE, safetyClass: "SAFETY_CRITICAL" }],
    tags: [{ name: "W", dataType: "BOOL", accessMode: "WRITE", safetyClass: "SAFETY_CRITICAL" }],
    alarms: [{ code: "A", severity: "CRITICAL" }],
    networkNodes: [{ nodeName: "N1", address: "1.1.1.1" }, { nodeName: "N2", address: "1.1.1.1" }],
  });

  it("no finding text reads as an executable instruction", () => {
    const text = ALL.map((f) => `${f.title} ${f.description} ${f.recommendation}`).join(" ").toLowerCase();
    for (const forbidden of [
      "write the value", "set the value", "force the tag", "download to plc",
      "start the motor", "stop the motor", "bypass", "acknowledge the alarm",
    ]) {
      expect(text, `recommendation must not instruct: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("every safety-touching finding demands human approval", () => {
    for (const f of ALL) {
      if (f.category === "SAFETY_POSTURE" || f.severity === "CRITICAL") {
        expect(f.humanApprovalRequired, `${f.ruleId} must require approval`).toBe(true);
      }
    }
  });

  it("the engine source contains no device-write vocabulary", () => {
    const code = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/analysis-rules.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    for (const forbidden of ["writeTag", "sendCommand", "setpoint", "actuate", "downloadToPlc", "exec("]) {
      expect(code, `engine must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("findings carry evidence references, not imported values", () => {
    for (const f of ALL) {
      for (const ref of f.evidenceRefs) {
        expect(typeof ref).toBe("string");
        expect(ref.length).toBeLessThanOrEqual(255);
      }
    }
  });
});
