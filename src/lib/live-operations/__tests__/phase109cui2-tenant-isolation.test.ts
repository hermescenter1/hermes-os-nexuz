/**
 * PHASE 109-C-UI.2 — tenant and site isolation, attacked at the feed.
 *
 * These tests drive `buildLiveOperationsFeed` with the industrial layer mocked,
 * because the boundary being tested is the one this module adds ON TOP of that
 * layer — specifically the re-attribution that closes the site-scope gap the
 * shared alert API has (recorded as F-02 in DISCOVERY.md).
 *
 * The mocks return DELIBERATELY LEAKY data: `getOrgAlerts` yields alerts for
 * assets in sites the reader cannot see, exactly as the real function does. A
 * test that mocked it to return only in-scope rows would prove nothing — it
 * would be asserting on its own fixture.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FILTER } from "../contract";

const NOW = 1_800_000_000_000;

/* ── the mocked world ─────────────────────────────────────────────────────── */

const state = {
  prisma: {} as unknown,
  allowedSiteIds: [] as string[],
  sites: [] as { id: string; name: string }[],
  assets: [] as { id: string; name: string; siteId: string }[],
  alerts: [] as Record<string, unknown>[],
};

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => state.prisma,
}));

vi.mock("@/lib/site/context", () => ({
  getAllowedSiteIds: async () => state.allowedSiteIds,
}));

vi.mock("@/lib/industrial/sites", () => ({
  // Mirrors the real contract: an empty allow-list yields nothing.
  listSites: async (_org: string, allowed?: string[]) =>
    allowed !== undefined && allowed.length === 0
      ? []
      : state.sites.filter((s) => allowed === undefined || allowed.includes(s.id)),
}));

vi.mock("@/lib/industrial/assets", () => ({
  listAssets: async (_org: string, opts?: { allowedSiteIds?: string[] }) =>
    opts?.allowedSiteIds !== undefined && opts.allowedSiteIds.length === 0
      ? []
      : state.assets.filter(
          (a) => opts?.allowedSiteIds === undefined || opts.allowedSiteIds.includes(a.siteId),
        ),
}));

vi.mock("@/lib/industrial/alerts", () => ({
  // THE LEAKY ONE. `getOrgAlerts` takes no site parameter and returns every
  // alert in the organisation — that is the real behaviour, reproduced here so
  // the boundary under test has something real to stop.
  getOrgAlerts: async () => state.alerts,
}));

const { buildLiveOperationsFeed } = await import("../feed");

const alert = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  organizationId: "org-a",
  assetId: "asset-a",
  alertType: "CRITICAL_RISK",
  severity: "HIGH",
  title: "t",
  description: "d",
  metadata: {},
  dismissed: false,
  dismissedAt: null,
  dismissedBy: null,
  resolvedAt: null,
  createdAt: new Date(NOW - 60_000).toISOString(),
  updatedAt: new Date(NOW - 60_000).toISOString(),
  ...over,
});

const run = (over: Partial<Parameters<typeof buildLiveOperationsFeed>[0]> = {}) =>
  buildLiveOperationsFeed({
    organizationId: "org-a",
    userId: "user-1",
    filter: DEFAULT_FILTER,
    nowEpochMs: NOW,
    ...over,
  });

beforeEach(() => {
  state.prisma = {};
  state.allowedSiteIds = ["site-a"];
  state.sites = [{ id: "site-a", name: "Site A" }];
  state.assets = [
    { id: "asset-a", name: "Pump A", siteId: "site-a" },
    { id: "asset-b", name: "Pump B", siteId: "site-b" }, // a site the reader cannot see
  ];
  state.alerts = [];
});

/* ── site isolation ───────────────────────────────────────────────────────── */

describe("109-C-UI.2 · site isolation the shared alert API does not provide", () => {
  it("drops an alert whose asset is on a site the reader cannot see", async () => {
    // `getOrgAlerts` hands us BOTH. Only one may survive.
    state.alerts = [
      alert({ id: "in-scope", assetId: "asset-a" }),
      alert({ id: "out-of-scope", assetId: "asset-b" }),
    ];

    const feed = await run();

    expect(feed.events.map((e) => e.id)).toEqual(["in-scope"]);
    expect(feed.events.some((e) => e.siteId === "site-b")).toBe(false);
  });

  it("drops an alert whose asset does not exist in scope at all", async () => {
    // An asset id that resolves to nothing cannot be proven in scope, so the
    // alert is dropped rather than shown unattributed.
    state.alerts = [alert({ id: "ghost", assetId: "asset-does-not-exist" })];
    const feed = await run();
    expect(feed.events).toEqual([]);
  });

  it("attributes a surviving alert to the site of its asset, not to the filter", async () => {
    state.alerts = [alert({ id: "in-scope", assetId: "asset-a" })];
    const feed = await run();
    expect(feed.events[0].siteId).toBe("site-a");
  });

  it("shows nothing at all when the reader has no site access", async () => {
    state.allowedSiteIds = [];
    state.alerts = [alert({ id: "in-scope", assetId: "asset-a" })];

    const feed = await run();

    expect(feed.events).toEqual([]);
    // And it says WHY, rather than looking like a quiet plant.
    expect(feed.allowedSiteIds).toEqual([]);
    expect(feed.eventsState).toBe("NO_DATA");
  });

  it("never widens an empty allow-list into every site", async () => {
    // The classic fail-open: treating [] as "unrestricted".
    state.allowedSiteIds = [];
    state.alerts = [
      alert({ id: "a", assetId: "asset-a" }),
      alert({ id: "b", assetId: "asset-b" }),
    ];
    const feed = await run();
    expect(feed.events).toEqual([]);
  });
});

/* ── the connection distinction, end to end ───────────────────────────────── */

describe("109-C-UI.2 · a disconnected feed never reads as a quiet plant", () => {
  it("reports NOT_CONNECTED rather than an empty result", async () => {
    state.prisma = null;
    state.alerts = [alert()];

    const feed = await run();

    expect(feed.connection).toBe("NOT_CONNECTED");
    expect(feed.eventsState).toBe("NOT_CONNECTED");
    expect(feed.eventsState).not.toBe("NO_DATA");
  });

  it("carries no readable number anywhere in the summary when disconnected", async () => {
    state.prisma = null;
    const feed = await run();

    for (const [name, metric] of Object.entries(feed.summary)) {
      expect(metric.state, name).toBe("NOT_CONNECTED");
      expect(metric.value, name).toBeNull();
    }
  });

  it("marks every source unreachable and the picture incomplete", async () => {
    state.prisma = null;
    const feed = await run();
    expect(feed.sources.length).toBeGreaterThan(0);
    for (const s of feed.sources) expect(s.connection).toBe("NOT_CONNECTED");
  });

  it("reports NO_DATA — not NOT_CONNECTED — when connected and genuinely empty", async () => {
    state.alerts = [];
    const feed = await run();
    expect(feed.connection).toBe("CONNECTED");
    expect(feed.eventsState).toBe("NO_DATA");
  });
});

/* ── nothing is fabricated ────────────────────────────────────────────────── */

describe("109-C-UI.2 · the feed invents nothing", () => {
  it("emits only PLANT_RECORD events — never a catalogue entry", async () => {
    state.alerts = [alert({ id: "in-scope", assetId: "asset-a" })];
    const feed = await run();
    for (const e of feed.events) expect(e.origin).toBe("PLANT_RECORD");
  });

  it("drops a record whose server timestamp cannot be parsed rather than guessing now", async () => {
    // Defaulting to `Date.now()` would fabricate recency and put an undated
    // record at the top of an operations list.
    state.alerts = [alert({ id: "undated", assetId: "asset-a", createdAt: "not-a-date" })];
    const feed = await run();
    expect(feed.events).toEqual([]);
  });

  it("drops a record whose severity is not in the closed set", async () => {
    state.alerts = [alert({ id: "weird", assetId: "asset-a", severity: "URGENT" })];
    const feed = await run();
    expect(feed.events).toEqual([]);
  });

  it("declares the capabilities this deployment does not have", async () => {
    const feed = await run();
    expect(feed.unavailableCapabilities).toContain("liveStream");
    expect(feed.unavailableCapabilities).toContain("safeActionExecution");
    expect(feed.unavailableCapabilities).toContain("acknowledgeFromThisSurface");
  });

  it("derives acknowledgement from the record, never from an assumption", async () => {
    state.alerts = [
      alert({ id: "open", assetId: "asset-a" }),
      alert({ id: "ack", assetId: "asset-a", dismissed: true, dismissedBy: "u2" }),
      alert({ id: "done", assetId: "asset-a", resolvedAt: new Date(NOW).toISOString() }),
    ];
    const feed = await run();
    const byId = new Map(feed.events.map((e) => [e.id, e]));
    expect(byId.get("open")!.acknowledgement).toBe("UNACKNOWLEDGED");
    expect(byId.get("ack")!.acknowledgement).toBe("ACKNOWLEDGED");
    expect(byId.get("done")!.acknowledgement).toBe("RESOLVED");
    expect(byId.get("ack")!.owner).toBe("u2");
    expect(byId.get("open")!.owner).toBeNull();
  });
});
