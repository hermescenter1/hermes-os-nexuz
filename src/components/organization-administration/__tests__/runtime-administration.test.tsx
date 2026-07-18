// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import { visibleAppNavGroups } from "@/lib/navigation/app-nav";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { AdministrationCommandSurface } from "../AdministrationCommandSurface";
import { buildLimitRows } from "../logic";
import type { MemberRecord, InvitationRecord } from "@/lib/org/types";
import type { SubscriptionRecord } from "@/lib/billing/types";

/**
 * PHASE 87K runtime — the administration surface renders real org/billing
 * records into the administration IA, EN+FA, with localized membership /
 * invitation / subscription statuses, unlimited and unmeasured handled
 * explicitly, no secret or token leakage, and no fabricated finance metric.
 */

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/dashboard/organization",
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  return {
    getTranslations: async (ns: string) => {
      const locale = (globalThis as { __adminLocale?: "en" | "fa" }).__adminLocale ?? "en";
      return actual.createTranslator({ locale, messages: locale === "en" ? en : fa, namespace: ns as never });
    },
  };
});

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const NOW = Date.parse("2026-07-18T00:00:00.000Z");

function member(over: Partial<MemberRecord> = {}): MemberRecord {
  return {
    id: "m1", organizationId: "org1", userId: "u1", role: "MEMBER", status: "ACTIVE",
    departmentId: null, invitedById: null, joinedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}
function invitation(over: Partial<InvitationRecord> = {}): InvitationRecord {
  return {
    id: "i1", organizationId: "org1", email: "secret.person@example.com", role: "MEMBER",
    status: "PENDING", invitedById: null, expiresAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z", ...over,
  };
}
const SUB: SubscriptionRecord = {
  id: "s1", organizationId: "org1", planId: "p1",
  plan: { id: "p1", name: "Professional", slug: "pro", description: "", monthlyPrice: "0", yearlyPrice: "0",
    currency: "USD", features: [], limits: { members: 10, projects: -1, storage_gb: 5 } as never, isActive: true },
  status: "PAST_DUE", billingCycle: "MONTHLY", startsAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z", autoRenew: true, createdAt: "2026-01-01T00:00:00.000Z",
};

async function mountSurface(locale: "en" | "fa", over: Partial<Parameters<typeof AdministrationCommandSurface>[0]> = {}) {
  (globalThis as { __adminLocale?: "en" | "fa" }).__adminLocale = locale;
  const el = await AdministrationCommandSurface({
    members: [member(), member({ id: "m2", status: "SUSPENDED" }), member({ id: "m3", status: "INVITED" })],
    // i1 = live PENDING · i2 = PENDING whose window elapsed · i3 = stored EXPIRED.
    // The attention layer counts i2 AND i3 as expired; the distribution shows
    // the STORED statuses (PENDING 2 / EXPIRED 1) — the two are deliberately
    // different views and this fixture exercises both paths.
    invitations: [
      invitation(),
      invitation({ id: "i2", expiresAt: "2026-07-01T00:00:00.000Z" }),
      invitation({ id: "i3", status: "EXPIRED" }),
    ],
    subscription: SUB,
    limitRows: buildLimitRows(
      { members: 10, projects: -1, storage_gb: 5 },
      { members: 10, projects: 40 }, // storage_gb has NO record → not measured
      ["members", "projects", "storage_gb"],
    ),
    now: NOW,
    locale,
    ...over,
  });
  return mount(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fa} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{el}</div> : el}
    </NextIntlClientProvider>,
  );
}

describe("catalog + navigation + boundary invariants", () => {
  it("orgAdministration: en/fa/de parity, de = en verbatim, no Arabic yeh/kaf, ICU parity", () => {
    const paths = (o: Record<string, unknown>, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? paths(v as Record<string, unknown>, `${p}.${k}`) : [`${p}.${k}`]));
    const e = paths(en.orgAdministration as unknown as Record<string, unknown>);
    expect(paths((fa as unknown as typeof en).orgAdministration as unknown as Record<string, unknown>)).toEqual(e);
    expect(JSON.stringify((de as unknown as typeof en).orgAdministration)).toBe(JSON.stringify(en.orgAdministration));
    expect(JSON.stringify((fa as unknown as typeof en).orgAdministration)).not.toMatch(/[يك]/);
    for (const p of e) {
      const get = (o: unknown) => p.split(".").slice(1).reduce((x: unknown, k) => (x as Record<string, unknown>)[k], o);
      const args = (s: string) => (s.match(/\{[^}]+\}/g) ?? []).sort().join(",");
      expect(args(String(get((fa as unknown as typeof en).orgAdministration)))).toBe(args(String(get(en.orgAdministration))));
    }
  });

  it("administration destinations are discoverable for authorized roles only", () => {
    for (const role of ["admin", "superadmin"] as const) {
      const hrefs = visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
      for (const href of [
        "/dashboard/organization", "/dashboard/organization/members",
        "/dashboard/organization/invitations", "/dashboard/api", "/dashboard/billing",
      ]) expect(hrefs).toContain(href);
      // ERP stays a separate destination — org members are not ERP resources
      expect(hrefs).toContain("/erp");
    }
    for (const role of ["candidate", "viewer"] as const) {
      const hrefs = visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
      expect(hrefs).not.toContain("/dashboard/organization");
      expect(hrefs).not.toContain("/dashboard/billing");
    }
  });

  it("the landing keeps the PHASE 87D PageShell contract and adds no API of its own", () => {
    const page = read("src/app/[locale]/dashboard/organization/page.tsx");
    // 87D public-shell-rollout contract: authenticated pages keep PageShell
    expect(page).toContain("@/components/PageShell");
    expect(page).not.toContain("@/components/public-site");
    // reads go through EXISTING server service functions, not a new endpoint
    expect(page).toContain("@/lib/org/members");
    expect(page).toContain("@/lib/billing/subscriptions");
    expect(page).not.toMatch(/fetch\(/);
  });

  it("the surface never imports sibling business modules (member ≠ ERP resource)", () => {
    for (const rel of [
      "src/components/organization-administration/AdministrationCommandSurface.tsx",
      "src/components/organization-administration/logic.ts",
    ]) {
      const src = read(rel);
      expect(src).not.toContain("@/lib/erp/");
      expect(src).not.toContain("@/lib/crm/");
    }
  });
});

describe("AdministrationCommandSurface — EN, real record wiring", () => {
  it("renders the administration IA in order with localized statuses and boundary notes", async () => {
    const { container, unmount } = await mountSurface("en");
    const h2s = Array.from(container.querySelectorAll("h2")).map((x) => x.textContent);
    expect(h2s).toEqual([
      en.orgAdministration.attention.title,
      en.orgAdministration.sections.membership,
      en.orgAdministration.sections.subscription,
      en.orgAdministration.sections.usage,
      en.orgAdministration.sections.actions,
    ]);
    expect(container.querySelectorAll("h1").length).toBe(0); // page owns the H1

    // attention: past-due first, then expired invitations, suspended, limit reached
    const attention = container.querySelector('section[aria-labelledby="admin-attention-title"]')!;
    expect(attention.textContent).toContain(en.orgAdministration.attention.pastDue);
    // i2 (window elapsed) + i3 (stored EXPIRED) both count
    expect(attention.textContent).toContain("2 invitation(s) expired");
    expect(attention.textContent).toContain("1 member(s) suspended");
    expect(attention.textContent).toContain("1 plan limit(s) reached");

    // localized status labels; raw enums never rendered
    expect(container.textContent).toContain(en.orgAdministration.memberStatus.SUSPENDED);
    expect(container.textContent).toContain(en.orgAdministration.invitationStatus.EXPIRED);
    expect(container.textContent).toContain(en.orgAdministration.subscriptionStatus.PAST_DUE);
    expect(container.textContent).not.toMatch(/\bPAST_DUE\b|\bSUSPENDED\b|\bBILLING_ADMIN\b/);

    // usage: unlimited shown as a word, unmeasured shown explicitly (never 0)
    expect(container.textContent).toContain(en.orgAdministration.fields.unlimited);
    expect(container.textContent).toContain(en.orgAdministration.fields.unavailable);
    expect(container.textContent).toContain(en.orgAdministration.fields.unavailableNote);

    // explicit product-boundary statements
    expect(container.textContent).toContain(en.orgAdministration.distinction.platformBilling);
    expect(container.textContent).toContain(en.orgAdministration.distinction.memberScope);

    // NO secret / token / email leakage
    expect(container.innerHTML).not.toContain("secret.person@example.com");
    expect(container.innerHTML).not.toMatch(/token|sk_|secret/i);

    // NO fabricated finance metrics
    expect(container.textContent).not.toMatch(/MRR|ARR|recurring revenue|security score|compliance score|success rate/i);

    // actions target real administration routes
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    for (const href of [
      "/dashboard/organization/members", "/dashboard/organization/invitations",
      "/dashboard/api", "/dashboard/billing",
    ]) expect(hrefs).toContain(href);
    await unmount();
  });

  it("no subscription → localized no-subscription state, not a fake active plan", async () => {
    const { container, unmount } = await mountSurface("en", { subscription: null, limitRows: [] });
    expect(container.textContent).toContain(en.orgAdministration.states.noSubscription);
    expect(container.textContent).toContain(en.orgAdministration.states.noUsage);
    // scoped to the subscription section: no plan/status is invented there
    // (the word "Active" legitimately appears in the MEMBER status distribution)
    const sub = container.querySelector('section[aria-labelledby="admin-subscription-title"]')!;
    expect(sub.textContent).not.toContain(en.orgAdministration.subscriptionStatus.ACTIVE);
    expect(sub.querySelectorAll("span.inline-flex").length).toBe(0); // no status badge at all
    await unmount();
  });

  it("empty organization → distinct localized empty states (not one generic message)", async () => {
    const { container, unmount } = await mountSurface("en", {
      members: [], invitations: [], subscription: null, limitRows: [],
    });
    expect(container.textContent).toContain(en.orgAdministration.attention.empty === "" ? "x" : en.orgAdministration.states.noMembers);
    expect(container.textContent).toContain(en.orgAdministration.states.noSubscription);
    expect(container.textContent).toContain(en.orgAdministration.states.noUsage);
    expect(new Set([
      en.orgAdministration.states.noMembers,
      en.orgAdministration.states.noSubscription,
      en.orgAdministration.states.noUsage,
    ]).size).toBe(3);
    await unmount();
  });

  it("Persian: localized sections/statuses, no hardcoded English, no raw errors", async () => {
    const { container, unmount } = await mountSurface("fa");
    expect(container.textContent).toContain(fa.orgAdministration.attention.title);            // «نیازمند توجه»
    expect(container.textContent).toContain(fa.orgAdministration.sections.subscription);      // «طرح و اشتراک»
    expect(container.textContent).toContain(fa.orgAdministration.subscriptionStatus.PAST_DUE); // «سررسید گذشته»
    expect(container.textContent).toContain(fa.orgAdministration.fields.unlimited);           // «نامحدود»
    expect(container.textContent).not.toMatch(/Requires attention|Plan and subscription|Past due/);
    expect(container.textContent).not.toMatch(/Error:|stack|ECONNREFUSED|prisma/i);
    await unmount();
  });
});
