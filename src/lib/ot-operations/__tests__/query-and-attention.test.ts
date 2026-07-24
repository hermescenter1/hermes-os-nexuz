import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEVICE_CATEGORIES,
  DEVICE_LIFECYCLES,
  DEVICE_QUERY_KEYS,
  DEVICE_SORT_FIELDS,
  GATEWAY_CAPABILITIES,
  GATEWAY_LIFECYCLES,
  GATEWAY_QUERY_KEYS,
  GATEWAY_SORT_FIELDS,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
  type DeviceRow,
  type GatewayRow,
} from "../contract";
import {
  deviceRequestQuery,
  gatewayRequestQuery,
  hasActiveFilters,
  pageCount,
  readDeviceQuery,
  readGatewayQuery,
  withFilters,
  withPageSize,
  writeDeviceQuery,
  writeGatewayQuery,
} from "../query";
import {
  deviceAttention,
  deviceAttentionItems,
  gatewayAttention,
  gatewayAttentionItems,
  summariseDevices,
  summariseGateways,
} from "../attention";

/**
 * PHASE 94C1 — the pure logic behind the OT Edge UI.
 *
 * Three properties are pinned here, each of which the interface would otherwise
 * be able to violate silently:
 *
 *   1. the browser can only ever send a key the server honours — an unsupported
 *      key is ignored server-side, so emitting one would let the UI imply a
 *      narrowing that never happened;
 *   2. reading a URL and writing it are inverses, which is what makes refresh,
 *      Back/Forward and a pasted link reproduce the same result set;
 *   3. every "requires review" item is derived from a field the API genuinely
 *      returns, and none of them asserts a plant condition.
 *
 * The allow-lists are additionally pinned to the SERVER's own list-filter
 * module, so the two cannot drift into disagreement.
 */

const params = (qs: string) => new URLSearchParams(qs);

/* ── 1. The client mirrors the server contract exactly ──────────────────── */

describe("94C1 — the client contract mirrors the server's allow-lists", () => {
  const serverSource = readFileSync(
    resolve(process.cwd(), "src/lib/ot-edge/http/list-filters.ts"),
    "utf8",
  );

  /** Read an `as const` array literal out of the server module. */
  function serverList(name: string): string[] {
    const block = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`).exec(serverSource);
    if (!block) throw new Error(`${name} not found in the server list-filter module`);
    return [...block[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
  }

  it.each([
    ["GATEWAY_LIFECYCLE_VALUES", GATEWAY_LIFECYCLES],
    ["GATEWAY_CAPABILITY_VALUES", GATEWAY_CAPABILITIES],
    ["DEVICE_LIFECYCLE_VALUES", DEVICE_LIFECYCLES],
    ["DEVICE_CATEGORY_VALUES", DEVICE_CATEGORIES],
  ])("%s matches the client allow-list", (name, client) => {
    // Equality both ways: a value the server drops must stop being offered, and
    // a value it gains must not stay silently unavailable in the UI.
    expect([...client].sort()).toEqual(serverList(name as string).sort());
  });

  it("offers no gateway category filter and no device vendor filter", () => {
    // Neither is backed by a column, so a control for either would do nothing.
    expect(GATEWAY_QUERY_KEYS).not.toContain("category");
    expect(DEVICE_QUERY_KEYS).not.toContain("vendor");
    expect(DEVICE_QUERY_KEYS).not.toContain("manufacturer");
  });
});

/* ── 2. Serialization: only supported keys, and round-trip stability ────── */

describe("94C1 — gateway query serialization", () => {
  it("emits every supported filter and nothing else", () => {
    const state = readGatewayQuery(
      params("lifecycle=ACTIVE&siteId=site-1&capability=READ_ONLY_TELEMETRY&search=Line%201&page=2&pageSize=10&sortBy=updatedAt&sortDir=asc"),
    );
    const keys = [...new URLSearchParams(gatewayRequestQuery(state)).keys()].sort();
    expect(keys).toEqual([...GATEWAY_QUERY_KEYS].sort());
  });

  it("never emits an unsupported key, however the URL is crafted", () => {
    const hostile = readGatewayQuery(
      params("organizationId=org-X&userId=u-1&role=OWNER&category=PLC&vendor=Siemens&allowedSiteIds=all&lifecycle=ACTIVE"),
    );
    const emitted = [...new URLSearchParams(gatewayRequestQuery(hostile)).keys()];
    for (const forbidden of ["organizationId", "userId", "role", "allowedSiteIds", "category", "vendor"]) {
      expect(emitted, `${forbidden} was emitted`).not.toContain(forbidden);
    }
    // The legitimate filter survived — identity was dropped, not the request.
    expect(new URLSearchParams(gatewayRequestQuery(hostile)).get("lifecycle")).toBe("ACTIVE");
  });

  it("omits an empty filter instead of sending a blank value", () => {
    const cleared = readGatewayQuery(params("lifecycle=&siteId=&capability=&search="));
    const request = new URLSearchParams(gatewayRequestQuery(cleared));
    expect(request.has("lifecycle")).toBe(false);
    expect(request.has("siteId")).toBe(false);
    expect(request.has("capability")).toBe(false);
    expect(request.has("search")).toBe(false);
    // Paging is always stated, so the response never depends on a server default.
    expect(request.get("page")).toBe("1");
    expect(request.get("pageSize")).toBe("25");
  });

  it("reads and writes as inverses, so a link reproduces its result set", () => {
    for (const qs of [
      "",
      "lifecycle=STALE",
      "siteId=site-9&search=packing",
      "capability=SIMULATION&page=4",
      "lifecycle=ACTIVE&siteId=s1&capability=TAG_METADATA_IMPORT&search=line&page=3&pageSize=50&sortBy=lifecycle&sortDir=asc",
    ]) {
      const once = writeGatewayQuery(readGatewayQuery(params(qs)));
      const twice = writeGatewayQuery(readGatewayQuery(params(once)));
      expect(twice, `unstable round trip for "${qs}"`).toBe(once);
    }
  });

  it("drops a value the server would refuse rather than resending it", () => {
    // A hand-edited URL must degrade to "no filter", not to a guaranteed 400.
    const state = readGatewayQuery(params("lifecycle=RETIRED&capability=CONTROL_WRITE&siteId=has%20space"));
    expect(state.lifecycle).toBe("");
    expect(state.capability).toBe("");
    expect(state.siteId).toBe("");
  });

  it("keeps sorting inside the server's allow-list", () => {
    expect(readGatewayQuery(params("sortBy=name")).sortBy).toBe(GATEWAY_SORT_FIELDS[0]);
    expect(readGatewayQuery(params("sortBy=lifecycle")).sortBy).toBe("lifecycle");
    expect(readGatewayQuery(params("sortDir=sideways")).sortDir).toBe("desc");
    expect(readGatewayQuery(params("sortDir=asc")).sortDir).toBe("asc");
  });

  it("keeps pagination bounded", () => {
    expect(readGatewayQuery(params("page=0")).page).toBe(1);
    expect(readGatewayQuery(params("page=-5")).page).toBe(1);
    expect(readGatewayQuery(params("page=abc")).page).toBe(1);
    expect(readGatewayQuery(params("pageSize=99999")).pageSize).toBe(MAX_PAGE_SIZE);
    expect(readGatewayQuery(params("pageSize=0")).pageSize).toBe(25);
  });

  it("sends a long search term verbatim so the server can refuse it", () => {
    // Truncating here would return rows that do not match what was typed.
    const term = "x".repeat(MAX_SEARCH_LENGTH + 40);
    const sent = new URLSearchParams(gatewayRequestQuery(readGatewayQuery(params(`search=${term}`)))).get("search");
    expect(sent).toBe(term);
  });
});

describe("94C1 — device query serialization", () => {
  it("emits every supported filter and nothing else", () => {
    const state = readDeviceQuery(params("lifecycle=OPERATIONAL&siteId=s1&category=PLC&search=P-101"));
    const keys = [...new URLSearchParams(deviceRequestQuery(state)).keys()].sort();
    expect(keys).toEqual([...DEVICE_QUERY_KEYS].sort());
  });

  it("refuses a gateway lifecycle on a device, and vice versa", () => {
    // The two enums are disjoint; accepting either for the other would produce
    // a control that can only ever return nothing.
    expect(readDeviceQuery(params("lifecycle=REVOKED")).lifecycle).toBe("");
    expect(readGatewayQuery(params("lifecycle=OPERATIONAL")).lifecycle).toBe("");
  });

  it("keeps device sorting inside the allow-list", () => {
    expect(readDeviceQuery(params("sortBy=lifecycle")).sortBy).toBe(DEVICE_SORT_FIELDS[0]);
    expect(readDeviceQuery(params("sortBy=category")).sortBy).toBe("category");
  });

  it("reads and writes as inverses", () => {
    const once = writeDeviceQuery(readDeviceQuery(params("lifecycle=MAINTENANCE&category=HMI&page=2")));
    expect(writeDeviceQuery(readDeviceQuery(params(once)))).toBe(once);
  });
});

/* ── 3. State transitions ───────────────────────────────────────────────── */

describe("94C1 — filter and paging transitions", () => {
  it("returns to page 1 whenever a filter changes", () => {
    // Page 7 of a narrowed set usually does not exist; keeping the page is the
    // classic way to show an empty list for a filter that has results.
    const state = readGatewayQuery(params("page=7&lifecycle=ACTIVE"));
    expect(withFilters(state, { lifecycle: "STALE" }).page).toBe(1);
  });

  it("returns to page 1 when the page size changes", () => {
    const state = readGatewayQuery(params("page=5"));
    expect(withPageSize(state, 50)).toMatchObject({ page: 1, pageSize: 50 });
    // An unoffered size falls back rather than being sent.
    expect(withPageSize(state, 7).pageSize).toBe(25);
  });

  it("reports active filters without counting paging or sorting", () => {
    expect(hasActiveFilters(readGatewayQuery(params("page=3&sortDir=asc")))).toBe(false);
    expect(hasActiveFilters(readGatewayQuery(params("lifecycle=ACTIVE")))).toBe(true);
    expect(hasActiveFilters(readGatewayQuery(params("search=%20%20")))).toBe(false);
    expect(hasActiveFilters(readDeviceQuery(params("category=PLC")))).toBe(true);
  });

  it("never reports fewer than one page", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(1, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(Number.NaN, 25)).toBe(1);
  });
});

/* ── 4. Attention rules ─────────────────────────────────────────────────── */

const gateway = (over: Partial<GatewayRow> = {}): GatewayRow => ({
  id: "g-1",
  gatewayId: "reg-1",
  displayName: "Line 1 gateway",
  siteId: "site-1",
  lifecycle: "ACTIVE",
  environment: "PRODUCTION",
  capabilities: ["PROJECT_METADATA_IMPORT"],
  softwareVersion: "1.0.0",
  readOnlyMode: true,
  simulatorMode: false,
  disabled: false,
  signingConfigured: true,
  lastSeenAt: "2026-05-06T07:08:09.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-02T00:00:00.000Z",
  ...over,
});

const device = (over: Partial<DeviceRow> = {}): DeviceRow => ({
  id: "d-1",
  siteId: "site-1",
  assetId: "a-1",
  category: "PLC",
  lifecycle: "OPERATIONAL",
  networkZone: "CONTROL",
  safetyClass: "NON_SAFETY",
  firmwareVersion: "2.9.4",
  productFamily: "S7-1500",
  engineeringId: "PLC_01",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-02T00:00:00.000Z",
  ...over,
});

describe("94C1 — attention rules are deterministic and evidence-based", () => {
  it("flags nothing about a fully configured, observed gateway", () => {
    expect(gatewayAttention(gateway())).toEqual([]);
  });

  it.each([
    ["awaiting activation", { lifecycle: "REGISTERED" }, "GATEWAY_AWAITING_ACTIVATION"],
    ["marked stale", { lifecycle: "STALE" }, "GATEWAY_MARKED_STALE"],
    ["disabled", { lifecycle: "DISABLED" }, "GATEWAY_NOT_IN_SERVICE"],
    ["revoked", { lifecycle: "REVOKED" }, "GATEWAY_NOT_IN_SERVICE"],
    ["signing incomplete", { signingConfigured: false }, "GATEWAY_SIGNING_INCOMPLETE"],
    ["no capability", { capabilities: [] }, "GATEWAY_NO_CAPABILITY"],
    ["never observed", { lastSeenAt: null }, "GATEWAY_NEVER_OBSERVED"],
    ["no site", { siteId: null }, "GATEWAY_NO_SITE"],
  ])("flags a gateway that is %s", (_label, patch, reason) => {
    expect(gatewayAttention(gateway(patch as Partial<GatewayRow>))).toContain(reason);
  });

  it("produces the same result for the same input, every time", () => {
    const row = gateway({ lifecycle: "STALE", signingConfigured: false, lastSeenAt: null });
    const once = gatewayAttention(row);
    expect(gatewayAttention(row)).toEqual(once);
    expect(once).toEqual(["GATEWAY_MARKED_STALE", "GATEWAY_SIGNING_INCOMPLETE", "GATEWAY_NEVER_OBSERVED"]);
  });

  it("never emits a reason that asserts a plant or security condition", () => {
    // A configuration console must not diagnose the plant. If a future reason
    // introduces this vocabulary, it fails here rather than in production.
    const every = [
      ...gatewayAttention(gateway({ lifecycle: "REVOKED", signingConfigured: false, capabilities: [], lastSeenAt: null, siteId: null })),
      ...deviceAttention(device({ lifecycle: "UNKNOWN", siteId: null })),
    ].join(" ");
    for (const forbidden of ["OFFLINE", "FAULT", "OUTAGE", "COMPROMISE", "BREACH", "UNSAFE", "DOWN", "UNHEALTHY"]) {
      expect(every, `${forbidden} appears in an attention reason`).not.toContain(forbidden);
    }
  });

  it.each([
    ["lifecycle unknown", { lifecycle: "UNKNOWN" }, "DEVICE_LIFECYCLE_UNKNOWN"],
    ["planned", { lifecycle: "PLANNED" }, "DEVICE_NOT_COMMISSIONED"],
    ["commissioning", { lifecycle: "COMMISSIONING" }, "DEVICE_NOT_COMMISSIONED"],
    ["decommissioned", { lifecycle: "DECOMMISSIONED" }, "DEVICE_DECOMMISSIONED"],
    ["no site", { siteId: null }, "DEVICE_NO_SITE"],
  ])("flags a device that is %s", (_label, patch, reason) => {
    expect(deviceAttention(device(patch as Partial<DeviceRow>))).toContain(reason);
  });

  it("reports the full flagged count even when the list is truncated", () => {
    const rows = Array.from({ length: 9 }, (_, index) =>
      gateway({ id: `g-${index}`, lifecycle: "STALE" }),
    );
    const { items, total } = gatewayAttentionItems(rows, 3);
    expect(items).toHaveLength(3);
    // A truncated panel must not understate the situation.
    expect(total).toBe(9);
  });

  it("labels a device by its engineering identifier, never by an invented name", () => {
    const named = deviceAttentionItems([device({ lifecycle: "UNKNOWN", engineeringId: "PLC_07" })]);
    expect(named.items[0].label).toBe("PLC_07");
    const unnamed = deviceAttentionItems([device({ id: "d-9", lifecycle: "UNKNOWN", engineeringId: null })]);
    // The record id is the honest last resort — not "Unknown device".
    expect(unnamed.items[0].label).toBe("d-9");
  });
});

describe("94C1 — page summaries describe the page, not the tenant", () => {
  it("counts only the rows it was given, and echoes the server total", () => {
    const rows = [
      gateway({ id: "a", lifecycle: "ACTIVE" }),
      gateway({ id: "b", lifecycle: "REGISTERED", lastSeenAt: null }),
      gateway({ id: "c", lifecycle: "REVOKED", signingConfigured: false }),
    ];
    const summary = summariseGateways(rows, 412);
    expect(summary.shown).toBe(3);
    // The total is the SERVER's figure, never extrapolated from the page.
    expect(summary.total).toBe(412);
    expect(summary.inService).toBe(1);
    expect(summary.awaitingActivation).toBe(1);
    expect(summary.notInService).toBe(1);
    expect(summary.neverObserved).toBe(1);
    expect(summary.signingIncomplete).toBe(1);
  });

  it("counts distinct sites on the page without claiming a tenant site count", () => {
    const summary = summariseDevices(
      [device({ id: "1", siteId: "s1" }), device({ id: "2", siteId: "s1" }), device({ id: "3", siteId: "s2" }), device({ id: "4", siteId: null })],
      99,
    );
    expect(summary.sitesOnPage).toBe(2);
    expect(summary.shown).toBe(4);
    expect(summary.total).toBe(99);
  });
});
