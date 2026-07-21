import { describe, it, expect } from "vitest";
import {
  ImportEnvelopeSchema,
  parseEnvelope,
  canonicalize,
  checksumOf,
  normalizeIdentifier,
  withinSizeLimit,
  IMPORT_LIMITS,
  type ImportEnvelope,
} from "../import-envelope";

/**
 * PHASE 94 — canonical import envelope.
 *
 * These fixtures are METADATA ONLY: names, types and addresses as an
 * engineering export would declare them. They contain no credentials, no
 * process values and no executable logic.
 */

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

/** Siemens-style TIA export metadata. */
export const SIEMENS_FIXTURE = {
  schemaVersion: "1.0",
  sourceType: "TIA_EXPORT",
  project: { name: "Line 3 Bottling", version: "V17", vendor: "Siemens", platform: "TIA Portal V17", revision: 4 },
  devices: [
    { engineeringId: "PLC_1", name: "CPU 1516F-3 PN/DP", category: "PLC", manufacturer: "Siemens",
      productFamily: "SIMATIC S7-1500", model: "6ES7516-3FN02-0AB0", firmwareVersion: "V2.9",
      networkZone: "CONTROL", safetyClass: "SAFETY_RELATED" },
    { engineeringId: "HMI_1", name: "TP1200 Comfort", category: "HMI", manufacturer: "Siemens",
      model: "6AV2124-0MC01-0AX0", firmwareVersion: "V16", networkZone: "SUPERVISORY", safetyClass: "NON_SAFETY" },
  ],
  tags: [
    { name: "Motor_Run_Fb", deviceRef: "PLC_1", dataType: "BOOL", address: "DB10.DBX0.0",
      symbolicPath: "Line3/Filler/Motor_Run_Fb", description: "Filler motor running feedback",
      accessMode: "READ", safetyClass: "NON_SAFETY", sourceReference: "PLC_1/DB10" },
    { name: "Fill_Pressure", deviceRef: "PLC_1", dataType: "REAL", address: "DB10.DBD4",
      unit: "bar", description: "Filling head pressure", accessMode: "READ", sourceReference: "PLC_1/DB10" },
  ],
  alarms: [
    { code: "A1001", deviceRef: "PLC_1", severity: "HIGH", message: "Filler motor overload tripped",
      conditionReference: "DB20.DBX1.0", requiresAck: true, safetyClass: "NON_SAFETY", productionRelevant: true },
  ],
  networkNodes: [
    { nodeName: "PLC_1_X1", deviceRef: "PLC_1", zone: "CONTROL", protocol: "SIEMENS_S7",
      address: "192.168.10.11", subnet: "255.255.255.0", stationId: "1" },
  ],
} as const;

/** Generic PLC export with no vendor-specific structure. */
export const GENERIC_FIXTURE = {
  schemaVersion: "1.0",
  sourceType: "PLC_EXPORT",
  project: { name: "Utilities Skid", version: "1.2", revision: 1 },
  devices: [{ engineeringId: "PLC_A", name: "Utility PLC", category: "PLC", model: "M241", firmwareVersion: "5.1" }],
  tags: [{ name: "Pump_Cmd", deviceRef: "PLC_A", dataType: "BOOL", address: "%MX0.0", description: "Pump command", accessMode: "READ" }],
  alarms: [],
  networkNodes: [],
} as const;

/** HMI/SCADA tag export. */
export const HMI_FIXTURE = {
  schemaVersion: "1.0",
  sourceType: "HMI_EXPORT",
  project: { name: "Control Room Mimic", vendor: "Siemens", platform: "WinCC", revision: 2 },
  devices: [{ engineeringId: "SCADA_1", name: "WinCC Server", category: "SCADA_SERVER", model: "RT Pro", firmwareVersion: "V7.5" }],
  tags: [{ name: "Tank_Level", deviceRef: "SCADA_1", dataType: "REAL", unit: "%", description: "Tank level", accessMode: "READ" }],
  alarms: [{ code: "S2001", deviceRef: "SCADA_1", severity: "MEDIUM", message: "Comms degraded", conditionReference: "SYS/COMMS" }],
  networkNodes: [{ nodeName: "SCADA_1_NIC", deviceRef: "SCADA_1", zone: "SUPERVISORY", protocol: "OPC_UA", address: "10.0.5.20" }],
} as const;

const asEnvelope = (raw: unknown): ImportEnvelope => {
  const r = ImportEnvelopeSchema.safeParse(raw);
  if (!r.success) throw new Error(`fixture invalid: ${JSON.stringify(r.error.issues[0])}`);
  return r.data;
};

/* ── Valid fixtures ───────────────────────────────────────────────────────── */

describe("94 — valid engineering fixtures parse", () => {
  it.each([
    ["Siemens TIA", SIEMENS_FIXTURE],
    ["generic PLC", GENERIC_FIXTURE],
    ["HMI/SCADA", HMI_FIXTURE],
  ])("%s metadata is accepted", (_l, fixture) => {
    const r = parseEnvelope(fixture);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it("optional collections default to empty arrays", () => {
    const r = parseEnvelope({
      schemaVersion: "1.0", sourceType: "GENERIC",
      project: { name: "Minimal" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.envelope.devices).toEqual([]);
      expect(r.envelope.tags).toEqual([]);
    }
  });
});

/* ── Strictness ───────────────────────────────────────────────────────────── */

describe("94 — the contract is strict, not permissive", () => {
  it("rejects an unknown top-level key (no metadata smuggling)", () => {
    const r = parseEnvelope({ ...GENERIC_FIXTURE, extraPayload: { evil: true } });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown key inside a tag", () => {
    const r = parseEnvelope({
      ...GENERIC_FIXTURE,
      tags: [{ ...GENERIC_FIXTURE.tags[0], writeValue: 1 }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects an unsupported schema version", () => {
    expect(parseEnvelope({ ...GENERIC_FIXTURE, schemaVersion: "2.0" }).ok).toBe(false);
    expect(parseEnvelope({ ...GENERIC_FIXTURE, schemaVersion: "" }).ok).toBe(false);
  });

  it("rejects an unsupported source type", () => {
    expect(parseEnvelope({ ...GENERIC_FIXTURE, sourceType: "BINARY_PROJECT" }).ok).toBe(false);
  });

  it("rejects over-length strings", () => {
    const r = parseEnvelope({
      ...GENERIC_FIXTURE,
      project: { name: "x".repeat(IMPORT_LIMITS.maxNameLength + 1) },
    });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-object body", () => {
    for (const bad of [null, 42, "str", [], true]) expect(parseEnvelope(bad).ok).toBe(false);
  });

  it("reports a safe field path and never the rejected value", () => {
    const secret = "SECRET_PLANT_NAME_9f3a";
    const r = parseEnvelope({ ...GENERIC_FIXTURE, project: { name: secret, revision: -5 } });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(secret);
    if (!r.ok) expect(typeof r.field === "string" || r.field === undefined).toBe(true);
  });
});

/* ── Bounds ───────────────────────────────────────────────────────────────── */

describe("94 — oversized payloads are refused", () => {
  it("rejects more tags than the per-collection cap", () => {
    const tags = Array.from({ length: IMPORT_LIMITS.maxTags + 1 }, (_, i) => ({
      name: `T_${i}`, dataType: "BOOL",
    }));
    const r = parseEnvelope({ ...GENERIC_FIXTURE, tags });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toBe("TOO_MANY_RECORDS");
  });

  it("rejects a body over the byte limit before parsing", () => {
    expect(withinSizeLimit(IMPORT_LIMITS.maxBytes)).toBe(true);
    expect(withinSizeLimit(IMPORT_LIMITS.maxBytes + 1)).toBe(false);
  });

  it("caps the combined record count even when each collection is within its own cap", () => {
    // Each collection is at (or under) its individual limit, yet together they
    // exceed the total budget — the guard that a per-collection cap alone misses.
    const tags = IMPORT_LIMITS.maxTags;                    // 20 000, at the cap
    const alarms = IMPORT_LIMITS.maxAlarms;                // 5 000,  at the cap
    const nodes = IMPORT_LIMITS.maxNetworkNodes;           // 2 000,  at the cap
    expect(tags + alarms + nodes).toBeGreaterThan(IMPORT_LIMITS.maxTotalRecords);

    const r = parseEnvelope({
      ...GENERIC_FIXTURE,
      tags: Array.from({ length: tags }, (_, i) => ({ name: `T${i}`, dataType: "BOOL" })),
      alarms: Array.from({ length: alarms }, (_, i) => ({ code: `A${i}` })),
      networkNodes: Array.from({ length: nodes }, (_, i) => ({ nodeName: `N${i}` })),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toBe("TOO_MANY_RECORDS");
  });
});

/* ── Normalisation + checksum ─────────────────────────────────────────────── */

describe("94 — identity normalisation is locale-independent", () => {
  it("folds separators and case to one identity", () => {
    const forms = ["Motor Run", "motor_run", "MOTOR-RUN", "  Motor.Run  "];
    const ids = new Set(forms.map(normalizeIdentifier));
    expect(ids.size, `expected one identity, got ${[...ids].join(" | ")}`).toBe(1);
    expect([...ids][0]).toBe("MOTOR_RUN");
  });

  it("does not depend on the ambient locale (Turkish dotted-i safety)", () => {
    // A locale-sensitive toUpperCase() would fold "i" to "İ" in tr-TR and split
    // one tag into two identities — silently breaking duplicate detection.
    expect(normalizeIdentifier("Fill_i")).toBe("FILL_I");
    expect(normalizeIdentifier("FILL_I")).toBe("FILL_I");
  });
});

describe("94 — checksum identifies content, not file layout", () => {
  it("is stable across repeated calls", async () => {
    const env = asEnvelope(SIEMENS_FIXTURE);
    expect(await checksumOf(env)).toBe(await checksumOf(env));
  });

  it("ignores collection ordering", async () => {
    const a = asEnvelope(SIEMENS_FIXTURE);
    const b = asEnvelope({ ...SIEMENS_FIXTURE, tags: [...SIEMENS_FIXTURE.tags].reverse() });
    expect(await checksumOf(b)).toBe(await checksumOf(a));
  });

  it("changes when engineering content changes", async () => {
    const a = asEnvelope(SIEMENS_FIXTURE);
    const b = asEnvelope({
      ...SIEMENS_FIXTURE,
      tags: [{ ...SIEMENS_FIXTURE.tags[0], address: "DB10.DBX9.9" }, SIEMENS_FIXTURE.tags[1]],
    });
    expect(await checksumOf(b)).not.toBe(await checksumOf(a));
  });

  it("is a sha256 hex digest", async () => {
    expect(await checksumOf(asEnvelope(GENERIC_FIXTURE))).toMatch(/^[a-f0-9]{64}$/);
  });

  it("canonical form is deterministic and key-ordered", () => {
    const env = asEnvelope(SIEMENS_FIXTURE);
    expect(canonicalize(env)).toBe(canonicalize(env));
    expect(canonicalize(env).indexOf('"schemaVersion"')).toBeLessThan(canonicalize(env).indexOf('"tags"'));
  });
});

/* ── Safety posture ───────────────────────────────────────────────────────── */

describe("94 — the contract cannot express a control action", () => {
  it("has no field that could carry a value, setpoint or command", () => {
    const keys = new Set<string>();
    const walk = (o: unknown) => {
      if (o && typeof o === "object" && !Array.isArray(o)) {
        for (const [k, v] of Object.entries(o)) { keys.add(k.toLowerCase()); walk(v); }
      } else if (Array.isArray(o)) o.forEach(walk);
    };
    walk(SIEMENS_FIXTURE);
    for (const forbidden of ["value", "setpoint", "command", "write", "execute", "script"]) {
      expect([...keys], `envelope must not carry "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("accessMode is a declaration, capped to the known set", () => {
    const r = parseEnvelope({
      ...GENERIC_FIXTURE,
      tags: [{ name: "T", dataType: "BOOL", accessMode: "EXECUTE" }],
    });
    expect(r.ok).toBe(false);
  });
});
