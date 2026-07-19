// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import { visibleAppNavGroups } from "@/lib/navigation/app-nav";
import { isAuthorizedForPath } from "@/lib/auth/rbac";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { AssetCommandSurface } from "../AssetCommandSurface";
import { MaintenanceCommandSurface } from "../MaintenanceCommandSurface";
import { AssetsSubNav, CmmsSubNav } from "../AmSubNav";
import type { AssetDashboard } from "@/lib/assets/types";
import type { CmmsDashboard } from "@/lib/cmms/types";

/**
 * PHASE 87I runtime — the Asset Registry and CMMS command surfaces render real
 * dashboard data into their respective IAs, EN+FA, with localized statuses,
 * deterministic attention, bidi-safe identifiers, no fabricated health/MTBF
 * claims and no raw errors. Plus: catalog parity, navigation distinction,
 * ERP↔CMMS record separation, and the preserved extraction contract.
 */

const h = vi.hoisted(() => ({ pathname: "/assets/dashboard" }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => h.pathname,
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

// Both surfaces are async Server Components using getTranslations.
vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return {
    getTranslations: async (ns: string) => {
      const locale = (globalThis as { __amLocale?: "en" | "fa" }).__amLocale ?? "en";
      const messages = locale === "en" ? en : fa;
      return actual.createTranslator({ locale, messages, namespace: ns as never });
    },
  };
});

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function ASSETS(over: Partial<AssetDashboard> = {}): AssetDashboard {
  return {
    totalAssets: 40, criticalAssets: 3, degradedAssets: 2, atRiskAssets: 1,
    assetsWithOpenWO: 5, assetsMissingDocs: 0,
    assetsByType: {},
    assetsByStatus: { IN_SERVICE: 30, DEGRADED: 2, RETIRED: 8 },
    assetsByCriticality: { CRITICAL: 3, HIGH: 7, LOW: 30 },
    lifecycleDistribution: {},
    recentLifecycleEvents: [
      { id: "e1", assetId: "a1", eventType: "STATE_CHANGE", fromState: "COMMISSIONING", toState: "IN_SERVICE",
        performedBy: null, notes: null, documents: [], metadata: {},
        occurredAt: "2026-07-01T00:00:00.000Z", createdAt: "2026-07-01T00:00:00.000Z" },
    ],
    topCriticalAssets: [
      { id: "a1", assetNumber: "PMP-204", name: "Feed Pump P-204", siteId: "SITE-B",
        criticality: "CRITICAL", status: "DEGRADED" } as unknown as AssetDashboard["topCriticalAssets"][number],
    ],
    healthDistribution: { healthy: 30, monitor: 5, atRisk: 3, critical: 1, unknown: 1 },
    ...over,
  };
}

function CMMS(over: Partial<CmmsDashboard> = {}): CmmsDashboard {
  return {
    kpis: {
      mtbf: 120.5, mttr: 4.2, availability: 97.5, maintenanceCompliance: 88,
      overdueCount: 4, emergencyWorkPct: 5, technicianUtilization: 70,
      totalDowntimeHours: 12, totalCost: 1000, failureCount: 2,
      completedThisMonth: 9, scheduledThisMonth: 14,
    },
    tasksByStatus: { OVERDUE: 4, IN_PROGRESS: 3, ON_HOLD: 2, SCHEDULED: 6 },
    tasksByType: {},
    tasksByPriority: { EMERGENCY: 1, HIGH: 4, MEDIUM: 8 },
    recentTasks: [],
    recentFailures: [
      { id: "f1", title: "Bearing seizure", detectedAt: "2026-07-02T00:00:00.000Z",
        createdAt: "2026-07-02T00:00:00.000Z" } as unknown as CmmsDashboard["recentFailures"][number],
    ],
    upcomingTasks: [
      { id: "t1", title: "Quarterly lubrication", priority: "HIGH",
        dueDate: "2026-08-01T00:00:00.000Z" } as unknown as CmmsDashboard["upcomingTasks"][number],
    ],
    downtimeTrend: [], costTrend: [],
    ...over,
  };
}

async function mountAssets(locale: "en" | "fa", data: AssetDashboard) {
  (globalThis as { __amLocale?: "en" | "fa" }).__amLocale = locale;
  const el = await AssetCommandSurface({ data, locale });
  return mount(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fa} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{el}</div> : el}
    </NextIntlClientProvider>,
  );
}
async function mountCmms(locale: "en" | "fa", data: CmmsDashboard) {
  (globalThis as { __amLocale?: "en" | "fa" }).__amLocale = locale;
  const el = await MaintenanceCommandSurface({ data, locale });
  return mount(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fa} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{el}</div> : el}
    </NextIntlClientProvider>,
  );
}

describe("catalog + navigation invariants", () => {
  it("assetMaintenance: en/fa/de parity, de is genuinely German, no Arabic yeh/kaf, ICU parity", () => {
    const paths = (o: Record<string, unknown>, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? paths(v as Record<string, unknown>, `${p}.${k}`) : [`${p}.${k}`]));
    const e = paths(en.assetMaintenance as unknown as Record<string, unknown>);
    expect(paths((fa as unknown as typeof en).assetMaintenance as unknown as Record<string, unknown>)).toEqual(e);
    // PHASE 87L.6C SUPERSEDES the "de = en verbatim" pin: assetMaintenance is
    // genuinely German now. Key shape stays identical (asserted above).
    expect(JSON.stringify((de as unknown as typeof en).assetMaintenance)).not.toBe(JSON.stringify(en.assetMaintenance));
    expect(JSON.stringify((fa as unknown as typeof en).assetMaintenance)).not.toMatch(/[يك]/);
    for (const p of e) {
      const get = (o: unknown) => p.split(".").slice(1).reduce((x: unknown, k) => (x as Record<string, unknown>)[k], o);
      const args = (s: string) => (s.match(/\{[^}]+\}/g) ?? []).sort().join(",");
      expect(args(String(get((fa as unknown as typeof en).assetMaintenance)))).toBe(args(String(get(en.assetMaintenance))));
    }
  });

  it("Asset Registry and CMMS are DISTINCT nav destinations for authorized roles only", () => {
    for (const role of ["admin", "superadmin"] as const) {
      const hrefs = visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
      expect(hrefs).toContain("/assets");
      expect(hrefs).toContain("/cmms");
      expect(hrefs).toContain("/erp"); // ERP stays a separate destination too
    }
    // PHASE 87L.4 AMENDMENT: engineer now sees BOTH engineering modules, and
    // middleware agrees — but still not the commercial ERP destination.
    const engineerHrefs = visibleAppNavGroups("engineer").flatMap((g) => g.items.map((i) => i.href));
    expect(engineerHrefs).toContain("/assets");
    expect(engineerHrefs).toContain("/cmms");
    expect(engineerHrefs).not.toContain("/erp");
    for (const role of ["customer", "candidate", "viewer"] as const) {
      const hrefs = visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
      expect(hrefs).not.toContain("/assets");
      expect(hrefs).not.toContain("/cmms");
    }
    expect(isAuthorizedForPath("engineer", "/en/cmms")).toBe(true);
    expect(isAuthorizedForPath("engineer", "/en/assets")).toBe(true);
    expect(isAuthorizedForPath("engineer", "/en/erp")).toBe(false);
  });

  it("preserves the /cmms/dashboard extraction contract and the ERP↔CMMS record separation", () => {
    // The CMMS landing still sources its title/subtitle from maintenanceOperations.
    const page = read("src/app/[locale]/cmms/dashboard/page.tsx");
    expect(page).toMatch(/getTranslations\("maintenanceOperations"\)/);
    expect(page).toContain('t("pages.dashboard.title")');
    // MaintenanceTask keeps its own record with the EXISTING erpWorkOrderId link.
    const cmmsTypes = read("src/lib/cmms/types.ts");
    expect(cmmsTypes).toMatch(/erpWorkOrderId:\s*string \| null/);
    // No CMMS surface reaches into ERP data ownership.
    for (const rel of [
      "src/components/asset-maintenance/MaintenanceCommandSurface.tsx",
      "src/components/asset-maintenance/AssetCommandSurface.tsx",
      "src/components/asset-maintenance/logic.ts",
    ]) {
      expect(read(rel)).not.toContain("@/lib/erp/");
    }
  });

  it("the CMMS root redirect is locale-aware and absolute (no relative double-segment)", () => {
    const src = read("src/app/[locale]/cmms/page.tsx");
    expect(src).toMatch(/redirect\(`\/\$\{locale\}\/cmms\/dashboard`\)/);
    expect(src).not.toContain('redirect("./cmms/dashboard")');
  });

  it("both landings sit on the AppShell with a scoped sub-nav (no legacy boxed sidebar)", () => {
    for (const [rel, subNav] of [
      ["src/app/[locale]/assets/layout.tsx", "AssetsSubNav"],
      ["src/app/[locale]/cmms/layout.tsx", "CmmsSubNav"],
    ] as const) {
      const src = read(rel);
      expect(src).toContain("AppShell");
      expect(src).toContain(subNav);
      // 87L.4 amendment: engineering modules now gate on `authoring` (admits engineer)
      expect(src).toContain('RequireCapability capability="authoring"');
      expect(src).not.toMatch(/<aside/);
    }
  });
});

describe("AssetCommandSurface — EN, real registry wiring", () => {
  it("renders the asset IA in order, localized statuses, and a bidi-safe asset number", async () => {
    const { container, unmount } = await mountAssets("en", ASSETS());
    const h2s = Array.from(container.querySelectorAll("h2")).map((x) => x.textContent);
    expect(h2s).toEqual([
      en.assetMaintenance.attention.title,
      en.assetMaintenance.sections.assetStatus,
      en.assetMaintenance.sections.criticalWatch,
      en.assetMaintenance.sections.lifecycle,
      en.assetMaintenance.sections.actions,
    ]);
    expect(container.querySelectorAll("h1").length).toBe(0); // page owns the H1

    // attention from real counts, cross-linking open work into CMMS
    const attention = container.querySelector('section[aria-labelledby="am-attention-title"]')!;
    expect(attention.textContent).toContain("3 asset(s) at critical criticality");
    expect(Array.from(attention.querySelectorAll("a")).map((a) => a.getAttribute("href"))).toContain("/cmms/work-orders");

    // localized status/criticality/health labels — raw enums never rendered
    expect(container.textContent).toContain(en.assetMaintenance.assetStatus.IN_SERVICE);
    expect(container.textContent).toContain(en.assetMaintenance.criticality.CRITICAL);
    expect(container.textContent).toContain(en.assetMaintenance.risk.AT_RISK);
    expect(container.textContent).not.toMatch(/IN_SERVICE|NON_CRITICAL|AT_RISK|UNDER_MAINTENANCE/);

    // critical watch: asset number LTR-isolated; lifecycle uses its own label set
    const tag = Array.from(container.querySelectorAll('bdi[dir="ltr"]')).find((b) => b.textContent === "PMP-204");
    expect(tag).toBeTruthy();
    expect(container.textContent).toContain(en.assetMaintenance.lifecycle.IN_SERVICE);

    // NO fabricated analytics
    expect(container.textContent).not.toMatch(/MTBF|MTTR|OEE|remaining useful life|failure probability/i);
    await unmount();
  });

  it("empty registry → localized empty states, no fabricated rows", async () => {
    const { container, unmount } = await mountAssets("en", ASSETS({
      totalAssets: 0, criticalAssets: 0, degradedAssets: 0, atRiskAssets: 0,
      assetsWithOpenWO: 0, assetsMissingDocs: 0,
      assetsByStatus: {}, assetsByCriticality: {},
      healthDistribution: { healthy: 0, monitor: 0, atRisk: 0, critical: 0, unknown: 0 },
      recentLifecycleEvents: [], topCriticalAssets: [],
    }));
    expect(container.textContent).toContain(en.assetMaintenance.attention.emptyAssets);
    expect(container.textContent).toContain(en.assetMaintenance.states.emptyRegistry);
    expect(container.textContent).toContain(en.assetMaintenance.states.noLifecycle);
    expect(container.querySelector('section[aria-labelledby="am-critical-title"]')).toBeNull();
    await unmount();
  });

  it("Persian: localized sections and RTL-safe identifiers", async () => {
    const { container, unmount } = await mountAssets("fa", ASSETS());
    expect(container.textContent).toContain(fa.assetMaintenance.attention.title);      // «نیازمند توجه»
    expect(container.textContent).toContain(fa.assetMaintenance.sections.criticalWatch);
    expect(container.textContent).toContain(fa.assetMaintenance.criticality.CRITICAL); // «بحرانی»
    expect(container.textContent).not.toMatch(/Requires attention|Critical asset watch/);
    expect(Array.from(container.querySelectorAll('bdi[dir="ltr"]')).some((b) => b.textContent === "PMP-204")).toBe(true);
    await unmount();
  });
});

describe("MaintenanceCommandSurface — EN/FA, verified reliability only", () => {
  it("renders the maintenance IA with localized work-order statuses and the EXISTING reliability KPIs", async () => {
    const { container, unmount } = await mountCmms("en", CMMS());
    const h2s = Array.from(container.querySelectorAll("h2")).map((x) => x.textContent);
    expect(h2s).toEqual([
      en.assetMaintenance.attention.title,
      en.assetMaintenance.sections.workFlow,
      en.assetMaintenance.sections.upcoming,
      en.assetMaintenance.sections.failures,
      en.assetMaintenance.sections.reliability,
      en.assetMaintenance.sections.actions,
    ]);
    expect(container.querySelectorAll("h1").length).toBe(0);

    expect(container.textContent).toContain("4 maintenance task(s) overdue");
    expect(container.textContent).toContain(en.assetMaintenance.maintenanceStatus.OVERDUE);
    expect(container.textContent).toContain(en.assetMaintenance.maintenancePriority.EMERGENCY);
    expect(container.textContent).not.toMatch(/ON_HOLD|IN_PROGRESS|WAITING_APPROVAL/);

    // MTBF/MTTR come from the EXISTING CmmsKpis calculation and carry their note
    expect(container.textContent).toContain("120.5");
    expect(container.textContent).toContain("4.2");
    expect(container.textContent).toContain(en.assetMaintenance.reliability.note);
    // no predictive/fabricated claims
    expect(container.textContent).not.toMatch(/predicted|forecast|remaining useful life|probability of failure/i);

    // actions stay in CMMS + one explicit cross-link to the Asset Registry
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    for (const href of ["/cmms/work-orders", "/cmms/plans", "/cmms/failures", "/assets/registry"]) {
      expect(hrefs).toContain(href);
    }
    expect(hrefs.some((x) => (x ?? "").startsWith("/erp/"))).toBe(false);
    await unmount();
  });

  it("no maintenance records → distinct localized empty states (not one generic message)", async () => {
    const { container, unmount } = await mountCmms("en", CMMS({
      kpis: { ...CMMS().kpis, overdueCount: 0 },
      tasksByStatus: {}, tasksByPriority: {},
      recentFailures: [], upcomingTasks: [],
    }));
    expect(container.textContent).toContain(en.assetMaintenance.attention.emptyMaintenance);
    expect(container.textContent).toContain(en.assetMaintenance.states.noMaintenance);
    expect(container.textContent).toContain(en.assetMaintenance.states.noUpcoming);
    expect(container.textContent).toContain(en.assetMaintenance.states.noFailures);
    // four DIFFERENT messages
    expect(new Set([
      en.assetMaintenance.attention.emptyMaintenance, en.assetMaintenance.states.noMaintenance,
      en.assetMaintenance.states.noUpcoming, en.assetMaintenance.states.noFailures,
    ]).size).toBe(4);
    await unmount();
  });

  it("Persian: localized maintenance sections and statuses; no raw server text", async () => {
    const { container, unmount } = await mountCmms("fa", CMMS());
    expect(container.textContent).toContain(fa.assetMaintenance.sections.workFlow);   // «جریان دستورکارهای نگهداری»
    expect(container.textContent).toContain(fa.assetMaintenance.maintenanceStatus.OVERDUE); // «سررسید گذشته»
    expect(container.textContent).toContain(fa.assetMaintenance.reliability.note);
    expect(container.textContent).not.toMatch(/Work-order flow|Overdue\b/);
    expect(container.textContent).not.toMatch(/Error:|stack|ECONNREFUSED|prisma/i);
    await unmount();
  });
});

describe("Sub-navs — distinct modules, locale-safe, accessible", () => {
  it("Asset Registry sub-nav lists only /assets destinations with aria-current", async () => {
    h.pathname = "/assets/dashboard";
    const { container, unmount } = await mount(
      <NextIntlClientProvider locale="fa" messages={fa} timeZone="UTC">
        <AssetsSubNav ariaLabel={(fa as unknown as typeof en).assetMaintenance.assets.eyebrow} />
      </NextIntlClientProvider>,
    );
    const links = Array.from(container.querySelectorAll("a"));
    expect(links.length).toBe(10);
    expect(links.every((a) => (a.getAttribute("href") ?? "").startsWith("/assets/"))).toBe(true);
    expect(links.every((a) => !/\/(en|fa)\/(en|fa)\//.test(a.getAttribute("href") ?? ""))).toBe(true);
    expect(links.every((a) => a.className.includes("h-11"))).toBe(true); // ≥44px
    expect(links[0].getAttribute("aria-current")).toBe("page");
    await unmount();
  });

  it("CMMS sub-nav lists only /cmms destinations and never duplicates ERP work orders", async () => {
    h.pathname = "/cmms/work-orders";
    const { container, unmount } = await mount(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <CmmsSubNav ariaLabel={en.assetMaintenance.cmms.eyebrow} />
      </NextIntlClientProvider>,
    );
    const links = Array.from(container.querySelectorAll("a"));
    expect(links.length).toBe(14);
    expect(links.every((a) => (a.getAttribute("href") ?? "").startsWith("/cmms/"))).toBe(true);
    expect(links.some((a) => (a.getAttribute("href") ?? "").startsWith("/erp/"))).toBe(false);
    const active = container.querySelector('a[aria-current="page"]')!;
    expect(active.getAttribute("href")).toBe("/cmms/work-orders");
    await unmount();
  });
});
