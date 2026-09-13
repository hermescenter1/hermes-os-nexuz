/**
 * PHASE 109-C-UI.3 — tenant and site isolation in the view builder.
 *
 * The fake below records every `where` clause it is handed, so these tests
 * assert the SHAPE OF THE QUERY rather than the shape of the result. That
 * distinction is the whole point: a builder that fetched everything and filtered
 * afterwards would return identical rows here and still be wrong, because any
 * future `take`, count or pagination would describe records the caller may not
 * see. Phase 109-C-UI.2 closed exactly that defect on the alerts feed (F-02).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as { model: string; args: Record<string, unknown> }[],
  rows: {} as Record<string, Record<string, unknown>[]>,
  clientAvailable: true,
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => {
    if (!h.clientAvailable) return null;
    const model = (name: string) => ({
      findMany: async (args: Record<string, unknown>) => {
        h.calls.push({ model: name, args });
        const rows = h.rows[name] ?? [];
        // Honour `take` the way PostgreSQL would, so a cap is observable here.
        return typeof args.take === "number" ? rows.slice(0, args.take) : rows;
      },
    });
    return {
      industrialSite: model("industrialSite"),
      industrialGateway: model("industrialGateway"),
      industrialNetworkNode: model("industrialNetworkNode"),
      alarmDefinition: model("alarmDefinition"),
    };
  },
}));

const { buildControlRoomView } = await import("../view");

const NOW = Date.UTC(2026, 8, 11, 12, 0, 0);
const whereFor = (model: string) =>
  (h.calls.find((c) => c.model === model)?.args.where ?? null) as Record<string, unknown> | null;

beforeEach(() => {
  h.calls = [];
  h.clientAvailable = true;
  h.rows = {
    industrialSite: [{ id: "site-a", name: "Site A", status: "ACTIVE" }],
    industrialGateway: [
      {
        id: "gw-1", name: "GW 1", gatewayId: "SN-1", siteId: "site-a",
        version: "1.2.3", status: "ONLINE",
        lastSeenAt: new Date(NOW - 60_000), revokedAt: null,
      },
    ],
    industrialNetworkNode: [{ protocol: "OPC_UA" }, { protocol: "OPC_UA" }, { protocol: "MQTT" }],
    alarmDefinition: [
      {
        id: "al-1", code: "E100", severity: "HIGH", message: "Pump overload",
        requiresAck: true, safetyClass: "SIL2", createdAt: new Date(NOW - 86_400_000),
      },
    ],
  };
});

const ENG = { engineeringPermitted: true } as const;

describe("109-C-UI.3 · the tenant boundary is in the query", () => {
  it("every read pins organizationId — none is filtered afterwards", async () => {
    await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW, ...ENG });
    for (const model of ["industrialSite", "industrialGateway", "industrialNetworkNode", "alarmDefinition"]) {
      expect(whereFor(model), model).toMatchObject({ organizationId: "org-a" });
    }
  });

  it("the site read is narrowed to the granted sites, not merely ordered by them", async () => {
    await buildControlRoomView({
      organizationId: "org-a", allowedSiteIds: ["site-a", "site-b"], nowMs: NOW,
    });
    expect(whereFor("industrialSite")).toMatchObject({
      organizationId: "org-a",
      id: { in: ["site-a", "site-b"] },
    });
  });

  it("the gateway read carries BOTH predicates", async () => {
    await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW });
    // Organisation alone was the F-02 defect; the site list alone would cross
    // tenants if two organisations ever shared a site id.
    expect(whereFor("industrialGateway")).toMatchObject({
      organizationId: "org-a",
      siteId: { in: ["site-a"] },
    });
  });

  it("an empty grant list reads NOTHING — it never means unrestricted", async () => {
    const view = await buildControlRoomView({
      organizationId: "org-a", allowedSiteIds: [], nowMs: NOW,
    });
    // Not one query was issued. Fail-closed before the database, not after it.
    expect(h.calls).toHaveLength(0);
    expect(view.sites).toEqual([]);
  });

  it("gateways are only attached to the site they belong to", async () => {
    h.rows.industrialSite = [
      { id: "site-a", name: "Site A", status: "ACTIVE" },
      { id: "site-b", name: "Site B", status: "ACTIVE" },
    ];
    h.rows.industrialGateway = [
      { id: "gw-a", name: "A", gatewayId: "SN-A", siteId: "site-a", version: null, status: "ONLINE", lastSeenAt: new Date(NOW), revokedAt: null },
      { id: "gw-b", name: "B", gatewayId: "SN-B", siteId: "site-b", version: null, status: "ONLINE", lastSeenAt: new Date(NOW), revokedAt: null },
    ];
    const view = await buildControlRoomView({
      organizationId: "org-a", allowedSiteIds: ["site-a", "site-b"], nowMs: NOW,
    });
    expect(view.sites.find((s) => s.id === "site-a")!.gateways.map((g) => g.id)).toEqual(["gw-a"]);
    expect(view.sites.find((s) => s.id === "site-b")!.gateways.map((g) => g.id)).toEqual(["gw-b"]);
  });
});

describe("109-C-UI.3 · secrets never reach the view", () => {
  it("the gateway projection does not select apiKeyId", async () => {
    await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW });
    const select = h.calls.find((c) => c.model === "industrialGateway")!.args.select as Record<string, unknown>;
    // That column binds a gateway to an API key. Publishing it would tell a
    // reader which credential to target.
    expect(select.apiKeyId).toBeUndefined();
    expect(Object.keys(select)).not.toContain("metadata");
  });

  it("no serialized view carries an apiKey-shaped field", async () => {
    h.rows.industrialGateway[0].apiKeyId = "key-should-never-surface";
    const view = await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW });
    expect(JSON.stringify(view)).not.toContain("key-should-never-surface");
  });
});

describe("109-C-UI.3 · an unreadable backend produces nothing, not a calm screen", () => {
  it("no database client yields an empty view rather than invented rows", async () => {
    h.clientAvailable = false;
    const view = await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW });
    expect(view.sites).toEqual([]);
    expect(view.protocols).toEqual([]);
    expect(view.alarmDefinitions).toEqual([]);
    // The missing capabilities are still declared, so the page still explains
    // itself instead of rendering blank.
    expect(view.unavailable.length).toBeGreaterThan(0);
  });
});

describe("109-C-UI.3 · nothing is fabricated", () => {
  it("protocol counts are of DECLARED nodes, and bounded", async () => {
    const view = await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW, ...ENG });
    expect(view.protocols).toEqual([
      { protocol: "OPC_UA", nodeCount: 2 },
      { protocol: "MQTT", nodeCount: 1 },
    ]);
    const call = h.calls.find((c) => c.model === "industrialNetworkNode")!.args;
    expect(call.take).toBeTypeOf("number");
    // A window with no ORDER BY is a different 500 rows on every render, and
    // a count that changes between two reloads of an unchanged table is not
    // a count.
    expect(call.orderBy).toEqual({ id: "asc" });
    expect(view.protocolsTruncated).toBe(false);
  });

  it("a protocol scan that hits its cap is flagged, and the cap is what is counted", async () => {
    h.rows.industrialNetworkNode = Array.from({ length: 501 }, () => ({ protocol: "MODBUS_TCP" }));
    const view = await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW, ...ENG });
    expect(view.protocolsTruncated).toBe(true);
    expect(view.protocols).toEqual([{ protocol: "MODBUS_TCP", nodeCount: 500 }]);
  });

  it("an alarm definition is DECLARED, never measured — it cannot read as active", async () => {
    const view = await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW, ...ENG });
    const a = view.alarmDefinitions[0];
    expect(a.provenance.source).toBe("ENGINEERING_IMPORT");
    expect(a.provenance.uncertainty).toBe("DECLARED");
    // There is no evaluator anywhere in the platform, so there is no field here
    // that could ever say "firing".
    expect(Object.keys(a)).not.toContain("active");
    expect(Object.keys(a)).not.toContain("state");
  });

  it("a site with no gateway rolls up UNKNOWN, never CONNECTED", async () => {
    h.rows.industrialGateway = [];
    const view = await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW });
    expect(view.sites[0].rollup.state).toBe("UNKNOWN");
  });

  it("the alarm read is bounded, so one render cannot pull an unbounded table", async () => {
    await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW, ...ENG });
    expect(h.calls.find((c) => c.model === "alarmDefinition")!.args.take).toBeTypeOf("number");
  });

  it("the alarm window keeps the MOST severe rows — severity is ordered descending", async () => {
    /*
      `severity` is a PostgreSQL enum declared INFO..CRITICAL and an enum
      orders by declaration. `asc` with a page cap dropped the CRITICAL rows
      first — the exact rows an operator opens this panel to confirm.
    */
    await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW, ...ENG });
    const call = h.calls.find((c) => c.model === "alarmDefinition")!.args;
    expect(call.orderBy).toEqual([{ severity: "desc" }, { code: "asc" }]);
  });

  it("a capped alarm list is flagged and shows exactly the page, never the sentinel row", async () => {
    h.rows.alarmDefinition = Array.from({ length: 51 }, (_, i) => ({
      id: `al-${i}`, code: `E${i}`, severity: "CRITICAL", message: null,
      requiresAck: false, safetyClass: "UNKNOWN", createdAt: new Date(NOW),
    }));
    const view = await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW, ...ENG });
    expect(view.alarmsTruncated).toBe(true);
    expect(view.alarmDefinitions).toHaveLength(50);
    h.rows.alarmDefinition = h.rows.alarmDefinition.slice(0, 50);
    const exact = await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW, ...ENG });
    expect(exact.alarmsTruncated).toBe(false);
    expect(exact.alarmDefinitions).toHaveLength(50);
  });
});

describe("109-C-UI.3 · the engineering half follows its own permission", () => {
  it("without view_engineering_project the alarm and node reads are NEVER issued", async () => {
    const view = await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW });
    // Not hidden after the fact — not read. The registry half still renders.
    expect(h.calls.map((c) => c.model)).toEqual(["industrialSite", "industrialGateway"]);
    expect(view.engineeringPermitted).toBe(false);
    expect(view.alarmDefinitions).toEqual([]);
    expect(view.protocols).toEqual([]);
    expect(view.sites).toHaveLength(1);
  });

  it("the permission defaults CLOSED — omitting it is the same as lacking it", async () => {
    const view = await buildControlRoomView({
      organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW,
      engineeringPermitted: undefined,
    });
    expect(view.engineeringPermitted).toBe(false);
    expect(h.calls.some((c) => c.model === "alarmDefinition")).toBe(false);
  });

  it("with the permission both engineering reads are issued, still organisation-scoped", async () => {
    await buildControlRoomView({ organizationId: "org-a", allowedSiteIds: ["site-a"], nowMs: NOW, ...ENG });
    expect(whereFor("alarmDefinition")).toMatchObject({ organizationId: "org-a" });
    expect(whereFor("industrialNetworkNode")).toMatchObject({ organizationId: "org-a" });
  });
});
