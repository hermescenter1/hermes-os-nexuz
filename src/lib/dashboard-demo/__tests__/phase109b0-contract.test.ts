import { describe, expect, it } from "vitest";

import {
  IMPLEMENTED_CONNECTION_MODES,
  MIN_SERIES_HISTORY,
  SUPPORTED_FRAME_VERSION,
  createLocalDemoFrame,
  findSnapshotStructureFault,
  isValidSourceDescriptor,
  resolveDashboardSource,
  validateDashboardFrame,
  type ClassifiedDashboardFrame,
  type DashboardSourceDescriptor,
  type FrameRejectionReason,
} from "..";

/**
 * PHASE 109-B0 — the fail-closed contract, asserted directly.
 *
 * The first revision of this contract checked PRESENCE and JavaScript TYPE. It
 * therefore accepted `provenance.network: "INTERNET"`, a `DEMO_NO_TENANT` scope
 * carrying a tenant id, a simulated frame claiming `source.kind: "DEVICE"`, a
 * `labelKey` of `"   "`, a `receivedTs` before its `acquisitionTs`, and an empty
 * object as a `DashboardSnapshot`. Every one of those is a specific, typed
 * rejection now, and each has its own case below.
 *
 * These tests are written against EXACT codes on purpose. Asserting only
 * `ok === false` would pass just as happily if every malformed input collapsed
 * into one catch-all reason, which is precisely the defect being corrected.
 */

const TS = 1_700_000_000_000;
const good = (): ClassifiedDashboardFrame => createLocalDemoFrame(TS);
const descriptor = (): DashboardSourceDescriptor => resolveDashboardSource();

/** A frame with one field replaced — including replacement by `undefined`. */
function withFrame(patch: Record<string, unknown>): Record<string, unknown> {
  return { ...(good() as unknown as Record<string, unknown>), ...patch };
}
/** A frame with one field DELETED, which is not the same as `undefined`. */
function withoutFrame(key: string): Record<string, unknown> {
  const f = { ...(good() as unknown as Record<string, unknown>) };
  delete f[key];
  return f;
}
function withScope(patch: Record<string, unknown>) {
  return withFrame({ scope: { ...good().scope, ...patch } });
}
function withSource(patch: Record<string, unknown>) {
  return withFrame({ source: { ...good().source, ...patch } });
}
function withProvenance(patch: Record<string, unknown>) {
  return withFrame({ provenance: { ...good().provenance, ...patch } });
}
/** Deep-clone the snapshot so a mutation cannot leak into another case. */
function withSnapshot(mutate: (s: Record<string, never>) => void) {
  const frame = good();
  const snapshot = JSON.parse(JSON.stringify(frame.snapshot));
  mutate(snapshot);
  return withFrame({ snapshot });
}

function reasonOf(candidate: unknown, d?: DashboardSourceDescriptor): FrameRejectionReason | "OK" {
  const v = validateDashboardFrame(candidate, d);
  return v.ok ? "OK" : v.reason;
}
function pathOf(candidate: unknown): string | undefined {
  const v = validateDashboardFrame(candidate);
  return v.ok ? undefined : v.path;
}

/* ── the happy path still works ──────────────────────────────────────────── */

describe("109-B0 contract · a correct frame and descriptor are accepted", () => {
  it("createLocalDemoFrame() passes with and without the descriptor", () => {
    expect(reasonOf(good())).toBe("OK");
    expect(reasonOf(good(), descriptor())).toBe("OK");
  });

  it("resolveDashboardSource() satisfies the full coherence matrix", () => {
    expect(isValidSourceDescriptor(descriptor())).toBe(true);
  });

  it("the local adapter's time invariant holds exactly", () => {
    const f = good();
    expect(f.snapshot.ts).toBe(TS);
    expect(f.acquisitionTs).toBe(TS);
    expect(f.receivedTs).toBe(TS);
  });

  it("the simulator's own snapshot is structurally sound", () => {
    expect(findSnapshotStructureFault(good().snapshot)).toBeNull();
  });
});

/* ── frame version ───────────────────────────────────────────────────────── */

describe("109-B0 contract · frame version", () => {
  it("missing frameVersion is MISSING_FRAME_VERSION", () => {
    expect(reasonOf(withoutFrame("frameVersion"))).toBe("MISSING_FRAME_VERSION");
    expect(reasonOf(withFrame({ frameVersion: null }))).toBe("MISSING_FRAME_VERSION");
  });

  it("an unsupported frameVersion is UNSUPPORTED_FRAME_VERSION, not accepted forward", () => {
    for (const v of [0, 2, 99, "1", 1.5]) {
      expect(reasonOf(withFrame({ frameVersion: v })), `frameVersion=${String(v)}`).toBe(
        "UNSUPPORTED_FRAME_VERSION"
      );
    }
    expect(SUPPORTED_FRAME_VERSION).toBe(1);
  });
});

/* ── classification / mode / quality ─────────────────────────────────────── */

describe("109-B0 contract · classification, mode and quality are never defaulted", () => {
  it("a missing classification is rejected and nothing is substituted", () => {
    const v = validateDashboardFrame(withoutFrame("classification"));
    expect(v).toEqual({ ok: false, reason: "MISSING_CLASSIFICATION" });
    expect(JSON.stringify(v)).not.toMatch(/SIMULATED|REAL/);
  });

  it("an unknown classification is UNKNOWN_CLASSIFICATION", () => {
    expect(reasonOf(withFrame({ classification: "LIVE_CONTROL" }))).toBe(
      "UNKNOWN_CLASSIFICATION"
    );
  });

  it("a documented-but-unimplemented mode is refused by its own code", () => {
    // The enum member exists so the future shape is fixed. Nothing in this
    // build produces or verifies such a frame, so accepting one would let a
    // payload describe an acquisition path that does not exist.
    expect(reasonOf(withFrame({ connectionMode: "LIVE_READ_ONLY" }))).toBe(
      "UNIMPLEMENTED_CONNECTION_MODE"
    );
    expect(reasonOf(withFrame({ connectionMode: "HISTORICAL_REPLAY" }))).toBe(
      "UNIMPLEMENTED_CONNECTION_MODE"
    );
    expect([...IMPLEMENTED_CONNECTION_MODES]).toEqual(["SIMULATED"]);
  });

  it("missing and unknown mode and quality have distinct codes", () => {
    expect(reasonOf(withoutFrame("connectionMode"))).toBe("MISSING_CONNECTION_MODE");
    expect(reasonOf(withFrame({ connectionMode: "OFFLINE" }))).toBe(
      "UNKNOWN_CONNECTION_MODE"
    );
    expect(reasonOf(withoutFrame("quality"))).toBe("MISSING_QUALITY");
    expect(reasonOf(withFrame({ quality: "EXCELLENT" }))).toBe("UNKNOWN_QUALITY");
  });
});

/* ── scope ───────────────────────────────────────────────────────────────── */

describe("109-B0 contract · scope coherence", () => {
  it("a missing scope, and a scope missing its kind, are distinct", () => {
    expect(reasonOf(withoutFrame("scope"))).toBe("MISSING_SCOPE");
    expect(reasonOf(withFrame({ scope: { organizationId: null, siteId: null } }))).toBe(
      "MISSING_SCOPE_KIND"
    );
    expect(reasonOf(withFrame({ scope: { scopeKind: "DEMO_NO_TENANT" } }))).toBe(
      "MISSING_SCOPE"
    );
  });

  it("an unknown scopeKind is UNKNOWN_SCOPE_KIND", () => {
    expect(reasonOf(withScope({ scopeKind: "GLOBAL" }))).toBe("UNKNOWN_SCOPE_KIND");
  });

  it("DEMO_NO_TENANT carrying a tenant or site id is INCOHERENT_SCOPE", () => {
    expect(reasonOf(withScope({ organizationId: "org_live_1" }))).toBe("INCOHERENT_SCOPE");
    expect(reasonOf(withScope({ siteId: "site_live_1" }))).toBe("INCOHERENT_SCOPE");
    expect(
      reasonOf(withScope({ organizationId: "org_live_1", siteId: "site_live_1" }))
    ).toBe("INCOHERENT_SCOPE");
  });

  it("ORGANIZATION_SITE with null, empty or whitespace ids is INCOHERENT_SCOPE", () => {
    const base = { scopeKind: "ORGANIZATION_SITE" };
    expect(reasonOf(withScope({ ...base }))).toBe("INCOHERENT_SCOPE");
    expect(reasonOf(withScope({ ...base, organizationId: "org_1" }))).toBe(
      "INCOHERENT_SCOPE"
    );
    expect(reasonOf(withScope({ ...base, organizationId: "", siteId: "site_1" }))).toBe(
      "INCOHERENT_SCOPE"
    );
    expect(reasonOf(withScope({ ...base, organizationId: "   ", siteId: "site_1" }))).toBe(
      "INCOHERENT_SCOPE"
    );
    expect(reasonOf(withScope({ ...base, organizationId: "org_1", siteId: "\t\n" }))).toBe(
      "INCOHERENT_SCOPE"
    );
  });

  it("ORGANIZATION_SITE with real ids is structurally coherent", () => {
    expect(
      reasonOf(
        withScope({ scopeKind: "ORGANIZATION_SITE", organizationId: "org_1", siteId: "site_1" })
      )
    ).toBe("OK");
  });
});

/* ── source ──────────────────────────────────────────────────────────────── */

describe("109-B0 contract · source identity", () => {
  it("missing source and missing source kind are distinct", () => {
    expect(reasonOf(withoutFrame("source"))).toBe("MISSING_SOURCE");
    expect(reasonOf(withFrame({ source: { id: "x", labelKey: "y" } }))).toBe(
      "MISSING_SOURCE_KIND"
    );
  });

  it("an unknown source kind is UNKNOWN_SOURCE_KIND", () => {
    expect(reasonOf(withSource({ kind: "SATELLITE" }))).toBe("UNKNOWN_SOURCE_KIND");
  });

  it("a SIMULATED frame may never claim a DEVICE, GATEWAY or HISTORIAN", () => {
    for (const kind of ["DEVICE", "GATEWAY", "HISTORIAN"]) {
      expect(reasonOf(withSource({ kind })), kind).toBe("UNSUPPORTED_SOURCE_FOR_MODE");
    }
  });

  it("a blank source id or labelKey is rejected with its own code", () => {
    for (const bad of [undefined, null, "", "   ", "\t", "\n "]) {
      expect(reasonOf(withSource({ id: bad })), `id=${JSON.stringify(bad)}`).toBe(
        "MISSING_SOURCE_ID"
      );
      expect(
        reasonOf(withSource({ labelKey: bad })),
        `labelKey=${JSON.stringify(bad)}`
      ).toBe("MISSING_SOURCE_LABEL_KEY");
    }
  });
});

/* ── provenance ──────────────────────────────────────────────────────────── */

describe("109-B0 contract · provenance", () => {
  it("a missing provenance object is MISSING_PROVENANCE and nothing else is", () => {
    expect(reasonOf(withoutFrame("provenance"))).toBe("MISSING_PROVENANCE");
  });

  it("a blank adapter and a blank adapterVersion have separate codes", () => {
    for (const bad of [undefined, "", "  "]) {
      expect(reasonOf(withProvenance({ adapter: bad }))).toBe("MISSING_PROVENANCE_ADAPTER");
      expect(reasonOf(withProvenance({ adapterVersion: bad }))).toBe(
        "MISSING_PROVENANCE_ADAPTER_VERSION"
      );
    }
  });

  it("producedBy must be the exact known value, not any string", () => {
    expect(reasonOf(withProvenance({ producedBy: undefined }))).toBe(
      "MISSING_PROVENANCE_PRODUCED_BY"
    );
    expect(reasonOf(withProvenance({ producedBy: "REMOTE_GATEWAY" }))).toBe(
      "UNKNOWN_PROVENANCE_PRODUCED_BY"
    );
    expect(reasonOf(withProvenance({ producedBy: "local_demo_adapter" }))).toBe(
      "UNKNOWN_PROVENANCE_PRODUCED_BY"
    );
  });

  it("network must be exactly NONE — the no-boundary claim is the whole point", () => {
    expect(reasonOf(withProvenance({ network: undefined }))).toBe(
      "MISSING_PROVENANCE_NETWORK"
    );
    for (const n of ["INTERNET", "LAN", "OT", "none", ""]) {
      expect(reasonOf(withProvenance({ network: n })), n).toBe(
        "UNSUPPORTED_PROVENANCE_NETWORK"
      );
    }
  });
});

/* ── timestamps ──────────────────────────────────────────────────────────── */

describe("109-B0 contract · timestamps", () => {
  it("missing acquisition and received timestamps are distinct codes", () => {
    expect(reasonOf(withoutFrame("acquisitionTs"))).toBe("MISSING_ACQUISITION_TS");
    expect(reasonOf(withoutFrame("receivedTs"))).toBe("MISSING_RECEIVED_TS");
  });

  it("NaN and Infinity are INVALID_TIMESTAMP", () => {
    for (const v of [NaN, Infinity, -Infinity, "1700000000000"]) {
      expect(reasonOf(withFrame({ acquisitionTs: v })), String(v)).toBe("INVALID_TIMESTAMP");
      expect(reasonOf(withFrame({ receivedTs: v })), String(v)).toBe("INVALID_TIMESTAMP");
    }
  });

  it("a negative timestamp is NEGATIVE_TIMESTAMP, not merely 'invalid'", () => {
    expect(reasonOf(withFrame({ acquisitionTs: -1, receivedTs: -1 }))).toBe(
      "NEGATIVE_TIMESTAMP"
    );
    expect(reasonOf(withFrame({ receivedTs: -5 }))).toBe("NEGATIVE_TIMESTAMP");
  });

  it("receipt before acquisition is TIMESTAMP_ORDER", () => {
    expect(reasonOf(withFrame({ receivedTs: TS - 1 }))).toBe("TIMESTAMP_ORDER");
  });

  it("an envelope whose clock disagrees with its payload is SNAPSHOT_TIME_MISMATCH", () => {
    const f = good();
    const snapshot = { ...f.snapshot, ts: TS + 1000 };
    // receivedTs still >= acquisitionTs, so this is not an ordering fault.
    expect(reasonOf(withFrame({ snapshot, receivedTs: TS + 5000 }))).toBe(
      "SNAPSHOT_TIME_MISMATCH"
    );
  });
});

/* ── snapshot structure ──────────────────────────────────────────────────── */

describe("109-B0 contract · the snapshot must be renderable, not merely an object", () => {
  it("an empty object is rejected", () => {
    expect(reasonOf(withFrame({ snapshot: {} }))).toBe("MALFORMED_SNAPSHOT");
    expect(pathOf(withFrame({ snapshot: {} }))).toBe("ts");
    expect(findSnapshotStructureFault({})).toBe("ts");
    expect(findSnapshotStructureFault(null)).toBe("snapshot");
    expect(findSnapshotStructureFault([])).toBe("snapshot");
  });

  it("a missing section is reported by its own path", () => {
    expect(pathOf(withSnapshot((s) => delete s.overview))).toBe("overview");
    expect(pathOf(withSnapshot((s) => delete s.risk))).toBe("risk");
    expect(pathOf(withSnapshot((s) => delete s.alarms))).toBe("alarms");
  });

  it("a non-finite numeric leaf is reported by its own path", () => {
    expect(pathOf(withSnapshot((s) => ((s as never as { overview: { oee: number } }).overview.oee = NaN)))).toBe(
      "overview.oee"
    );
    expect(
      pathOf(withSnapshot((s) => ((s as never as { risk: { score: number } }).risk.score = Infinity)))
    ).toBe("risk.score");
    expect(
      pathOf(withSnapshot((s) => ((s as never as { ai: { confidence: number }[] }).ai[0].confidence = NaN)))
    ).toBe("ai[0].confidence");
  });

  it("a nested enum outside its permitted set is reported by its own path", () => {
    expect(
      pathOf(withSnapshot((s) => ((s as never as { lines: { status: string }[] }).lines[0].status = "melting")))
    ).toBe("lines[0].status");
    expect(
      pathOf(withSnapshot((s) => ((s as never as { risk: { trend: string } }).risk.trend = "sideways")))
    ).toBe("risk.trend");
    expect(
      pathOf(
        withSnapshot(
          (s) => ((s as never as { network: { ids: string } }).network.ids = "unknown")
        )
      )
    ).toBe("network.ids");
    expect(
      pathOf(
        withSnapshot(
          (s) =>
            ((s as never as { maintenance: { severity: string }[] }).maintenance[0].severity =
              "urgent")
        )
      )
    ).toBe("maintenance[0].severity");
  });

  it("a blank required identifier is reported by its own path", () => {
    expect(
      pathOf(withSnapshot((s) => ((s as never as { plc: { id: string }[] }).plc[0].id = "")))
    ).toBe("plc[0].id");
    expect(
      pathOf(
        withSnapshot(
          (s) => ((s as never as { alarms: { recent: { msgKey: string }[] } }).alarms.recent[0].msgKey = "   ")
        )
      )
    ).toBe("alarms.recent[0].msgKey");
  });

  it("alarms.counts must carry all four severities", () => {
    expect(
      pathOf(
        withSnapshot(
          (s) => delete (s as never as { alarms: { counts: Record<string, number> } }).alarms.counts.low
        )
      )
    ).toBe("alarms.counts.low");
  });

  it("a section that should be an array but is not is reported", () => {
    expect(
      pathOf(withSnapshot((s) => ((s as never as { lines: unknown }).lines = { id: "L1" })))
    ).toBe("lines");
    expect(
      pathOf(
        withSnapshot((s) => ((s as never as { energy: { history: unknown } }).energy.history = 5))
      )
    ).toBe("energy.history");
  });

  it("a series too short for Spark to draw is rejected before it renders NaN geometry", () => {
    expect(
      pathOf(
        withSnapshot(
          (s) => ((s as never as { temperature: { history: number[] }[] }).temperature[0].history = [10])
        )
      )
    ).toBe("temperature[0].history.length");
    expect(
      pathOf(
        withSnapshot(
          (s) => ((s as never as { temperature: { history: number[] }[] }).temperature[0].history = [])
        )
      )
    ).toBe("temperature[0].history.length");
    expect(MIN_SERIES_HISTORY).toBe(2);
  });

  it("a non-finite history entry is reported by its index", () => {
    expect(
      pathOf(
        withSnapshot(
          (s) => ((s as never as { pressure: { history: number[] }[] }).pressure[0].history[3] = Infinity)
        )
      )
    ).toBe("pressure[0].history[3]");
    expect(
      pathOf(
        withSnapshot((s) => ((s as never as { energy: { history: number[] } }).energy.history[1] = NaN))
      )
    ).toBe("energy.history[1]");
  });
});

/* ── descriptor agreement ────────────────────────────────────────────────── */

describe("109-B0 contract · the descriptor is compared field by field", () => {
  it("an invalid descriptor is refused before any comparison", () => {
    const bad = { ...descriptor(), resolvedBy: "CLIENT" } as unknown as DashboardSourceDescriptor;
    expect(reasonOf(good(), bad)).toBe("INVALID_DESCRIPTOR");
  });

  it("classification disagreement has its own code", () => {
    expect(reasonOf(withFrame({ classification: "REPLAYED" }), descriptor())).toBe(
      "DESCRIPTOR_CLASSIFICATION_MISMATCH"
    );
    expect(reasonOf(withFrame({ classification: "IMPORTED" }), descriptor())).toBe(
      "DESCRIPTOR_CLASSIFICATION_MISMATCH"
    );
  });

  it("scope disagreement has its own code", () => {
    const frame = withScope({
      scopeKind: "ORGANIZATION_SITE",
      organizationId: "org_1",
      siteId: "site_1",
    });
    expect(reasonOf(frame, descriptor())).toBe("DESCRIPTOR_SCOPE_MISMATCH");
  });

  it("every comparable source leaf disagreement has its own code", () => {
    const d = descriptor();
    expect(reasonOf(withSource({ id: "hermes-demo-scenario-02" }), d)).toBe(
      "DESCRIPTOR_SOURCE_ID_MISMATCH"
    );
    expect(reasonOf(withSource({ labelKey: "dashboard.provenance.other" }), d)).toBe(
      "DESCRIPTOR_SOURCE_LABEL_KEY_MISMATCH"
    );
  });

  it("every comparable provenance leaf disagreement has its own code", () => {
    const d = descriptor();
    expect(reasonOf(withProvenance({ adapter: "hermes.dashboard.other-adapter" }), d)).toBe(
      "DESCRIPTOR_ADAPTER_MISMATCH"
    );
    expect(reasonOf(withProvenance({ adapterVersion: "109-C" }), d)).toBe(
      "DESCRIPTOR_ADAPTER_VERSION_MISMATCH"
    );
  });

  it("agreement on classification alone is NOT agreement", () => {
    // The exact defect this correction closes: the old comparison checked
    // classification and mode and nothing beneath them.
    const frame = withFrame({
      source: { kind: "DEMO_SCENARIO", id: "someone-elses-plant", labelKey: "x.y" },
      provenance: {
        adapter: "not.the.local.demo.adapter",
        adapterVersion: "0",
        producedBy: "LOCAL_DEMO_ADAPTER",
        network: "NONE",
      },
    });
    const v = validateDashboardFrame(frame, descriptor());
    expect(v.ok).toBe(false);
    expect(v.ok ? "" : v.reason).toMatch(/^DESCRIPTOR_(SOURCE|ADAPTER)/);
  });

  it("the pinned identity fields cannot even reach the comparison — proved, not assumed", () => {
    // source.kind, producedBy and network are pinned on BOTH sides, so a
    // mismatch is impossible today. That is a stronger guarantee than the
    // comparison, and the codes remain as defence in depth for the day a pin is
    // relaxed. The test proves the pins, rather than claiming unreachability.
    const d = descriptor();
    expect(isValidSourceDescriptor({ ...d, source: { ...d.source, kind: "GATEWAY" } })).toBe(false);
    expect(
      isValidSourceDescriptor({
        ...d,
        provenance: { ...d.provenance, producedBy: "REMOTE_GATEWAY" },
      })
    ).toBe(false);
    expect(
      isValidSourceDescriptor({ ...d, provenance: { ...d.provenance, network: "INTERNET" } })
    ).toBe(false);
    expect(isValidSourceDescriptor({ ...d, connectionMode: "LIVE_READ_ONLY" })).toBe(false);
    expect(isValidSourceDescriptor({ ...d, classification: "REAL" })).toBe(false);
    expect(
      isValidSourceDescriptor({ ...d, scope: { ...d.scope, organizationId: "org_1" } })
    ).toBe(false);
  });
});
