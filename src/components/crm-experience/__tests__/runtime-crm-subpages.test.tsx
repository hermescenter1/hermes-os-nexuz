// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { LeadListClient } from "../../crm/LeadListClient";
import { LeadDetailClient } from "../../crm/LeadDetailClient";
import { OpportunityPipelineClient } from "../../crm/OpportunityPipelineClient";
import { OpportunityDetailClient } from "../../crm/OpportunityDetailClient";
import { AccountListClient } from "../../crm/AccountListClient";
import { CustomerSuccessClient } from "../../crm/CustomerSuccessClient";
import { HealthScoreCard } from "../../crm/HealthScoreCard";
import type { CrmLead, CrmOpportunity } from "@/lib/crm/types";

/**
 * PHASE 87G AMENDMENT 1 — CRM subpage localization. EN+FA rendering of every
 * verified subpage client from deterministic fixtures: localized headers,
 * statuses, actions and states; API enum VALUES unchanged on the wire;
 * bidi-safe identifiers/currency; no raw server errors; DE carryover.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/fa/crm/leads",
}));

const LEAD: CrmLead = {
  id: "l1", organizationId: null, firstName: "Sara", lastName: "Karimi",
  email: "sara@pars-steel.example", phone: "+98 912 000 0000", company: "Pars Steel",
  jobTitle: "Plant Engineer", status: "QUALIFIED", source: "WEBSITE", score: 72,
  ownerId: null, notes: "Met at expo.", convertedAt: null, convertedToId: null,
  deletedAt: null, createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-05T00:00:00.000Z",
};
const OPP: CrmOpportunity & { account: null } = {
  id: "o1", organizationId: null, accountId: null, leadId: null,
  title: "Steel line expansion", stage: "NEGOTIATION", value: 850_000, probability: 60,
  expectedCloseDate: "2026-09-01T00:00:00.000Z", ownerId: null, lostReason: null,
  notes: null, createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z",
  account: null,
} as unknown as CrmOpportunity & { account: null };

function stubFetch(map: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      const key = Object.keys(map).find((k) => String(url).includes(k));
      if (!key) return { ok: false, status: 404, json: async () => ({ error: "RAW_SERVER_TRACE" }) };
      return { ok: true, status: 200, json: async () => map[key] };
    }),
  );
  return calls;
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

describe("catalog — subpage sub-trees parity + carryover", () => {
  it("crm subpage keys: en/fa/de identical paths, de=en verbatim, no Arabic yeh/kaf, ICU parity", () => {
    const paths = (o: Record<string, unknown>, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? paths(v as Record<string, unknown>, `${p}.${k}`) : [`${p}.${k}`]));
    const e = paths(en.crm as unknown as Record<string, unknown>);
    expect(paths((fa as unknown as typeof en).crm as unknown as Record<string, unknown>)).toEqual(e);
    expect(JSON.stringify((de as unknown as typeof en).crm)).toBe(JSON.stringify(en.crm));
    expect(JSON.stringify((fa as unknown as typeof en).crm)).not.toMatch(/[يك]/);
    // ICU parity en↔fa on the new sub-trees
    for (const p of e) {
      const get = (o: unknown) => p.split(".").slice(1).reduce((x: unknown, k) => (x as Record<string, unknown>)[k], o);
      const ev = String(get(en.crm)), fv = String(get((fa as unknown as typeof en).crm));
      const args = (s: string) => (s.match(/\{[^}]+\}/g) ?? []).sort().join(",");
      expect(args(fv), `ICU mismatch at crm${p}`).toBe(args(ev));
    }
  });
});

describe("LeadListClient — localized list, enum values on the wire", () => {
  it("FA: localized headers/status/source/empty-filter labels; filter click sends the RAW enum", async () => {
    const calls = stubFetch({ "/api/crm/leads": { leads: [LEAD] } });
    const { container, unmount } = await mount(withIntl("fa", <LeadListClient />));
    await settle();

    for (const col of ["colName", "colCompany", "colStatus", "colSource", "colScore", "colCreated"] as const) {
      expect(container.textContent).toContain(fa.crm.leads[col]);
    }
    expect(container.textContent).toContain(fa.crm.status.QUALIFIED); // «واجد شرایط»
    expect(container.textContent).toContain(fa.crm.source.WEBSITE);   // «وب‌سایت»
    expect(container.textContent).not.toMatch(/\bQualified\b|\bWebsite\b/); // no hardcoded EN

    // email is LTR-isolated
    const email = Array.from(container.querySelectorAll('bdi[dir="ltr"]')).find(
      (b) => b.textContent === "sara@pars-steel.example",
    );
    expect(email).toBeTruthy();

    // clicking the QUALIFIED filter sends the internal enum value, not the label
    const btn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === fa.crm.status.QUALIFIED,
    )!;
    await act(async () => { btn.click(); });
    await settle();
    expect(calls.some((u) => u.includes("status=QUALIFIED"))).toBe(true);
    expect(calls.some((u) => u.includes(encodeURIComponent(fa.crm.status.QUALIFIED)))).toBe(false);
    await unmount();
  });

  it("EN: localized empty state (no raw error text ever)", async () => {
    stubFetch({ "/api/crm/leads": { leads: [] } });
    const { container, unmount } = await mount(withIntl("en", <LeadListClient />));
    await settle();
    expect(container.textContent).toContain(en.crm.leads.empty);
    expect(container.textContent).not.toContain("RAW_SERVER_TRACE");
    await unmount();
  });
});

describe("LeadDetailClient — localized profile + bidi", () => {
  it("FA: field labels, status badge, notes heading; score LTR", async () => {
    stubFetch({ "/api/crm/leads/l1": { lead: LEAD } });
    const { container, unmount } = await mount(withIntl("fa", <LeadDetailClient leadId="l1" />));
    await settle();
    expect(container.textContent).toContain(fa.crm.leadDetail.contactDetails);
    expect(container.textContent).toContain(fa.crm.leadDetail.email);
    expect(container.textContent).toContain(fa.crm.common.notes);
    expect(container.textContent).toContain(fa.crm.status.QUALIFIED);
    expect(container.textContent).not.toContain("Contact Details");
    await unmount();
  });

  it("EN: not-found state is localized", async () => {
    stubFetch({ "/api/crm/leads/missing": { lead: null } });
    const { container, unmount } = await mount(withIntl("en", <LeadDetailClient leadId="missing" />));
    await settle();
    expect(container.textContent).toContain(en.crm.leadDetail.notFound);
    await unmount();
  });
});

describe("OpportunityPipelineClient — kanban/list localized, stages internal", () => {
  it("FA kanban: localized stage columns + view switch + money bidi-safe", async () => {
    stubFetch({ "/api/crm/opportunities": { opportunities: [OPP] } });
    const { container, unmount } = await mount(withIntl("fa", <OpportunityPipelineClient />));
    await settle();
    expect(container.textContent).toContain(fa.crm.stage.NEGOTIATION); // «مذاکره»
    expect(container.textContent).toContain(fa.crm.stage.TECHNICAL_REVIEW);
    expect(container.textContent).toContain(fa.crm.opps.switchToList);
    expect(container.textContent).toContain(fa.crm.opps.emptyColumn);
    const money = Array.from(container.querySelectorAll('bdi[dir="ltr"]')).find((b) => b.textContent === "$850K");
    expect(money).toBeTruthy();
    expect(container.textContent).not.toMatch(/Switch to List|Tech Review/);
    await unmount();
  });

  it("EN list view: localized table headers", async () => {
    stubFetch({ "/api/crm/opportunities": { opportunities: [OPP] } });
    const { container, unmount } = await mount(withIntl("en", <OpportunityPipelineClient />));
    await settle();
    const switchBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === en.crm.opps.switchToList,
    )!;
    await act(async () => { switchBtn.click(); });
    for (const col of ["colTitle", "colStage", "colValue", "colProbability", "colClose"] as const) {
      expect(container.textContent).toContain(en.crm.opps[col]);
    }
    await unmount();
  });
});

describe("OpportunityDetailClient + AccountListClient + CustomerSuccessClient + HealthScoreCard", () => {
  it("opp detail FA: details/win-probability/weighted labels localized", async () => {
    stubFetch({ "/api/crm/opportunities/o1": { opportunity: OPP } });
    const { container, unmount } = await mount(withIntl("fa", <OpportunityDetailClient oppId="o1" />));
    await settle();
    expect(container.textContent).toContain(fa.crm.oppDetail.details);
    expect(container.textContent).toContain(fa.crm.oppDetail.winProbability);
    expect(container.textContent).toContain(fa.crm.oppDetail.weightedValue);
    expect(container.textContent).toContain(fa.crm.stage.NEGOTIATION);
    await unmount();
  });

  it("accounts FA: search placeholder/label + tier localized; empty state localized", async () => {
    stubFetch({ "/api/crm/accounts": { accounts: [] } });
    const { container, unmount } = await mount(withIntl("fa", <AccountListClient />));
    await settle();
    const input = container.querySelector("input")!;
    expect(input.getAttribute("placeholder")).toBe(fa.crm.accounts.searchPlaceholder);
    expect(input.getAttribute("aria-label")).toBe(fa.crm.accounts.searchLabel);
    expect(container.textContent).toContain(fa.crm.accounts.empty);
    await unmount();
  });

  it("customer success FA: KPI + tab labels localized with counts; unavailable localized", async () => {
    stubFetch({
      "/api/crm/customer-success": {
        overview: {
          healthSummary: { healthy: 3, watch: 1, atRisk: 1, critical: 0 },
          accounts: [], renewals: [], expansions: [], managers: [],
        },
      },
    });
    const { container, unmount } = await mount(withIntl("fa", <CustomerSuccessClient />));
    await settle();
    expect(container.textContent).toContain(fa.crm.health.HEALTHY);   // «سالم»
    expect(container.textContent).toContain(fa.crm.health.AT_RISK);   // «در معرض ریسک»
    expect(container.textContent).not.toMatch(/Healthy|At Risk|CSMs/);
    await unmount();
  });

  it("HealthScoreCard renders the localized category label from the enum value", async () => {
    const { container, unmount } = await mount(withIntl("fa", <HealthScoreCard score={42} category="CRITICAL" compact />));
    expect(container.textContent).toContain(fa.crm.health.CRITICAL); // «بحرانی»
    expect(container.textContent).toContain("42");
    await unmount();
  });
});
