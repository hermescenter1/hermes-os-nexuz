// @vitest-environment jsdom
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";
import {
  DEVICE_TONE,
  HEALTH_TONE,
  LINE_TONE,
  RISK_TREND_TONE,
  STATUS_GLYPH,
  STATUS_TONE_CLASS,
  SimulatedStatus,
  type RiskTrend,
  type SimulatedStatusValue,
  type StatusTone,
} from "../SimulatedDataDisclosure";
import type { DeviceStatus, HealthStatus, LineStatus } from "@/lib/services/types";

/**
 * PHASE 104-I.D / D.0-R3 — the status/tone TYPE contract.
 *
 * The accepted Phase 104-I.D2 contribution to this screen was not a component;
 * it was a compile-time discipline. One `Record<string, string>` served four
 * unrelated domains, so `"down"` — falling risk, a good outcome — sat in the
 * same table as `offline` and `fault`, and both readings type-checked. Two call
 * sites had no fallback, so a miss emitted the class name `undefined`.
 *
 * Half of this file is therefore checked by `tsc`, not by the runner. Every
 * `@ts-expect-error` below is an ASSERTION: if the error it predicts stops
 * happening, TypeScript reports the directive as unused and `npx tsc --noEmit`
 * fails. That is what makes these real compile-time tests rather than runtime
 * assertions wearing a type-shaped costume — a runtime `expect` cannot observe
 * a type that has been widened back to `string`.
 *
 * `tsconfig.json` includes `**​/*.ts`, so this file is inside the typecheck.
 */

/*
 * The declarations below are assertions addressed to the COMPILER, so they are
 * unused at runtime by construction — that is the whole mechanism, not an
 * oversight. Deleting them to satisfy the rule would delete the test.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */

/* ── type-level helpers (no new dependency) ──────────────────────────────── */

/** Invariant equality — distinguishes `"a" | "b"` from `string`, unlike `extends`. */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

/* ── 1. the domains are exactly what the mappings assume ─────────────────── */

/*
 * These pin the SHAPE the tables are built against. If a domain union gains or
 * loses a member, the equality fails here — naming the domain — instead of
 * surfacing later as an unstyled status nobody notices.
 */
type _LineExact = Expect<Equal<LineStatus, "running" | "idle" | "fault">>;
type _DeviceExact = Expect<Equal<DeviceStatus, "online" | "offline" | "fault">>;
type _HealthExact = Expect<Equal<HealthStatus, "ok" | "warning" | "degraded">>;
type _TrendExact = Expect<Equal<RiskTrend, "up" | "down" | "flat">>;

/** Risk trend is a DIRECTION and must never join the renderable status union. */
type _SimIsThreeDomains = Expect<Equal<SimulatedStatusValue, LineStatus | DeviceStatus | HealthStatus>>;
// @ts-expect-error — "up" is a risk direction, not a status SimulatedStatus can render.
const _trendIsNotAStatus: SimulatedStatusValue = "up";

/** The tone vocabulary is closed. */
type _ToneExact = Expect<Equal<StatusTone, "signal" | "muted" | "warn" | "danger">>;

/* ── 2. an invalid literal cannot cross a typed internal call ────────────── */

type StatusProps = Parameters<typeof SimulatedStatus>[0];

// @ts-expect-error — `status` no longer accepts an arbitrary string.
const _invalidStatusLiteral: StatusProps["status"] = "sprinting";
// @ts-expect-error — a widened `string` is not assignable to the closed union.
const _widenedStatus: StatusProps["status"] = "running" as string;
// @ts-expect-error — `tone` is a semantic token, not a class name.
const _toneIsNotAClassName: StatusProps["tone"] = "text-signal";
// @ts-expect-error — an invented tone is rejected.
const _invalidTone: StatusProps["tone"] = "critical";

/* ── 3. removing or adding a mapping entry is a compile-time failure ─────── */

/*
 * The negative-control harness performs these mutations on the real files. The
 * two declarations below prove the MECHANISM catches them, in-file and under
 * the same compiler, so a harness that silently stopped injecting could not
 * make the guarantee disappear unnoticed.
 */

// @ts-expect-error — a tone table missing `fault` does not satisfy the domain.
const _toneMissingMember: Record<LineStatus, StatusTone> = { running: "signal", idle: "muted" };

// @ts-expect-error — a glyph table missing a member of the union is rejected.
const _glyphMissingMember: Record<SimulatedStatusValue, string> = {
  running: "▶", online: "●", ok: "●", idle: "◌", warning: "▲", degraded: "▲", fault: "■",
};

// @ts-expect-error — a NEW union member with no mapping fails until one is added.
const _newMemberUnmapped: Record<LineStatus | "commissioning", StatusTone> = {
  running: "signal", idle: "muted", fault: "danger",
};

const _rawClassValue: Record<LineStatus, StatusTone> = {
  // @ts-expect-error — a tone table cannot smuggle in a raw class string.
  running: "text-signal",
  idle: "muted",
  fault: "danger",
};

/* ── 4. runtime cover, over an INDEPENDENT expectation ───────────────────── */

/*
 * These lists are the test's own expectation, not a re-read of the tables. They
 * are welded to the real unions by the equalities above, so a domain change
 * cannot quietly change what "every status" means.
 */
const LINE: LineStatus[] = ["running", "idle", "fault"];
const DEVICE: DeviceStatus[] = ["online", "offline", "fault"];
const HEALTH: HealthStatus[] = ["ok", "warning", "degraded"];
const TREND: RiskTrend[] = ["up", "down", "flat"];
const ALL_STATUSES: SimulatedStatusValue[] = [...new Set([...LINE, ...DEVICE, ...HEALTH])];

describe("PHASE 104-I.D / D.0-R3 — status/tone contract", () => {
  it("gives every renderable status a glyph, and holds nothing else", () => {
    for (const s of ALL_STATUSES) expect(STATUS_GLYPH[s]).toBeTruthy();
    expect(Object.keys(STATUS_GLYPH).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("gives every status in every domain a tone", () => {
    for (const s of LINE) expect(LINE_TONE[s]).toBeTruthy();
    for (const s of DEVICE) expect(DEVICE_TONE[s]).toBeTruthy();
    for (const s of HEALTH) expect(HEALTH_TONE[s]).toBeTruthy();
    for (const s of TREND) expect(RISK_TREND_TONE[s]).toBeTruthy();
  });

  it("maps every tone to a class, and every table value to a real tone", () => {
    const tones: StatusTone[] = ["signal", "muted", "warn", "danger"];
    for (const tone of tones) expect(STATUS_TONE_CLASS[tone]).toMatch(/^text-/);
    expect(Object.keys(STATUS_TONE_CLASS).sort()).toEqual([...tones].sort());
    for (const table of [LINE_TONE, DEVICE_TONE, HEALTH_TONE, RISK_TREND_TONE]) {
      for (const value of Object.values(table)) expect(tones).toContain(value);
    }
  });

  /**
   * The defect the accepted work removed, pinned as a test.
   *
   * A single table cannot express both readings of "down": falling risk is the
   * good outcome, a device that is down is not. Separate domains are what make
   * both true at once, so this assertion fails the moment they are merged again.
   */
  it("keeps the two readings of a status word apart", () => {
    expect(RISK_TREND_TONE.down).toBe("signal");
    expect(DEVICE_TONE.offline).toBe("danger");
    expect(DEVICE_TONE.fault).toBe("danger");
    expect(RISK_TREND_TONE.up).toBe("danger");
  });

  /** No status may be rendered with a tone that carries no colour. */
  it("never yields an empty or undefined class for a valid status", () => {
    const resolved = [
      ...LINE.map((s) => STATUS_TONE_CLASS[LINE_TONE[s]]),
      ...DEVICE.map((s) => STATUS_TONE_CLASS[DEVICE_TONE[s]]),
      ...HEALTH.map((s) => STATUS_TONE_CLASS[HEALTH_TONE[s]]),
      ...TREND.map((s) => STATUS_TONE_CLASS[RISK_TREND_TONE[s]]),
    ];
    for (const cls of resolved) {
      expect(cls).toBeTruthy();
      expect(cls).not.toContain("undefined");
    }
  });
});

/* ── 5. the rendered matrix, per status and per locale ───────────────────── */

/**
 * Typing the mapping is only half the claim. These render every status in every
 * locale and read what actually reaches the DOM and the accessibility tree, so
 * "the tone is typed" cannot stand in for "the state is disclosed".
 *
 * The tone that the port narrowed must not have cost the screen any of the
 * channels newer main introduced: shape, localized word, marker and snapshot
 * path. Each is asserted per case rather than once over a blended render.
 */
const MESSAGES = { en, de, fa } as const;
type Loc = keyof typeof MESSAGES;
const LOCALES: Loc[] = ["en", "de", "fa"];

/** The domain each renderable status belongs to, and therefore its tone table. */
const TONE_OF: Record<SimulatedStatusValue, StatusTone> = {
  running: LINE_TONE.running,
  idle: LINE_TONE.idle,
  fault: LINE_TONE.fault,
  online: DEVICE_TONE.online,
  offline: DEVICE_TONE.offline,
  ok: HEALTH_TONE.ok,
  warning: HEALTH_TONE.warning,
  degraded: HEALTH_TONE.degraded,
};

/** Computed accessible name: honours aria-label, skips aria-hidden subtrees. */
function accessibleName(el: Element): string {
  const label = el.getAttribute("aria-label");
  if (label) return label.replace(/\s+/g, " ").trim();
  let out = "";
  const visit = (node: Node) => {
    if (node.nodeType === 3) { out += node.nodeValue ?? ""; return; }
    if (node.nodeType !== 1) return;
    const e = node as Element;
    if (e.getAttribute("aria-hidden") === "true") return;
    const own = e.getAttribute("aria-label");
    if (own) { out += " " + own + " "; return; }
    for (const child of Array.from(e.childNodes)) visit(child);
  };
  for (const child of Array.from(el.childNodes)) visit(child);
  return out.replace(/\s+/g, " ").trim();
}

const CASES = LOCALES.flatMap((locale) =>
  ALL_STATUSES.map((status) => ({ locale, status })),
);

/*
 * Written as a loop with literal titles rather than `it.each` with a `$locale`
 * template, because the JSON reporter emits the template UNINTERPOLATED — so a
 * matrix built from reporter output would read every case as missing while the
 * suite itself was green. The titles are the matrix; they have to be real.
 */
describe("PHASE 104-I.D / D.0-R3 — rendered status matrix", () => {
  for (const { locale, status } of CASES) {
    it(`${locale} / ${status} — shape, word, marker, tone and path all survive`, async () => {
    const msgs = MESSAGES[locale] as unknown as {
      dashboard: { status: Record<string, string>; provenance: { valueMarker: string } };
    };
    const label = msgs.dashboard.status[status];
    const marker = msgs.dashboard.provenance.valueMarker;
    expect(label, `${locale} is missing a word for ${status}`).toBeTruthy();
    expect(marker, `${locale} is missing the value marker`).toBeTruthy();

    const path = `matrix.${status}`;
    const m = await mount(
      createElement(SimulatedStatus, { status, label, marker, path, tone: TONE_OF[status] }),
    );
    const el = m.container.querySelector("[data-hermes-operational-value]");
    expect(el, "the status wrapper is missing").not.toBeNull();
    const wrapper = el as Element;

    /* tone — the class is applied, and it is the one the domain table chose. */
    expect(wrapper.className).toContain(STATUS_TONE_CLASS[TONE_OF[status]]);
    expect(wrapper.className).not.toContain("undefined");

    /* shape — the glyph is present and is the one mapped to this status. */
    const glyph = wrapper.querySelector(".hermes-sim-status__glyph");
    expect(glyph, "the glyph is missing").not.toBeNull();
    expect(glyph!.textContent).toBe(STATUS_GLYPH[status]);
    expect(glyph!.getAttribute("aria-hidden")).toBe("true");

    /* word and marker — both inside the element's own accessible name, so the
       state is never carried by colour alone. */
    const name = accessibleName(wrapper);
    expect(name).toContain(label);
    expect(name).toContain(marker);

    /* disclosure attributes newer main introduced. */
    expect(wrapper.getAttribute("data-hermes-operational-value")).toBe("simulated");
    expect(wrapper.getAttribute("data-hermes-snapshot-path")).toBe(path);

      await m.unmount();
    });
  }

  /**
   * Two statuses share a glyph on purpose (`online`/`ok` are both ●), so shape
   * alone does not separate every state — which is exactly why the word channel
   * must be present, and why colour alone was never acceptable.
   */
  it("distinguishes every status by word even where the shape repeats", () => {
    const words = new Set(ALL_STATUSES.map((s) => (en as unknown as {
      dashboard: { status: Record<string, string> };
    }).dashboard.status[s]));
    expect(words.size).toBe(ALL_STATUSES.length);
  });
});
