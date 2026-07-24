// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mount, click } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { GatewayListClient } from "../GatewayListClient";
import { DeviceListClient } from "../DeviceListClient";
import type { DeviceRow, GatewayRow } from "@/lib/ot-operations/contract";

/**
 * PHASE 94C1 — runtime behaviour of the OT Edge lists.
 *
 * The subject is what an operator actually sees and what the browser actually
 * sends. `fetch` is stubbed so the exact request URL can be asserted; nothing
 * else is faked — the real query serializer, the real presenters and the real
 * catalogs run.
 *
 * The assertions deliberately compare against catalog VALUES rather than string
 * literals, so a missing or renamed key fails here instead of shipping a raw
 * key to the screen.
 */

const h = vi.hoisted(() => ({
  pathname: "/dashboard/ot/gateways",
  /** The live query string the component reads via useSearchParams. */
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
}));

// The filter state is read from the LIVE URL, not from a prop, so the test
// drives it through the same hook the browser uses.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(h.search),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => h.pathname,
  useRouter: () => ({ push: h.push, replace: h.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
  redirect: vi.fn(),
  getPathname: vi.fn(),
}));

const CATALOGS = { en, fa, de } as const;
type Loc = keyof typeof CATALOGS;

function withIntl(locale: Loc, ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale={locale} messages={CATALOGS[locale]} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : <div dir="ltr">{ui}</div>}
    </NextIntlClientProvider>
  );
}

const settle = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

const gatewayRow = (over: Partial<GatewayRow> = {}): GatewayRow => ({
  id: "g-1",
  gatewayId: "REG-PK-001",
  displayName: "Packing line north",
  siteId: "site-1",
  lifecycle: "ACTIVE",
  environment: "PRODUCTION",
  capabilities: ["PROJECT_METADATA_IMPORT"],
  softwareVersion: "1.4.0",
  readOnlyMode: true,
  simulatorMode: false,
  disabled: false,
  signingConfigured: true,
  lastSeenAt: "2026-05-06T07:08:09.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-02T00:00:00.000Z",
  ...over,
});

const deviceRow = (over: Partial<DeviceRow> = {}): DeviceRow => ({
  id: "d-1",
  siteId: "site-1",
  assetId: "a-1",
  category: "PLC",
  lifecycle: "OPERATIONAL",
  networkZone: "CONTROL",
  safetyClass: "NON_SAFETY",
  firmwareVersion: "2.9.4",
  productFamily: "S7-1500",
  engineeringId: "PLC_01",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-02-02T00:00:00.000Z",
  ...over,
});

/** Records every request URL, and answers the OT and site endpoints. */
function stubFetch(options: {
  items?: unknown[];
  total?: number;
  status?: number;
  code?: string;
  sites?: Array<{ id: string; name: string }>;
  pending?: boolean;
}) {
  const calls: string[] = [];
  const spy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    calls.push(url);

    if (url.startsWith("/api/industrial/sites")) {
      return { ok: true, status: 200, json: async () => ({ sites: options.sites ?? [] }) } as Response;
    }
    if (options.pending) return new Promise<Response>(() => {});
    if (options.status && options.status >= 400) {
      return {
        ok: false,
        status: options.status,
        json: async () => ({ ok: false, code: options.code, message: "SERVER ENGLISH SENTENCE" }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: { items: options.items ?? [], total: options.total ?? (options.items?.length ?? 0), take: 25, skip: 0 },
      }),
    } as Response;
  });
  vi.stubGlobal("fetch", spy);
  return { calls, spy };
}

/** The OT list request, ignoring the separately-authorized site lookup. */
const listCall = (calls: string[]) => calls.find((url) => url.startsWith("/api/ot/"));

beforeEach(() => {
  h.pathname = "/dashboard/ot/gateways";
  h.search = "";
  h.push.mockClear();
  h.replace.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

/* ── Gateway list ───────────────────────────────────────────────────────── */

describe("94C1 — gateway list rendering", () => {
  it.each(["en", "fa", "de"] as const)("%s: renders rows with localized labels", async (locale) => {
    stubFetch({ items: [gatewayRow()], total: 1, sites: [{ id: "site-1", name: "Karaj plant" }] });
    const { container, unmount } = await mount(
      withIntl(locale, <GatewayListClient locale={locale} />),
    );
    await settle();

    const catalog = CATALOGS[locale].otEdge;
    const text = container.textContent ?? "";
    expect(text).toContain(catalog.gateways.columns.lifecycle);
    expect(text).toContain(catalog.enums.gatewayLifecycle.ACTIVE);
    expect(text).toContain(catalog.gateways.columns.systemIdentifier);
    expect(text).toContain(catalog.signing.configured);
    // The record's own values are present.
    expect(text).toContain("Packing line north");
    expect(text).toContain("REG-PK-001");
    await unmount();
  });

  it("labels the identifier as a system identifier, never as a serial number", async () => {
    stubFetch({ items: [gatewayRow()], total: 1 });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    const text = (container.textContent ?? "").toLowerCase();
    expect(text).toContain(en.otEdge.gateways.columns.systemIdentifier.toLowerCase());

    // Scoped to the TABLE: the search hint legitimately mentions the separate,
    // never-displayed hardware identifier the server also searches, and a
    // page-wide scan would forbid that accurate sentence. What must never
    // happen is the DISPLAYED value being labelled as hardware.
    const table = (container.querySelector("table")?.textContent ?? "").toLowerCase();
    for (const forbidden of ["serial number", "hardware id", "hardware identifier", "mac address"]) {
      expect(table, `the table called it a ${forbidden}`).not.toContain(forbidden);
    }
    // And nowhere on the page is anything called a serial number.
    expect(text).not.toContain("serial number");
    // And it is bidi-isolated so RTL text cannot reorder it.
    const bdi = [...container.querySelectorAll("bdi")].map((node) => node.textContent);
    expect(bdi).toContain("REG-PK-001");
    await unmount();
  });

  it("renders a timestamp when observed and an explicit label when never observed", async () => {
    stubFetch({ items: [gatewayRow({ lastSeenAt: "2026-05-06T07:08:09.000Z" })], total: 1 });
    const first = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();
    expect(first.container.querySelector("time")?.getAttribute("dateTime")).toBe("2026-05-06T07:08:09.000Z");
    expect(first.container.textContent).not.toContain(en.otEdge.observation.never);
    await first.unmount();

    stubFetch({ items: [gatewayRow({ id: "g-2", lastSeenAt: null })], total: 1 });
    const second = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();
    // Null is stated, never rendered as a bare dash the reader must interpret.
    expect(second.container.textContent).toContain(en.otEdge.observation.never);
    expect(second.container.querySelector("time")).toBeNull();
    await second.unmount();
  });

  it("makes no connectivity, health or security claim", async () => {
    stubFetch({ items: [gatewayRow(), gatewayRow({ id: "g-2", lastSeenAt: null, lifecycle: "STALE" })], total: 2 });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    const text = (container.textContent ?? "").toLowerCase();
    for (const claim of ["online", "offline", "connected", "disconnected", "healthy", "uptime", "compromis", "breach", "packets"]) {
      expect(text, `the UI claimed "${claim}"`).not.toContain(claim);
    }
    await unmount();
  });

  it("exposes no secret, signing reference or ingestion handle in the DOM", async () => {
    stubFetch({ items: [gatewayRow()], total: 1 });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    const html = container.innerHTML;
    for (const secret of ["signingKeyRef", "OT_GATEWAY_HMAC", "ingestionId", "signature", "nonce", "idempotency"]) {
      expect(html, `${secret} reached the DOM`).not.toContain(secret);
    }
    await unmount();
  });

  it("shows exactly the supported filter controls", async () => {
    stubFetch({ items: [gatewayRow()], total: 1 });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    const labels = [...container.querySelectorAll("label")].map((node) => node.textContent ?? "");
    expect(labels).toContain(en.otEdge.filters.lifecycle);
    expect(labels).toContain(en.otEdge.filters.site);
    expect(labels).toContain(en.otEdge.filters.capability);
    expect(labels).toContain(en.otEdge.filters.searchGateways);
    // A gateway category filter does not exist server-side, so it is not offered.
    expect(labels).not.toContain(en.otEdge.filters.category);
    await unmount();
  });
});

/* ── What the browser sends ─────────────────────────────────────────────── */

describe("94C1 — the request carries only supported keys", () => {
  it("sends every filter from the URL to the API", async () => {
    h.search = "lifecycle=STALE&siteId=site-2&capability=SIMULATION&search=north&page=3&pageSize=10&sortBy=updatedAt&sortDir=asc";
    const { calls } = stubFetch({ items: [], total: 0 });
    const { unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    const url = new URL(listCall(calls) ?? "", "https://t.invalid");
    expect(url.pathname).toBe("/api/ot/gateways");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      lifecycle: "STALE",
      siteId: "site-2",
      capability: "SIMULATION",
      search: "north",
      page: "3",
      pageSize: "10",
      sortBy: "updatedAt",
      sortDir: "asc",
    });
    await unmount();
  });

  it("never forwards an identity or unsupported parameter from the URL", async () => {
    h.search = "organizationId=org-VICTIM&userId=u-9&role=OWNER&category=PLC&vendor=Siemens&lifecycle=ACTIVE";
    const { calls } = stubFetch({ items: [], total: 0 });
    const { unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    const url = listCall(calls) ?? "";
    for (const forbidden of ["organizationId", "userId", "role=", "category", "vendor"]) {
      expect(url, `${forbidden} was sent`).not.toContain(forbidden);
    }
    expect(url).toContain("lifecycle=ACTIVE");
    await unmount();
  });

  it("requests with credentials and without caching", async () => {
    const { spy } = stubFetch({ items: [], total: 0 });
    const { unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    const init = spy.mock.calls.find((call) => String(call[0]).startsWith("/api/ot/"))?.[1];
    expect(init?.credentials).toBe("same-origin");
    expect(init?.cache).toBe("no-store");
    await unmount();
  });

  it("pushes a new URL when filters are applied, and resets to page 1", async () => {
    h.search = "page=4";
    stubFetch({ items: [gatewayRow()], total: 1 });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    const select = container.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      select.value = "STALE";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const submit = container.querySelector('button[type="submit"]');
    await click(submit);

    expect(h.push).toHaveBeenCalledTimes(1);
    const href = String(h.push.mock.calls[0][0]);
    expect(href).toContain("lifecycle=STALE");
    // Page 4 of a narrowed set usually does not exist.
    expect(href).not.toContain("page=4");
    await unmount();
  });

  it("does not re-request while the operator is still editing a filter", async () => {
    const { calls } = stubFetch({ items: [gatewayRow()], total: 1 });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();
    const before = calls.filter((url) => url.startsWith("/api/ot/")).length;

    const input = container.querySelector('input[type="search"]') as HTMLInputElement;
    for (const value of ["P", "PL", "PLC"]) {
      await act(async () => {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    // Typing is not a request: search-as-you-type would race and burn the
    // shared read budget.
    expect(calls.filter((url) => url.startsWith("/api/ot/")).length).toBe(before);
    await unmount();
  });
});

/* ── States ─────────────────────────────────────────────────────────────── */

describe("94C1 — every outcome has its own state", () => {
  it("announces loading without reading the skeleton aloud", async () => {
    stubFetch({ pending: true });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));

    expect(container.querySelector('[role="status"]')?.textContent).toBe(en.otEdge.states.loadingTitle);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    await unmount();
  });

  it("distinguishes 'nothing registered' from 'nothing matches'", async () => {
    stubFetch({ items: [], total: 0 });
    const empty = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();
    expect(empty.container.textContent).toContain(en.otEdge.states.emptyGatewaysTitle);
    await empty.unmount();

    h.search = "lifecycle=STALE";
    stubFetch({ items: [], total: 0 });
    const filtered = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();
    expect(filtered.container.textContent).toContain(en.otEdge.states.noMatchTitle);
    expect(filtered.container.textContent).not.toContain(en.otEdge.states.emptyGatewaysTitle);
    await filtered.unmount();
  });

  it.each([
    [401, "UNAUTHENTICATED", "unauthenticatedTitle", false],
    [403, "FORBIDDEN", "forbiddenTitle", false],
    [400, "INVALID_QUERY_PARAMETER", "invalidQueryTitle", false],
    [429, "RATE_LIMITED", "rateLimitedTitle", true],
    [503, "TRANSIENT_FAILURE", "unavailableTitle", true],
    [500, "INTERNAL_FAILURE", "failedTitle", true],
  ])("renders its own copy for %i, and offers retry only where it can help", async (status, code, key, retryable) => {
    stubFetch({ status: status as number, code: code as string });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    const text = container.textContent ?? "";
    expect(text).toContain((en.otEdge.states as Record<string, string>)[key as string]);
    // The server's own English sentence is never shown.
    expect(text).not.toContain("SERVER ENGLISH SENTENCE");
    expect(text.includes(en.otEdge.states.retry)).toBe(retryable);
    await unmount();
  });

  it("clears the previous rows rather than showing them under an error", async () => {
    stubFetch({ status: 503, code: "TRANSIENT_FAILURE" });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).not.toContain("Packing line north");
    await unmount();
  });

  it("still lists gateways when the site registry is not readable", async () => {
    // Site names are separately authorized; losing them must not fail the page.
    const spy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/industrial/sites")) return { ok: false, status: 403, json: async () => ({}) } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { items: [gatewayRow()], total: 1, take: 25, skip: 0 } }),
      } as Response;
    });
    vi.stubGlobal("fetch", spy);

    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();
    expect(container.querySelector("table")).not.toBeNull();
    // The identifier stands in for the unavailable name.
    expect(container.textContent).toContain("site-1");
    await unmount();
  });
});

/* ── Accessibility ──────────────────────────────────────────────────────── */

describe("94C1 — accessible structure", () => {
  it("gives the table a caption, column scopes and a reachable scroll region", async () => {
    stubFetch({ items: [gatewayRow()], total: 1 });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    expect(container.querySelector("caption")?.textContent).toBe(en.otEdge.gateways.tableCaption);
    const headers = [...container.querySelectorAll("th")];
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) expect(header.getAttribute("scope")).toBe("col");

    const region = container.querySelector('[role="region"]');
    expect(region?.getAttribute("tabindex")).toBe("0");
    expect(region?.getAttribute("aria-label")).toBe(en.otEdge.gateways.tableCaption);
    await unmount();
  });

  it("labels every filter control and gives pagination a nav landmark", async () => {
    stubFetch({ items: [gatewayRow()], total: 60 });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    for (const control of [...container.querySelectorAll("select, input")]) {
      const id = control.getAttribute("id");
      expect(id, "a control has no id to be labelled by").toBeTruthy();
      expect(container.querySelector(`label[for="${id}"]`), `no label for ${id}`).not.toBeNull();
    }

    const nav = container.querySelector(`nav[aria-label="${en.otEdge.pagination.label}"]`);
    expect(nav).not.toBeNull();
    expect(nav?.querySelector('[aria-live="polite"]')).not.toBeNull();
    await unmount();
  });

  it("renders no heading above h2, leaving the single h1 to the page", async () => {
    stubFetch({ items: [gatewayRow()], total: 1 });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();
    expect(container.querySelector("h1")).toBeNull();
    await unmount();
  });

  it("keeps identifiers bidi-isolated under RTL", async () => {
    stubFetch({ items: [gatewayRow()], total: 1 });
    const { container, unmount } = await mount(withIntl("fa", <GatewayListClient locale="fa" />));
    await settle();

    const bdi = [...container.querySelectorAll("bdi")];
    expect(bdi.length).toBeGreaterThan(0);
    for (const node of bdi) expect(node.getAttribute("dir")).toBe("ltr");
    await unmount();
  });
});

/* ── Device list ────────────────────────────────────────────────────────── */

describe("94C1 — device list", () => {
  beforeEach(() => {
    h.pathname = "/dashboard/ot/devices";
  });

  it.each(["en", "fa", "de"] as const)("%s: renders localized rows", async (locale) => {
    stubFetch({ items: [deviceRow()], total: 1 });
    const { container, unmount } = await mount(withIntl(locale, <DeviceListClient />));
    await settle();

    const catalog = CATALOGS[locale].otEdge;
    expect(container.textContent).toContain(catalog.enums.deviceCategory.PLC);
    expect(container.textContent).toContain(catalog.enums.deviceLifecycle.OPERATIONAL);
    expect(container.textContent).toContain("PLC_01");
    await unmount();
  });

  it("renders no vendor, manufacturer, model or protocol column", async () => {
    stubFetch({ items: [deviceRow()], total: 1 });
    const { container, unmount } = await mount(withIntl("en", <DeviceListClient />));
    await settle();

    const headers = [...container.querySelectorAll("th")].map((node) => (node.textContent ?? "").toLowerCase());
    for (const forbidden of ["vendor", "manufacturer", "model", "protocol", "import source"]) {
      expect(headers.join(" "), `a ${forbidden} column was rendered`).not.toContain(forbidden);
    }
    await unmount();
  });

  it("uses no fabricated placeholder for a missing engineering identifier", async () => {
    stubFetch({ items: [deviceRow({ engineeringId: null })], total: 1 });
    const { container, unmount } = await mount(withIntl("en", <DeviceListClient />));
    await settle();

    const text = container.textContent ?? "";
    expect(text).toContain(en.otEdge.devices.noEngineeringId);
    for (const fabricated of ["Unknown Device", "Generic Vendor", "Standard Protocol", "Unknown Vendor"]) {
      expect(text, `${fabricated} was fabricated`).not.toContain(fabricated);
    }
    await unmount();
  });

  it("sends only the supported device filters", async () => {
    h.search = "lifecycle=MAINTENANCE&siteId=s3&category=HMI&search=filler&vendor=Siemens";
    const { calls } = stubFetch({ items: [], total: 0 });
    const { unmount } = await mount(withIntl("en", <DeviceListClient />));
    await settle();

    const url = new URL(listCall(calls) ?? "", "https://t.invalid");
    expect(url.pathname).toBe("/api/ot/devices");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      lifecycle: "MAINTENANCE",
      siteId: "s3",
      category: "HMI",
      search: "filler",
      page: "1",
      pageSize: "25",
      sortBy: "createdAt",
      sortDir: "desc",
    });
    await unmount();
  });

  it("offers a category filter but never a vendor filter", async () => {
    stubFetch({ items: [deviceRow()], total: 1 });
    const { container, unmount } = await mount(withIntl("en", <DeviceListClient />));
    await settle();

    const labels = [...container.querySelectorAll("label")].map((node) => node.textContent ?? "");
    expect(labels).toContain(en.otEdge.filters.category);
    expect(labels).not.toContain(en.otEdge.filters.capability);
    expect(labels.join(" ").toLowerCase()).not.toContain("vendor");
    await unmount();
  });
});

/* ── Pagination over a server total ─────────────────────────────────────── */

describe("94C1 — pagination follows the server", () => {
  it("derives the page count from the server total and never recomputes it", async () => {
    h.search = "page=2&pageSize=25";
    stubFetch({ items: [gatewayRow()], total: 60 });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    const nav = container.querySelector(`nav[aria-label="${en.otEdge.pagination.label}"]`);
    // 60 records at 25 per page is three pages — from `total`, not from the
    // single row this page happens to carry.
    expect(nav?.textContent).toContain("3");
    expect(nav?.textContent).toContain("60");
    await unmount();
  });

  it("replaces rather than pushes when paging, so Back leaves the list", async () => {
    stubFetch({ items: [gatewayRow()], total: 60 });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    const next = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === en.otEdge.pagination.next,
    );
    await click(next ?? null);
    expect(h.replace).toHaveBeenCalledTimes(1);
    expect(h.push).not.toHaveBeenCalled();
    expect(String(h.replace.mock.calls[0][0])).toContain("page=2");
    await unmount();
  });

  it("disables the boundaries instead of allowing an impossible page", async () => {
    stubFetch({ items: [gatewayRow()], total: 10 });
    const { container, unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    const buttons = [...container.querySelectorAll("button")];
    const previous = buttons.find((b) => b.textContent === en.otEdge.pagination.previous) as HTMLButtonElement;
    const next = buttons.find((b) => b.textContent === en.otEdge.pagination.next) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(true);
    await unmount();
  });
});

/* ── Storage and transport hygiene ──────────────────────────────────────── */

describe("94C1 — nothing is persisted or polled", () => {
  it("writes nothing to local or session storage", async () => {
    h.search = "lifecycle=ACTIVE";
    stubFetch({ items: [gatewayRow()], total: 1 });
    const { unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    await unmount();
  });

  it("issues exactly one list request per URL state", async () => {
    h.search = "lifecycle=ACTIVE";
    const { calls } = stubFetch({ items: [gatewayRow()], total: 1 });
    const { unmount } = await mount(withIntl("en", <GatewayListClient locale="en" />));
    await settle();
    await settle();

    expect(calls.filter((url) => url.startsWith("/api/ot/gateways"))).toHaveLength(1);
    await unmount();
  });
});
