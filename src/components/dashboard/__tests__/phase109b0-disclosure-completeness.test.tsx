// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";

/**
 * PHASE 109-B0 — the DISCLOSURE COMPLETENESS ORACLE.
 *
 * ══ WHY THIS EXISTS, AND WHY IT WAS REWRITTEN TWICE ══
 *
 * v1 walked `[data-hermes-operational-value]` and proved every element it found
 * carried the marker. That is true by construction and stays true while half the
 * screen is never wrapped at all.
 *
 * v2 added a sentinel snapshot and a token list — better, but the list was
 * hand-written and therefore incomplete. Five classes of output were rendered
 * with no wrapper and no token, so they were in neither the numerator nor the
 * denominator: `lines[*].id`, `lines[*].status`, and the `tag` of every
 * temperature, pressure and flow series. The line, PLC and SCADA states were
 * `aria-hidden` coloured dots — legible only by hue, and absent from the
 * accessibility tree entirely.
 *
 * v3 (this file) closes the loop from the OUTPUT side. Every snapshot-derived
 * element now carries `data-hermes-snapshot-path`, and the test asserts an
 * EXACT SET:
 *
 *   · a path in the inventory but missing from the render  → MISSING
 *   · a path in the render but not in the inventory        → UNEXPECTED
 *   · a rendered path whose element lacks the marker       → UNDISCLOSED
 *   · a state with no accessible word                      → NO_ACCESSIBLE_STATUS
 *
 * Each is reported separately, because collapsing them hides whichever one is
 * currently broken.
 *
 * The sentinel values are chosen so no token is a substring of another and none
 * collides with the real `usePlatformFacts` counts (30 / 14 / 7) that share the
 * screen and must NOT be marked as simulated.
 */

/* ── sentinel snapshot ───────────────────────────────────────────────────── */

const SENTINEL_TS = Date.UTC(2026, 0, 2, 4, 5, 6); // formats as 04:05:06 under UTC

const SENTINEL = {
  overview: {
    oee: 61,
    availability: 62,
    performance: 63,
    quality: 64,
    activeLines: 7,
    totalLines: 8,
  },
  lines: [{ id: "LX9", status: "running" as const, throughput: 94, target: 95 }],
  plc: [{ id: "PLCX9", model: "MX9", status: "online" as const, cycleMs: 96 }],
  scada: {
    servers: [{ id: "SCDX9", status: "online" as const, latencyMs: 97 }],
    tagsPolled: 77,
    updateRateMs: 78,
  },
  network: { devices: 74, online: 75, blockedEvents: 76, ids: "degraded" as const },
  alarms: {
    counts: { critical: 41, high: 13, medium: 17, low: 19 },
    recent: [{ id: "AX9", severity: "critical" as const, msgKey: "m1", ts: SENTINEL_TS }],
  },
  temperature: [
    { tag: "TTX9", value: 93, unit: "C", min: 91, max: 92, history: [10, 20, 30] },
  ],
  pressure: [{ tag: "PTX9", value: 86, unit: "bar", min: 84, max: 85, history: [10, 20, 30] }],
  flow: [{ tag: "FTX9", value: 53, unit: "lpm", min: 51, max: 52, history: [10, 20, 30] }],
  energy: { nowKw: 71, todayKwh: 72, peakKw: 73, history: [10, 20, 30] },
  ai: [
    { id: "AIX1", recKey: "r1", confidence: 0.99 },
    { id: "AIX2", recKey: "r2", confidence: 0.88 },
  ],
  maintenance: [
    { id: "MX1", assetKey: "a1", priority: 2, dueDays: 98, severity: "critical" as const },
  ],
  risk: { score: 67, trend: "up" as const, factors: [{ key: "f1", weight: 0.5 }] },
};

vi.mock("@/lib/industrial/simulator", () => ({
  // The real adapter and the real validator still run: only the mathematics is
  // replaced, so the frame under test is produced and accepted by production code.
  //
  // `ts` is PINNED rather than passed through. With the real clock the frame's
  // acquisition and receipt times printed the current time, whose digits
  // collided at random with the sentinel tokens — an oracle that fails on
  // Tuesdays is not an oracle. Pinning also exercises the adapter's own
  // invariant on a fixed instant: snapshot.ts === acquisitionTs === receivedTs.
  simulateSnapshot: () => ({ ...SENTINEL, ts: SENTINEL_TS }),
}));

/* The Platform Intelligence panel fetches and polls and renders no snapshot value. */
vi.mock("../ExecutiveOverview", () => ({
  ExecutiveOverview: () => <div data-testid="exec-overview" />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

const { DashboardClient } = await import("../DashboardClient");
const { resolveDashboardSource } = await import("@/lib/dashboard-demo");

/* ── computed accessible semantics ───────────────────────────────────────── */

function accessibleName(el: Element): string {
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    return labelledby
      .split(/\s+/)
      .map((id) => {
        const t = el.ownerDocument.getElementById(id);
        return t ? accessibleName(t) : "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const label = el.getAttribute("aria-label");
  if (label) return label.replace(/\s+/g, " ").trim();

  let out = "";
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      out += node.nodeValue ?? "";
      return;
    }
    if (node.nodeType !== 1) return;
    const e = node as Element;
    if (e.getAttribute("aria-hidden") === "true") return;
    if ((e as HTMLElement).hidden) return;
    const own = e.getAttribute("aria-label");
    if (own) {
      out += " " + own + " ";
      return;
    }
    for (const child of Array.from(e.childNodes)) visit(child);
  };
  for (const child of Array.from(el.childNodes)) visit(child);
  return out.replace(/\s+/g, " ").trim();
}

function accessibleDescription(el: Element): string {
  const ids = el.getAttribute("aria-describedby");
  if (!ids) return "";
  return ids
    .split(/\s+/)
    .map((id) => {
      const t = el.ownerDocument.getElementById(id);
      return t ? accessibleName(t) : "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the element sits inside a subtree hidden from assistive tech. */
function hiddenFromAT(el: Element): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (cur.getAttribute("aria-hidden") === "true") return true;
    cur = cur.parentElement;
  }
  return false;
}

const MARKER = en.dashboard.provenance.valueMarker;
const D = en.dashboard;

/* ── the snapshot-path inventory ─────────────────────────────────────────── */

/**
 * Every snapshot leaf this screen renders, for the sentinel above (one line, one
 * PLC, one SCADA server, one series per panel, one alarm, one maintenance item,
 * two AI recommendations, one risk factor).
 *
 * `derived.*` are values computed FROM the snapshot rather than read from it
 * directly; `command.*` are the operational command surface's own derivations.
 * Both are still simulated output and are disclosed as such.
 */
const EXPECTED_PATHS: string[] = [
  /* command surface */
  "command.posture",
  "command.summaryNote",
  "command.activeLines",
  "command.lastUpdated",
  "command.beaconNote",
  "command.attention[0]",
  "command.attention[1]",
  "command.risk.score",
  "command.risk.trend",
  "command.risk.factors[0]",
  "command.evidence[0]",
  "command.evidence[1]",
  "command.evidence[2]",
  "command.readiness",
  /* overview + strip */
  "overview.oee",
  "overview.availability",
  "overview.performance",
  "overview.quality",
  "overview.activeLines",
  /* global operations */
  "network.devices",
  "derived.platformPosture",
  "derived.operationalStatus",
  /* production lines */
  "lines[0].id",
  "lines[0].status",
  "lines[0].throughput",
  "lines[0].fill",
  /* alarms */
  "alarms.total",
  "alarms.counts.critical",
  "alarms.counts.high",
  "alarms.counts.medium",
  "alarms.counts.low",
  "alarms.recent[0]",
  /* risk */
  "risk.score",
  "risk.trend",
  "risk.factors[0].weight",
  "risk.factors[0].fill",
  /* asset health */
  "derived.assetHealth.critical",
  "derived.assetHealth.high",
  "derived.assetHealth.medium",
  "derived.assetHealth.tracked",
  "derived.assetHealth.criticalWarning",
  /* maintenance + AI */
  "maintenance[0]",
  "ai[0]",
  "ai[1]",
  /* metric series */
  "temperature[0].tag",
  "temperature[0].value",
  "temperature[0].range",
  "temperature[0].history",
  "pressure[0].tag",
  "pressure[0].value",
  "pressure[0].range",
  "pressure[0].history",
  "flow[0].tag",
  "flow[0].value",
  "flow[0].range",
  "flow[0].history",
  /* energy */
  "energy.nowKw",
  "energy.todayKwh",
  "energy.peakKw",
  "energy.history",
  /* control systems */
  "scada.servers[0]",
  "scada.servers[0].status",
  "scada.tagsPolled",
  "scada.updateRateMs",
  "plc[0]",
  "plc[0].status",
  "network.online",
  "network.ids",
  "network.blockedEvents",
  /* freshness */
  "snapshot.ts",
].sort();

/** Snapshot-derived STATES that must reach assistive technology as a word. */
const ACCESSIBLE_STATES: { path: string; word: string }[] = [
  { path: "lines[0].status", word: D.status.running },
  { path: "plc[0].status", word: D.status.online },
  { path: "scada.servers[0].status", word: D.status.online },
  { path: "network.ids", word: D.status.degraded },
];

/* ── the token oracle ────────────────────────────────────────────────────── */

type Token = { id: string; needle: string; numeric?: boolean };

const OPERATIONAL_TOKENS: Token[] = [
  /* overview + KPI strip */
  { id: "overview.oee", needle: "61", numeric: true },
  { id: "overview.availability (value and the strip's delta line)", needle: "62", numeric: true },
  { id: "overview.performance", needle: "63", numeric: true },
  { id: "overview.quality", needle: "64", numeric: true },
  { id: "overview.lines (strip composite)", needle: "7/8" },
  /* alarms */
  { id: "alarms.total", needle: "90", numeric: true },
  { id: "alarms.counts.critical (badge and the strip's note line)", needle: "41", numeric: true },
  { id: "alarms.counts.high", needle: "13", numeric: true },
  { id: "alarms.counts.medium", needle: "17", numeric: true },
  { id: "alarms.counts.low", needle: "19", numeric: true },
  { id: "alarms.recent[0].msgKey", needle: D.alarmsP.msgs.m1 },
  /* risk */
  { id: "risk.score (strip and hero)", needle: "67", numeric: true },
  { id: "risk.trend word", needle: D.riskP.trend.up },
  { id: "risk.factors[0].weight", needle: "50", numeric: true },
  { id: "derived platform posture (100 - risk)", needle: "33", numeric: true },
  /* energy */
  { id: "energy.nowKw", needle: "71", numeric: true },
  { id: "energy.todayKwh (panel and the strip's note line)", needle: "72", numeric: true },
  { id: "energy.peakKw", needle: "73", numeric: true },
  /* network */
  { id: "network.devices", needle: "74", numeric: true },
  { id: "network.online", needle: "75", numeric: true },
  { id: "network.blockedEvents", needle: "76", numeric: true },
  { id: "network.ids status label", needle: D.status.degraded },
  /* scada + plc — IDENTIFIERS as well as values (v3) */
  { id: "scada.servers[0].id", needle: "SCDX9" },
  { id: "scada.tagsPolled", needle: "77", numeric: true },
  { id: "scada.updateRateMs", needle: "78", numeric: true },
  { id: "scada.servers[0].latencyMs", needle: "97", numeric: true },
  { id: "plc[0].id", needle: "PLCX9" },
  { id: "plc[0].cycleMs", needle: "96", numeric: true },
  /* lines — ID and STATE (v3) */
  { id: "lines[0].id", needle: "LX9" },
  { id: "lines[0].status word", needle: D.status.running },
  { id: "lines[0].throughput", needle: "94", numeric: true },
  { id: "lines[0].target", needle: "95", numeric: true },
  /* metric series — TAG as well as value (v3) */
  { id: "temperature[0].tag", needle: "TTX9" },
  { id: "temperature[0].min", needle: "91", numeric: true },
  { id: "temperature[0].max", needle: "92", numeric: true },
  { id: "temperature[0].value", needle: "93", numeric: true },
  { id: "pressure[0].tag", needle: "PTX9" },
  { id: "pressure[0].min", needle: "84", numeric: true },
  { id: "pressure[0].max", needle: "85", numeric: true },
  { id: "pressure[0].value", needle: "86", numeric: true },
  { id: "flow[0].tag", needle: "FTX9" },
  { id: "flow[0].min", needle: "51", numeric: true },
  { id: "flow[0].max", needle: "52", numeric: true },
  { id: "flow[0].value", needle: "53", numeric: true },
  /* maintenance */
  { id: "maintenance[0].assetKey", needle: D.maintenanceP.assets.a1 },
  { id: "maintenance[0].dueDays", needle: "98", numeric: true },
  /* AI recommendations */
  { id: "ai[0].confidence", needle: "99", numeric: true },
  { id: "ai[1].confidence", needle: "88", numeric: true },
  { id: "ai[0] recommendation title", needle: D.aiP.recs.r1.title },
  { id: "ai[1] recommendation title", needle: D.aiP.recs.r2.title },
  { id: "ai[0] recommendation body", needle: D.aiP.recs.r1.desc },
  /* derived status prose */
  { id: "operational status phrase", needle: D.command.signal.criticalEventsActive },
  { id: "command posture label", needle: D.command.posture.critical },
  { id: "command posture note", needle: D.command.posture.criticalNote },
  /* freshness */
  { id: "snapshot freshness stamp", needle: "04:05:06" },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The disclosure furniture is not operational output.
 *
 * The mode chip, the watermark and the provenance block exist to STATE what the
 * data is; demanding that each of their own rows additionally announce
 * "simulated value" would bury the disclosure in itself. They are exempted here
 * — and only they. `DISCLOSURE_REGIONS` is asserted below, so the exemption
 * cannot quietly grow to cover an operational panel.
 */
const DISCLOSURE_REGIONS = [
  ".hermes-sim-chip-bar",
  "[data-hermes-simulated-watermark]",
  ".hermes-sim-provenance",
] as const;

const inDisclosureFurniture = (el: Element) =>
  DISCLOSURE_REGIONS.some((sel) => el.closest(sel) !== null);

/**
 * Search over a clone with the furniture REMOVED.
 *
 * Merely skipping elements inside the furniture was not enough: the
 * deepest-match walk then selected the furniture's parent, which is outside it
 * and still carries its text. Cutting the subtree out removes that escape.
 */
function prune(container: Element): Element {
  const clone = container.cloneNode(true) as Element;
  for (const sel of DISCLOSURE_REGIONS) {
    for (const node of Array.from(clone.querySelectorAll(sel))) node.remove();
  }
  return clone;
}

/** The deepest elements whose text carries the token (numeric = whole number). */
function occurrences(root: Element, token: Token): Element[] {
  const re = token.numeric
    ? new RegExp(`(?<![0-9])${escapeRe(token.needle)}(?![0-9])`)
    : null;
  const norm = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ");
  const all = Array.from(root.querySelectorAll("*")).filter((el) =>
    re ? re.test(norm(el)) : norm(el).includes(token.needle.replace(/\s+/g, " "))
  );
  return all.filter((el) => !all.some((other) => other !== el && el.contains(other)));
}

function withIntl(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <div dir="ltr">{ui}</div>
    </NextIntlClientProvider>
  );
}

const render = () => mount(withIntl(<DashboardClient source={resolveDashboardSource()} />));

/* ── tests ───────────────────────────────────────────────────────────────── */

describe("109-B0 · disclosure completeness oracle", () => {
  it("renders the sentinel snapshot through the real adapter and validator", async () => {
    const { container, unmount } = await render();
    // The sentinel must actually have been accepted: a rejected frame renders
    // the unavailable panel, and every assertion below would be trivially true.
    expect(container.querySelector(".hermes-sim-provenance")).not.toBeNull();
    expect(container.querySelectorAll("[data-hermes-operational-value]").length).toBeGreaterThan(30);
    await unmount();
  });

  it("renders EXACTLY the expected inventory of snapshot paths", async () => {
    const { container, unmount } = await render();
    const rendered = [
      ...new Set(
        Array.from(container.querySelectorAll("[data-hermes-snapshot-path]")).map(
          (el) => el.getAttribute("data-hermes-snapshot-path") ?? ""
        )
      ),
    ].sort();

    const missing = EXPECTED_PATHS.filter((p) => !rendered.includes(p));
    const unexpected = rendered.filter((p) => !EXPECTED_PATHS.includes(p));

    // Reported separately: a missing path is an output that stopped being
    // disclosed; an unexpected one is an output nobody has reviewed.
    expect(missing, "expected snapshot paths that were not rendered").toEqual([]);
    expect(unexpected, "rendered snapshot paths outside the inventory").toEqual([]);
    await unmount();
  });

  it("marked and pathed are the same set — no marked element without a path", async () => {
    // The two attributes must agree exactly. A marked element with no path is
    // an output nobody can enumerate; a pathed element with no marker is an
    // output nobody discloses. The inventory found one of the first kind: a
    // STATIC caption in the KPI strip was claiming to be simulated data.
    const { container, unmount } = await render();
    const marked = Array.from(container.querySelectorAll("[data-hermes-operational-value]"));
    const pathed = Array.from(container.querySelectorAll("[data-hermes-snapshot-path]"));
    const markedWithoutPath = marked
      .filter((el) => !el.hasAttribute("data-hermes-snapshot-path"))
      .map((el) => (el.className || el.tagName).toString().slice(0, 70));
    const pathedWithoutMark = pathed
      .filter((el) => !el.hasAttribute("data-hermes-operational-value"))
      .map((el) => el.getAttribute("data-hermes-snapshot-path"));
    expect(markedWithoutPath, "marked as simulated but naming no snapshot leaf").toEqual([]);
    expect(pathedWithoutMark, "names a snapshot leaf but is not marked").toEqual([]);
    expect(marked.length).toBe(pathed.length);
    await unmount();
  });

  it("every rendered snapshot path carries the marker in its own accessible semantics", async () => {
    const { container, unmount } = await render();
    const undisclosed: string[] = [];
    for (const el of Array.from(container.querySelectorAll("[data-hermes-snapshot-path]"))) {
      const path = el.getAttribute("data-hermes-snapshot-path") ?? "?";
      if (hiddenFromAT(el)) {
        undisclosed.push(`${path} — hidden from assistive technology`);
        continue;
      }
      const semantics = `${accessibleName(el)} ${accessibleDescription(el)}`;
      if (!semantics.includes(MARKER)) undisclosed.push(`${path} — no marker in accessible name`);
    }
    expect(undisclosed, "snapshot outputs rendered without disclosure").toEqual([]);
    await unmount();
  });

  it("every snapshot-derived STATE reaches assistive technology as a word, not a colour", async () => {
    const { container, unmount } = await render();
    const problems: string[] = [];
    for (const { path, word } of ACCESSIBLE_STATES) {
      const el = container.querySelector(`[data-hermes-snapshot-path="${path}"]`);
      if (!el) {
        problems.push(`${path} — not rendered`);
        continue;
      }
      if (hiddenFromAT(el)) {
        problems.push(`${path} — hidden from assistive technology`);
        continue;
      }
      const name = accessibleName(el);
      if (!name.includes(word)) problems.push(`${path} — accessible name lacks "${word}"`);
      if (!name.includes(MARKER)) problems.push(`${path} — accessible name lacks the marker`);
    }
    expect(problems, "states with no accessible word").toEqual([]);
    await unmount();
  });

  it("every snapshot-derived output token is PRESENT and DISCLOSED", async () => {
    const { container, unmount } = await render();
    const root = prune(container);
    const absent: string[] = [];
    const undisclosed: string[] = [];

    for (const token of OPERATIONAL_TOKENS) {
      const hits = occurrences(root, token);
      if (hits.length === 0) {
        absent.push(`${token.id} — token ${JSON.stringify(token.needle)} not rendered`);
        continue;
      }
      for (const hit of hits) {
        const marked = hit.closest("[data-hermes-operational-value]");
        if (!marked) {
          undisclosed.push(
            `${token.id} — no marked ancestor for ${JSON.stringify(token.needle)} :: ` +
              (hit as HTMLElement).outerHTML.replace(/\s+/g, " ").slice(0, 180)
          );
          continue;
        }
        if (!accessibleName(marked).includes(MARKER)) {
          undisclosed.push(
            `${token.id} — marked ancestor has no simulated marker in its accessible name`
          );
        }
      }
    }

    expect(absent, "snapshot-derived outputs that stopped rendering").toEqual([]);
    expect(undisclosed, "snapshot-derived outputs rendered without disclosure").toEqual([]);
    await unmount();
  });

  it("covers every class Codex found undisclosed, by name", async () => {
    const { container, unmount } = await render();
    const root = prune(container);
    const disclosed = (needle: string, numeric = false) => {
      const hits = occurrences(root, { id: needle, needle, numeric });
      expect(hits.length, `not rendered: ${needle}`).toBeGreaterThan(0);
      return hits.every((h) => {
        const m = h.closest("[data-hermes-operational-value]");
        return m !== null && accessibleName(m).includes(MARKER);
      });
    };

    /* correction round 1 */
    expect(disclosed("91", true), "MetricRows min").toBe(true);
    expect(disclosed("92", true), "MetricRows max").toBe(true);
    expect(disclosed("62", true), "KPI strip delta line").toBe(true);
    expect(disclosed("72", true), "KPI strip note line").toBe(true);
    expect(disclosed(D.riskP.trend.up), "risk trend word").toBe(true);
    expect(disclosed("04:05:06"), "final updated timestamp").toBe(true);
    expect(disclosed(D.status.degraded), "snapshot-derived status label").toBe(true);
    expect(disclosed(D.command.signal.criticalEventsActive), "operational status phrase").toBe(true);
    expect(disclosed(D.aiP.recs.r1.title), "AI recommendation title").toBe(true);
    expect(disclosed(D.aiP.recs.r1.desc), "AI recommendation body").toBe(true);
    expect(disclosed(D.command.posture.criticalNote), "posture summary note").toBe(true);

    /* correction round 2 */
    expect(disclosed("LX9"), "line identifier").toBe(true);
    expect(disclosed("TTX9"), "temperature tag").toBe(true);
    expect(disclosed("PTX9"), "pressure tag").toBe(true);
    expect(disclosed("FTX9"), "flow tag").toBe(true);
    expect(disclosed("PLCX9"), "PLC identifier").toBe(true);
    expect(disclosed("SCDX9"), "SCADA server identifier").toBe(true);
    expect(disclosed(D.status.running), "line state word").toBe(true);
    await unmount();
  });

  it("exempts only the three disclosure regions, and each of them exists", async () => {
    const { container, unmount } = await render();
    expect(DISCLOSURE_REGIONS.length).toBe(3);
    for (const sel of DISCLOSURE_REGIONS) {
      expect(container.querySelector(sel), `disclosure region missing: ${sel}`).not.toBeNull();
    }
    const marked = Array.from(container.querySelectorAll("[data-hermes-operational-value]"));
    const outside = marked.filter((el) => !inDisclosureFurniture(el));
    expect(outside.length).toBe(marked.length);
    await unmount();
  });

  it("still does NOT mark the real platform-fact counts as simulated", async () => {
    // The oracle must not be satisfiable by marking everything: the three
    // Global Operations cells fed by usePlatformFacts carry REAL published
    // counts, and claiming they are simulated would be its own false statement.
    const { container, unmount } = await render();
    const cells = Array.from(container.querySelectorAll(".global-ops-cell"));
    for (const label of [
      D.command.globalOps.knowledgeVolume,
      D.command.globalOps.engineeringCases,
      D.command.globalOps.supportedVendors,
    ]) {
      const cell = cells.find((c) => (c.textContent ?? "").includes(label));
      expect(cell, `cell missing: ${label}`).toBeDefined();
      expect(cell!.querySelector("[data-hermes-operational-value]")).toBeNull();
      expect(cell!.querySelector("[data-hermes-snapshot-path]")).toBeNull();
    }
    await unmount();
  });
});
