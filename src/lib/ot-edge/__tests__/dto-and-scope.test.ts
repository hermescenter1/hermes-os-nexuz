import { describe, it, expect, vi } from "vitest";
import {
  buildOtServiceContext,
  authorize,
  siteFilter,
  tenantWhere,
  boundedPage,
  PAGE_LIMITS,
} from "../service-context";
import {
  FORBIDDEN_DTO_FIELDS,
  toGatewayProfileDto,
  toOtDeviceProfileDto,
  toEngineeringImportDto,
  toEngineeringProjectSummaryDto,
  toAutomationTagDto,
  toAlarmDefinitionDto,
  toIndustrialNetworkNodeDto,
  toEngineeringFindingDto,
} from "../dto";
import {
  OT_METRICS,
  FORBIDDEN_LABELS,
  isSafeLabels,
  record,
  durationMs,
  type MetricSink,
  type OtMetric,
  type OtMetricLabels,
} from "../metrics";

const ctx = (over: Partial<Parameters<typeof buildOtServiceContext>[0]> = {}) =>
  buildOtServiceContext({
    userId: "u-1",
    organizationId: "org-1",
    role: "ENGINEER",
    allowedSiteIds: ["site-1", "site-2"],
    ...over,
  });

describe("94B3 — the service context is a trusted scope, not a suggestion", () => {
  it("refuses to build without an authenticated actor", () => {
    expect(() => buildOtServiceContext({ userId: "", organizationId: "org-1", role: "ENGINEER", allowedSiteIds: null }))
      .toThrow(/authenticated actor/);
    expect(() => buildOtServiceContext({ userId: "u-1", organizationId: "", role: "ENGINEER", allowedSiteIds: null }))
      .toThrow(/authenticated actor/);
  });

  it("copies the site list so a caller cannot widen scope after construction", () => {
    const sites = ["site-1"];
    const c = ctx({ allowedSiteIds: sites });
    sites.push("site-EVIL");
    expect(c.allowedSiteIds).toEqual(["site-1"]);
  });

  it("always yields an organization predicate", () => {
    expect(tenantWhere(ctx())).toEqual({ organizationId: "org-1" });
  });

  it("an actor with NO site access matches nothing — never everything", () => {
    // The dangerous bug would be returning `undefined` (no filter) for an
    // empty allow-list, silently granting org-wide access.
    const f = siteFilter(ctx({ allowedSiteIds: [] }));
    expect(f).toEqual({ in: [] });
    expect(f).not.toBeUndefined();
  });

  it("only an explicit null means org-wide site access", () => {
    expect(siteFilter(ctx({ allowedSiteIds: null }))).toBeUndefined();
    expect(siteFilter(ctx({ allowedSiteIds: ["site-1"] }))).toEqual({ in: ["site-1"] });
  });

  it("authorizes by role through the existing RBAC system", () => {
    expect(authorize(ctx({ role: "ENGINEER" }), "create_engineering_import")).toBeNull();
    expect(authorize(ctx({ role: "VIEWER" }), "create_engineering_import")).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(authorize(ctx({ role: "ENGINEER" }), "review_engineering_finding")).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("pagination is always bounded, whatever the caller sends", () => {
    expect(boundedPage()).toEqual({ take: PAGE_LIMITS.default, skip: 0 });
    expect(boundedPage({ take: 100000 }).take).toBe(PAGE_LIMITS.max);
    expect(boundedPage({ take: 0 }).take).toBe(1);
    expect(boundedPage({ take: -5 }).take).toBe(1);
    expect(boundedPage({ skip: -20 }).skip).toBe(0);
    for (const bad of [NaN, Infinity, "abc" as unknown as number]) {
      const p = boundedPage({ take: bad, skip: bad });
      expect(p.take).toBeLessThanOrEqual(PAGE_LIMITS.max);
      expect(p.take).toBeGreaterThanOrEqual(1);
      expect(p.skip).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("94B3 — DTOs cannot leak secrets or internals", () => {
  /** Every mapper, fed a row deliberately polluted with forbidden columns. */
  const mappers = [
    ["gateway", toGatewayProfileDto],
    ["device", toOtDeviceProfileDto],
    ["import", toEngineeringImportDto],
    ["project", toEngineeringProjectSummaryDto],
    ["tag", toAutomationTagDto],
    ["alarm", toAlarmDefinitionDto],
    ["network", toIndustrialNetworkNodeDto],
    ["finding", toEngineeringFindingDto],
  ] as const;

  const POLLUTED = {
    id: "x-1",
    projectId: "p-1",
    signingKeyRef: "env:OT_GATEWAY_HMAC_PRIMARY",
    signature: "AAAAsignatureAAAA",
    nonce: "n".repeat(32),
    idempotencyKey: "idem-secret-1",
    secret: "super-secret-value",
    sourcePayload: '{"tags":[{"name":"SECRET_TAG"}]}',
    rawPayload: "RAW_MANIFEST_BODY",
    evidenceBody: "PRIVATE_EVIDENCE",
    passwordHash: "$argon2id$abc",
    organizationId: "org-1",
    _internalCursor: "cur-1",
  };

  it.each(mappers)("%s DTO contains no forbidden field", (_name, map) => {
    const dto = map(POLLUTED as never) as unknown as Record<string, unknown>;
    for (const field of FORBIDDEN_DTO_FIELDS) {
      expect(Object.keys(dto), `${field} leaked`).not.toContain(field);
    }
  });

  it.each(mappers)("%s DTO contains no forbidden VALUE either", (_name, map) => {
    const serialized = JSON.stringify(map(POLLUTED as never));
    for (const secret of [
      "env:OT_GATEWAY_HMAC_PRIMARY",
      "AAAAsignatureAAAA",
      "idem-secret-1",
      "super-secret-value",
      "SECRET_TAG",
      "RAW_MANIFEST_BODY",
      "PRIVATE_EVIDENCE",
      "$argon2id$abc",
    ]) {
      expect(serialized, `${secret} leaked by value`).not.toContain(secret);
    }
  });

  it.each(mappers)("%s DTO ignores unknown columns entirely", (_name, map) => {
    // A column added to the schema later must not appear until mapped.
    const dto = map({ ...POLLUTED, futureSecretColumn: "LEAK" } as never) as unknown as Record<string, unknown>;
    expect(Object.keys(dto)).not.toContain("futureSecretColumn");
    expect(JSON.stringify(dto)).not.toContain("LEAK");
  });

  it("a gateway reports THAT signing is configured, never the reference", () => {
    const configured = toGatewayProfileDto({ ...POLLUTED } as never);
    expect(configured.signingConfigured).toBe(true);
    expect(JSON.stringify(configured)).not.toContain("OT_GATEWAY_HMAC");

    const unconfigured = toGatewayProfileDto({ id: "g" } as never);
    expect(unconfigured.signingConfigured).toBe(false);
  });

  it("an import DTO never echoes the idempotency reservation token", () => {
    const dto = toEngineeringImportDto(POLLUTED as never) as unknown as Record<string, unknown>;
    expect(Object.keys(dto)).not.toContain("idempotencyKey");
  });
});

describe("94B3 — metric labels stay low-cardinality", () => {
  const sink = (): MetricSink & { calls: Array<[OtMetric, number, OtMetricLabels]> } => {
    const calls: Array<[OtMetric, number, OtMetricLabels]> = [];
    return { calls, emit: (m, v, l) => { calls.push([m, v, l]); } };
  };

  it("accepts only declared label keys with declared values", () => {
    expect(isSafeLabels({ severity: "HIGH" })).toBe(true);
    expect(isSafeLabels({ outcome: "rejected", sourceType: "GENERIC" })).toBe(true);
    expect(isSafeLabels({})).toBe(true);
    expect(isSafeLabels({ severity: "EXTREME" }), "value outside the set").toBe(false);
    expect(isSafeLabels({ unknownKey: "x" }), "undeclared key").toBe(false);
  });

  it.each(FORBIDDEN_LABELS)("drops the tenant-identifying label %s", (key) => {
    const s = sink();
    record(s, "ot_import_completed", 1, { [key]: "org-secret-1" } as unknown as OtMetricLabels);
    expect(s.calls).toHaveLength(1);
    // Recorded, but stripped: the counter still increments, the identifier does not travel.
    expect(s.calls[0][2]).toEqual({});
    expect(JSON.stringify(s.calls[0])).not.toContain("org-secret-1");
  });

  it("a rejected label set is reported without the offending values", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = sink();
    record(s, "ot_import_failed", 1, { projectId: "p-SECRET" } as unknown as OtMetricLabels);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain("p-SECRET");
    warn.mockRestore();
  });

  it("passes a safe label bag through unchanged", () => {
    const s = sink();
    record(s, "ot_findings_total", 3, { severity: "CRITICAL" });
    expect(s.calls[0]).toEqual(["ot_findings_total", 3, { severity: "CRITICAL" }]);
  });

  it("every declared metric name is namespaced and stable", () => {
    for (const m of OT_METRICS) expect(m).toMatch(/^ot_[a-z0-9_]+$/);
    expect(new Set(OT_METRICS).size).toBe(OT_METRICS.length);
  });

  it("duration is injected, never read from a hidden clock", () => {
    expect(durationMs(1000, 1250)).toBe(250);
    expect(durationMs(1000, 900), "a clock skew must not yield a negative").toBe(0);
    expect(durationMs(NaN, 1)).toBe(0);
  });
});

describe("94B.1 — the gateway DTO reports the real last-envelope time", () => {
  /**
   * REGRESSION FOR A CONFIRMED DEFECT.
   *
   * `toGatewayProfileDto` used to read `row.lastSeenAt`, a key that no
   * `GatewayProfileRecord` carries — the persistence field is `lastEnvelopeAt`
   * (persistence/ports.ts). Every route therefore answered `null` for every
   * gateway, including ones that had successfully submitted signed envelopes.
   * The public field name is deliberately unchanged; only its source is.
   */
  const seen = new Date("2026-03-04T05:06:07.000Z");

  const record = (over: Record<string, unknown> = {}) => ({
    id: "g-1",
    gatewayId: "gw-row-1",
    displayName: "Line 1 gateway",
    siteId: "site-1",
    lifecycle: "ACTIVE",
    environment: "PRODUCTION",
    capabilities: ["PROJECT_METADATA_IMPORT"],
    softwareVersion: "1.2.3",
    readOnlyMode: true,
    simulatorMode: false,
    disabled: false,
    signingKeyRef: "env:OT_GATEWAY_HMAC_PRIMARY",
    lastEnvelopeAt: seen,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-02T00:00:00.000Z"),
    ...over,
  });

  it("maps a populated lastEnvelopeAt onto lastSeenAt", () => {
    expect(toGatewayProfileDto(record() as never).lastSeenAt).toBe(seen.toISOString());
  });

  it("preserves null when no envelope has ever been accepted", () => {
    expect(toGatewayProfileDto(record({ lastEnvelopeAt: null }) as never).lastSeenAt).toBeNull();
    // Absent behaves like null — a record that never carried the field at all.
    const withoutField: Record<string, unknown> = record();
    delete withoutField.lastEnvelopeAt;
    expect(toGatewayProfileDto(withoutField as never).lastSeenAt).toBeNull();
  });

  it("never synthesises the timestamp from createdAt or updatedAt", () => {
    // "Never seen" and "seen" must stay distinguishable: a gateway that has
    // never ingested must not appear to have been seen when it was created.
    const dto = toGatewayProfileDto(record({ lastEnvelopeAt: null }) as never);
    expect(dto.lastSeenAt).toBeNull();
    expect(dto.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(dto.updatedAt).toBe("2026-02-02T00:00:00.000Z");
  });

  it("ignores a stray lastSeenAt column instead of trusting it", () => {
    // IndustrialGateway has its own unrelated `lastSeenAt` (a heartbeat). If a
    // row of that shape ever reached this mapper, the DTO must still report the
    // ENVELOPE time — the two have different meanings.
    const dto = toGatewayProfileDto(
      record({ lastEnvelopeAt: null, lastSeenAt: new Date("2020-09-09T00:00:00.000Z") }) as never,
    );
    expect(dto.lastSeenAt).toBeNull();
  });

  it("reports signing configuration from the record, not from an absent reference", () => {
    // The shape production actually produces: `GatewayProfileRecord` carries
    // the derived boolean and deliberately does NOT carry `signingKeyRef`.
    // Deriving the DTO field from the reference alone reported `false` for
    // every gateway on every route.
    const realistic = { ...record(), signingConfigured: true };
    delete (realistic as Record<string, unknown>).signingKeyRef;
    expect(toGatewayProfileDto(realistic as never).signingConfigured).toBe(true);

    const unconfigured = { ...record(), signingConfigured: false };
    delete (unconfigured as Record<string, unknown>).signingKeyRef;
    expect(toGatewayProfileDto(unconfigured as never).signingConfigured).toBe(false);

    // A raw database row still works, and the reference still never escapes.
    const rawRow = { ...record() };
    delete (rawRow as Record<string, unknown>).signingConfigured;
    const dto = toGatewayProfileDto(rawRow as never);
    expect(dto.signingConfigured).toBe(true);
    expect(JSON.stringify(dto)).not.toContain("OT_GATEWAY_HMAC");
  });

  it("changes no other field of the gateway DTO", () => {
    const dto = toGatewayProfileDto(record() as never) as unknown as Record<string, unknown>;
    expect(Object.keys(dto).sort()).toEqual(
      [
        "id", "gatewayId", "displayName", "siteId", "lifecycle", "environment",
        "softwareVersion", "capabilities", "readOnlyMode", "simulatorMode",
        "disabled", "signingConfigured", "lastSeenAt", "createdAt", "updatedAt",
      ].sort(),
    );
    expect(dto.signingConfigured).toBe(true);
    // The reference itself still never crosses the boundary.
    expect(JSON.stringify(dto)).not.toContain("OT_GATEWAY_HMAC");
  });
});

describe("94B.1 — the device DTO reports the lifecycle it is filtered by", () => {
  /**
   * REGRESSION FOR THE SAME CLASS OF DEFECT AS `lastSeenAt`.
   *
   * The record's field is `lifecycleState`; the public DTO field is
   * `lifecycle`. The mapper read `row.lifecycle`, which no record carries, so
   * every device response reported an empty lifecycle. This phase adds a public
   * `?lifecycle=` filter that narrows correctly on the column — so without this
   * correction the list would have been filtered by a value the API reported as
   * blank, which is exactly the class of dishonesty 94B.1 exists to remove.
   */
  const deviceRecordShape = (over: Record<string, unknown> = {}) => ({
    id: "d-1",
    assetId: "a-1",
    siteId: "site-1",
    category: "PLC",
    lifecycleState: "OPERATIONAL",
    networkZone: "CONTROL",
    safetyClass: "NON_SAFETY",
    productFamily: "S7-1500",
    firmwareVersion: "2.9.4",
    engineeringId: "PLC_01",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-02T00:00:00.000Z"),
    ...over,
  });

  it("maps lifecycleState onto the public lifecycle field", () => {
    expect(toOtDeviceProfileDto(deviceRecordShape() as never).lifecycle).toBe("OPERATIONAL");
    expect(
      toOtDeviceProfileDto(deviceRecordShape({ lifecycleState: "DECOMMISSIONED" }) as never).lifecycle,
    ).toBe("DECOMMISSIONED");
  });

  it("never returns a blank lifecycle for a record that has one", () => {
    // The precise failure this replaces: `""` on 100% of responses.
    for (const state of ["PLANNED", "COMMISSIONING", "OPERATIONAL", "MAINTENANCE", "DECOMMISSIONED", "UNKNOWN"]) {
      const dto = toOtDeviceProfileDto(deviceRecordShape({ lifecycleState: state }) as never);
      expect(dto.lifecycle, state).not.toBe("");
      expect(dto.lifecycle).toBe(state);
    }
  });

  it("keeps the rest of the device DTO contract unchanged", () => {
    const dto = toOtDeviceProfileDto(deviceRecordShape() as never) as unknown as Record<string, unknown>;
    expect(Object.keys(dto).sort()).toEqual(
      [
        "id", "siteId", "assetId", "category", "manufacturer", "productFamily",
        "model", "firmwareVersion", "protocols", "lifecycle", "engineeringId",
        "networkZone", "safetyClass", "lastImportSource", "createdAt", "updatedAt",
      ].sort(),
    );
    // Still honestly empty: no write path populates these, and this phase does
    // not pretend otherwise.
    expect(dto.manufacturer).toBeNull();
    expect(dto.model).toBeNull();
    expect(dto.protocols).toEqual([]);
  });
});
