/**
 * PHASE 109-C-UI.2 — the Live Operations contract, attacked.
 *
 * The premise of this whole surface is that "nothing to report" and "we could
 * not read anything" are different facts. Every test here tries to collapse
 * them, or to smuggle a value past the state that governs it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALL_ACKNOWLEDGEMENTS,
  ALL_DATA_STATES,
  ALL_SEVERITIES,
  applyFilter,
  classifyFreshness,
  DEFAULT_FILTER,
  FRESHNESS_LIMITS,
  isCompletePicture,
  isOperationalOrigin,
  isReadable,
  isSeverity,
  measured,
  parseFilter,
  siteFilterable,
  sortEvents,
  unavailable,
  unreachedProvenance,
  unreachedSources,
  type LiveOperationsFeed,
  type OperationalEvent,
  type Provenance,
} from "../contract";

const NOW = 1_800_000_000_000;

const connected = (observedAtEpochMs: number | null): Provenance => ({
  source: "postgres:AssetAlert",
  connection: "CONNECTED",
  observedAtEpochMs,
  reportedAtEpochMs: null,
  freshness: classifyFreshness(observedAtEpochMs, NOW),
  confidence: "MEASURED",
});

const event = (over: Partial<OperationalEvent> = {}): OperationalEvent => ({
  id: "e1",
  organizationId: "org-a",
  siteId: "site-a",
  assetId: "asset-1",
  severity: "HIGH",
  title: "t",
  description: "d",
  origin: "PLANT_RECORD",
  observedAtEpochMs: NOW - 60_000,
  acknowledgement: "UNACKNOWLEDGED",
  owner: null,
  evidence: [],
  ...over,
});

/* ── the central claim ────────────────────────────────────────────────────── */

describe("109-C-UI.2 · an unreachable source is never a zero", () => {
  it("refuses to carry a value when the source was not reached", () => {
    // The attack: hand `measured` a perfectly good number together with a
    // provenance that says the source was never reached. A careless renderer
    // would print the number.
    const smuggled = measured(0, unreachedProvenance("postgres:AssetAlert"));
    expect(smuggled.state).toBe("NOT_CONNECTED");
    expect(smuggled.value).toBeNull();

    const smuggledNonZero = measured(42, unreachedProvenance("postgres:AssetAlert"));
    expect(smuggledNonZero.state).toBe("NOT_CONNECTED");
    expect(smuggledNonZero.value).toBeNull();
  });

  it("keeps NO_DATA and NOT_CONNECTED distinguishable", () => {
    const empty = measured(0, connected(NOW), { emptyWhen: (n) => n === 0 });
    const blind = unavailable<number>("postgres:AssetAlert");

    expect(empty.state).toBe("NO_DATA");
    expect(blind.state).toBe("NOT_CONNECTED");
    expect(empty.state).not.toBe(blind.state);
    // Both render nothing, and that is exactly why the STATE has to differ.
    expect(empty.value).toBeNull();
    expect(blind.value).toBeNull();
  });

  it("only OK and STALE may be read", () => {
    for (const s of ALL_DATA_STATES) {
      expect(isReadable(s), s).toBe(s === "OK" || s === "STALE");
    }
  });

  it("reports a real zero as a real zero", () => {
    // The opposite failure: refusing to show a genuine measurement. A count of
    // zero stale sources is a useful answer and must survive.
    const zero = measured(0, connected(NOW));
    expect(zero.state).toBe("OK");
    expect(zero.value).toBe(0);
  });
});

/* ── freshness cannot be forged by the source ─────────────────────────────── */

describe("109-C-UI.2 · freshness comes from the server, and a bad clock cannot beat it", () => {
  it("classifies against the observed instant", () => {
    expect(classifyFreshness(NOW, NOW)).toBe("FRESH");
    expect(classifyFreshness(NOW - FRESHNESS_LIMITS.freshWithinMs, NOW)).toBe("FRESH");
    expect(classifyFreshness(NOW - FRESHNESS_LIMITS.freshWithinMs - 1, NOW)).toBe("AGEING");
    expect(classifyFreshness(NOW - FRESHNESS_LIMITS.ageingWithinMs - 1, NOW)).toBe("STALE");
  });

  it("refuses a future timestamp instead of calling it fresh", () => {
    // A gateway with a wrong — or hostile — clock must not be able to present
    // arbitrarily old data as current. "I cannot classify this" is the safe
    // answer; "fresh" is the dangerous one.
    expect(classifyFreshness(NOW + 1, NOW)).toBe("UNKNOWN");
    expect(classifyFreshness(NOW + 86_400_000, NOW)).toBe("UNKNOWN");
  });

  it("refuses an absent or unusable instant", () => {
    expect(classifyFreshness(null, NOW)).toBe("UNKNOWN");
    expect(classifyFreshness(Number.NaN, NOW)).toBe("UNKNOWN");
    expect(classifyFreshness(Number.POSITIVE_INFINITY, NOW)).toBe("UNKNOWN");
  });

  it("marks a stale measurement STALE while still letting it be read", () => {
    const old = measured(7, connected(NOW - FRESHNESS_LIMITS.ageingWithinMs - 1));
    expect(old.state).toBe("STALE");
    expect(old.value).toBe(7);
    // Readable, but never mistakable for current.
    expect(isReadable(old.state)).toBe(true);
  });
});

/* ── filters are not an authorization boundary, and cannot be used as a hole ─ */

describe("109-C-UI.2 · a filter cannot widen what the reader may see", () => {
  it("refuses a site id the reader is not entitled to", () => {
    // The attack: type another company's site id into the URL.
    const f = parseFilter({ site: "site-of-another-company" }, ["site-a", "site-b"]);
    expect(f.siteId).toBeNull();
  });

  it("accepts only a site in the allowed list", () => {
    expect(parseFilter({ site: "site-b" }, ["site-a", "site-b"]).siteId).toBe("site-b");
    expect(parseFilter({ site: "site-b" }, []).siteId).toBeNull();
  });

  it("falls back to the default for malformed input instead of passing it through", () => {
    const f = parseFilter(
      { severity: "'; DROP TABLE --", ack: "yes", range: "9999y", site: "" },
      ["site-a"],
    );
    expect(f).toEqual(DEFAULT_FILTER);
  });

  it("treats a repeated parameter as ambiguous rather than picking one", () => {
    // `?site=a&site=b` arrives as an array. Choosing either would be a guess.
    const f = parseFilter({ site: ["site-a", "site-b"], severity: ["HIGH", "LOW"] }, ["site-a"]);
    expect(f.siteId).toBeNull();
    expect(f.severity).toBeNull();
  });

  it("excludes an unattributable record under an explicit site filter", () => {
    // A record with no siteId cannot be PROVEN to belong to a site the reader
    // may see. "We could not tell" must resolve to hidden, never to shown.
    const orphan = event({ id: "orphan", siteId: null });
    expect(siteFilterable(orphan)).toBe(false);

    const filtered = applyFilter([orphan, event()], { ...DEFAULT_FILTER, siteId: "site-a" }, NOW);
    expect(filtered.map((e) => e.id)).toEqual(["e1"]);
  });

  it("keeps an unattributable record visible when no site filter is applied", () => {
    // Hiding it unconditionally would lose a real event; the rule is about the
    // site-scoped view, not about the record's existence.
    const filtered = applyFilter([event({ id: "orphan", siteId: null })], DEFAULT_FILTER, NOW);
    expect(filtered.map((e) => e.id)).toEqual(["orphan"]);
  });

  it("drops events outside the selected time range", () => {
    const old = event({ id: "old", observedAtEpochMs: NOW - 40 * 86_400_000 });
    expect(applyFilter([old], { ...DEFAULT_FILTER, timeRange: "24h" }, NOW)).toEqual([]);
    expect(applyFilter([old], { ...DEFAULT_FILTER, timeRange: "30d" }, NOW)).toEqual([]);
    expect(
      applyFilter([event({ id: "recent" })], { ...DEFAULT_FILTER, timeRange: "1h" }, NOW)
        .map((e) => e.id),
    ).toEqual(["recent"]);
  });
});

/* ── the catalogue must never be presentable as operations ────────────────── */

describe("109-C-UI.2 · reference catalogue entries are not operational events", () => {
  it("classifies CATALOGUE as non-operational", () => {
    expect(isOperationalOrigin("PLANT_RECORD")).toBe(true);
    expect(isOperationalOrigin("DERIVED")).toBe(true);
    // /api/operations/* is built from the static engineering corpus, is identical
    // for every organisation and is guarded only by an anonymous rate limiter.
    expect(isOperationalOrigin("CATALOGUE")).toBe(false);
  });
});

/* ── ordering and severity ────────────────────────────────────────────────── */

describe("109-C-UI.2 · deterministic ordering", () => {
  it("sorts by severity, then recency, then id", () => {
    const sorted = sortEvents([
      event({ id: "b", severity: "LOW", observedAtEpochMs: NOW }),
      event({ id: "a", severity: "CRITICAL", observedAtEpochMs: NOW - 1000 }),
      event({ id: "c", severity: "CRITICAL", observedAtEpochMs: NOW }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["c", "a", "b"]);
  });

  it("is stable across two runs of the same input", () => {
    const input = [event({ id: "x" }), event({ id: "y" }), event({ id: "z" })];
    expect(sortEvents(input)).toEqual(sortEvents(input));
  });

  it("refuses a severity it does not know", () => {
    for (const s of ALL_SEVERITIES) expect(isSeverity(s)).toBe(true);
    for (const bad of ["critical", "URGENT", "", null, 3, {}]) {
      expect(isSeverity(bad), String(bad)).toBe(false);
    }
  });
});

/* ── the completeness verdict ─────────────────────────────────────────────── */

describe("109-C-UI.2 · a partial picture is never reported as a whole one", () => {
  const feed = (over: Partial<LiveOperationsFeed>): LiveOperationsFeed => ({
    generatedAtEpochMs: NOW,
    connection: "CONNECTED",
    organizationId: "org-a",
    allowedSiteIds: ["site-a"],
    filter: DEFAULT_FILTER,
    summary: {
      activeSignals: measured(1, connected(NOW)),
      unresolvedIssues: measured(0, connected(NOW)),
      staleSources: measured(0, connected(NOW)),
      pendingValidations: measured(0, connected(NOW)),
      recentEvents: measured(0, connected(NOW)),
    },
    events: [],
    eventsState: "NO_DATA",
    sources: [
      { source: "postgres:AssetAlert", connection: "CONNECTED", freshness: "FRESH", observedAtEpochMs: NOW },
    ],
    unavailableCapabilities: [],
    ...over,
  });

  it("is complete only when every source was reached", () => {
    expect(isCompletePicture(feed({}))).toBe(true);
  });

  it("is incomplete when any single source was unreachable", () => {
    const partial = feed({
      sources: [
        { source: "postgres:AssetAlert", connection: "CONNECTED", freshness: "FRESH", observedAtEpochMs: NOW },
        { source: "postgres:IndustrialAsset", connection: "NOT_CONNECTED", freshness: "UNKNOWN", observedAtEpochMs: null },
      ],
    });
    expect(isCompletePicture(partial)).toBe(false);
    expect(unreachedSources(partial).map((s) => s.source)).toEqual(["postgres:IndustrialAsset"]);
  });

  it("is incomplete when the connection itself failed, even with no sources listed", () => {
    expect(isCompletePicture(feed({ connection: "NOT_CONNECTED", sources: [] }))).toBe(false);
  });
});

describe("109-C-UI.2 · every filter the parser accepts has a control (D-21)", () => {
  /*
    The defect this pins: `parseFilter` honoured `ack`, the workspace carried it
    through every generated link, and nothing on screen could set or clear it. A
    reader arriving on `?ack=RESOLVED` saw a narrowed event list, no indication a
    filter was on, and no way out — on an operations page that means
    unacknowledged alarms hidden by a filter nobody chose.

    Source scanning is the honest instrument here: these are SERVER components
    with async `getTranslations`, so a jsdom render would prove less than it
    appears to. What is asserted is narrow and real — that a reset link exists
    for every nullable dimension, and that every enumerated value is offered.
  */
  const workspace = readFileSync(
    join(process.cwd(), "src/components/live-operations/LiveOperationsWorkspace.tsx"),
    "utf8",
  );

  it("offers a reset for every dimension that can be null", () => {
    // Each of these is a filter the URL can set. Without the reset chip the only
    // way back to the unfiltered view is editing the address bar.
    for (const param of ["site", "severity", "ack"]) {
      expect(workspace, `no reset chip for ${param}`).toContain(`{ ${param}: null }`);
    }
  });

  it("renders every enumerated value the parser will accept", () => {
    for (const name of ["ALL_SEVERITIES", "ALL_TIME_RANGES", "ALL_ACKNOWLEDGEMENTS"]) {
      expect(workspace, `${name} is never mapped over`).toContain(`${name}.map(`);
    }
  });

  it("the parser and the interface share one acknowledgement vocabulary", () => {
    // Not a restatement of the constant: it asserts the PARSER honours exactly
    // the values the chips offer, so neither side can grow a value alone.
    for (const ack of ALL_ACKNOWLEDGEMENTS) {
      expect(parseFilter({ ack }, []).acknowledgement).toBe(ack);
    }
    expect(parseFilter({ ack: "SOMETHING_ELSE" }, []).acknowledgement).toBeNull();
    expect(parseFilter({}, []).acknowledgement).toBeNull();
  });

  it("time range is the one dimension with a default rather than a reset", () => {
    // Deliberate and different: an events list with no time bound is not a
    // neutral view, it is an unbounded query. Every range is offered instead.
    expect(parseFilter({}, []).timeRange).toBe(DEFAULT_FILTER.timeRange);
    expect(parseFilter({ range: "nonsense" }, []).timeRange).toBe(DEFAULT_FILTER.timeRange);
  });
});
