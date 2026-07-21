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
