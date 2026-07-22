import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseGatewayListFilters,
  parseDeviceListFilters,
  GATEWAY_LIFECYCLE_VALUES,
  GATEWAY_CAPABILITY_VALUES,
  DEVICE_LIFECYCLE_VALUES,
  DEVICE_CATEGORY_VALUES,
  MAX_SEARCH_LENGTH,
} from "../list-filters";

/**
 * PHASE 94B.1 — the list-filter contract at the route boundary.
 *
 * The property under test is NOT "does a valid value parse". It is the pair of
 * guarantees that make a filtered list trustworthy:
 *
 *   1. a SUPPORTED key is never silently ignored — it is honoured or refused;
 *   2. an UNSUPPORTED value never reaches a query, and the refusal never
 *      repeats what the caller sent.
 *
 * The allow-lists are additionally pinned to the Prisma enums, so a schema
 * change that adds or renames a member fails here rather than producing a
 * filter that quietly matches nothing.
 */

const url = (qs: string) => new URL(`https://example.invalid/api/ot/x${qs}`);

/** The enum body as written in the schema, so the pin reads the real source. */
function prismaEnum(name: string): string[] {
  const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const block = new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!block) throw new Error(`enum ${name} not found in schema.prisma`);
  return block[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("///") && !l.startsWith("@"));
}

describe("94B.1 — allow-lists are pinned to the persisted enums", () => {
  it.each([
    ["EdgeGatewayLifecycle", GATEWAY_LIFECYCLE_VALUES],
    ["EdgeGatewayCapability", GATEWAY_CAPABILITY_VALUES],
    ["OtLifecycleState", DEVICE_LIFECYCLE_VALUES],
    ["OtDeviceCategory", DEVICE_CATEGORY_VALUES],
  ])("%s matches the filter allow-list exactly", (enumName, allowed) => {
    // Equality both ways: a value the schema drops must not stay filterable,
    // and a value the schema adds must not stay silently unfilterable.
    expect([...allowed].sort()).toEqual(prismaEnum(enumName as string).sort());
  });
});

describe("94B.1 — gateway filters", () => {
  it("accepts every lifecycle and capability the schema defines", () => {
    for (const lifecycle of GATEWAY_LIFECYCLE_VALUES) {
      const res = parseGatewayListFilters(url(`?lifecycle=${lifecycle}`));
      expect(res.ok, lifecycle).toBe(true);
      if (res.ok) expect(res.value.lifecycle).toBe(lifecycle);
    }
    for (const capability of GATEWAY_CAPABILITY_VALUES) {
      const res = parseGatewayListFilters(url(`?capability=${capability}`));
      expect(res.ok, capability).toBe(true);
      if (res.ok) expect(res.value.capability).toBe(capability);
    }
  });

  it("carries every supported key at once", () => {
    const res = parseGatewayListFilters(
      url("?lifecycle=ACTIVE&siteId=site-1&capability=READ_ONLY_TELEMETRY&search=Line%201"),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({
      lifecycle: "ACTIVE",
      siteId: "site-1",
      capability: "READ_ONLY_TELEMETRY",
      search: "Line 1",
    });
  });

  it.each([
    ["unknown lifecycle", "?lifecycle=RETIRED"],
    ["lower-case lifecycle", "?lifecycle=active"],
    ["a device lifecycle on a gateway", "?lifecycle=OPERATIONAL"],
    ["unknown capability", "?capability=CONTROL_WRITE"],
    ["a device category on a gateway", "?category=PLC&lifecycle=NOT_A_VALUE"],
    ["site id with a wildcard", "?siteId=%25"],
    ["site id with a space", "?siteId=site%201"],
    ["site id with a quote", "?siteId=site%27"],
    ["site id with a path separator", "?siteId=../../etc"],
  ])("refuses %s with 400 and no echo", async (_label, qs) => {
    const res = parseGatewayListFilters(url(qs));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.response.status).toBe(400);
    const body = await res.response.json();
    expect(body.code).toBe("INVALID_QUERY_PARAMETER");
    // The offending value must not be reflected back to the caller.
    const serialized = JSON.stringify(body);
    for (const probe of ["RETIRED", "CONTROL_WRITE", "../../etc", "%", "'"]) {
      expect(serialized, `${probe} was echoed`).not.toContain(probe);
    }
  });

  it("refuses a search term beyond the bound rather than truncating it", async () => {
    const ok = parseGatewayListFilters(url(`?search=${"a".repeat(MAX_SEARCH_LENGTH)}`));
    expect(ok.ok).toBe(true);
    const tooLong = parseGatewayListFilters(url(`?search=${"a".repeat(MAX_SEARCH_LENGTH + 1)}`));
    expect(tooLong.ok).toBe(false);
    // Truncating would return rows that do not match what was typed.
    if (!tooLong.ok) expect(tooLong.response.status).toBe(400);
  });

  it("treats absent and blank as no filter, not as match-nothing", () => {
    for (const qs of ["", "?lifecycle=", "?siteId=%20&capability=&search="]) {
      const res = parseGatewayListFilters(url(qs));
      expect(res.ok, qs).toBe(true);
      if (res.ok) expect(res.value, qs).toEqual({});
    }
  });

  it("ignores a category parameter, because gateways have no category column", () => {
    // Accepting it would advertise a filter that could never do anything.
    const res = parseGatewayListFilters(url("?category=PLC"));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual({});
  });
});

describe("94B.1 — device filters", () => {
  it("accepts every lifecycle and category the schema defines", () => {
    for (const lifecycle of DEVICE_LIFECYCLE_VALUES) {
      const res = parseDeviceListFilters(url(`?lifecycle=${lifecycle}`));
      expect(res.ok, lifecycle).toBe(true);
      if (res.ok) expect(res.value.lifecycle).toBe(lifecycle);
    }
    for (const category of DEVICE_CATEGORY_VALUES) {
      const res = parseDeviceListFilters(url(`?category=${category}`));
      expect(res.ok, category).toBe(true);
      if (res.ok) expect(res.value.category).toBe(category);
    }
  });

  it("carries every supported key at once", () => {
    const res = parseDeviceListFilters(url("?lifecycle=OPERATIONAL&siteId=site-9&category=PLC&search=P-101"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual({
      lifecycle: "OPERATIONAL",
      siteId: "site-9",
      category: "PLC",
      search: "P-101",
    });
  });

  it.each([
    ["unknown category", "?category=ROBOT"],
    ["a gateway lifecycle on a device", "?lifecycle=REVOKED"],
    ["lower-case category", "?category=plc"],
    ["malformed site id", "?siteId=site%20one"],
  ])("refuses %s with 400", async (_label, qs) => {
    const res = parseDeviceListFilters(url(qs));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.response.status).toBe(400);
    expect((await res.response.json()).code).toBe("INVALID_QUERY_PARAMETER");
  });

  it("ignores a vendor parameter, because no vendor column is persisted", () => {
    // OtDeviceProfile stores no manufacturer, model or protocol. A vendor
    // filter could only ever match nothing, so it is deliberately unsupported
    // rather than accepted-and-useless.
    const res = parseDeviceListFilters(url("?vendor=Siemens&manufacturer=Siemens"));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual({});
  });
});

describe("94B.1 — the parser resolves no identity", () => {
  it("never reads an organization or actor from the query string", () => {
    // The identity parameters are constant; the lifecycle differs because the
    // two entities have DIFFERENT lifecycle enums — proof in itself that each
    // parser validates against its own allow-list rather than a shared one.
    const identity = "organizationId=org-VICTIM&userId=u-9&role=OWNER&allowedSiteIds=all";
    const parsed = [
      parseGatewayListFilters(url(`?${identity}&lifecycle=ACTIVE`)),
      parseDeviceListFilters(url(`?${identity}&lifecycle=OPERATIONAL`)),
    ];
    for (const res of parsed) {
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      const keys = Object.keys(res.value);
      // The real filter survived; only identity was dropped.
      expect(keys).toEqual(["lifecycle"]);
      expect(keys).not.toContain("organizationId");
      expect(keys).not.toContain("userId");
      expect(keys).not.toContain("role");
      expect(keys).not.toContain("allowedSiteIds");
    }
  });

  it("the module contains no identity vocabulary at all", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/ot-edge/http/list-filters.ts"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    for (const forbidden of [/organizationId/, /\buserId\b/, /allowedSiteIds/, /OrgPermission/]) {
      expect(src, `${forbidden} must not appear`).not.toMatch(forbidden);
    }
  });
});
