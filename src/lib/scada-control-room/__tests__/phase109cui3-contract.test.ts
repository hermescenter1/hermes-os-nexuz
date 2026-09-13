/**
 * PHASE 109-C-UI.3 — the connectivity derivation, pinned.
 *
 * These are the assertions that stop the page inventing plant state. The single
 * most important one is the first: the stored `ONLINE` column must NOT be able
 * to make a long-dead gateway read as connected, because the repository writes
 * that column on every heartbeat and never takes it back.
 */

import { describe, expect, it } from "vitest";
import {
  CONNECTIVITY_STATES,
  FRESH_WITHIN_MS,
  STALE_AFTER_MS,
  UNAVAILABLE_CAPABILITIES,
  deriveConnectivity,
  rollupConnectivity,
} from "../contract";

const NOW = Date.UTC(2026, 8, 11, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("109-C-UI.3 · a stale heartbeat cannot read as connected", () => {
  it("a gateway stored ONLINE but silent for two hours is NOT_CONNECTED", () => {
    /*
      The defect this whole contract exists for. `touchGatewayHeartbeat` writes
      ONLINE and nothing ever writes it back, so trusting the column would show
      a dead gateway as live indefinitely.
    */
    const v = deriveConnectivity({
      storedStatus: "ONLINE",
      lastSeenAt: ago(2 * 60 * 60 * 1000),
      revokedAt: null,
      nowMs: NOW,
    });
    expect(v.state).toBe("NOT_CONNECTED");
    expect(v.reason).toBe("HEARTBEAT_EXPIRED");
    // The column is still carried, so the screen can show what was stored.
    expect(v.storedStatus).toBe("ONLINE");
  });

  it("a gateway stored ONLINE and silent past the fresh window is DEGRADED", () => {
    const v = deriveConnectivity({
      storedStatus: "ONLINE",
      lastSeenAt: ago(FRESH_WITHIN_MS + 60_000),
      revokedAt: null,
      nowMs: NOW,
    });
    expect(v.state).toBe("DEGRADED");
    expect(v.reason).toBe("HEARTBEAT_STALE");
  });

  it("a fresh heartbeat is CONNECTED, and that is the only way to get there", () => {
    const v = deriveConnectivity({
      storedStatus: "ONLINE",
      lastSeenAt: ago(60_000),
      revokedAt: null,
      nowMs: NOW,
    });
    expect(v.state).toBe("CONNECTED");
    expect(v.reason).toBe("HEARTBEAT_FRESH");
  });

  it("no input without a fresh heartbeat can produce CONNECTED", () => {
    // Exhaustive over the stored column, with every non-fresh timestamp shape.
    const stored = ["ONLINE", "OFFLINE", "DEGRADED", "REVOKED"] as const;
    const times = [null, ago(STALE_AFTER_MS + 1), ago(FRESH_WITHIN_MS + 1), "not-a-date"];
    for (const s of stored) {
      for (const t of times) {
        const v = deriveConnectivity({
          storedStatus: s, lastSeenAt: t, revokedAt: null, nowMs: NOW,
        });
        expect(v.state, `${s} @ ${String(t)}`).not.toBe("CONNECTED");
      }
    }
  });
});

describe("109-C-UI.3 · UNKNOWN means we are blind, not that the plant is down", () => {
  it("an unreadable backend is UNKNOWN, never NOT_CONNECTED", () => {
    const v = deriveConnectivity({
      storedStatus: "ONLINE",
      lastSeenAt: ago(1000),
      revokedAt: null,
      nowMs: NOW,
      dataAvailable: false,
    });
    expect(v.state).toBe("UNKNOWN");
    expect(v.reason).toBe("DATA_UNAVAILABLE");
    // Nothing about the gateway is asserted when we could not read it.
    expect(v.storedStatus).toBeNull();
  });

  it("an unparseable timestamp is UNKNOWN, not a dead gateway", () => {
    const v = deriveConnectivity({
      storedStatus: "ONLINE", lastSeenAt: "yesterday", revokedAt: null, nowMs: NOW,
    });
    expect(v.state).toBe("UNKNOWN");
  });
});

describe("109-C-UI.3 · deliberate states stay distinguishable from faults", () => {
  it("a revoked gateway is NOT_CONNECTED with reason REVOKED", () => {
    const v = deriveConnectivity({
      storedStatus: "ONLINE", lastSeenAt: ago(1000), revokedAt: ago(500), nowMs: NOW,
    });
    expect(v.state).toBe("NOT_CONNECTED");
    // An operator must not chase a network fault that is an admin decision.
    expect(v.reason).toBe("REVOKED");
  });

  it("a gateway that never reported is NOT_CONNECTED, not UNKNOWN", () => {
    // This IS knowable: it was created and has never spoken.
    const v = deriveConnectivity({
      storedStatus: "OFFLINE", lastSeenAt: null, revokedAt: null, nowMs: NOW,
    });
    expect(v.state).toBe("NOT_CONNECTED");
    expect(v.reason).toBe("NEVER_REPORTED");
  });

  it("a clock-skewed future heartbeat is clamped, not negative", () => {
    const v = deriveConnectivity({
      storedStatus: "ONLINE",
      lastSeenAt: new Date(NOW + 60_000).toISOString(),
      revokedAt: null,
      nowMs: NOW,
    });
    expect(v.ageMs).toBe(0);
    expect(v.state).toBe("CONNECTED");
  });
});

describe("109-C-UI.3 · the site rollup reports the worst, not the kindest", () => {
  const fresh = deriveConnectivity({ storedStatus: "ONLINE", lastSeenAt: ago(1000), revokedAt: null, nowMs: NOW });
  const dead = deriveConnectivity({ storedStatus: "ONLINE", lastSeenAt: ago(STALE_AFTER_MS + 1), revokedAt: null, nowMs: NOW });
  const blind = deriveConnectivity({ storedStatus: null, lastSeenAt: null, revokedAt: null, nowMs: NOW, dataAvailable: false });

  it("one dead gateway makes the site NOT_CONNECTED", () => {
    expect(rollupConnectivity([fresh, dead]).state).toBe("NOT_CONNECTED");
  });

  it("a known bad state outranks UNKNOWN — the operator must see the fault", () => {
    expect(rollupConnectivity([blind, dead]).state).toBe("NOT_CONNECTED");
  });

  it("a site with no gateways at all is UNKNOWN, never CONNECTED", () => {
    const r = rollupConnectivity([]);
    expect(r.state).toBe("UNKNOWN");
    expect(r.reason).toBe("DATA_UNAVAILABLE");
  });

  it("all fresh is CONNECTED", () => {
    expect(rollupConnectivity([fresh, fresh]).state).toBe("CONNECTED");
  });
});

describe("109-C-UI.3 · the vocabulary is closed", () => {
  it("exactly the four states the brief names", () => {
    expect([...CONNECTIVITY_STATES]).toEqual([
      "CONNECTED", "DEGRADED", "NOT_CONNECTED", "UNKNOWN",
    ]);
  });

  it("the missing capabilities are declared, not silently omitted", () => {
    // A panel that is absent reads as "nothing to report". These three are
    // rendered as explicit DATA_UNAVAILABLE instead.
    expect([...UNAVAILABLE_CAPABILITIES]).toEqual([
      "PRODUCTION_LINES", "LIVE_ALARM_EVENTS", "LIVE_PLC_DIAGNOSTICS",
    ]);
  });

  it("the fresh window is shorter than the stale window", () => {
    expect(FRESH_WITHIN_MS).toBeLessThan(STALE_AFTER_MS);
  });
});
