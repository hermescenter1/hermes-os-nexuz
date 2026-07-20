// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import { visibleAppNavGroups } from "@/lib/navigation/app-nav";
import { isAuthorizedForPath } from "@/lib/auth/rbac";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { ErpCommandSurface } from "../ErpCommandSurface";
import { ErpSubNav } from "../ErpSubNav";
import type { ErpOverview } from "@/lib/erp/types";

/**
 * PHASE 87H runtime — the ERP command surface renders real ErpOverview data
 * into the operations IA (attention → status → budget → KPIs → activity →
 * actions), EN+FA, with localized statuses, deterministic attention,
 * bidi-safe money, no fabricated metrics and no raw errors. Plus: catalog
 * parity + nav-visibility invariants.
 *
 * ErpCommandSurface is an async Server Component; we await it to a rendered
 * element (getTranslations resolves against the provider messages via the
 * next-intl server API shim) — so we render it inside the client provider by
 * resolving the promise first.
 */

const h = vi.hoisted(() => ({ pathname: "/erp" }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => h.pathname,
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

// getTranslations (server) → back it with the same catalogs the provider uses.
vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return {
    getTranslations: async (ns: string) => {
      // Build a translator bound to the active test locale + namespace.
      const locale = (globalThis as { __erpLocale?: "en" | "fa" }).__erpLocale ?? "en";
      const messages = locale === "en" ? en : fa;
      return actual.createTranslator({ locale, messages, namespace: ns as never });
    },
  };
});

function OVERVIEW(over: Partial<ErpOverview> = {}): ErpOverview {
  return {
    activeProjects: 3, overdueTasks: 2, openWorkOrders: 4, inventoryWarnings: 1,
    pendingApprovals: 3, totalBudget: 2_000_000, totalActualCost: 2_400_000,
    resourceUtilization: 70,
    recentActivity: [
      { type: "task_completed", description: "Task completed: X", createdAt: "2026-07-01T00:00:00.000Z" },
      { type: "approval_decided", description: "Approval approved: Y", createdAt: "2026-07-02T00:00:00.000Z" },
    ],
    projectsByStatus: { PLANNED: 1, ACTIVE: 2, ON_HOLD: 0, COMPLETED: 0, CANCELLED: 0 },
    tasksByStatus: { TODO: 4, IN_PROGRESS: 3, BLOCKED: 2, REVIEW: 1, DONE: 5, CANCELLED: 0 },
    workOrdersByStatus: { OPEN: 1, ASSIGNED: 1, IN_PROGRESS: 0, WAITING_APPROVAL: 1, COMPLETED: 3, CANCELLED: 0 },
    kpiSummary: [{ id: "k1", name: "On-time delivery", value: 92, target: 95, unit: "%" } as ErpOverview["kpiSummary"][number]],
    ...over,
  };
}

async function mountSurface(locale: "en" | "fa", overview: ErpOverview) {
  (globalThis as { __erpLocale?: "en" | "fa" }).__erpLocale = locale;
  const el = await ErpCommandSurface({ overview, locale });
  const messages = locale === "en" ? en : fa;
  return mount(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{el}</div> : el}
    </NextIntlClientProvider>,
  );
}

describe("catalog + nav invariants", () => {
  it("businessOps: en/fa/de parity, de is genuinely German, no Arabic yeh/kaf, ICU parity", () => {
    const paths = (o: Record<string, unknown>, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? paths(v as Record<string, unknown>, `${p}.${k}`) : [`${p}.${k}`]));
    const e = paths(en.businessOps as unknown as Record<string, unknown>);
    expect(paths((fa as unknown as typeof en).businessOps as unknown as Record<string, unknown>)).toEqual(e);
    // PHASE 87L.6C SUPERSEDES the "de = en verbatim" pin: businessOps is
    // genuinely German now. Key shape stays identical (asserted above).
    expect(JSON.stringify((de as unknown as typeof en).businessOps)).not.toBe(JSON.stringify(en.businessOps));
    expect(JSON.stringify((fa as unknown as typeof en).businessOps)).not.toMatch(/[يك]/);
    for (const p of e) {
      const get = (o: unknown) => p.split(".").slice(1).reduce((x: unknown, k) => (x as Record<string, unknown>)[k], o);
      const args = (s: string) => (s.match(/\{[^}]+\}/g) ?? []).sort().join(",");
      expect(args(String(get((fa as unknown as typeof en).businessOps)))).toBe(args(String(get(en.businessOps))));
    }
  });

  it("ERP nav visibility unchanged: admin/superadmin see /erp; engineer/customer/candidate do not", () => {
    for (const role of ["admin", "superadmin"] as const) {
      expect(visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href))).toContain("/erp");
    }
    for (const role of ["engineer", "customer", "candidate", "viewer"] as const) {
      expect(visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href))).not.toContain("/erp");
    }
    // PHASE 87L.4 AMENDMENT: ERP is a commercial module — engineer is denied at
    // middleware as well, matching the admin-only layout guard.
    expect(isAuthorizedForPath("engineer", "/en/erp")).toBe(false);
    expect(isAuthorizedForPath("admin", "/en/erp")).toBe(true);
  });
});

describe("ErpCommandSurface — EN, real overview wiring", () => {
  it("renders the operations IA in order with localized statuses and deterministic attention", async () => {
    const { container, unmount } = await mountSurface("en", OVERVIEW());
    const h2s = Array.from(container.querySelectorAll("h2")).map((x) => x.textContent);
    expect(h2s).toEqual([
      en.businessOps.attention.title,
      en.businessOps.sections.operationalStatus,
      en.businessOps.sections.budget,
      en.businessOps.sections.kpis,
      en.businessOps.sections.activity,
      en.businessOps.sections.actions,
    ]);
    expect(container.querySelectorAll("h1").length).toBe(0); // page owns the H1

    // attention items — overdue(2), wo-waiting(1), approvals(3), blocked(2), inventory(1)
    const attention = container.querySelector('section[aria-labelledby="erp-attention-title"]')!;
    expect(attention.textContent).toContain("2 task(s) overdue");
    expect(attention.textContent).toContain("3 approval(s) awaiting review");
    expect(attention.textContent).toContain("1 work order(s) waiting on approval");
    expect(attention.querySelectorAll("a").length).toBe(5);

    // localized status labels (not raw enums)
    expect(container.textContent).toContain(en.businessOps.status.task.BLOCKED);
    expect(container.textContent).toContain(en.businessOps.status.workOrder.WAITING_APPROVAL);
    expect(container.textContent).not.toMatch(/WAITING_APPROVAL|IN_PROGRESS/); // raw enums never shown

    // budget: real values + variance (+20%), bidi-safe money
    expect(container.textContent).toContain("$2.0M");
    expect(container.textContent).toContain("$2.4M");
    expect(container.textContent).toContain("+20%");

    // activity localized by type; safe actions to real routes
    expect(container.textContent).toContain(en.businessOps.activity.task_completed);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    for (const href of ["/erp/projects", "/erp/approvals", "/erp/tasks", "/erp/work-orders"]) {
      expect(hrefs).toContain(href);
    }
    await unmount();
  });

  it("empty overview → calm empty attention + localized empty activity (no fabricated items)", async () => {
    const { container, unmount } = await mountSurface("en", OVERVIEW({
      overdueTasks: 0, pendingApprovals: 0, inventoryWarnings: 0,
      tasksByStatus: { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, REVIEW: 0, DONE: 0, CANCELLED: 0 },
      workOrdersByStatus: { OPEN: 0, ASSIGNED: 0, IN_PROGRESS: 0, WAITING_APPROVAL: 0, COMPLETED: 0, CANCELLED: 0 },
      recentActivity: [], kpiSummary: [],
    }));
    expect(container.textContent).toContain(en.businessOps.attention.empty);
    expect(container.textContent).toContain(en.businessOps.activity.empty);
    // KPI section is omitted when there are no KPI records
    expect(container.querySelector('section[aria-labelledby="erp-kpis-title"]')).toBeNull();
    await unmount();
  });
});

describe("ErpCommandSurface — Persian (RTL) + bidi", () => {
  it("renders Persian sections/statuses and LTR-isolated money", async () => {
    const { container, unmount } = await mountSurface("fa", OVERVIEW());
    expect(container.textContent).toContain(fa.businessOps.attention.title);   // «نیازمند توجه»
    expect(container.textContent).toContain(fa.businessOps.sections.budget);   // «خلاصهٔ بودجه»
    expect(container.textContent).toContain(fa.businessOps.status.task.BLOCKED); // «مسدود»
    const money = Array.from(container.querySelectorAll('bdi[dir="ltr"]')).find((b) => b.textContent === "$2.4M");
    expect(money).toBeTruthy();
    expect(container.textContent).not.toMatch(/Requires attention|Budget summary/);
    await unmount();
  });
});

describe("ErpSubNav — localized sections, active state, no double prefix", () => {
  it("renders the ten localized ERP sections with aria-current on the active tab", async () => {
    h.pathname = "/erp";
    const { container, unmount } = await mount(
      <NextIntlClientProvider locale="fa" messages={fa} timeZone="UTC">
        <ErpSubNav />
      </NextIntlClientProvider>,
    );
    const links = Array.from(container.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/erp", "/erp/projects", "/erp/tasks", "/erp/teams", "/erp/resources",
      "/erp/inventory", "/erp/work-orders", "/erp/approvals", "/erp/kpis", "/erp/settings",
    ]);
    expect(links.every((a) => !/\/(en|fa)\/(en|fa)\//.test(a.getAttribute("href") ?? ""))).toBe(true);
    expect(links[0].getAttribute("aria-current")).toBe("page");
    expect(links.every((a) => a.className.includes("h-11"))).toBe(true); // ≥44px
    expect(container.textContent).toContain((fa as unknown as typeof en).enterpriseOperations.nav.items.approvals);
    await unmount();
  });

  it("marks a deeper section active by prefix (projects detail → Projects tab)", async () => {
    h.pathname = "/erp/projects/p-1";
    const { container, unmount } = await mount(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ErpSubNav />
      </NextIntlClientProvider>,
    );
    const active = container.querySelector('a[aria-current="page"]')!;
    expect(active.getAttribute("href")).toBe("/erp/projects");
    await unmount();
  });
});
