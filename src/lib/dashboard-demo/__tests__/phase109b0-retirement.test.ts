import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  TELEMETRY_CONNECTION_MODES,
  TELEMETRY_QUALITIES,
  TELEMETRY_RECORD_CLASSIFICATIONS,
  createLocalDemoFrame,
  isValidSourceDescriptor,
  resolveDashboardSource,
  validateDashboardFrame,
  type ClassifiedDashboardFrame,
} from "..";

/**
 * PHASE 109-B0 — retirement of the anonymous synthetic telemetry surface.
 *
 * `/api/telemetry` served plant-shaped values (OEE, alarms, PLC scan times,
 * SCADA latency) over an unauthenticated route with no tenant, no site, no
 * source identity, no acquisition semantics and no provenance. The owner
 * decision was RETIRE, not repair.
 *
 * The detector below is deliberately NOT a filename check and NOT a substring
 * scan. A route called `/api/plant-status` re-exporting the same simulator
 * would pass either of those. It builds the real transitive import closure of
 * every route module under `src/app` and fails if ANY of them can reach a
 * plant-shaped data producer — which is the property that actually matters.
 */

const ROOT = process.cwd();
const APP = path.join(ROOT, "src", "app");
const SRC = path.join(ROOT, "src");
const CODE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

/* ── file-system helpers ─────────────────────────────────────────────────── */

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");

const ALL_SRC = walk(SRC).filter((f) => CODE_EXTS.includes(path.extname(f)));
const IS_TEST = (p: string) =>
  /(^|\/)__tests__(\/|$)/.test(rel(p)) || /\.test\.(ts|tsx|js|jsx|mjs)$/.test(p);
const PRODUCTION_SRC = ALL_SRC.filter((f) => !IS_TEST(f));

/* ── import-graph helpers ────────────────────────────────────────────────── */

/** Strip comments so a mention inside documentation is never read as an import. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * RUNTIME import specifiers only.
 *
 * A type-only import (`import type … from`) is erased by the compiler: the
 * module is never loaded and none of its code can execute. Following those
 * edges would make almost every module in the repository "reachable" from
 * almost every other one and would turn the detector below into noise — the
 * same mistake as calling a type-only consumer a route consumer.
 */
function specifiersOf(src: string): string[] {
  const s = stripComments(src);
  const out: string[] = [];
  const push = (re: RegExp) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) out.push(m[1]);
  };
  // `import type X from "y"` is excluded by the negative lookahead;
  // `import { type X, y } from "z"` still emits a runtime import and is followed.
  push(/\bimport\s+(?!type\s)(?:[\s\S]*?\bfrom\s+)?["']([^"']+)["']/g);
  push(/\bexport\s+(?!type\s)(?:\*(?:\s+as\s+\w+)?|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/g);
  push(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g);
  push(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g);
  return out;
}

/** Resolve an in-repo specifier to a real file, or null for a package import. */
function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  const candidates = [
    base,
    ...CODE_EXTS.map((e) => base + e),
    ...CODE_EXTS.map((e) => path.join(base, "index" + e)),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** Every in-repo module reachable from `entry`, including `entry` itself. */
function closureOf(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (!file || seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    for (const spec of specifiersOf(src)) {
      const resolved = resolveSpecifier(spec, file);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

/** Route modules are the ONLY files App Router turns into an HTTP endpoint. */
const ROUTE_MODULES = walk(APP).filter((f) =>
  /(^|\/)route\.(ts|tsx|js|jsx|mjs)$/.test(rel(f))
);

/**
 * Modules that produce plant-shaped operational values. A route whose closure
 * reaches any of these is serving factory-shaped data, whatever it is called.
 */
const PLANT_SHAPED_PRODUCERS = [
  path.join(SRC, "lib", "industrial", "simulator.ts"),
  path.join(SRC, "lib", "dashboard-demo"),
];

const reachesPlantShapedProducer = (closure: Set<string>) =>
  [...closure].filter((f) =>
    PLANT_SHAPED_PRODUCERS.some((p) => f === p || f.startsWith(p + path.sep))
  );

/* ── 1 · the route is gone, and nothing replaced it ──────────────────────── */

describe("109-B0 · the anonymous telemetry route is retired", () => {
  it("has no /api/telemetry route module", () => {
    expect(existsSync(path.join(APP, "api", "telemetry"))).toBe(false);
    const telemetryRoutes = ROUTE_MODULES.filter((f) => /\/api\/telemetry\/route\./.test(rel(f)));
    expect(telemetryRoutes.map(rel)).toEqual([]);
  });

  it("keeps the UNRELATED authenticated /api/industrial/telemetry route intact", () => {
    // Proof that the deletion was surgical: this is a different route, backed by
    // real records, and B0 must not have touched it.
    expect(existsSync(path.join(APP, "api", "industrial", "telemetry", "route.ts"))).toBe(true);
  });

  it("exposes NO route that can reach a plant-shaped data producer", () => {
    const offenders: string[] = [];
    for (const routeFile of ROUTE_MODULES) {
      const hits = reachesPlantShapedProducer(closureOf(routeFile));
      if (hits.length > 0) offenders.push(`${rel(routeFile)} -> ${hits.map(rel).join(", ")}`);
    }
    // A renamed replacement (/api/demo-telemetry, /api/public/metrics, anything)
    // fails HERE, on behaviour, not on its filename.
    expect(offenders).toEqual([]);
  });

  it("has no production source that fetches the retired endpoint", () => {
    const offenders = PRODUCTION_SRC.filter((f) => {
      const s = stripComments(readFileSync(f, "utf8"));
      return /["'`]\/api\/telemetry(?:[?#"'`])/.test(s + '"');
    }).map(rel);
    expect(offenders).toEqual([]);
  });
});

/* ── 2 · the obsolete service layer is gone ──────────────────────────────── */

describe("109-B0 · the obsolete telemetry service is removed", () => {
  it("has no telemetry-service module", () => {
    expect(existsSync(path.join(SRC, "lib", "services", "telemetry-service.ts"))).toBe(false);
  });

  it("has no telemetryService barrel export", () => {
    const barrel = readFileSync(path.join(SRC, "lib", "services", "index.ts"), "utf8");
    expect(barrel).not.toMatch(/telemetryService/);
    expect(barrel).not.toMatch(/telemetry-service/);
  });

  it("has no production importer of telemetryService anywhere", () => {
    const offenders = PRODUCTION_SRC.filter((f) => {
      const s = stripComments(readFileSync(f, "utf8"));
      return /\btelemetryService\b/.test(s);
    }).map(rel);
    expect(offenders).toEqual([]);
  });

  it("removed the TelemetryService interface, and kept DashboardSnapshot", () => {
    const types = readFileSync(path.join(SRC, "lib", "services", "types.ts"), "utf8");
    expect(types).not.toMatch(/export interface TelemetryService\b/);
    // DashboardSnapshot has real consumers (command logic + tests) and stays.
    expect(types).toMatch(/export interface DashboardSnapshot\b/);
  });
});

/* ── 3 · the local demo adapter is isolated ──────────────────────────────── */

describe("109-B0 · the local demo adapter performs no network operation", () => {
  const ADAPTER_DIR = path.join(SRC, "lib", "dashboard-demo");
  const adapterFiles = walk(ADAPTER_DIR).filter(
    (f) => CODE_EXTS.includes(path.extname(f)) && !IS_TEST(f)
  );

  it("ships at least the contract, the adapter and the barrel", () => {
    expect(adapterFiles.length).toBeGreaterThanOrEqual(3);
  });

  it("contains no network, socket, broker or database client anywhere in its closure", () => {
    const closure = new Set<string>();
    for (const f of adapterFiles) for (const c of closureOf(f)) closure.add(c);

    const NETWORK =
      /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|axios)\b|\bhttps?\.request\b|\bnet\.connect\b/;
    // A CLIENT is an IMPORT of one, never a word that appears in a string union:
    // `ConnectorKind = "opcua" | "modbus-tcp" | "mqtt"` is a type, not a broker.
    const CLIENT_MODULE =
      /^(@prisma\/client|mqtt|modbus-serial|node-opcua|redis|ioredis|pg|ws|undici|axios|node-fetch)(\/|$)/;

    const offenders: string[] = [];
    for (const f of closure) {
      const s = stripComments(readFileSync(f, "utf8"));
      if (NETWORK.test(s)) offenders.push(`${rel(f)} (network)`);
      for (const spec of specifiersOf(s)) {
        if (CLIENT_MODULE.test(spec)) offenders.push(`${rel(f)} imports ${spec}`);
      }
      if (/\bnew PrismaClient\b|@\/lib\/db\/prisma/.test(s)) offenders.push(`${rel(f)} (database)`);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps a tiny runtime closure — isolation is a size property too", () => {
    const closure = new Set<string>();
    for (const f of adapterFiles) for (const c of closureOf(f)) closure.add(c);
    expect([...closure].map(rel).sort()).toEqual([
      "src/lib/dashboard-demo/contract.ts",
      "src/lib/dashboard-demo/index.ts",
      "src/lib/dashboard-demo/local-demo-adapter.ts",
      "src/lib/industrial/simulator.ts",
    ]);
  });

  it("is imported by no route module", () => {
    const importers = ROUTE_MODULES.filter((f) =>
      [...closureOf(f)].some((c) => c.startsWith(ADAPTER_DIR + path.sep))
    ).map(rel);
    expect(importers).toEqual([]);
  });
});

/* ── 4 · demo mode is explicit, never a fallback ─────────────────────────── */

describe("109-B0 · demo mode is explicit, not inferred", () => {
  const adapterSrc = readFileSync(
    path.join(SRC, "lib", "dashboard-demo", "local-demo-adapter.ts"),
    "utf8"
  );
  const code = stripComments(adapterSrc);

  it("resolves the source with no argument and no conditional branch", () => {
    const fn = code.slice(code.indexOf("export function resolveDashboardSource"));
    const body = fn.slice(0, fn.indexOf("\n}") + 2);
    expect(body).toMatch(/resolveDashboardSource\(\)/); // takes no input
    expect(body).not.toMatch(/\bif\b|\?\?|\|\||\?\s*[^.]/); // no branch, no fallback
  });

  it("never mentions a live or real mode as a source it could fall back from", () => {
    expect(code).not.toMatch(/LIVE_READ_ONLY/);
    expect(code).not.toMatch(/["']REAL["']/);
    expect(code).not.toMatch(/HISTORICAL_REPLAY/);
  });

  it("has no client-selected mode parameter anywhere in the dashboard path", () => {
    const files = [
      path.join(SRC, "lib", "dashboard-demo", "local-demo-adapter.ts"),
      path.join(SRC, "lib", "dashboard-demo", "contract.ts"),
      path.join(SRC, "components", "dashboard", "DashboardClient.tsx"),
      path.join(ROOT, "src", "app", "[locale]", "dashboard", "page.tsx"),
    ];
    const MODE_PARAM =
      /searchParams|useSearchParams|URLSearchParams|[?&](mode|demo|live|source)=/;
    const offenders = files.filter((f) => MODE_PARAM.test(stripComments(readFileSync(f, "utf8")))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("stamps SIMULATED on the descriptor and on every frame", () => {
    const d = resolveDashboardSource();
    expect(d.classification).toBe("SIMULATED");
    expect(d.connectionMode).toBe("SIMULATED");
    expect(d.resolvedBy).toBe("SERVER");
    expect(isValidSourceDescriptor(d)).toBe(true);

    for (const t of [0, 1_700_000_000_000, Date.now()]) {
      const f = createLocalDemoFrame(t);
      expect(f.classification).toBe("SIMULATED");
      expect(f.connectionMode).toBe("SIMULATED");
      expect(f.provenance.network).toBe("NONE");
      expect(f.provenance.producedBy).toBe("LOCAL_DEMO_ADAPTER");
      expect(f.source.kind).toBe("DEMO_SCENARIO");
      expect(f.source.id).toMatch(/demo/i);
      expect(f.scope.scopeKind).toBe("DEMO_NO_TENANT");
      expect(f.scope.organizationId).toBeNull();
      expect(f.scope.siteId).toBeNull();
      expect(f.quality).toBe("GOOD");
      expect(typeof f.acquisitionTs).toBe("number");
      expect(typeof f.receivedTs).toBe("number");
    }
  });
});

/* ── 5 · the two axes stay distinct, and neither writes to a plant ───────── */

describe("109-B0 · classification and connection mode are different axes", () => {
  it("record classification is exactly the four documented values", () => {
    expect([...TELEMETRY_RECORD_CLASSIFICATIONS]).toEqual([
      "REAL",
      "SIMULATED",
      "REPLAYED",
      "IMPORTED",
    ]);
  });

  it("connection mode is exactly the three documented values", () => {
    expect([...TELEMETRY_CONNECTION_MODES]).toEqual([
      "SIMULATED",
      "LIVE_READ_ONLY",
      "HISTORICAL_REPLAY",
    ]);
  });

  it("the two enums are not interchangeable", () => {
    const a = new Set<string>(TELEMETRY_RECORD_CLASSIFICATIONS);
    const b = new Set<string>(TELEMETRY_CONNECTION_MODES);
    expect([...b].filter((v) => !a.has(v))).toEqual(["LIVE_READ_ONLY", "HISTORICAL_REPLAY"]);
    expect([...a].filter((v) => !b.has(v))).toEqual(["REAL", "REPLAYED", "IMPORTED"]);
  });

  it("NEITHER enum contains LIVE_CONTROL", () => {
    expect([...TELEMETRY_RECORD_CLASSIFICATIONS]).not.toContain("LIVE_CONTROL");
    expect([...TELEMETRY_CONNECTION_MODES]).not.toContain("LIVE_CONTROL");
    const contract = readFileSync(path.join(SRC, "lib", "dashboard-demo", "contract.ts"), "utf8");
    // The phrase may only appear in the prose that FORBIDS it.
    for (const line of stripComments(contract).split("\n")) {
      expect(line, `LIVE_CONTROL appears in executable code: ${line.trim()}`).not.toMatch(
        /LIVE_CONTROL/
      );
    }
  });

  it("documents telemetry IMPORTED as measurement history, not EngineeringImport", () => {
    const contract = readFileSync(path.join(SRC, "lib", "dashboard-demo", "contract.ts"), "utf8");
    expect(contract).toMatch(/IMPORTED\s+—\s+historical or measurement data/);
    expect(contract).toMatch(/EngineeringImport/);
    expect(contract).toMatch(/unrelated domains/);
    // The two must never be defined as the same thing.
    expect(contract).not.toMatch(/IMPORTED[^\n]*(?:means|is)\s+an?\s+EngineeringImport/i);
  });

  it("quality is an explicit three-state, never an absence", () => {
    expect([...TELEMETRY_QUALITIES]).toEqual(["GOOD", "BAD", "STALE"]);
  });
});

/* ── 6 · the envelope refuses everything it cannot classify ──────────────── */

describe("109-B0 · the classified envelope fails closed", () => {
  const good = () => createLocalDemoFrame(1_700_000_000_000);
  const drop = (key: keyof ClassifiedDashboardFrame) => {
    const f: Record<string, unknown> = { ...good() };
    delete f[key];
    return f;
  };

  it("accepts a well-formed frame", () => {
    const v = validateDashboardFrame(good(), resolveDashboardSource());
    expect(v.ok).toBe(true);
  });

  it("rejects a missing classification WITHOUT defaulting it", () => {
    const v = validateDashboardFrame(drop("classification"));
    expect(v).toEqual({ ok: false, reason: "MISSING_CLASSIFICATION" });
    // The critical property: nothing was substituted.
    expect(JSON.stringify(v)).not.toMatch(/SIMULATED|REAL/);
  });

  it("rejects an unknown classification", () => {
    expect(validateDashboardFrame({ ...good(), classification: "LIVE_CONTROL" })).toEqual({
      ok: false,
      reason: "UNKNOWN_CLASSIFICATION",
    });
  });

  it("rejects a missing connection mode without defaulting it", () => {
    const v = validateDashboardFrame(drop("connectionMode"));
    expect(v).toEqual({ ok: false, reason: "MISSING_CONNECTION_MODE" });
  });

  it("rejects a missing provenance", () => {
    expect(validateDashboardFrame(drop("provenance"))).toEqual({
      ok: false,
      reason: "MISSING_PROVENANCE",
    });
  });

  it("rejects a missing source identity, scope, quality, timestamps or snapshot", () => {
    expect(validateDashboardFrame(drop("source")).ok).toBe(false);
    expect(validateDashboardFrame(drop("scope"))).toEqual({ ok: false, reason: "MISSING_SCOPE" });
    expect(validateDashboardFrame(drop("quality"))).toEqual({ ok: false, reason: "MISSING_QUALITY" });
    expect(validateDashboardFrame(drop("acquisitionTs"))).toEqual({
      ok: false,
      reason: "MISSING_ACQUISITION_TS",
    });
    expect(validateDashboardFrame(drop("snapshot"))).toEqual({
      ok: false,
      reason: "MISSING_SNAPSHOT",
    });
  });

  it("rejects a frame that disagrees with the server-resolved descriptor", () => {
    // Per-field codes now: agreeing on classification while disagreeing about
    // the adapter is no longer agreement. The exhaustive matrix is asserted in
    // phase109b0-contract.test.ts.
    const frame = { ...good(), classification: "REAL" as const };
    expect(validateDashboardFrame(frame, resolveDashboardSource())).toEqual({
      ok: false,
      reason: "DESCRIPTOR_CLASSIFICATION_MISMATCH",
    });
  });

  it("rejects a malformed descriptor rather than assuming a mode", () => {
    expect(isValidSourceDescriptor(undefined)).toBe(false);
    expect(isValidSourceDescriptor({ ...resolveDashboardSource(), classification: undefined })).toBe(
      false
    );
    expect(isValidSourceDescriptor({ ...resolveDashboardSource(), resolvedBy: "CLIENT" })).toBe(false);
  });
});

/* ── 7 · security inventory and documentation tell the truth ─────────────── */

describe("109-B0 · security inventory and documentation", () => {
  it("no longer allowlists /api/telemetry as a public surface", () => {
    const surface = readFileSync(
      path.join(ROOT, "scripts", "security", "phase99", "public-surface.mjs"),
      "utf8"
    );
    const code = stripComments(surface);
    expect(code).not.toMatch(/path:\s*["']\/api\/telemetry["']/);
    expect(code).not.toMatch(/simulateSnapshot/);
  });

  it("the regenerated inventory contains no /api/telemetry handler and is self-consistent", () => {
    const inv = JSON.parse(
      readFileSync(path.join(ROOT, "docs", "security", "phase99-route-security-inventory.json"), "utf8")
    ) as {
      summary: { routeFiles: number; handlers: number; unknown: number };
      routes: { apiPath: string; file: string; classification: string }[];
    };

    expect(inv.routes.filter((r) => r.apiPath === "/api/telemetry")).toEqual([]);
    // Totals must be DERIVED from the rows, not trusted.
    expect(inv.summary.handlers).toBe(inv.routes.length);
    expect(inv.summary.routeFiles).toBe(new Set(inv.routes.map((r) => r.file)).size);
    expect(inv.summary.unknown).toBe(0);
    // Every listed route file must actually exist in the source tree.
    const missing = [...new Set(inv.routes.map((r) => r.file))].filter(
      (f) => !existsSync(path.join(ROOT, f))
    );
    expect(missing).toEqual([]);
    // And every route file in the source tree must be listed — with NO
    // exceptions. B0 recorded a carve-out here for two root-level route modules
    // the canonical generator could not see (FINDING-109B0-001). That finding is
    // closed in B0.1: the generator now enumerates the App Router root instead
    // of the `/api` subtree, so the exclusion list is gone rather than merely
    // shortened. A carve-out that outlives its cause is how a real deletion
    // hides.
    const rootLevelRoutes = [
      "src/app/indexnow-key.txt/route.ts",
      "src/app/llms.txt/route.ts",
    ];
    for (const f of rootLevelRoutes) {
      expect(existsSync(path.join(ROOT, f)), `${f} disappeared`).toBe(true);
      expect(reachesPlantShapedProducer(closureOf(path.join(ROOT, f)))).toEqual([]);
    }
    const listed = new Set(inv.routes.map((r) => r.file));
    for (const f of rootLevelRoutes) {
      expect(listed.has(f), `${f} is still missing from the inventory`).toBe(true);
    }
    const unlisted = ROUTE_MODULES.map(rel).filter((f) => !listed.has(f));
    expect(unlisted).toEqual([]);
  });

  it("the architecture document claims no shipped historian, gateway or plant link", () => {
    const doc = readFileSync(path.join(ROOT, "docs", "ARCHITECTURE.md"), "utf8");
    expect(doc).toMatch(/`\/api\/telemetry` route is \*\*retired\*\*/);
    expect(doc).toMatch(/No live Historian, gateway, PLC, OPC UA, Modbus, MQTT or factory connection is\s*\nshipped/);
    // The retired module must not still be presented as the seam of a shipped service.
    expect(doc).not.toMatch(/\*\*Historian\*\* \+ \*\*Industrial telemetry engine\*\* ← `telemetry-service\.ts`/);
  });
});
