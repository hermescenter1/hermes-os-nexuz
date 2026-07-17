// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import { isAuthorizedForPath } from "@/lib/auth/rbac";
import { visibleAppNavGroups } from "@/lib/navigation/app-nav";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { CrmCommandClient } from "../CrmCommandClient";
import { CrmSubNav } from "../CrmSubNav";
import type { CrmDashboardStats, CrmPipelineStage, CrmLead } from "@/lib/crm/types";

/**
 * PHASE 87G runtime — the CRM landing surface renders REAL fetched records
 * into the sales IA (attention → pipeline → recent → KPIs → actions), EN+FA,
 * with locale-safe links, accessible states, no fabricated numbers and no raw
 * server errors. Plus: catalog parity guards and role-visibility invariants.
 */

const h = vi.hoisted(() => ({ pathname: "/crm" }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => h.pathname,
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

const STATS: CrmDashboardStats = {
  totalLeads: 12, newLeadsThisMonth: 4, pipelineValue: 2_400_000, activeOpportunities: 5,
  conversionRate: 18, forecastRevenue: 900_000, renewalsThisQuarter: 2,
  healthyAccounts: 7, atRiskAccounts: 2, churnRisk: 9,
};
const PIPELINE: CrmPipelineStage[] = [
  { stage: "DISCOVERY", label: "Discovery", count: 2, value: 400_000, probability: 10 },
  { stage: "NEGOTIATION", label: "Negotiation", count: 1, value: 800_000, probability: 70 },
  { stage: "WON", label: "Won", count: 1, value: 500_000, probability: 100 },
];
const LEADS: CrmLead[] = [
  {
    id: "l1", organizationId: null, firstName: "Sara", lastName: "Karimi", email: "s@a.com",
    phone: null, company: "Pars Steel", jobTitle: null, status: "NEW", source: "WEBSITE",
    score: 10, ownerId: null, notes: null, convertedAt: null, convertedToId: null,
    deletedAt: null, createdAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z",
  },
  {
    id: "l2", organizationId: null, firstName: "Ali", lastName: "Naderi", email: "a@b.com",
    phone: null, company: null, jobTitle: null, status: "QUALIFIED", source: "REFERRAL",
    score: 55, ownerId: null, notes: null, convertedAt: null, convertedToId: null,
    deletedAt: null, createdAt: "2026-07-09T00:00:00.000Z", updatedAt: "2026-07-09T00:00:00.000Z",
  },
];

function stubCrmFetch(opts: { failDashboard?: boolean; emptyLeads?: boolean } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/crm/dashboard")) {
        if (opts.failDashboard) return { ok: false, status: 500, json: async () => ({ error: "DB_CONN_REFUSED at pool.ts:42" }) };
        return { ok: true, status: 200, json: async () => ({ stats: STATS, pipeline: PIPELINE }) };
      }
      return { ok: true, status: 200, json: async () => ({ leads: opts.emptyLeads ? [] : LEADS }) };
    }),
  );
}

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function withIntl(locale: "en" | "fa", ui: React.ReactNode) {
  const messages = locale === "en" ? en : fa;
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("catalog + visibility invariants", () => {
  it("crm namespace: en/fa/de key-path parity, de = en verbatim, no Arabic yeh/kaf", () => {
    const paths = (o: Record<string, unknown>, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? paths(v as Record<string, unknown>, `${p}.${k}`) : [`${p}.${k}`]));
    const e = paths(en.crm as unknown as Record<string, unknown>);
    expect(paths((fa as unknown as typeof en).crm as unknown as Record<string, unknown>)).toEqual(e);
    expect(paths((de as unknown as typeof en).crm as unknown as Record<string, unknown>)).toEqual(e);
    expect(JSON.stringify((de as unknown as typeof en).crm)).toBe(JSON.stringify(en.crm));
    expect(JSON.stringify((fa as unknown as typeof en).crm)).not.toMatch(/[يك]/);
  });

  it("role visibility unchanged: admin/superadmin discover /crm; engineer/customer/candidate do not", () => {
    for (const role of ["admin", "superadmin"] as const) {
      expect(visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href))).toContain("/crm");
    }
    for (const role of ["engineer", "customer", "candidate", "viewer"] as const) {
      expect(visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href))).not.toContain("/crm");
    }
    // middleware policy itself is untouched (engineer still middleware-authorized — known 87C mismatch)
    expect(isAuthorizedForPath("engineer", "/en/crm")).toBe(true);
  });
});

describe("CrmCommandClient — English, real fixture wiring", () => {
  it("renders the sales IA in order with real numbers and no fabricated metrics", async () => {
    stubCrmFetch();
    const { container, unmount } = await mount(withIntl("en", <CrmCommandClient />));
    await settle();

    const h2s = Array.from(container.querySelectorAll("h2")).map((x) => x.textContent);
    expect(h2s).toEqual([
      en.crm.attention.title,
      en.crm.pipeline.title,
      en.crm.recent.title,
      en.crm.actions.title,
    ]);
    expect(container.querySelectorAll("h1").length).toBe(0); // page owns the H1

    // attention: unassigned QUALIFIED (Ali) + NEW (Sara) + at-risk aggregate (2)
    const attention = container.querySelector('section[aria-labelledby="crm-attention-title"]')!;
    expect(attention.textContent).toContain("Ali Naderi");
    expect(attention.textContent).toContain(en.crm.attention.unassignedLead);
    expect(attention.textContent).toContain("Sara Karimi");
    expect(attention.textContent).toContain(en.crm.attention.newLead);
    expect(attention.textContent).toContain("2 account(s) flagged at-risk");

    // pipeline: WON/LOST excluded from open stages; values traceable to fixture
    const pipeline = container.querySelector('section[aria-labelledby="crm-pipeline-title"]')!;
    expect(pipeline.textContent).toContain(en.crm.stage.DISCOVERY);
    expect(pipeline.textContent).toContain(en.crm.stage.NEGOTIATION);
    expect(pipeline.textContent).not.toContain(en.crm.stage.WON);
    expect(pipeline.textContent).toContain("$800K");
    expect(pipeline.textContent).toContain("$400K");

    // KPIs from stats fields only
    expect(container.textContent).toContain("$2.4M");
    expect(container.textContent).toContain("$900K");
    expect(container.textContent).toContain("12");

    // recent leads with localized status badges
    const recent = container.querySelector('section[aria-labelledby="crm-recent-title"]')!;
    expect(recent.textContent).toContain(en.crm.status.NEW);
    expect(recent.textContent).toContain(en.crm.status.QUALIFIED);

    // actions target the four real CRM routes with unique labels
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    for (const href of ["/crm/leads", "/crm/opportunities", "/crm/accounts", "/crm/customer-success"]) {
      expect(hrefs).toContain(href);
    }
    await unmount();
  });

  it("failure → calm unavailable state; the raw server error payload never renders", async () => {
    stubCrmFetch({ failDashboard: true });
    const { container, unmount } = await mount(withIntl("en", <CrmCommandClient />));
    await settle();
    expect(container.textContent).toContain(en.crm.states.unavailableTitle);
    expect(container.textContent).not.toContain("DB_CONN_REFUSED");
    expect(container.textContent).not.toContain("pool.ts");
    await unmount();
  });

  it("empty leads → localized empty states for attention-leads and recent (aggregate risk still shown)", async () => {
    stubCrmFetch({ emptyLeads: true });
    const { container, unmount } = await mount(withIntl("en", <CrmCommandClient />));
    await settle();
    expect(container.textContent).toContain(en.crm.recent.empty);
    // stats.atRiskAccounts=2 → attention still carries the real aggregate item
    expect(container.textContent).toContain(en.crm.attention.reviewCs);
    await unmount();
  });

  it("loading state is announced politely and hidden shimmer from AT", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => { /* never resolves */ })));
    const { container, unmount } = await mount(withIntl("en", <CrmCommandClient />));
    const status = container.querySelector('[role="status"]')!;
    expect(status.textContent).toBe(en.crm.states.loading);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
    await unmount();
  });
});

describe("CrmCommandClient — Persian (RTL) + bidi safety", () => {
  it("renders Persian sections, statuses and LTR-isolated money values", async () => {
    stubCrmFetch();
    const { container, unmount } = await mount(withIntl("fa", <CrmCommandClient />));
    await settle();
    expect(container.textContent).toContain(fa.crm.attention.title);      // «نیازمند توجه»
    expect(container.textContent).toContain(fa.crm.pipeline.title);       // «خط لولهٔ فرصت‌ها»
    expect(container.textContent).toContain(fa.crm.status.QUALIFIED);     // «واجد شرایط»
    // money stays LTR-isolated inside RTL text
    const money = Array.from(container.querySelectorAll('bdi[dir="ltr"]')).find((b) => b.textContent === "$2.4M");
    expect(money).toBeTruthy();
    await unmount();
  });
});

describe("CrmSubNav — localized sections, active state, no double prefix", () => {
  it("renders five localized sections with aria-current on the active one", async () => {
    h.pathname = "/crm";
    const { container, unmount } = await mount(withIntl("fa", <CrmSubNav />));
    const links = Array.from(container.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/crm", "/crm/leads", "/crm/opportunities", "/crm/accounts", "/crm/customer-success",
    ]);
    expect(links.every((a) => !/\/(en|fa)\/(en|fa)\//.test(a.getAttribute("href") ?? ""))).toBe(true);
    expect(links[0].getAttribute("aria-current")).toBe("page");
    expect(container.textContent).toContain(fa.crm.nav.leads);            // «سرنخ‌ها»
    expect(container.textContent).toContain(fa.crm.nav.customerSuccess);  // «موفقیت مشتری»
    // ≥44px touch targets
    expect(links.every((a) => a.className.includes("h-11"))).toBe(true);
    await unmount();
  });

  it("marks a deeper section active by prefix (leads detail → Leads tab)", async () => {
    h.pathname = "/crm/leads/l-123";
    const { container, unmount } = await mount(withIntl("en", <CrmSubNav />));
    const active = container.querySelector('a[aria-current="page"]')!;
    expect(active.getAttribute("href")).toBe("/crm/leads");
    await unmount();
  });
});
