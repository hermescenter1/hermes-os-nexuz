// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";
import { DashboardClient } from "../DashboardClient";
import { resolveDashboardSource } from "@/lib/dashboard-demo";
import type { DashboardSourceDescriptor } from "@/lib/dashboard-demo";

/**
 * PHASE 109-B0 — structural disclosure on the MAIN Executive Dashboard.
 *
 * Before B0 this screen rendered synthetic OEE, alarms, PLC scan times and
 * SCADA latency with no disclosure that travelled with the values. The separate
 * Industrial Dashboard's hard-coded "Simulated" labels are a different screen
 * and never covered this one.
 *
 * These assertions read COMPUTED ACCESSIBLE SEMANTICS, not raw page text: the
 * name computation below honours `aria-labelledby`, then `aria-label`, and
 * otherwise walks content while SKIPPING `aria-hidden` subtrees. Wrapping the
 * marker in `aria-hidden` — the obvious way to "keep" it while removing it from
 * assistive technology — therefore fails here.
 */

/* The Platform Intelligence panel fetches and polls; it renders no operational
   telemetry value and is not what this file is about. */
vi.mock("../ExecutiveOverview", () => ({
  ExecutiveOverview: () => <div data-testid="exec-overview" />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

const MESSAGES = { en, de, fa } as const;
type Loc = keyof typeof MESSAGES;
const LOCALES: Loc[] = ["en", "de", "fa"];
const DIR: Record<Loc, "ltr" | "rtl"> = { en: "ltr", de: "ltr", fa: "rtl" };

function withIntl(locale: Loc, ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="UTC">
      <div dir={DIR[locale]}>{ui}</div>
    </NextIntlClientProvider>
  );
}

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
    // Excluded from the accessibility tree entirely.
    if (e.getAttribute("aria-hidden") === "true") return;
    if ((e as HTMLElement).hidden) return;
    if ((e as HTMLElement).style?.display === "none") return;
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

const SOURCE = resolveDashboardSource();

async function renderDashboard(locale: Loc, source: DashboardSourceDescriptor = SOURCE) {
  return mount(withIntl(locale, <DashboardClient source={source} />));
}

/* ── 1 · the three visual disclosure layers ──────────────────────────────── */

describe.each(LOCALES)("109-B0 · disclosure layers render in %s", (locale) => {
  const m = MESSAGES[locale].dashboard.provenance;

  it("shows a persistent simulated-mode chip exposed as a status", async () => {
    const { container, unmount } = await renderDashboard(locale);
    const chip = container.querySelector("[data-hermes-simulated-chip='true']");
    expect(chip, "no simulated-mode chip").not.toBeNull();
    expect(chip!.getAttribute("role")).toBe("status");
    const name = accessibleName(chip!);
    expect(name).toContain(m.chipLabel);
    expect(name).toContain(m.chipDetail);
    // Colour is never the disclosure: the words must be there.
    expect(name.length).toBeGreaterThan(m.chipLabel.length);
    await unmount();
  });

  it("shows the visible SIMULATED DATA watermark over the operational surface", async () => {
    const { container, unmount } = await renderDashboard(locale);
    const wm = container.querySelector("[data-hermes-simulated-watermark]");
    expect(wm, "no watermark").not.toBeNull();
    expect(wm!.getAttribute("data-hermes-simulated-watermark")).toBe(m.watermark);
    const tiles = wm!.querySelectorAll(".hermes-sim-watermark__tile");
    // COVERAGE, not presence. A tile row is ~136px and the rendered surface runs
    // 3,800-6,000px, so ~44 rows are needed at 320px where a tile owns its row.
    // The first version shipped 24 tiles — about 800px — and left the KPI band,
    // the alarm summary and the control systems column with no stamp at all.
    // The browser gate measures the real geometry; this pins the input.
    expect(tiles.length).toBeGreaterThanOrEqual(320);
    expect(tiles[0].textContent).toBe(m.watermark);
    // It must sit inside the clipped surface, not float over the document.
    expect(wm!.closest(".hermes-sim-surface"), "watermark outside the surface").not.toBeNull();
    await unmount();
  });

  it("renders the frame's own provenance: scenario, classification, mode, quality, times, adapter", async () => {
    const { container, unmount } = await renderDashboard(locale);
    const block = container.querySelector(".hermes-sim-provenance");
    expect(block, "no provenance block").not.toBeNull();
    const text = block!.textContent ?? "";
    expect(text).toContain(m.scenarioName);
    expect(text).toContain(m.scenarioLabel);
    expect(text).toContain(m.classificationLabel);
    expect(text).toContain(m.connectionLabel);
    expect(text).toContain(m.qualityLabel);
    expect(text).toContain(m.acquisitionLabel);
    expect(text).toContain(m.receivedLabel);
    expect(text).toContain(m.adapterLabel);
    // The values come from the frame, not from a hard-coded label.
    expect(text).toContain("SIMULATED");
    expect(text).toContain("GOOD");
    expect(text).toContain("hermes.dashboard.local-demo-adapter");
    await unmount();
  });
});

/* ── 2 · every operational value carries the marker accessibly ───────────── */

describe.each(LOCALES)("109-B0 · per-value accessible markers in %s", (locale) => {
  const marker = MESSAGES[locale].dashboard.provenance.valueMarker;

  it("puts the simulated marker in the accessible name or description of EVERY marked value", async () => {
    const { container, unmount } = await renderDashboard(locale);
    const values = Array.from(container.querySelectorAll("[data-hermes-operational-value]"));
    expect(values.length, "no operational values were marked at all").toBeGreaterThanOrEqual(30);

    const naked = values
      .filter((el) => {
        const semantics = `${accessibleName(el)} ${accessibleDescription(el)}`;
        return !semantics.includes(marker);
      })
      .map((el) => (el.className || el.tagName).toString().slice(0, 70));

    expect(naked, `values without an accessible simulated marker: ${naked.length}`).toEqual([]);
    await unmount();
  });

  it("covers a KPI, an alarm, a PLC, a SCADA and a metric value", async () => {
    const { container, unmount } = await renderDashboard(locale);
    const named = Array.from(container.querySelectorAll("[data-hermes-operational-value]")).map(
      (el) => accessibleName(el)
    );
    const dash = MESSAGES[locale].dashboard;

    // KPI strip — the OEE figure carries a unit and a marker.
    expect(named.some((n) => n.includes(marker))).toBe(true);
    // Alarms — a severity word appears inside a marked element.
    expect(
      named.some((n) => n.includes(dash.severity.critical) && n.includes(marker)),
      "no marked alarm value"
    ).toBe(true);
    // PLC + SCADA — identifiers are rendered LTR inside marked rows.
    expect(named.some((n) => /PLC-/.test(n) && n.includes(marker)), "no marked PLC row").toBe(true);
    expect(named.some((n) => /ms/.test(n) && n.includes(marker)), "no marked latency value").toBe(true);
    // Metric series — a tag such as TT-101 with its value.
    expect(
      named.some((n) => /[A-Z]{2}-\d{3}/.test(n) || /°C|bar|m³/.test(n)),
      "no marked metric value"
    ).toBe(true);
    await unmount();
  });

  it("does NOT mark the real platform-fact cells as simulated", async () => {
    // Knowledge volume, engineering cases and supported vendors are REAL
    // published counts. Marking them would be its own false statement, so the
    // honesty of the marker cuts both ways.
    const { container, unmount } = await renderDashboard(locale);
    const cells = Array.from(container.querySelectorAll(".global-ops-cell"));
    expect(cells.length).toBe(5);
    const dash = MESSAGES[locale].dashboard;
    for (const label of [
      dash.command.globalOps.knowledgeVolume,
      dash.command.globalOps.engineeringCases,
      dash.command.globalOps.supportedVendors,
    ]) {
      const cell = cells.find((c) => (c.textContent ?? "").includes(label));
      expect(cell, `cell missing: ${label}`).toBeDefined();
      expect(cell!.querySelector("[data-hermes-operational-value]")).toBeNull();
    }
    await unmount();
  });
});

/* ── 3 · direction and locale integrity ──────────────────────────────────── */

describe("109-B0 · RTL / LTR", () => {
  it("keeps Persian right-to-left and English/German left-to-right", async () => {
    for (const locale of LOCALES) {
      const { container, unmount } = await renderDashboard(locale);
      expect(container.firstElementChild?.getAttribute("dir")).toBe(DIR[locale]);
      // Technical identifiers stay LTR-isolated inside an RTL page.
      const ltr = container.querySelectorAll("[dir='ltr']");
      expect(ltr.length).toBeGreaterThan(0);
      await unmount();
    }
  });

  it("renders the disclosure in a different string per locale (no English fallback)", async () => {
    const seen = new Set<string>();
    for (const locale of LOCALES) {
      const { container, unmount } = await renderDashboard(locale);
      const chip = container.querySelector("[data-hermes-simulated-chip='true']")!;
      seen.add(accessibleName(chip));
      await unmount();
    }
    expect(seen.size, "a locale fell back to another locale's disclosure").toBe(3);
  });
});

/* ── 4 · fail closed ─────────────────────────────────────────────────────── */

describe("109-B0 · missing provenance renders no operational values", () => {
  const BROKEN: DashboardSourceDescriptor[] = [
    { ...SOURCE, resolvedBy: "CLIENT" as unknown as "SERVER" },
    { ...SOURCE, classification: undefined as unknown as "SIMULATED" },
    { ...SOURCE, provenance: undefined as unknown as typeof SOURCE.provenance },
  ];

  it.each(BROKEN.map((d, i) => [i, d] as const))(
    "descriptor #%i is refused, not assumed",
    async (_i, descriptor) => {
      const { container, unmount } = await renderDashboard("en", descriptor);
      expect(container.querySelectorAll("[data-hermes-operational-value]").length).toBe(0);
      expect(container.querySelector(".hermes-sim-provenance")).toBeNull();
      // The mode chip is PERSISTENT: refusing a frame must not also remove the
      // disclosure, or the failure state would be the one screen that says
      // nothing about what this dashboard is.
      const chip = container.querySelector("[data-hermes-simulated-chip='true']");
      expect(chip, "the mode chip disappeared in the refused state").not.toBeNull();
      expect(accessibleName(chip!)).toContain(en.dashboard.provenance.chipLabel);
      const text = container.textContent ?? "";
      expect(text).toContain(en.dashboard.command.unavailable.title);
      // Never a raw reason code, never a stack trace.
      expect(text).not.toMatch(/MISSING_|UNKNOWN_|DESCRIPTOR_MISMATCH|Error/);
      await unmount();
    }
  );
});

/* ── 5 · no wording implies a live plant connection ──────────────────────── */

describe("109-B0 · loading and error copy claim no plant connection", () => {
  const LIVE_CLAIM: Record<Loc, RegExp> = {
    en: /reconnect|re-connect|connection restored|live plant|telemetry integration/i,
    de: /wiederhergestellt|verbindet sich (?:automatisch )?neu|Live-Signal/i,
    fa: /اتصال مجدد|سیگنال زنده/,
  };

  it.each(LOCALES)("%s loading, unavailable and ribbon copy", (locale) => {
    const d = MESSAGES[locale].dashboard;
    const copy = [
      d.command.preparingDemo,
      d.command.unavailable.title,
      d.command.unavailable.body,
      d.command.unavailable.hint,
      d.ecosystem.layers.telemetryNetwork.description,
      d.commandRibbon.signals.telemetrySimulated,
    ].join(" | ");
    expect(copy).not.toMatch(LIVE_CLAIM[locale]);
    // The retired key must be gone from every catalogue.
    expect("reconnecting" in d.command).toBe(false);
  });

  it("the dashboard's own rendered copy never claims a live connection", async () => {
    const { container, unmount } = await renderDashboard("en");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/reconnect/i);
    expect(text).not.toMatch(/live plant|connected to the plant/i);
    await unmount();
  });
});

/* ── 6 · the surface has no export path to stamp ─────────────────────────── */

describe("109-B0 · export disclosure scope", () => {
  it("EXPORT_DISCLOSURE=NOT_APPLICABLE_NO_EXPORT_SURFACE", async () => {
    const { container, unmount } = await renderDashboard("en");
    // No download, print, export or screenshot control exists on this screen,
    // so there is no export artefact for a stamp to travel on. This assertion
    // is what makes that claim falsifiable: add one, and this test fails until
    // the export carries the disclosure.
    expect(container.querySelectorAll("a[download]").length).toBe(0);
    expect(
      Array.from(container.querySelectorAll("button")).filter((b) =>
        /export|download|print|csv|pdf/i.test(b.textContent ?? "")
      ).length
    ).toBe(0);
    await unmount();
  });
});
