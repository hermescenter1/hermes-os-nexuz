/**
 * Executive Management Center — the read-through cache (requirement row 11).
 *
 * A cache in front of a tenant-isolated, permission-gated surface is a security
 * boundary, so these tests are about WHO can be served WHICH entry, not about
 * speed. The questions each case answers:
 *
 *   * does a reader with a different access shape get a different entry?
 *   * does a write make the previous answer unreachable?
 *   * does losing a permission stop the reader reaching what they could see?
 *   * does the TTL actually expire?
 *   * is the reader told how old the figures are?
 *   * is the FROZEN report left out of all of this?
 *
 * The build function is injected, so a "recomputation" is observable by
 * counting calls rather than by timing anything.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CACHE_STALE_AFTER_SECONDS,
  CACHE_TTL_SECONDS,
  executiveCacheKeyMaterial,
  invalidateExecutiveSummary,
  readExecutiveSummary,
} from "../cache";
import { resolveRange, type ExecutiveRange } from "../period";
import type { ExecutiveScope } from "../contract";
import type { ExecutiveSummary } from "../summary";

const NOW = Date.UTC(2026, 9, 13, 9, 30, 0);

/** A distinct organization per test, so entries cannot collide between cases. */
let seq = 0;
const nextOrg = () => `org-cache-${(seq += 1)}`;

function scopeOf(over: Partial<ExecutiveScope> = {}): ExecutiveScope {
  return {
    userId: "user-1",
    organizationId: "org-a",
    memberId: "member-1",
    role: "OWNER",
    authority: { operations: true, financial: true, industrial: true },
    allowedSiteIds: ["site-1", "site-2"],
    timeZone: "Asia/Tehran",
    dayCutoffMinutes: 0,
    correlationId: "corr-1",
    ...over,
  } as ExecutiveScope;
}

/** Counts its calls and stamps each answer, so a served copy is identifiable. */
function builder(label = "build") {
  let calls = 0;
  const build = async (a: { scope: ExecutiveScope; nowMs: number }): Promise<ExecutiveSummary> => {
    calls += 1;
    return {
      generatedAtIso: new Date(a.nowMs).toISOString(),
      range: "today",
      period: { current: {}, baseline: {} },
      timeZone: a.scope.timeZone,
      authority: a.scope.authority,
      sections: {
        operations: { status: "OPERATIONAL" },
        financial: { status: "OPERATIONAL" },
        industrial: { status: "OPERATIONAL" },
        customers: { status: "OPERATIONAL" },
      },
      actions: { status: "OPERATIONAL" },
      // Marks WHICH computation this payload came from.
      marker: `${label}-${calls}`,
    } as unknown as ExecutiveSummary;
  };
  return { build, get calls() { return calls; } };
}

const markerOf = (s: ExecutiveSummary) => (s as unknown as { marker: string }).marker;

const keyOf = (scope: ExecutiveScope, range: ExecutiveRange = "today", generation = 0) =>
  executiveCacheKeyMaterial({
    scope,
    range,
    window: resolveRange({ range, nowMs: NOW, timeZone: scope.timeZone, cutoffMinutes: scope.dayCutoffMinutes }),
    generation,
  });

describe("executive summary cache — the key separates readers who may see different things", () => {
  const base = scopeOf();

  it("gives two readers with the SAME access shape the same key", () => {
    // Identity, membership and the request correlation are NOT part of it: a
    // management team watching one screen must share one computation.
    const other = scopeOf({ userId: "user-2", memberId: "member-2", correlationId: "corr-2" });
    expect(keyOf(other)).toBe(keyOf(base));
  });

  it.each([
    ["organization", scopeOf({ organizationId: "org-b" })],
    ["role", scopeOf({ role: "MEMBER" as ExecutiveScope["role"] })],
    ["the operations axis", scopeOf({ authority: { operations: false, financial: true, industrial: true } })],
    ["the financial axis", scopeOf({ authority: { operations: true, financial: false, industrial: true } })],
    ["the industrial axis", scopeOf({ authority: { operations: true, financial: true, industrial: false } })],
    ["a removed site", scopeOf({ allowedSiteIds: ["site-1"] })],
    ["an added site", scopeOf({ allowedSiteIds: ["site-1", "site-2", "site-3"] })],
    ["the reporting zone", scopeOf({ timeZone: "Europe/Berlin" })],
    ["the day cutoff", scopeOf({ dayCutoffMinutes: 360 })],
  ])("gives a different key when %s differs", (_label, other) => {
    expect(keyOf(other)).not.toBe(keyOf(base));
  });

  it("gives a different key for a different range and for a different generation", () => {
    // Every range the contract actually defines, against "today". A string the
    // union does not contain would type-check nowhere and prove nothing.
    expect(keyOf(base, "last7Days")).not.toBe(keyOf(base, "today"));
    expect(keyOf(base, "last30Days")).not.toBe(keyOf(base, "today"));
    expect(keyOf(base, "last30Days")).not.toBe(keyOf(base, "last7Days"));
    expect(keyOf(base, "today", 1)).not.toBe(keyOf(base, "today", 0));
  });

  it("does not depend on the ORDER of the permitted sites", () => {
    expect(keyOf(scopeOf({ allowedSiteIds: ["site-2", "site-1"] }))).toBe(keyOf(base));
  });

  it("changes when the window starts somewhere else, even at the same instant", () => {
    // Same clock, different business day: the cutoff moves the window start.
    const a = resolveRange({ range: "today", nowMs: NOW, timeZone: "Asia/Tehran", cutoffMinutes: 0 });
    const b = resolveRange({ range: "today", nowMs: NOW, timeZone: "Asia/Tehran", cutoffMinutes: 720 });
    expect(a.current.fromIso).not.toBe(b.current.fromIso);
    const scope = scopeOf();
    expect(executiveCacheKeyMaterial({ scope, range: "today", window: a, generation: 0 })).not.toBe(
      executiveCacheKeyMaterial({ scope, range: "today", window: b, generation: 0 }),
    );
  });
});

describe("executive summary cache — serving, ageing and expiry", () => {
  beforeEach(() => {
    expect(CACHE_TTL_SECONDS).toBeGreaterThan(0);
  });

  it("computes once and serves the SAME payload again inside the TTL", async () => {
    const scope = scopeOf({ organizationId: nextOrg() });
    const b = builder();

    const first = await readExecutiveSummary({ scope, range: "today", nowMs: NOW, build: b.build });
    expect(first.cache.hit).toBe(false);
    expect(first.cache.ageSeconds).toBe(0);
    expect(first.cache.stale).toBe(false);

    const second = await readExecutiveSummary({ scope, range: "today", nowMs: NOW + 1_000, build: b.build });
    expect(b.calls).toBe(1);
    expect(second.cache.hit).toBe(true);
    expect(second.cache.ageSeconds).toBe(1);
    // The SAME computation, not a recomputation that happens to look alike.
    expect(markerOf(second.summary)).toBe(markerOf(first.summary));
    // And it reports when it was computed, not when it was served.
    expect(second.cache.computedAtIso).toBe(first.summary.generatedAtIso);
  });

  it("marks the figures stale once they pass the stale threshold, while still serving them", async () => {
    const scope = scopeOf({ organizationId: nextOrg() });
    const b = builder();
    await readExecutiveSummary({ scope, range: "today", nowMs: NOW, build: b.build });

    const justBefore = await readExecutiveSummary({
      scope,
      range: "today",
      nowMs: NOW + (CACHE_STALE_AFTER_SECONDS - 1) * 1_000,
      build: b.build,
    });
    expect(justBefore.cache.hit).toBe(true);
    expect(justBefore.cache.stale).toBe(false);

    const after = await readExecutiveSummary({
      scope,
      range: "today",
      nowMs: NOW + CACHE_STALE_AFTER_SECONDS * 1_000,
      build: b.build,
    });
    expect(after.cache.hit).toBe(true);
    expect(after.cache.stale).toBe(true);
    expect(b.calls).toBe(1);
  });

  it("recomputes once the TTL has passed", async () => {
    const scope = scopeOf({ organizationId: nextOrg() });
    const b = builder();
    const first = await readExecutiveSummary({ scope, range: "today", nowMs: NOW, build: b.build });

    const expired = await readExecutiveSummary({
      scope,
      range: "today",
      nowMs: NOW + (CACHE_TTL_SECONDS + 1) * 1_000,
      build: b.build,
    });
    expect(b.calls).toBe(2);
    expect(expired.cache.hit).toBe(false);
    expect(markerOf(expired.summary)).not.toBe(markerOf(first.summary));
  });

  it("serves each range from its own entry", async () => {
    const scope = scopeOf({ organizationId: nextOrg() });
    const b = builder();
    await readExecutiveSummary({ scope, range: "today", nowMs: NOW, build: b.build });
    const week = await readExecutiveSummary({ scope, range: "last7Days", nowMs: NOW, build: b.build });
    expect(week.cache.hit).toBe(false);
    const month = await readExecutiveSummary({ scope, range: "last30Days", nowMs: NOW, build: b.build });
    expect(month.cache.hit).toBe(false);
    expect(b.calls).toBe(3);
    // And each is then served from its OWN entry, not from the newest one.
    expect((await readExecutiveSummary({ scope, range: "today", nowMs: NOW, build: b.build })).cache.hit).toBe(true);
    expect((await readExecutiveSummary({ scope, range: "last7Days", nowMs: NOW, build: b.build })).cache.hit).toBe(true);
    expect(b.calls).toBe(3);
  });
});

describe("executive summary cache — invalidation and tenant isolation", () => {
  it("stops serving the previous answer after a write", async () => {
    const organizationId = nextOrg();
    const scope = scopeOf({ organizationId });
    const b = builder();
    const before = await readExecutiveSummary({ scope, range: "today", nowMs: NOW, build: b.build });
    expect((await readExecutiveSummary({ scope, range: "today", nowMs: NOW, build: b.build })).cache.hit).toBe(true);

    // What `createCustomer`, `updateCustomer` and `addInteraction` call.
    await invalidateExecutiveSummary(organizationId);

    const after = await readExecutiveSummary({ scope, range: "today", nowMs: NOW, build: b.build });
    expect(after.cache.hit).toBe(false);
    expect(markerOf(after.summary)).not.toBe(markerOf(before.summary));
    expect(b.calls).toBe(2);
  });

  it("invalidates ONE organization and leaves the others alone", async () => {
    const a = scopeOf({ organizationId: nextOrg() });
    const other = scopeOf({ organizationId: nextOrg() });
    const ba = builder("a");
    const bb = builder("b");
    await readExecutiveSummary({ scope: a, range: "today", nowMs: NOW, build: ba.build });
    await readExecutiveSummary({ scope: other, range: "today", nowMs: NOW, build: bb.build });

    await invalidateExecutiveSummary(a.organizationId);

    expect((await readExecutiveSummary({ scope: a, range: "today", nowMs: NOW, build: ba.build })).cache.hit).toBe(false);
    expect((await readExecutiveSummary({ scope: other, range: "today", nowMs: NOW, build: bb.build })).cache.hit).toBe(true);
  });

  it("never serves one organization's entry to another", async () => {
    const a = scopeOf({ organizationId: nextOrg() });
    const b = scopeOf({ organizationId: nextOrg() });
    const ba = builder("tenant-a");
    const bb = builder("tenant-b");

    const first = await readExecutiveSummary({ scope: a, range: "today", nowMs: NOW, build: ba.build });
    const second = await readExecutiveSummary({ scope: b, range: "today", nowMs: NOW, build: bb.build });

    expect(second.cache.hit).toBe(false);
    expect(markerOf(second.summary)).toBe("tenant-b-1");
    expect(markerOf(first.summary)).toBe("tenant-a-1");
  });

  it("does not let a reader who LOST an axis read the answer built while they had it", async () => {
    const organizationId = nextOrg();
    const full = scopeOf({ organizationId });
    const b = builder("full");
    const privileged = await readExecutiveSummary({ scope: full, range: "today", nowMs: NOW, build: b.build });
    expect(markerOf(privileged.summary)).toBe("full-1");

    // The same person a moment later, with the financial axis revoked. The
    // gate would already have recomputed their scope; the cache must not hand
    // them the entry that was built with the axis they no longer have.
    const reduced = scopeOf({
      organizationId,
      authority: { operations: true, financial: false, industrial: true },
    });
    const after = builder("reduced");
    const result = await readExecutiveSummary({ scope: reduced, range: "today", nowMs: NOW, build: after.build });

    expect(result.cache.hit).toBe(false);
    expect(markerOf(result.summary)).toBe("reduced-1");
    expect(result.summary.authority.financial).toBe(false);
  });
});

describe("executive summary cache — a failure is never stored", () => {
  it("does not cache a summary with an UNAVAILABLE section, so recovery is immediate", async () => {
    const scope = scopeOf({ organizationId: nextOrg() });
    let calls = 0;
    // First the source is down, then it recovers — within the TTL.
    const build = async (a: { scope: ExecutiveScope; nowMs: number }): Promise<ExecutiveSummary> => {
      calls += 1;
      const broken = calls === 1;
      return {
        generatedAtIso: new Date(a.nowMs).toISOString(),
        range: "today",
        period: { current: {}, baseline: {} },
        timeZone: a.scope.timeZone,
        authority: a.scope.authority,
        sections: {
          operations: { status: broken ? "UNAVAILABLE" : "OPERATIONAL" },
          financial: { status: "FORBIDDEN" },
          industrial: { status: "EMPTY" },
          customers: { status: "OPERATIONAL" },
        },
        actions: { status: "OPERATIONAL" },
        marker: `call-${calls}`,
      } as unknown as ExecutiveSummary;
    };

    const down = await readExecutiveSummary({ scope, range: "today", nowMs: NOW, build });
    expect(down.cache.store).toBe("none");

    // One second later the reader must see the recovered source, not a cached
    // outage: nothing was stored to serve them.
    const up = await readExecutiveSummary({ scope, range: "today", nowMs: NOW + 1_000, build });
    expect(up.cache.hit).toBe(false);
    expect(markerOf(up.summary)).toBe("call-2");

    // And a healthy answer IS stored.
    const again = await readExecutiveSummary({ scope, range: "today", nowMs: NOW + 2_000, build });
    expect(again.cache.hit).toBe(true);
    expect(markerOf(again.summary)).toBe("call-2");
    expect(calls).toBe(2);
  });
});

describe("executive summary cache — the frozen report stays out of it", () => {
  it("has the report generator calling the aggregation DIRECTLY, never the cache", () => {
    // A source assertion on purpose: the point is not that today's code path
    // happens to be uncached, it is that a later edit cannot quietly route the
    // frozen report through a live cache. A report is a record of a finished
    // day; serving it a cached live summary would replace a historical fact.
    const src = readFileSync("src/lib/executive/report/generate.ts", "utf8");
    expect(src).toContain("buildExecutiveSummary");
    expect(src).not.toMatch(/readExecutiveSummary|executive\/cache|from "\.\.\/cache"/);
  });
});
