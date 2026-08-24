// @vitest-environment jsdom
/**
 * PHASE 107 STAGE 6-A.2 — a 2xx that says nothing must not be read as an answer.
 *
 * Stage 6-A made a FAILED request visible. It left a narrower hole open: a
 * request that SUCCEEDS but comes back without the field the screen needs. A
 * proxy's empty 200, a truncated body, a route regression — each produces a
 * response `requestJson` is happy with, and the selector then decided what it
 * meant.
 *
 * Three selectors decided wrongly, and each was user-visible:
 *
 *   - billing read `subscription ?? null`, so a body that never mentioned a
 *     subscription rendered as a confident "you are on no plan" — a wrong
 *     answer about money, derived from a response that said nothing;
 *   - the settings form read `preference ?? DEFAULT_PREFERENCE`, so the reader
 *     was shown invented defaults they could then save over their real ones;
 *   - the settings SAVE read `preference ?? null` and then set "Saved."
 *     unconditionally — a success banner for a write nobody could confirm.
 *
 * The distinction under test is ABSENT versus NULL. An explicit `null` is a
 * real answer from these routes and must keep working; an absent key is a
 * broken contract and must surface as a failure the reader can act on.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../messages/en.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children?: ReactNode; href?: string }) => <a href={String(href)}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/dashboard/billing",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { BillingDashboard }       from "../billing/BillingDashboard";
import { CustomerSettingsClient } from "../customer-portal/CustomerSettingsClient";
import { CustomerOverviewClient } from "../customer-portal/CustomerOverviewClient";
import { CustomerAccountClient }  from "../customer-portal/CustomerAccountClient";

/**
 * A fetch double routed by URL and method.
 *
 * Billing issues four requests at once, so a single-answer stub cannot express
 * "this one endpoint is malformed and the rest are fine" — which is exactly the
 * case that matters.
 */
function routedFetch(routes: Array<{ match: RegExp; method?: string; status?: number; body: unknown }>) {
  const calls: Array<{ url: string; method: string }> = [];
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url: u, method });
    const route = routes.find((r) => r.match.test(u) && (r.method ?? "GET") === method)
      ?? routes.find((r) => r.match.test(u));
    const status = route?.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(route ? route.body : {}),
    };
  });
  return Object.assign(fn as unknown as typeof fetch, { calls });
}

const render = (ui: ReactNode) =>
  mount(<NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>);

const resourceCopy = (key: string) => (en.errors.resource as Record<string, string>)[key];

/*
 * Submit inside a single act() and let the pending PATCH settle.
 *
 * Deliberately NOT nested: a nested act() in React 19 leaves every later render
 * in the file empty, which silently turns an absence assertion into a pass.
 */
async function submit(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => { await Promise.resolve(); });
}

/** Every billing endpoint answering well-formed data, so one can be varied. */
const HEALTHY_BILLING = [
  { match: /\/api\/billing\/plans/, body: { plans: [] } },
  { match: /\/api\/billing\/invoices/, body: { invoices: [] } },
  // `UsageSummary` is a metric -> number map, not a list; a wrong fixture shape
  // crashes the render and would be mistaken for the defect under test.
  { match: /\/api\/billing\/usage/, body: { summary: { apiCalls: 12 }, statuses: [] } },
];

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe("BillingDashboard — a subscription the server never mentioned", () => {
  it("treats a 2xx with NO subscription key as a failure, not as 'no plan'", async () => {
    globalThis.fetch = routedFetch([
      ...HEALTHY_BILLING,
      { match: /\/api\/billing\/subscription/, body: {} },   // the malformed one
    ]);
    const { container, unmount } = await render(<BillingDashboard />);
    const text = container.textContent ?? "";

    expect(text).toContain(resourceCopy("failedTitle"));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    // The defect: an absent field presented as a confident statement about billing.
    expect(text).not.toMatch(/no active (plan|subscription)/i);
    await unmount();
  });

  it("still accepts an EXPLICIT null subscription, which is a real answer", async () => {
    globalThis.fetch = routedFetch([
      ...HEALTHY_BILLING,
      { match: /\/api\/billing\/subscription/, body: { subscription: null } },
    ]);
    const { container, unmount } = await render(<BillingDashboard />);
    const text = container.textContent ?? "";

    // A legitimate "on no plan" state: the page renders, with no failure notice.
    expect(text).not.toContain(resourceCopy("failedTitle"));
    expect(text).not.toContain(resourceCopy("unauthenticatedTitle"));
    await unmount();
  });

  it("does not sit forever loading on a malformed body", async () => {
    globalThis.fetch = routedFetch([
      ...HEALTHY_BILLING,
      { match: /\/api\/billing\/subscription/, body: {} },
    ]);
    const { container, unmount } = await render(<BillingDashboard />);
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    await unmount();
  });
});

describe("CustomerSettingsClient — loading", () => {
  it("treats a 2xx with neither noAccount nor preference as a failure", async () => {
    globalThis.fetch = routedFetch([{ match: /\/api\/customer\/settings/, body: {} }]);
    const { container, unmount } = await render(<CustomerSettingsClient />);
    const text = container.textContent ?? "";

    expect(text).toContain(resourceCopy("failedTitle"));
    // The defect: a full settings form built from values the server never sent.
    expect(container.querySelector('[role="switch"]')).toBeNull();
    await unmount();
  });

  /*
   * PHASE 107 STAGE 6-A.3 — the no-account path needs the SAME presence check.
   *
   * `if (d.noAccount) return null` used to run BEFORE the `preference` check, so
   * `200 {"noAccount": true}` — an envelope missing the documented key — became a
   * legitimate `null` and rendered "No Account Found". A malformed body was
   * turned into a confident statement about the reader's account.
   */
  it("rejects {noAccount:true} with NO preference key as malformed", async () => {
    globalThis.fetch = routedFetch([
      { match: /\/api\/customer\/settings/, body: { noAccount: true } },
    ]);
    const { container, unmount } = await render(<CustomerSettingsClient />);
    const text = container.textContent ?? "";

    expect(text).toContain(resourceCopy("failedTitle"));
    // The specific false success this closes.
    expect(text).not.toMatch(/no account found/i);
    await unmount();
  });

  it("rejects an envelope carrying only unrelated keys", async () => {
    globalThis.fetch = routedFetch([
      { match: /\/api\/customer\/settings/, body: { ok: true, data: { language: "en" } } },
    ]);
    const { container, unmount } = await render(<CustomerSettingsClient />);
    expect(container.textContent).toContain(resourceCopy("failedTitle"));
    await unmount();
  });

  it("accepts the documented noAccount envelope", async () => {
    globalThis.fetch = routedFetch([
      { match: /\/api\/customer\/settings/, body: { preference: null, noAccount: true } },
    ]);
    const { container, unmount } = await render(<CustomerSettingsClient />);
    expect(container.textContent).not.toContain(resourceCopy("failedTitle"));
    await unmount();
  });

  it("accepts an EXPLICIT null preference and seeds the form with defaults", async () => {
    globalThis.fetch = routedFetch([
      { match: /\/api\/customer\/settings/, body: { preference: null } },
    ]);
    const { container, unmount } = await render(<CustomerSettingsClient />);

    expect(container.textContent).not.toContain(resourceCopy("failedTitle"));
    // The account exists with no saved row yet, so the editable form IS correct here.
    expect(container.querySelector('[role="switch"]')).not.toBeNull();
    await unmount();
  });
});

describe("CustomerSettingsClient — saving", () => {
  /** A loaded, editable form, ready for the save path to be exercised. */
  const LOADED = {
    preference: {
      language: "en", timezone: "UTC", emailNotifications: true,
      ticketUpdates: true, projectUpdates: true, documentAlerts: true, marketingEmails: false,
    },
  };

  it("never shows 'Settings saved.' for a 2xx carrying no saved record", async () => {
    globalThis.fetch = routedFetch([
      { match: /\/api\/customer\/settings/, method: "GET", body: LOADED },
      { match: /\/api\/customer\/settings/, method: "PATCH", body: {} },   // malformed save
    ]);
    const { container, unmount } = await render(<CustomerSettingsClient />);

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    await submit(form!);

    const text = container.textContent ?? "";
    expect(text).not.toContain("Settings saved.");
    // And the reader is told, in place, with a native recoverable state.
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await unmount();
  });

  it("confirms a save that DID come back with the record", async () => {
    globalThis.fetch = routedFetch([
      { match: /\/api\/customer\/settings/, method: "GET", body: LOADED },
      { match: /\/api\/customer\/settings/, method: "PATCH", body: LOADED },
    ]);
    const { container, unmount } = await render(<CustomerSettingsClient />);

    const form = container.querySelector("form");
    await submit(form!);

    expect(container.textContent).toContain("Settings saved.");
    await unmount();
  });
});

describe("CustomerOverviewClient — the same defect, found by the audit not the review", () => {
  /*
   * PHASE 107 STAGE 6-A.3 — the order-sensitive selector audit found a SECOND
   * component with the identical shape: `if (d.noAccount) return null` running
   * before the envelope had been verified. Nobody reported this one; the
   * previous text-matching audit had certified it as safe because a presence
   * check appeared somewhere in the function.
   */
  const OVERVIEW = { revenue: 0, openTickets: 0, activeProjects: 0, documents: 0 };

  it("rejects {noAccount:true} with NO overview key as malformed", async () => {
    globalThis.fetch = routedFetch([{ match: /\/api\/customer\/overview/, body: { noAccount: true } }]);
    const { container, unmount } = await render(<CustomerOverviewClient />);
    const text = container.textContent ?? "";

    expect(text).toContain(resourceCopy("failedTitle"));
    expect(text).not.toMatch(/no account found/i);
    await unmount();
  });

  it("rejects an empty 2xx", async () => {
    globalThis.fetch = routedFetch([{ match: /\/api\/customer\/overview/, body: {} }]);
    const { container, unmount } = await render(<CustomerOverviewClient />);
    expect(container.textContent).toContain(resourceCopy("failedTitle"));
    await unmount();
  });

  it("accepts the documented noAccount envelope", async () => {
    globalThis.fetch = routedFetch([
      { match: /\/api\/customer\/overview/, body: { overview: null, noAccount: true } },
    ]);
    const { container, unmount } = await render(<CustomerOverviewClient />);
    expect(container.textContent).not.toContain(resourceCopy("failedTitle"));
    await unmount();
  });

  it("accepts a real overview", async () => {
    globalThis.fetch = routedFetch([
      { match: /\/api\/customer\/overview/, body: { overview: OVERVIEW } },
    ]);
    const { container, unmount } = await render(<CustomerOverviewClient />);
    expect(container.textContent).not.toContain(resourceCopy("failedTitle"));
    await unmount();
  });
});

describe("CustomerAccountClient — proving one field is not proving another", () => {
  /*
   * PHASE 107 FINAL — found by making the selector audit field-sensitive.
   *
   * The selector proved `account`/`noAccount` and then returned
   * `contacts: d.contacts ?? []`. The route has two success shapes:
   *
   *     { account: null, noAccount: true }   — no contacts key, legitimately
   *     { account, contacts }                — both always present
   *
   * so in the second shape a missing `contacts` is a broken contract that was
   * rendered as a confident "no contacts" for a customer who may well have them.
   */
  const ACCOUNT = { id: "acc-1", name: "Acme", status: "ACTIVE" };

  it("rejects an account response whose contacts key is missing", async () => {
    globalThis.fetch = routedFetch([
      { match: /\/api\/customer\/account/, body: { account: ACCOUNT } },
    ]);
    const { container, unmount } = await render(<CustomerAccountClient />);
    expect(container.textContent).toContain(resourceCopy("failedTitle"));
    await unmount();
  });

  it("accepts the no-account envelope, which legitimately omits contacts", async () => {
    globalThis.fetch = routedFetch([
      { match: /\/api\/customer\/account/, body: { account: null, noAccount: true } },
    ]);
    const { container, unmount } = await render(<CustomerAccountClient />);
    expect(container.textContent).not.toContain(resourceCopy("failedTitle"));
    await unmount();
  });

  it("accepts an account WITH an explicitly empty contacts list", async () => {
    // Empty is a real answer when the server says so; only absence is not.
    globalThis.fetch = routedFetch([
      { match: /\/api\/customer\/account/, body: { account: ACCOUNT, contacts: [] } },
    ]);
    const { container, unmount } = await render(<CustomerAccountClient />);
    expect(container.textContent).not.toContain(resourceCopy("failedTitle"));
    await unmount();
  });
});
