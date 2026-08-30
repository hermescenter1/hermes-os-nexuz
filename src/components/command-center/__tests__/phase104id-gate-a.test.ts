/**
 * PHASE 104-I.D2 — Gate A contracts.
 *
 * Two kinds of assertion live here and they are deliberately not mixed up:
 *
 *   1. BEHAVIOURAL — run the real state model and assert what it produces.
 *      These are the tests that would go red if the fix were reverted.
 *   2. STRUCTURAL — read the shipped source and assert a property that is
 *      genuinely a property of the file (which HTTP verbs a route exports,
 *      whether a layout owns an <h1>). A source assertion is only used where
 *      the source IS the contract, never as a stand-in for behaviour.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  interpretResponse,
  isAlertsPayload,
  isValidAlert,
  isCount,
  selectQueue,
  buildLedger,
  dominantSeverity,
  distinctVendors,
  assessFreshness,
  msUntilStale,
  scheduleFreshnessCheck,
  STALE_AFTER_SECONDS,
  type AlertsPayload,
} from "../alarm-state";
import { SEVERITY_TEXT, SEVERITY_FILL, SEVERITY_BADGE, SEVERITY_ROW } from "../severity-tokens";
import type { OperationsAlert } from "@/lib/operations/types";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Source with comments removed.
 *
 * A structural gate that greps raw source will happily fire on the file's OWN
 * documentation — these files explain the `<h1>` ownership rule in prose, and a
 * naive `not.toContain("<h1")` fails on the sentence describing the fix rather
 * than on any rendered heading. Strip block comments, JSX comments and line
 * comments first, so every assertion below is about executable code.
 */
const code = (p: string) =>
  read(p)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "") // {/* JSX comment */}
    .replace(/\/\*[\s\S]*?\*\//g, "")           // /* block */
    .replace(/^\s*\/\/.*$/gm, "");              // // line

const ALERTS_ROUTE   = "src/app/api/operations/alerts/route.ts";
const ALARM_CLIENT   = "src/components/operations/AlertCommandClient.tsx";
const OPS_LAYOUT     = "src/app/[locale]/dashboard/operations/layout.tsx";
const OPS_TITLE      = "src/components/operations/OperationsPageTitle.tsx";
const DASH_CLIENT    = "src/components/dashboard/DashboardClient.tsx";
const OPS_PAGES = [
  "src/app/[locale]/dashboard/operations/page.tsx",
  "src/app/[locale]/dashboard/operations/sites/page.tsx",
  "src/app/[locale]/dashboard/operations/alerts/page.tsx",
  "src/app/[locale]/dashboard/operations/intelligence/page.tsx",
  "src/app/[locale]/dashboard/operations/war-room/page.tsx",
];

function alert(
  id: string,
  severity: "critical" | "warning" | "info",
  vendor = "v1",
): OperationsAlert {
  return {
    id, label: "L" + id, category: "Power", severity,
    vendor, vendorName: vendor, deviceId: "d", deviceLabel: "D",
    caseId: "c", status: "active",
  };
}

const payload = (over: Partial<AlertsPayload> = {}): AlertsPayload => ({
  alerts: [alert("a", "critical"), alert("b", "warning"), alert("c", "warning", "v2")],
  byCategory: [{ category: "Power", count: 3, severity: "critical" }],
  counts: { total: 3, critical: 1, warning: 2, info: 0 },
  builtAt: new Date().toISOString(),
  ...over,
}) as AlertsPayload;

/* ────────────────────────────────────────────────────────────────────────── */

describe("104-I.D2 — a failed read is never rendered as data", () => {
  /**
   * THE REGRESSION THIS PHASE FIXES.
   *
   * The shipped client called `.json()` on every response regardless of status,
   * so the 500 envelope `{error:"alerts_unavailable"}` was stored AS DATA. The
   * guard `if (error || !data)` then passed (the object is truthy) and the render
   * read `data.counts.total` off an object with no `counts` — a TypeError, i.e.
   * an API outage presented as a broken page rather than an honest state.
   */
  it("a 500 error envelope becomes a failure, never a payload", () => {
    const s = interpretResponse(500, false, { error: "alerts_unavailable" });
    expect(s.phase).toBe("failed");
    expect(s).not.toHaveProperty("payload");
    if (s.phase === "failed") expect(s.failure.kind).toBe("unavailable");
  });

  it("a 429 is distinguished from a generic outage", () => {
    const s = interpretResponse(429, false, null);
    expect(s.phase).toBe("failed");
    if (s.phase === "failed") expect(s.failure.kind).toBe("rateLimited");
  });

  it("a 200 carrying the wrong shape is a failure, not empty data", () => {
    // This is the subtle one: status is fine, so a naive client would render
    // "no alarms" from a body that never described alarms at all.
    const s = interpretResponse(200, true, { error: "nope" });
    expect(s.phase).toBe("failed");
    if (s.phase === "failed") expect(s.failure.kind).toBe("malformed");
  });

  it("a well-formed 200 becomes ready", () => {
    const s = interpretResponse(200, true, payload());
    expect(s.phase).toBe("ready");
  });

  it("payload validation rejects partial counts", () => {
    expect(isAlertsPayload({ alerts: [], byCategory: [], builtAt: "x", counts: { total: 1 } })).toBe(false);
    expect(isAlertsPayload(payload())).toBe(true);
  });
});

describe("104-I.D2 — empty and filtered-empty are different facts", () => {
  it("no alarms at all reports empty", () => {
    const q = selectQueue(payload({ alerts: [], counts: { total: 0, critical: 0, warning: 0, info: 0 } }), "all");
    expect(q.kind).toBe("empty");
  });

  it("alarms exist but none match the filter reports filtered, with the real remainder", () => {
    const q = selectQueue(payload(), "info");
    expect(q.kind).toBe("filtered");
    if (q.kind === "filtered") {
      expect(q.filter).toBe("info");
      expect(q.totalAvailable).toBe(3);
    }
  });

  it("matching alarms are listed", () => {
    const q = selectQueue(payload(), "warning");
    expect(q.kind).toBe("list");
    if (q.kind === "list") expect(q.alerts).toHaveLength(2);
  });
});

describe("104-I.D2 — unknown is never drawn as zero or success", () => {
  it("a zero total yields zero-width segments, not a full calm bar", () => {
    const l = buildLedger({ total: 0, critical: 0, warning: 0, info: 0 });
    expect(l.every((s) => s.percent === 0)).toBe(true);
  });

  it("segments are proportions of the real total", () => {
    const l = buildLedger({ total: 4, critical: 1, warning: 2, info: 1 });
    expect(l.find((s) => s.severity === "warning")!.percent).toBe(50);
  });

  it("dominant severity is null when nothing is observed", () => {
    expect(dominantSeverity({ total: 0, critical: 0, warning: 0, info: 0 })).toBeNull();
    expect(dominantSeverity({ total: 1, critical: 0, warning: 1, info: 0 })).toBe("warning");
  });

  it("blank vendor ids are not counted as a vendor", () => {
    expect(distinctVendors([alert("a", "info", ""), alert("b", "info", "x")])).toBe(1);
  });

  it("an unparseable or future build time is unknown, never a plausible age", () => {
    expect(assessFreshness("not-a-date", Date.now()).kind).toBe("unknown");
    expect(assessFreshness(new Date(Date.now() + 60_000).toISOString(), Date.now()).kind).toBe("unknown");
  });

  it("an old build time is stale, not current", () => {
    const old = new Date(Date.now() - (STALE_AFTER_SECONDS + 60) * 1000).toISOString();
    expect(assessFreshness(old, Date.now()).kind).toBe("stale");
  });
});

describe("104-I.D2 §4 — a 200 with a bad body is a failure, not data", () => {
  const base = () => JSON.parse(JSON.stringify(payload()));

  const reject = (label: string, mutate: (p: Record<string, unknown>) => void) => {
    it(label, () => {
      const p = base();
      mutate(p);
      expect(isAlertsPayload(p), "validator").toBe(false);
      const st = interpretResponse(200, true, p);
      expect(st.phase, "state").toBe("failed");
      if (st.phase === "failed") expect(st.failure.kind).toBe("malformed");
    });
  };

  reject("rejects an alert that is an empty object", (p) => { (p.alerts as unknown[])[0] = {}; });
  reject("rejects an unknown severity", (p) => { ((p.alerts as Record<string, unknown>[])[0]).severity = "catastrophic"; });
  reject("rejects a non-string vendor", (p) => { ((p.alerts as Record<string, unknown>[])[0]).vendor = 7; });
  reject("rejects a non-string id", (p) => { ((p.alerts as Record<string, unknown>[])[0]).id = 42; });
  reject("rejects a negative count", (p) => { ((p.counts as Record<string, unknown>)).info = -1; });
  reject("rejects a fractional count", (p) => { ((p.counts as Record<string, unknown>)).warning = 1.5; });
  reject("rejects total disagreeing with the alert array", (p) => { ((p.counts as Record<string, unknown>)).total = 99; });
  reject("rejects severity counts that do not sum to total", (p) => {
    const c = p.counts as Record<string, number>;
    c.critical = 0; c.warning = 3;
  });
  reject("rejects a category ledger that disagrees with the alerts", (p) => {
    (p.byCategory as Record<string, unknown>[])[0].count = 99;
  });
  reject("rejects a duplicate alert id", (p) => {
    const a = p.alerts as Record<string, unknown>[];
    a[1].id = a[0].id;
  });
  reject("rejects a duplicate category", (p) => {
    (p.byCategory as unknown[]).push({ category: "Power", count: 3, severity: "critical" });
  });
  reject("rejects a non-string builtAt", (p) => { p.builtAt = 12345; });

  it("accepts a fully coherent payload", () => {
    expect(isAlertsPayload(base())).toBe(true);
    expect(interpretResponse(200, true, base()).phase).toBe("ready");
  });

  it("a rejected payload never reaches a render path", () => {
    // The point of the whole exercise: malformed must not become `ready`, and
    // must not throw either.
    const st = interpretResponse(200, true, { alerts: [{}], byCategory: [], counts: {}, builtAt: "x" });
    expect(st.phase).toBe("failed");
  });
});

describe("104-I.D2 §4 — each guard is independently load-bearing", () => {
  /**
   * The payload checks are layered, so removing any ONE of them often still
   * leaves the payload rejected by a later check. That is good defence in
   * depth, but it means a whole-payload test cannot prove a single guard is
   * doing work. These assertions exercise each predicate in isolation, so a
   * negative control that deletes one check flips exactly one assertion.
   */
  const goodAlert = {
    id: "a", label: "L", category: "Power", severity: "critical",
    vendor: "v", vendorName: "V", deviceId: "d", deviceLabel: "D",
    caseId: "c", status: "active",
  };

  it("isValidAlert rejects an empty object", () => {
    expect(isValidAlert({})).toBe(false);
    expect(isValidAlert(goodAlert)).toBe(true);
  });

  it("isValidAlert rejects an unknown severity", () => {
    expect(isValidAlert({ ...goodAlert, severity: "catastrophic" })).toBe(false);
  });

  it("isValidAlert rejects a non-string field", () => {
    expect(isValidAlert({ ...goodAlert, vendor: 7 })).toBe(false);
    expect(isValidAlert({ ...goodAlert, id: 42 })).toBe(false);
  });

  it("isValidAlert rejects an empty id", () => {
    expect(isValidAlert({ ...goodAlert, id: "" })).toBe(false);
  });

  it("isCount rejects a negative count", () => {
    expect(isCount(-1)).toBe(false);
  });

  it("isCount rejects a fractional count", () => {
    expect(isCount(1.5)).toBe(false);
    expect(isCount(3)).toBe(true);
  });
});

describe("104-I.D2 §5 — freshness ages without a remount", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("a payload that starts fresh becomes stale once the threshold passes", () => {
    const t0 = Date.parse("2026-08-26T12:00:00.000Z");
    const builtAt = new Date(t0).toISOString();

    expect(assessFreshness(builtAt, t0).kind).toBe("fresh");
    // Same payload, no refetch, no remount — only time moves.
    const later = t0 + (STALE_AFTER_SECONDS + 60) * 1000;
    expect(assessFreshness(builtAt, later).kind).toBe("stale");
  });

  it("schedules exactly one re-evaluation, at the crossing point", () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    const builtAt = new Date(t0).toISOString();

    let fired = 0;
    const cleanup = scheduleFreshnessCheck(builtAt, t0, () => { fired++; });

    vi.advanceTimersByTime(STALE_AFTER_SECONDS * 1000 - 1000);
    expect(fired, "must not fire early").toBe(0);

    vi.advanceTimersByTime(3000);
    expect(fired, "must fire once past the threshold").toBe(1);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(fired, "must not poll").toBe(1);
    cleanup();
  });

  it("cleanup cancels the pending timer", () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    let fired = 0;
    const cleanup = scheduleFreshnessCheck(new Date(t0).toISOString(), t0, () => { fired++; });
    cleanup();
    vi.advanceTimersByTime(STALE_AFTER_SECONDS * 2000);
    expect(fired).toBe(0);
  });

  it("an already-stale or unreadable timestamp schedules nothing", () => {
    const t0 = Date.now();
    expect(msUntilStale(new Date(t0 - STALE_AFTER_SECONDS * 2000).toISOString(), t0)).toBeNull();
    expect(msUntilStale("not-a-date", t0)).toBeNull();
  });

  it("the component drives freshness from state, not from a render-time clock", () => {
    const src = code("src/components/operations/AlertCommandClient.tsx");
    expect(src).not.toMatch(/assessFreshness\([^)]*Date\.now\(\)/);
    expect(src).toContain("scheduleFreshnessCheck");
  });
});

describe("104-I.D2 — severity colour is exhaustive over a closed union", () => {
  it.each([
    ["text", SEVERITY_TEXT], ["fill", SEVERITY_FILL],
    ["badge", SEVERITY_BADGE], ["row", SEVERITY_ROW],
  ])("%s map covers exactly critical/warning/info", (_n, map) => {
    expect(Object.keys(map).sort()).toEqual(["critical", "info", "warning"]);
  });

  /**
   * Gate A.1 §6 — the affirmative-accent gate now covers ALL FOUR maps.
   *
   * It previously inspected only SEVERITY_TEXT, so the fill, badge and row maps
   * were listed as "covered" while nothing actually checked them: any of the
   * three could have been repainted in the success accent without a red test.
   */
  const ALL_SEVERITY_MAPS: Array<[string, Record<string, string>]> = [
    ["SEVERITY_TEXT", SEVERITY_TEXT],
    ["SEVERITY_FILL", SEVERITY_FILL],
    ["SEVERITY_BADGE", SEVERITY_BADGE],
    ["SEVERITY_ROW", SEVERITY_ROW],
  ];

  it.each(ALL_SEVERITY_MAPS)("%s paints no severity in the affirmative accent", (_n, map) => {
    for (const [sev, v] of Object.entries(map)) {
      expect(v, sev).not.toMatch(/\bsignal\b/);
      expect(v, sev).not.toMatch(/hs--confident/);
      expect(v, sev).not.toMatch(/hs--reasoning/);
    }
  });

  it("informational severity does not borrow a healthy-posture token", () => {
    // `hs--nominal` is visually neutral, but the word asserts "operating
    // normally" — a posture claim an informational ALARM cannot make.
    for (const [, map] of ALL_SEVERITY_MAPS) {
      expect(map.info).not.toContain("nominal");
    }
  });

  it("every map is exhaustive over the closed union", () => {
    for (const [name, map] of ALL_SEVERITY_MAPS) {
      expect(Object.keys(map).sort(), name).toEqual(["critical", "info", "warning"]);
    }
  });
});

describe("104-I.D2 — a failure is not announced as a polite status", () => {
  const src = code("src/components/command-center/StateBoundary.tsx");

  it("role and live-region politeness are derived from tone, not hard-coded", () => {
    expect(src).not.toMatch(/role="status"/);
    expect(src).not.toMatch(/aria-live="polite"/);
    expect(src).toContain("TONE_ROLE[tone]");
    expect(src).toContain("TONE_LIVE[tone]");
  });

  it("dangerous and throttled failures announce assertively; calm states stay polite", async () => {
    const mod = await import("../StateBoundary");
    // The maps are module-private by design; assert through the source contract.
    expect(src).toMatch(/neutral:\s*"status"/);
    expect(src).toMatch(/warning:\s*"alert"/);
    expect(src).toMatch(/danger:\s*"alert"/);
    expect(src).toMatch(/neutral:\s*"polite"/);
    expect(src).toMatch(/warning:\s*"assertive"/);
    expect(src).toMatch(/danger:\s*"assertive"/);
    expect(typeof mod.StateBoundary).toBe("function");
  });
});

describe("104-I.D2 — the Alarm Center is read-only", () => {
  it("the alerts route exports GET and nothing else", () => {
    const src = read(ALERTS_ROUTE);
    const verbs = [...src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)]
      .map((m) => m[1]);
    expect(verbs).toEqual(["GET"]);
  });

  it("the client issues no mutating request", () => {
    const src = code(ALARM_CLIENT);
    expect(src).not.toMatch(/method\s*:\s*["'](POST|PUT|PATCH|DELETE)["']/i);
  });

  it("no acknowledgement control exists — not even a disabled decoy", () => {
    const src = code(ALARM_CLIENT);
    expect(src).not.toMatch(/acknowledg/i);
    expect(src).not.toMatch(/\back\b/i);
  });

  it("the surface states its read-only boundary to the user", () => {
    const en = JSON.parse(read("messages/en.json"));
    expect(en.dashboard.alarms.provenance.readOnly).toMatch(/read-only/i);
  });
});

describe("104-I.D2 — exactly one meaningful H1 per operations route", () => {
  it("the family layout owns no <h1>", () => {
    // A layout cannot know which child it wraps. When it owned the heading, all
    // five operations routes announced the same name.
    expect(code(OPS_LAYOUT)).not.toContain("<h1");
  });

  it("the shared page title renders exactly one <h1>", () => {
    expect((code(OPS_TITLE).match(/<h1/g) ?? []).length).toBe(1);
  });

  it.each(OPS_PAGES)("%s renders exactly one page title and no <h1> of its own", (p) => {
    const src = code(p);
    expect((src.match(/<OperationsPageTitle/g) ?? []).length).toBe(1);
    expect(src).not.toContain("<h1");
  });

  it("each operations route uses a distinct heading key", () => {
    const keys = OPS_PAGES.map((p) => code(p).match(/titleKey="([^"]+)"/)?.[1]);
    expect(new Set(keys).size).toBe(OPS_PAGES.length);
    expect(keys.every(Boolean)).toBe(true);
  });
});

describe("104-I.D2 — styling goes through the token layer", () => {
  const NEW_FILES = [
    ALARM_CLIENT,
    "src/components/command-center/SeverityLedger.tsx",
    "src/components/command-center/StateBoundary.tsx",
    "src/components/command-center/ProvenanceFooter.tsx",
    "src/components/command-center/severity-tokens.ts",
    "src/components/operations/OperationsSubNav.tsx",
    "src/components/operations/OperationsPageTitle.tsx",
    OPS_LAYOUT,
  ];

  it.each(NEW_FILES)("%s contains no literal colour or shadow", (p) => {
    const src = code(p);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/rgba?\(/);
    expect(src).not.toMatch(/boxShadow/);
  });

  it("the dashboard panel no longer carries an inline rgba shadow", () => {
    // Comments may mention rgba() as history; executable style must not use it.
    const code = read(DASH_CLIENT)
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(code).not.toMatch(/boxShadow/);
    expect(code).not.toMatch(/rgba\(/);
  });

  it("the dashboard no longer keys status colour off an open string map", () => {
    const src = read(DASH_CLIENT);
    expect(src).not.toMatch(/statusColor\s*:\s*Record<string/);
    expect(src).not.toContain("statusColor[");
  });
});

describe("104-I.D2 — a semantic tone is never defeated by a component class", () => {
  /**
   * `.type-panel-title` in globals.css hard-sets `color: var(--muted)`. Combining
   * it with a tone utility in the same className produced a title that LOOKED
   * identical whether the surface was calm, stale or failed — the exact
   * "unknown state styled as fine" failure this phase exists to prevent, and one
   * no amount of correct copy fixes.
   *
   * Any globals.css class that hard-sets `color` is disqualified from carrying a
   * tone. The list is derived from the stylesheet, not remembered.
   */
  const css = read("src/app/globals.css");
  const colorSetting = new Set<string>();
  for (const m of css.matchAll(/\.([a-z0-9-]+)\s*\{([^}]*)\}/gi)) {
    if (/(^|;|\s)color\s*:/.test(m[2])) colorSetting.add(m[1]);
  }

  it("globals.css really does hard-set colour on type-panel-title", () => {
    // Guards the premise: if this ever stops being true the test below is moot.
    expect(colorSetting.has("type-panel-title")).toBe(true);
  });

  const TONED = [
    "src/components/command-center/StateBoundary.tsx",
    "src/components/command-center/SeverityLedger.tsx",
  ];

  it.each(TONED)("%s never pairs a tone token with a colour-setting class", (p) => {
    const src = code(p);
    for (const m of src.matchAll(/className=\{`([^`]*)`\}/g)) {
      const expr = m[1];
      const carriesTone = /TONE_TITLE\[|SEVERITY_TEXT\[/.test(expr);
      if (!carriesTone) continue;
      const classes = expr.split(/[\s${}[\]]+/).filter(Boolean);
      const offender = classes.find((c) => colorSetting.has(c));
      expect(offender, `tone would be overridden by .${offender}`).toBeUndefined();
    }
  });
});

describe("104-I.D2 — no gate is silently vacuous", () => {
  /**
   * The most dangerous defect this phase produced, and it happened TWICE.
   *
   * A text-substitution step turned a regex escape into a literal BACKSPACE
   * byte (0x08), so the affirmative-accent check became /<BS>signal<BS>/ — a
   * pattern that can never match. It reported PASS while a severity really was
   * painted in the success accent. The same corruption produced the evidence
   * verifier's machine-identity regex, which also could not match anything.
   *
   * A gate that CANNOT fail is worse than no gate: it turns an unchecked
   * property into a green tick. This makes the class detectable.
   */
  const GATE_SOURCES = [
    "src/components/command-center/__tests__/phase104id-gate-a.test.ts",
    "src/components/command-center/alarm-state.ts",
    "src/components/command-center/severity-tokens.ts",
    "src/components/command-center/StateBoundary.tsx",
  ];

  it.each(GATE_SOURCES)("%s contains no stray control character", (p) => {
    const src = read(p);
    const stray = [...src].filter((c) => {
      const o = c.codePointAt(0);
      return o !== undefined && o < 32 && c !== "\t" && c !== "\r" && c !== "\n";
    });
    expect(stray.length, `${stray.length} control byte(s) — an escape was eaten`).toBe(0);
  });

  it("the affirmative-accent patterns actually match the text they forbid", () => {
    // Proves the gate can fail: each forbidden token must be detected in a
    // string that contains it. A corrupted pattern fails this immediately.
    expect(/\bsignal\b/.test("bg-signal")).toBe(true);
    expect(/\bsignal\b/.test("text-signal")).toBe(true);
    expect(/\bsignal\b/.test("border-signal/25 bg-signal/[0.03]")).toBe(true);
    expect(/hs--confident/.test("hs-badge hs--confident")).toBe(true);
    expect(/hs--reasoning/.test("hs-badge hs--reasoning")).toBe(true);
    // And that it stays quiet on the tokens actually in use.
    expect(/\bsignal\b/.test("text-danger")).toBe(false);
    expect(/\bsignal\b/.test("bg-muted/60")).toBe(false);
  });

  it("a repainted severity map is genuinely detected", () => {
    // The end-to-end proof: run the real rule over a deliberately repainted map.
    const repainted: Record<string, string> = { critical: "bg-signal", warning: "bg-warn", info: "bg-muted/60" };
    const offenders = Object.entries(repainted).filter(([, v]) => /\bsignal\b/.test(v));
    expect(offenders.map(([k]) => k)).toEqual(["critical"]);
  });
});

describe("104-I.D §3A — the mobile tab rail never clips a destination", () => {
  const src = code("src/components/operations/OperationsSubNav.tsx");

  it("the rail scrolls itself rather than the page", () => {
    expect(src).toContain("overflow-x-auto");
    expect(src).toContain("overscroll-x-contain");
  });

  it("labels are never truncated or ellipsised", () => {
    // A half-read destination ("ALARM CEN") is worse than one you must scroll to.
    expect(src).toContain("whitespace-nowrap");
    expect(src).not.toMatch(/truncate|line-clamp|text-ellipsis/);
  });

  it("the active tab is brought into view on mount and on navigation", () => {
    expect(src).toContain("aria-current");
    expect(src).toMatch(/scrollBy|scrollLeft/);
    expect(src).toMatch(/useEffect\(/);
    expect(src).toMatch(/\[pathname\]/);
  });

  it("the rail scrolls itself, not the document", () => {
    // `scrollIntoView` would also scroll the page and fight the layout.
    expect(src).not.toContain("scrollIntoView");
  });

  it("every tab meets the 44px minimum target", () => {
    expect(src).toContain("min-h-11");
  });

  it("the edge affordance cannot swallow a tap", () => {
    expect(src).toContain("pointer-events-none");
    expect(src).toContain('aria-hidden="true"');
  });
});

describe("104-I.D §3B — operational copy is never ellipsised", () => {
  const SURFACES = [
    "src/app/[locale]/dashboard/operations/layout.tsx",
    "src/components/operations/OperationsPageTitle.tsx",
    "src/components/operations/AlertCommandClient.tsx",
    "src/components/command-center/StateBoundary.tsx",
  ];

  it.each(SURFACES)("%s clamps no operational copy", (p) => {
    const src = code(p);
    expect(src).not.toMatch(/line-clamp-\d/);
    expect(src).not.toMatch(/text-ellipsis/);
  });

  it("the family description and the page lead wrap in full", () => {
    expect(code("src/app/[locale]/dashboard/operations/layout.tsx"))
      .toMatch(/leading-relaxed/);
    expect(code("src/components/operations/OperationsPageTitle.tsx"))
      .toMatch(/leading-relaxed/);
  });
});

describe("104-I.D §3C — the outage surface reads as a failure", () => {
  const src = code("src/components/command-center/StateBoundary.tsx");

  it("is bounded to a reading measure rather than full-bleed", () => {
    expect(src).toMatch(/max-w-2xl/);
  });

  it("keeps role/live derived from tone and fail-closed", () => {
    expect(src).toContain("TONE_ROLE[tone]");
    expect(src).toContain("TONE_LIVE[tone]");
    expect(src).not.toMatch(/role="status"/);
  });

  it("separates status, explanation, attribution and action", () => {
    expect(src).toContain("TONE_TITLE[tone]");   // status
    expect(src).toMatch(/\{body &&/);            // explanation
    expect(src).toMatch(/\{detail &&/);          // attribution
    expect(src).toMatch(/\{action &&/);          // action
    expect(src).toMatch(/border-t border-line/); // action is separated
  });

  it("the severity marker never uses the affirmative accent", () => {
    const dot = src.slice(src.indexOf("TONE_DOT"), src.indexOf("TONE_DOT") + 260);
    expect(dot).not.toMatch(/\bsignal\b/);
  });
});

describe("104-I.D §3C — the Retry control is reachable and named", () => {
  const src = code("src/components/operations/AlertCommandClient.tsx");

  it("meets 44x44 in both dimensions", () => {
    // A short localized label ("Alle", "همه") would otherwise be under-wide.
    expect(src).toContain("min-h-11");
    expect(src).toContain("min-w-11");
  });

  it("renders a visible focus ring", () => {
    expect(src).toMatch(/focus-visible:ring/);
  });

  it("takes its accessible name from the catalogue, not a glyph", () => {
    expect(src).toContain('t("state.retry")');
  });
});

describe("104-I.D §5 — a failure state never claims health", () => {
  const flat = (o: unknown, p = ""): [string, string][] =>
    o !== null && typeof o === "object"
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k))
      : [[p, String(o)]];

  const catalogue = (l: string) =>
    Object.fromEntries(flat(JSON.parse(read(`messages/${l}.json`)).dashboard));

  const FAILURE_KEYS = [
    "alarms.state.errorTitle", "alarms.state.errorBody",
    "alarms.state.rateLimitedTitle", "alarms.state.rateLimitedBody",
  ];

  const HEALTHY = /\b(all clear|nominal|healthy|operating normally|no alarms|alles in ordnung|störungsfrei|unauffällig)\b/i;

  /**
   * Healthy vocabulary is forbidden as a CLAIM, not as a word.
   *
   * The German copy reads "…dies ist keine Meldung, dass die Anlage
   * störungsfrei ist" — the healthy term appears inside an explicit denial,
   * which is precisely what honest failure copy should say. A rule that flags
   * the word regardless of negation would push the copy toward saying LESS
   * about what the outage does not mean, which is the opposite of the goal.
   *
   * So: split into sentences, and only fail when a healthy term appears in a
   * sentence carrying no negation.
   */
  const NEGATION = /\b(not|never|no|isn't|does not|keine|kein|nicht|niemals)\b|نیست|نه |به معنای/i;

  const healthyClaims = (text: string) =>
    text
      .split(/(?<=[.!?۔])\s+/)
      .filter((sentence) => HEALTHY.test(sentence) && !NEGATION.test(sentence));

  it.each(["en", "de", "fa"])("%s failure copy makes no healthy CLAIM", (l) => {
    const c = catalogue(l);
    for (const k of FAILURE_KEYS) {
      expect(c[k], k).toBeDefined();
      expect(healthyClaims(c[k]), `${k}: "${c[k]}"`).toEqual([]);
    }
  });

  it("the rule still catches a healthy claim that is NOT negated", () => {
    // Guards the premise: without this, the negation carve-out could silently
    // swallow a genuine "all clear" and the gate would be vacuous.
    expect(healthyClaims("The alarm feed failed. All clear.")).toHaveLength(1);
    expect(healthyClaims("Die Anlage ist störungsfrei.")).toHaveLength(1);
    expect(healthyClaims("This is not a report that the estate is nominal.")).toEqual([]);
  });

  it("the English failure copy states the state is UNKNOWN", () => {
    expect(catalogue("en")["alarms.state.errorBody"]).toMatch(/UNKNOWN/);
    expect(catalogue("de")["alarms.state.errorBody"]).toMatch(/UNBEKANNT/);
    expect(catalogue("fa")["alarms.state.errorBody"]).toMatch(/نامشخص/);
  });

  it("a failure is never rendered from the ready branch", () => {
    // The behavioural half: a 500 cannot become a payload, in any locale.
    const st = interpretResponse(500, false, { error: "alerts_unavailable" });
    expect(st.phase).toBe("failed");
  });
});

describe("104-I.D2 — catalogue parity for the new surfaces", () => {
  const flat = (o: unknown, p = ""): [string, string][] =>
    o !== null && typeof o === "object"
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k))
      : [[p, String(o)]];

  const cat = (l: string) =>
    Object.fromEntries(flat(JSON.parse(read(`messages/${l}.json`)).dashboard));

  const en = cat("en"), de = cat("de"), fa = cat("fa");
  const NEW = Object.keys(en).filter((k) => k.startsWith("operations.") || k.startsWith("alarms."));

  it("the Gate A surfaces contributed the expected leaf count", () => {
    // 54 from 104-I.D2 (dashboard.operations + dashboard.alarms), plus the 4
    // dashboard.operations.intelligenceTabs leaves added when the Intelligence
    // Wall's own tabs stopped being hard-coded English in every locale.
    expect(NEW.length).toBe(58);
  });

  it("every new key exists in all three catalogues", () => {
    for (const k of NEW) {
      expect(de, k).toHaveProperty(k);
      expect(fa, k).toHaveProperty(k);
    }
  });

  it("no new German or Persian value is an English carryover", () => {
    expect(NEW.filter((k) => de[k] === en[k])).toEqual([]);
    expect(NEW.filter((k) => fa[k] === en[k])).toEqual([]);
  });

  it("Persian uses Persian ya and kaf", () => {
    expect(NEW.filter((k) => /[يك]/.test(fa[k]))).toEqual([]);
  });

  it("ICU arguments match across locales", () => {
    const args = (v: string) => [...v.matchAll(/\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]).sort().join("|");
    for (const k of NEW) {
      expect(args(de[k]), k).toBe(args(en[k]));
      expect(args(fa[k]), k).toBe(args(en[k]));
    }
  });

  it("the error copy refuses to imply the estate is clear", () => {
    expect(en["alarms.state.errorBody"]).toMatch(/UNKNOWN/);
    expect(en["alarms.state.errorTitle"]).not.toMatch(/no alarms/i);
  });
});
