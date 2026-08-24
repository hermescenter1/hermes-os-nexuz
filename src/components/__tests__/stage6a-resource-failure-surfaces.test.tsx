// @vitest-environment jsdom
/**
 * PHASE 107 STAGE 6-A — every converted surface must SHOW its failure.
 *
 * The Stage 5 authenticated sweep recorded 73 cells where a request had failed
 * and the page said nothing about it, and 26 where a spinner never resolved.
 * Unit tests on the primitives prove the state machine; only mounting the real
 * components proves the state reaches the screen.
 *
 * For each of the ten owners the evidence implicated, this asserts:
 *   - a 401 asks the reader to sign in, and does NOT say "empty" or "not found"
 *   - a 500 says the data could not be loaded
 *   - a dropped connection says so
 *   - the loading state always terminates
 *
 * The copy is asserted in Persian and German too, because an error state that
 * only exists in English is not an error state for two thirds of this product.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";

// The i18n-aware Link cannot be imported under vitest; the components under
// test only need it to render an anchor.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children?: ReactNode; href?: string }) => <a href={String(href)}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/crm/accounts",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AccountListClient }         from "../crm/AccountListClient";
import { AccountDetailClient }       from "../crm/AccountDetailClient";
import { LeadDetailClient }          from "../crm/LeadDetailClient";
import { OpportunityDetailClient }   from "../crm/OpportunityDetailClient";
import { OpportunityPipelineClient } from "../crm/OpportunityPipelineClient";
import { CustomerSuccessClient }     from "../crm/CustomerSuccessClient";
import { CustomerAccountClient }     from "../customer-portal/CustomerAccountClient";
import { CustomerOverviewClient }    from "../customer-portal/CustomerOverviewClient";
import { CustomerTrainingClient }    from "../customer-portal/CustomerTrainingClient";
import { CustomerSettingsClient }    from "../customer-portal/CustomerSettingsClient";
import { BillingDashboard }          from "../billing/BillingDashboard";
import { ApiKeysDashboard }          from "../api/ApiKeysDashboard";
import { OrgOverview }               from "../organization/OrgOverview";
import { DepartmentsPanel }          from "../organization/DepartmentsPanel";

const CATALOGUE = { en, fa, de } as const;
type Locale = keyof typeof CATALOGUE;

/**
 * The fourteen owners behind the affected cells.
 *
 * The last four were initially misfiled as detector false positives: they all
 * had a `.ok` check and an `error` state somewhere in the file, which a static
 * pass reads as "handled". Reading them showed the error state belonged to the
 * SAVE path while the LOAD guarded with `if (res.ok)` and no else — so a failed
 * load set nothing, finished loading, and rendered the empty case. They are
 * here because a component is only cleared by being mounted and watched.
 */
const SURFACES: Array<{ name: string; render: () => ReactNode }> = [
  { name: "crm/AccountListClient",         render: () => <AccountListClient /> },
  { name: "crm/AccountDetailClient",       render: () => <AccountDetailClient accountId="acc-1" /> },
  { name: "crm/LeadDetailClient",          render: () => <LeadDetailClient leadId="lead-1" /> },
  { name: "crm/OpportunityDetailClient",   render: () => <OpportunityDetailClient oppId="opp-1" /> },
  { name: "crm/OpportunityPipelineClient", render: () => <OpportunityPipelineClient /> },
  { name: "crm/CustomerSuccessClient",     render: () => <CustomerSuccessClient /> },
  { name: "customer-portal/CustomerAccountClient",  render: () => <CustomerAccountClient /> },
  { name: "customer-portal/CustomerOverviewClient", render: () => <CustomerOverviewClient /> },
  { name: "customer-portal/CustomerTrainingClient", render: () => <CustomerTrainingClient /> },
  { name: "customer-portal/CustomerSettingsClient", render: () => <CustomerSettingsClient /> },
  { name: "billing/BillingDashboard",       render: () => <BillingDashboard /> },
  { name: "api/ApiKeysDashboard",           render: () => <ApiKeysDashboard /> },
  { name: "organization/OrgOverview",       render: () => <OrgOverview orgId="org-1" /> },
  { name: "organization/DepartmentsPanel",  render: () => <DepartmentsPanel orgId="org-1" canManage /> },
];

const respond = (status: number, body: unknown) =>
  vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;

const rejectWith = (error: Error) => vi.fn(async () => { throw error; }) as unknown as typeof fetch;

async function render(ui: ReactNode, locale: Locale = "en") {
  return mount(
    <NextIntlClientProvider locale={locale} messages={CATALOGUE[locale]}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const copy = (locale: Locale, key: string) =>
  (CATALOGUE[locale].errors.resource as Record<string, string>)[key];

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe.each(SURFACES)("$name", ({ render: renderSurface }) => {
  it("asks the reader to sign in when the session has expired", async () => {
    globalThis.fetch = respond(401, { error: "Authentication required" });
    const { container, unmount } = await render(renderSurface());

    const text = container.textContent ?? "";
    expect(text).toContain(copy("en", "unauthenticatedTitle"));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    // The exact defect: the failure must not be dressed up as absence.
    expect(text).not.toMatch(/no (accounts|leads|contacts|opportunities) /i);
    expect(text).not.toContain("No Account Found");
    await unmount();
  });

  it("offers a way forward when the server fails", async () => {
    globalThis.fetch = respond(500, { error: "boom" });
    const { container, unmount } = await render(renderSurface());

    expect(container.textContent).toContain(copy("en", "failedTitle"));
    // FAILED is retryable, so the reader is not left with a dead end.
    expect(container.textContent).toContain(copy("en", "retry"));
    await unmount();
  });

  it("names a dropped connection as one", async () => {
    globalThis.fetch = rejectWith(new TypeError("Failed to fetch"));
    const { container, unmount } = await render(renderSurface());

    expect(container.textContent).toContain(copy("en", "offlineTitle"));
    await unmount();
  });

  it("tells a signed-in reader to select an organization, never to sign in again", async () => {
    /*
     * PHASE 107 STAGE 6-A — the 12 cells that were still wrong. Billing and the
     * API-key dashboard answered 401 to a browser holding a valid admin session,
     * so the page offered a sign-in link that could not possibly help. The API
     * now answers 409 with a code, and this asserts the reader is told what is
     * actually missing.
     */
    globalThis.fetch = respond(409, { error: "context", code: "ORGANIZATION_CONTEXT_REQUIRED" });
    const { container, unmount } = await render(renderSurface());

    const text = container.textContent ?? "";
    expect(text).toContain(copy("en", "orgContextTitle"));
    // The whole point: no sign-in wording, and no sign-in link.
    expect(text).not.toContain(copy("en", "unauthenticatedTitle"));
    expect(text).not.toContain(copy("en", "signIn"));
    expect(container.querySelector("a[href*='/auth/login']")).toBeNull();
    await unmount();
  });

  it("distinguishes forbidden from unauthenticated", async () => {
    globalThis.fetch = respond(403, { error: "Forbidden" });
    const { container, unmount } = await render(renderSurface());

    const text = container.textContent ?? "";
    expect(text).toContain(copy("en", "forbiddenTitle"));
    // Asking a user without permission to sign in again sends them in circles.
    expect(text).not.toContain(copy("en", "unauthenticatedTitle"));
    await unmount();
  });

  it("leaves the loading state on every path", async () => {
    globalThis.fetch = respond(500, { error: "boom" });
    const { container, unmount } = await render(renderSurface());

    // The 26 STUCK_LOADING cells: a skeleton with no way out.
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
    await unmount();
  });
});

describe("the failure is localized, not English-only", () => {
  it.each(["fa", "de"] as const)("renders the sign-in state in %s", async (locale) => {
    globalThis.fetch = respond(401, { error: "Authentication required" });
    const { container, unmount } = await render(<AccountListClient />, locale);

    expect(container.textContent).toContain(copy(locale, "unauthenticatedTitle"));
    expect(container.textContent).toContain(copy(locale, "signIn"));
    // English copy must not leak into a non-English surface.
    expect(container.textContent).not.toContain(copy("en", "unauthenticatedTitle"));
    await unmount();
  });

  it("points sign-in at the reader's own locale", async () => {
    globalThis.fetch = respond(401, {});
    const { container, unmount } = await render(<AccountListClient />, "de");

    const link = container.querySelector("a[href*='/auth/login']");
    expect(link?.getAttribute("href")).toBe("/de/auth/login");
    await unmount();
  });
});

describe("success and emptiness still behave", () => {
  it("renders rows when the server returns them", async () => {
    globalThis.fetch = respond(200, {
      accounts: [{ id: "a1", name: "Pars Petrochemical", industry: "Chemicals", tier: "ENTERPRISE", openDeals: 3, country: "IR", health: null }],
    });
    const { container, unmount } = await render(<AccountListClient />);

    expect(container.textContent).toContain("Pars Petrochemical");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await unmount();
  });

  it("still says 'empty' when the server genuinely returns nothing", async () => {
    globalThis.fetch = respond(200, { accounts: [] });
    const { container, unmount } = await render(<AccountListClient />);

    expect(container.textContent).toContain(en.crm.accounts.empty);
    // Emptiness is not a failure and must not be announced as one.
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await unmount();
  });
});

/**
 * PHASE 107 STAGE 6-A.1 — the way out has to be reachable with a thumb.
 *
 * Both recovery controls this stage introduced were built with the design
 * system's `sm` size, which is 32px. A recovery control is exactly the wrong
 * place to be hard to hit: the reader is already stuck, and on a phone the
 * difference between 32px and 44px is the difference between recovering and
 * giving up. `lg` is the DS token that means 44px — asserted through the real
 * recipe, so a future change to the token cannot silently shrink these.
 */
describe("Stage 6-A.1 — recovery controls meet the 44px touch target", () => {
  const MIN_TARGET = "h-11";   // Tailwind h-11 = 2.75rem = 44px

  it("the sign-in link uses the 44px size", async () => {
    globalThis.fetch = respond(401, { error: "Authentication required" });
    const { container, unmount } = await render(<AccountListClient />);
    const link = container.querySelector("a[href*='/auth/login']");
    expect(link).not.toBeNull();
    expect(link!.className).toContain(MIN_TARGET);
    await unmount();
  });

  it("the retry button uses the 44px size", async () => {
    globalThis.fetch = respond(500, { error: "boom" });
    const { container, unmount } = await render(<AccountListClient />);
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.className).toContain(MIN_TARGET);
    await unmount();
  });

  it("neither control is the 32px size any more", async () => {
    for (const [status, body] of [[401, {}], [500, {}]] as const) {
      globalThis.fetch = respond(status, body);
      const { container, unmount } = await render(<AccountListClient />);
      const control = container.querySelector("a[href*='/auth/login'], button");
      expect(control).not.toBeNull();
      expect(control!.className).not.toMatch(/\bh-8\b/);
      await unmount();
    }
  });

  it("keeps its accessible name and stays focusable", async () => {
    globalThis.fetch = respond(500, { error: "boom" });
    const { container, unmount } = await render(<AccountListClient />);
    const button = container.querySelector("button")!;
    // A bigger target must not come at the cost of the name or the keyboard.
    expect((button.textContent || "").trim().length).toBeGreaterThan(0);
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("tabindex")).not.toBe("-1");
    await unmount();
  });
});
