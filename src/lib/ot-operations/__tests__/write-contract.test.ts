import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCreateDeviceBody,
  buildCreateGatewayBody,
  buildUpdateDeviceBody,
  buildUpdateGatewayBody,
  deviceDraftFromRecord,
  DEVICE_NETWORK_ZONES,
  DEVICE_SAFETY_CLASSES,
  EMPTY_DEVICE_DRAFT,
  EMPTY_GATEWAY_DRAFT,
  FORBIDDEN_WRITE_FIELDS,
  GATEWAY_ENVIRONMENTS,
  gatewayDraftFromRecord,
  validateDeviceDraft,
  validateGatewayDraft,
  WRITE_LIMITS,
  type DeviceFormDraft,
  type GatewayFormDraft,
} from "../write-contract";
import { DEVICE_CATEGORIES, DEVICE_LIFECYCLES, GATEWAY_CAPABILITIES, GATEWAY_LIFECYCLES } from "../contract";

/**
 * PHASE 94C2 — the write contract, pinned to the server's own schemas.
 *
 * The property under test is not "does a body serialise". It is that the
 * browser can only ever send a field the route accepts, and can never send one
 * it must not — because every write schema is `.strict()`, so an extra key is a
 * 422 with no field detail, and a credential-adjacent key would be a leak.
 *
 * The allow-lists are read out of the ROUTE FILES themselves, so a server
 * schema change that the client does not follow fails here rather than in
 * production.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

/** The keys of a Zod object literal in a route file. */
function schemaKeys(source: string, name: string): string[] {
  const block = new RegExp(`const ${name} = z\\s*\\.object\\(\\{([\\s\\S]*?)\\}\\)\\s*\\.strict\\(\\)`).exec(source);
  if (!block) throw new Error(`${name} not found`);
  return [...block[1].matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*):/gm)].map((m) => m[1]).sort();
}

/** The members of a `z.enum([...])` for one field. */
function schemaEnum(source: string, name: string, field: string): string[] {
  const block = new RegExp(`const ${name} = z\\s*\\.object\\(\\{([\\s\\S]*?)\\}\\)\\s*\\.strict\\(\\)`).exec(source);
  if (!block) throw new Error(`${name} not found`);
  const line = new RegExp(`${field}: z\\.enum\\(\\[([^\\]]*)\\]\\)`).exec(block[1]);
  if (!line) throw new Error(`${field} enum not found in ${name}`);
  return [...line[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]).sort();
}

const GATEWAY_ROUTE = read("src/app/api/ot/gateways/route.ts");
const GATEWAY_ID_ROUTE = read("src/app/api/ot/gateways/[id]/route.ts");
const DEVICE_ROUTE = read("src/app/api/ot/devices/route.ts");
const DEVICE_ID_ROUTE = read("src/app/api/ot/devices/[id]/route.ts");

/* ── The payload can only contain accepted keys ─────────────────────────── */

describe("94C2 — every payload key is one the server accepts", () => {
  const filled: GatewayFormDraft = {
    gatewayId: "gw-record-1",
    environment: "PRODUCTION",
    capabilities: ["PROJECT_METADATA_IMPORT", "TAG_METADATA_IMPORT"],
    softwareVersion: "1.4.0",
    readOnlyMode: false,
    simulatorMode: true,
    lifecycle: "ACTIVE",
  };

  const filledDevice: DeviceFormDraft = {
    assetId: "asset-1",
    category: "PLC",
    lifecycleState: "OPERATIONAL",
    networkZone: "CONTROL",
    safetyClass: "SAFETY_RELATED",
    productFamily: "S7-1500",
    firmwareVersion: "2.9.4",
    engineeringId: "PLC_01",
  };

  it("a gateway create body is a subset of CreateGateway", () => {
    const accepted = schemaKeys(GATEWAY_ROUTE, "CreateGateway");
    const sent = Object.keys(buildCreateGatewayBody(filled));
    for (const key of sent) expect(accepted, `${key} is not accepted`).toContain(key);
    // `signingKeyRef` IS accepted by the schema and is deliberately never sent:
    // provisioning signing material is not a dashboard workflow.
    expect(sent).not.toContain("signingKeyRef");
  });

  it("a gateway update body is a subset of UpdateGateway", () => {
    const accepted = schemaKeys(GATEWAY_ID_ROUTE, "UpdateGateway");
    const sent = Object.keys(buildUpdateGatewayBody(filled, EMPTY_GATEWAY_DRAFT));
    for (const key of sent) expect(accepted, `${key} is not accepted`).toContain(key);
    expect(sent).not.toContain("signingKeyRef");
    // The parent link is immutable, and the update schema has no field for it.
    expect(sent).not.toContain("gatewayId");
  });

  it("a device create body is a subset of CreateDevice", () => {
    const accepted = schemaKeys(DEVICE_ROUTE, "CreateDevice");
    const sent = Object.keys(buildCreateDeviceBody(filledDevice));
    for (const key of sent) expect(accepted, `${key} is not accepted`).toContain(key);
  });

  it("a device update body is a subset of UpdateDevice, without the asset link", () => {
    const accepted = schemaKeys(DEVICE_ID_ROUTE, "UpdateDevice");
    const sent = Object.keys(buildUpdateDeviceBody(filledDevice, EMPTY_DEVICE_DRAFT));
    for (const key of sent) expect(accepted, `${key} is not accepted`).toContain(key);
    expect(sent).not.toContain("assetId");
  });

  it("no builder can ever emit a forbidden field", () => {
    const payloads = [
      buildCreateGatewayBody(filled),
      buildUpdateGatewayBody(filled, EMPTY_GATEWAY_DRAFT),
      buildCreateDeviceBody(filledDevice),
      buildUpdateDeviceBody(filledDevice, EMPTY_DEVICE_DRAFT),
    ];
    for (const payload of payloads) {
      const keys = Object.keys(payload);
      for (const forbidden of FORBIDDEN_WRITE_FIELDS) {
        expect(keys, `${forbidden} reached a payload`).not.toContain(forbidden);
      }
      // And no forbidden token appears in a VALUE either.
      const serialized = JSON.stringify(payload);
      for (const secret of ["signingKeyRef", "organizationId", "tenantId", "siteId", "ingestionId"]) {
        expect(serialized, `${secret} appeared in a payload value`).not.toContain(secret);
      }
    }
  });

  it("submits no site, because no write schema accepts one", () => {
    // The site is inherited from the parent record. A `siteId` key would be a
    // 422, and pretending the UI assigns a site would misdescribe the model.
    for (const route of [GATEWAY_ROUTE, GATEWAY_ID_ROUTE, DEVICE_ROUTE, DEVICE_ID_ROUTE]) {
      expect(route).not.toMatch(/^\s{4}siteId:/m);
    }
    const payloads = [buildCreateGatewayBody(filled), buildCreateDeviceBody(filledDevice)];
    for (const payload of payloads) {
      expect(Object.keys(payload)).not.toContain("siteId");
    }
  });
});

/* ── Enum values are exactly the server's ───────────────────────────────── */

describe("94C2 — enum allow-lists match the route schemas", () => {
  it.each([
    ["CreateGateway.environment", () => schemaEnum(GATEWAY_ROUTE, "CreateGateway", "environment"), GATEWAY_ENVIRONMENTS],
    ["UpdateGateway.lifecycle", () => schemaEnum(GATEWAY_ID_ROUTE, "UpdateGateway", "lifecycle"), GATEWAY_LIFECYCLES],
    ["CreateDevice.category", () => schemaEnum(DEVICE_ROUTE, "CreateDevice", "category"), DEVICE_CATEGORIES],
    ["CreateDevice.lifecycleState", () => schemaEnum(DEVICE_ROUTE, "CreateDevice", "lifecycleState"), DEVICE_LIFECYCLES],
    ["CreateDevice.networkZone", () => schemaEnum(DEVICE_ROUTE, "CreateDevice", "networkZone"), DEVICE_NETWORK_ZONES],
    ["CreateDevice.safetyClass", () => schemaEnum(DEVICE_ROUTE, "CreateDevice", "safetyClass"), DEVICE_SAFETY_CLASSES],
  ])("%s", (_label, serverValues, clientValues) => {
    expect([...clientValues].sort()).toEqual(serverValues());
  });

  it("omits TEST from the environment list, because the route does not accept it", () => {
    // The Prisma enum has TEST; `CreateGateway` does not. Offering it would be
    // a guaranteed 422 — the route is the contract, not the schema.
    expect(GATEWAY_ENVIRONMENTS as readonly string[]).not.toContain("TEST");
  });

  it("keeps a raw enum value on the wire, never a translated label", () => {
    const body = buildCreateDeviceBody({ ...EMPTY_DEVICE_DRAFT, assetId: "a-1", category: "SCADA_SERVER" });
    expect(body.category).toBe("SCADA_SERVER");
  });

  it("drops a value outside the allow-list rather than sending it", () => {
    // A tampered control cannot smuggle a value the server would refuse with an
    // unattributable error.
    const body = buildCreateGatewayBody({
      ...EMPTY_GATEWAY_DRAFT,
      gatewayId: "g-1",
      environment: "PRODUCTION_X",
      capabilities: ["PROJECT_METADATA_IMPORT", "CONTROL_WRITE"],
    });
    expect(body.environment).toBeUndefined();
    expect(body.capabilities).toEqual(["PROJECT_METADATA_IMPORT"]);
  });
});

/* ── Update sends only what changed ─────────────────────────────────────── */

describe("94C2 — an update carries only the operator's own changes", () => {
  const original: GatewayFormDraft = {
    gatewayId: "",
    environment: "PRODUCTION",
    capabilities: ["PROJECT_METADATA_IMPORT"],
    softwareVersion: "1.0.0",
    readOnlyMode: true,
    simulatorMode: false,
    lifecycle: "ACTIVE",
  };

  it("sends nothing at all when nothing changed", () => {
    expect(buildUpdateGatewayBody(original, original)).toEqual({});
  });

  it("sends exactly one field when one field changed", () => {
    const body = buildUpdateGatewayBody({ ...original, lifecycle: "STALE" }, original);
    expect(body).toEqual({ lifecycle: "STALE" });
  });

  it("treats a cleared optional value as an explicit null", () => {
    const body = buildUpdateGatewayBody({ ...original, softwareVersion: "  " }, original);
    expect(body).toEqual({ softwareVersion: null });
  });

  it("detects a capability change regardless of order", () => {
    const reordered = { ...original, capabilities: ["PROJECT_METADATA_IMPORT"] };
    expect(buildUpdateGatewayBody(reordered, original)).toEqual({});

    const added = { ...original, capabilities: ["TAG_METADATA_IMPORT", "PROJECT_METADATA_IMPORT"] };
    expect(buildUpdateGatewayBody(added, original).capabilities).toEqual([
      "TAG_METADATA_IMPORT",
      "PROJECT_METADATA_IMPORT",
    ]);
  });

  it("does the same for a device", () => {
    const before: DeviceFormDraft = {
      assetId: "",
      category: "PLC",
      lifecycleState: "OPERATIONAL",
      networkZone: "CONTROL",
      safetyClass: "NON_SAFETY",
      productFamily: "S7",
      firmwareVersion: "1.0",
      engineeringId: "PLC_01",
    };
    expect(buildUpdateDeviceBody(before, before)).toEqual({});
    expect(buildUpdateDeviceBody({ ...before, category: "HMI" }, before)).toEqual({ category: "HMI" });
    expect(buildUpdateDeviceBody({ ...before, engineeringId: "" }, before)).toEqual({ engineeringId: null });
  });
});

/* ── Seeding an edit form from a DTO ────────────────────────────────────── */

describe("94C2 — a fetched record never flows back to the server", () => {
  const gatewayRecord = {
    id: "profile-1",
    gatewayId: "registry-1",
    displayName: "Packing line north",
    siteId: "site-1",
    lifecycle: "ACTIVE",
    environment: "PRODUCTION",
    capabilities: ["PROJECT_METADATA_IMPORT"],
    softwareVersion: "1.4.0",
    readOnlyMode: true,
    simulatorMode: false,
    disabled: false,
    signingConfigured: true,
    lastSeenAt: "2026-05-06T07:08:09.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-02T00:00:00.000Z",
  };

  it("seeds only the writable fields of a gateway", () => {
    const draft = gatewayDraftFromRecord(gatewayRecord);
    // The parent link is dropped at the boundary, so it cannot be resubmitted.
    expect(draft.gatewayId).toBe("");
    expect(draft).toEqual({
      gatewayId: "",
      environment: "PRODUCTION",
      capabilities: ["PROJECT_METADATA_IMPORT"],
      softwareVersion: "1.4.0",
      readOnlyMode: true,
      simulatorMode: false,
      lifecycle: "ACTIVE",
    });
    // Everything server-owned is absent from the draft entirely.
    const keys = Object.keys(draft);
    for (const forbidden of ["id", "siteId", "displayName", "signingConfigured", "lastSeenAt", "createdAt", "updatedAt", "disabled"]) {
      expect(keys, `${forbidden} survived into the draft`).not.toContain(forbidden);
    }
  });

  it("renames the device lifecycle field on the way in", () => {
    // The DTO reads it back as `lifecycle`; the write schema calls it
    // `lifecycleState`. Round-tripping the DTO name would be a 422.
    const draft = deviceDraftFromRecord({
      category: "PLC",
      lifecycle: "MAINTENANCE",
      networkZone: "CONTROL",
      safetyClass: "NON_SAFETY",
      productFamily: null,
      firmwareVersion: null,
      engineeringId: "PLC_01",
    });
    expect(draft.lifecycleState).toBe("MAINTENANCE");
    expect(Object.keys(draft)).not.toContain("lifecycle");
  });

  it("a round trip through seed-and-build sends nothing", () => {
    const draft = gatewayDraftFromRecord(gatewayRecord);
    expect(buildUpdateGatewayBody(draft, draft)).toEqual({});
  });
});

/* ── Client validation mirrors the server bounds ────────────────────────── */

describe("94C2 — validation mirrors the server, which reports no field detail", () => {
  it("requires the parent record on create, and not on edit", () => {
    expect(validateGatewayDraft(EMPTY_GATEWAY_DRAFT, "create").gatewayId).toBe("required");
    expect(validateGatewayDraft(EMPTY_GATEWAY_DRAFT, "edit").gatewayId).toBeUndefined();
    expect(validateDeviceDraft(EMPTY_DEVICE_DRAFT, "create").assetId).toBe("required");
    expect(validateDeviceDraft(EMPTY_DEVICE_DRAFT, "edit").assetId).toBeUndefined();
  });

  it("refuses a malformed parent identifier before a request is made", () => {
    const draft = { ...EMPTY_GATEWAY_DRAFT, gatewayId: "not a cuid" };
    expect(validateGatewayDraft(draft, "create").gatewayId).toBe("malformed");
  });

  it("bounds every text field at the server's own limit", () => {
    expect(
      validateGatewayDraft(
        { ...EMPTY_GATEWAY_DRAFT, gatewayId: "g-1", softwareVersion: "x".repeat(WRITE_LIMITS.softwareVersionMax + 1) },
        "create",
      ).softwareVersion,
    ).toBe("tooLong");

    const device = validateDeviceDraft(
      {
        ...EMPTY_DEVICE_DRAFT,
        assetId: "a-1",
        engineeringId: "x".repeat(WRITE_LIMITS.engineeringIdMax + 1),
        productFamily: "y".repeat(WRITE_LIMITS.productFamilyMax + 1),
        firmwareVersion: "z".repeat(WRITE_LIMITS.firmwareVersionMax + 1),
      },
      "create",
    );
    expect(device.engineeringId).toBe("tooLong");
    expect(device.productFamily).toBe("tooLong");
    expect(device.firmwareVersion).toBe("tooLong");
  });

  it("bounds the capability list at the schema's maximum", () => {
    const tooMany = Array.from({ length: WRITE_LIMITS.capabilitiesMax + 1 }, () => GATEWAY_CAPABILITIES[0]);
    expect(validateGatewayDraft({ ...EMPTY_GATEWAY_DRAFT, gatewayId: "g-1", capabilities: tooMany }, "create").capabilities).toBe("tooMany");
  });

  it("accepts a fully valid draft", () => {
    expect(validateGatewayDraft({ ...EMPTY_GATEWAY_DRAFT, gatewayId: "cku1abc" }, "create")).toEqual({});
    expect(validateDeviceDraft({ ...EMPTY_DEVICE_DRAFT, assetId: "cku1xyz" }, "create")).toEqual({});
  });
});

/* ── No spreading anywhere in the write path ────────────────────────────── */

describe("94C2 — payloads are mapped by name, never spread", () => {
  it("the builders contain no spread of a record or a form value bag", () => {
    const source = read("src/lib/ot-operations/write-contract.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");
    // `{ ...record }` or `{ ...body }` would let any field the server sent
    // travel straight back, which a `.strict()` schema answers with a 422 —
    // and which is how a credential-adjacent field would escape.
    for (const forbidden of [/\.\.\.record/, /\.\.\.body/, /\.\.\.formValues/, /\.\.\.values/, /\.\.\.dto/]) {
      expect(source, `a spread was used: ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("the forms build their payload only through the named builders", () => {
    for (const file of [
      "src/components/ot-edge-onboarding/GatewayForm.tsx",
      "src/components/ot-edge-onboarding/DeviceForm.tsx",
    ]) {
      const source = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
      expect(source).toMatch(/build(Create|Update)(Gateway|Device)Body\(/);
      // No hand-assembled body object may reach the mutation helpers.
      expect(source).not.toMatch(/createGateway\(\{/);
      expect(source).not.toMatch(/updateGateway\([^,]+,\s*\{/);
      expect(source).not.toMatch(/createDevice\(\{/);
      expect(source).not.toMatch(/updateDevice\([^,]+,\s*\{/);
    }
  });
});
