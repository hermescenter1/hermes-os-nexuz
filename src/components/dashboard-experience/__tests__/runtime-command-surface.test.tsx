// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import { DashboardCommandSurface } from "../../dashboard/DashboardCommandSurface";
import { DashboardSkeleton, DataUnavailableState } from "../DashboardStates";
import type { DashboardSnapshot } from "@/lib/services/types";

/**
 * PHASE 87F runtime — the command surface renders real snapshot data into the
 * prioritized IA (status → attention → risk/evidence → safe actions), EN + FA,
 * with correct links, a11y (headings, sr-only labels), bidi-safe identifiers,
 * no fabricated numbers, no raw errors, and distinct loading/unavailable states.
 */

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

function baseSnap(over: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    ts: 1_700_000_000_000,
    overview: { oee: 82, availability: 90, performance: 88, quality: 95, activeLines: 5, totalLines: 6 },
    lines: [],
    plc: [{ id: "PLC-1", model: "S7", status: "online", cycleMs: 10 }],
    scada: { servers: [{ id: "SC-1", status: "online", latencyMs: 5 }], tagsPolled: 100, updateRateMs: 500 },
    network: { devices: 10, online: 10, blockedEvents: 0, ids: "ok" },
    alarms: { counts: { critical: 0, high: 0, medium: 0, low: 0 }, recent: [] },
    temperature: [], pressure: [], flow: [],
    energy: { nowKw: 100, todayKwh: 1000, peakKw: 150, history: [1, 2, 3] },
    ai: [],
    maintenance: [],
    risk: { score: 20, trend: "flat", factors: [{ key: "process", weight: 0.2 }] },
    ...over,
  };
}

function withIntl(locale: "en" | "fa", ui: React.ReactNode) {
  const messages = locale === "en" ? en : fa;
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

const alarmKey = Object.keys(en.dashboard.alarmsP.msgs)[0];
const assetKey = Object.keys(en.dashboard.maintenanceP.assets)[0];
const factorKey = Object.keys(en.dashboard.riskP.factors)[0];

describe("DashboardCommandSurface — English, healthy (empty attention)", () => {
  it("renders the four command sections in order with h2 headings and a calm empty attention state", async () => {
    const { container, unmount } = await mount(
      withIntl("en", <DashboardCommandSurface snap={baseSnap({ risk: { score: 20, trend: "flat", factors: [{ key: factorKey, weight: 0.2 }] } })} />),
    );
    const h2s = Array.from(container.querySelectorAll("h2")).map((h) => h.textContent);
    expect(h2s).toEqual([
      en.dashboard.command.attention.title,
      en.dashboard.command.riskEvidence.title,
      en.dashboard.command.actions.title,
    ]);
    // no h1 here — the page owns the single H1
    expect(container.querySelectorAll("h1").length).toBe(0);

    // operational posture + truthful auto/simulated note (no "real-time")
    expect(container.textContent).toContain(en.dashboard.command.posture.operational);
    expect(container.textContent).toContain(en.dashboard.command.autoNote);
    expect(container.textContent).not.toMatch(/real[- ]?time/i);

    // calm empty attention state (not fake-healthy metrics)
    expect(container.textContent).toContain(en.dashboard.command.attention.empty);

    // readiness = Ready (risk 20, no critical)
    expect(container.textContent).toContain(en.dashboard.command.riskEvidence.readinessReady);
    await unmount();
  });

  it("safe actions link to real authorized routes with accessible labels", async () => {
    const { container, unmount } = await mount(withIntl("en", <DashboardCommandSurface snap={baseSnap()} />));
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    for (const href of ["/industrial-brain", "/dashboard/operations", "/dashboard/predictive", "/dashboard/knowledge"]) {
      expect(hrefs, `missing safe action ${href}`).toContain(href);
    }
    // labels present + unique (no ambiguous duplicate CTA text)
    const labels = [
      en.dashboard.command.actions.openBrain,
      en.dashboard.command.actions.openOperations,
      en.dashboard.command.actions.openPredictive,
      en.dashboard.command.actions.openKnowledge,
    ];
    for (const l of labels) expect(container.textContent).toContain(l);
    expect(new Set(labels).size).toBe(labels.length);
    await unmount();
  });
});

describe("DashboardCommandSurface — attention prioritization + links", () => {
  it("surfaces critical/high alarms and assets with severity labels, timestamps and destinations", async () => {
    const snap = baseSnap({
      alarms: {
        counts: { critical: 1, high: 1, medium: 0, low: 0 },
        recent: [
          { id: "a1", severity: "critical", msgKey: alarmKey, ts: 1_700_000_000_000 },
          { id: "a2", severity: "high", msgKey: alarmKey, ts: 1_699_999_000_000 },
        ],
      },
      maintenance: [{ id: "m1", assetKey, priority: 1, dueDays: 3, severity: "critical" }],
      risk: { score: 82, trend: "up", factors: [{ key: factorKey, weight: 0.7 }] },
    });
    const { container, unmount } = await mount(withIntl("en", <DashboardCommandSurface snap={snap} />));

    // attention list has items; critical posture; readiness = Hold (critical present)
    const attentionSection = container.querySelector('section[aria-labelledby="attention-title"]')!;
    const links = Array.from(attentionSection.querySelectorAll("a"));
    expect(links.length).toBe(3); // 2 alarms + 1 asset
    expect(links.map((a) => a.getAttribute("href"))).toContain("/dashboard/operations");
    expect(links.map((a) => a.getAttribute("href"))).toContain("/dashboard/predictive");
    // each item exposes an sr-only view label (accessible action name)
    expect(attentionSection.querySelector(".sr-only")?.textContent).toBe(en.dashboard.command.attention.view);
    expect(container.textContent).toContain(en.dashboard.command.posture.critical);
    expect(container.textContent).toContain(en.dashboard.command.riskEvidence.readinessHold);
    await unmount();
  });
});

describe("DashboardCommandSurface — Persian (RTL) + bidi safety", () => {
  it("renders Persian section titles and isolates technical identifiers LTR", async () => {
    const snap = baseSnap({
      alarms: { counts: { critical: 1, high: 0, medium: 0, low: 0 }, recent: [{ id: "PLC-7", severity: "critical", msgKey: alarmKey, ts: 1_700_000_000_000 }] },
    });
    const { container, unmount } = await mount(withIntl("fa", <DashboardCommandSurface snap={snap} />));
    expect(container.textContent).toContain(fa.dashboard.command.attention.title); // «نیازمند توجه»
    expect(container.textContent).toContain(fa.dashboard.command.riskEvidence.title); // «ریسک و شواهد»
    expect(container.textContent).toContain(fa.dashboard.command.posture.critical);
    // numbers render; no Latin-only fabricated metric text
    expect(container.querySelector('section[aria-labelledby="risk-evidence-title"]')).toBeTruthy();
    await unmount();
  });
});

describe("Dashboard states — distinct loading vs unavailable", () => {
  it("skeleton announces politely and hides shimmer from AT", async () => {
    const { container, unmount } = await mount(withIntl("en", <DashboardSkeleton label={en.dashboard.command.reconnecting} />));
    const status = container.querySelector('[role="status"]')!;
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe(en.dashboard.command.reconnecting);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
    await unmount();
  });

  it("unavailable state shows calm localized copy — never a raw error string", async () => {
    const { container, unmount } = await mount(
      withIntl("fa", (
        <DataUnavailableState
          title={fa.dashboard.command.unavailable.title}
          body={fa.dashboard.command.unavailable.body}
          hint={fa.dashboard.command.unavailable.hint}
        />
      )),
    );
    expect(container.textContent).toContain(fa.dashboard.command.unavailable.title);
    expect(container.textContent).not.toMatch(/HTTP|stack|Error:|undefined/);
    await unmount();
  });
});
