// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PHASE 110-A1.0b R3 (R3-2) — the browser half of the tenant precondition.
 *
 * `r3-cross-tab.test.ts` proves the SERVER refuses a request whose precondition
 * does not match the tenant in effect. That is worth nothing on its own if no
 * client ever sends one, so this file proves the other half:
 *
 *   1. the shell stamps the organization it RENDERED into the markup;
 *   2. the shared browser wrapper reads that stamp and sends it;
 *   3. a page with no stamp sends nothing and behaves exactly as before.
 *
 * The value is read from the DOM rather than from client state on purpose. The
 * question the precondition answers is "which organization is the reader
 * looking at?", and only what was rendered can answer it — a value held in a
 * store could be refreshed underneath a page still showing the old tenant,
 * which is the failure being closed rather than one to reproduce.
 */

const ATTR = "data-hermes-organization";
const HEADER = "x-hermes-organization";

let fetched: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  fetched = [];
  document.body.innerHTML = "";
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    fetched.push({ url, init });
    return new Response(JSON.stringify({ value: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stampShell(organizationId: string | null): void {
  const el = document.createElement("div");
  if (organizationId !== null) el.setAttribute(ATTR, organizationId);
  document.body.appendChild(el);
}

const headerOf = (init?: RequestInit): string | null =>
  new Headers(init?.headers).get(HEADER);

describe("the browser sends the organization the page was rendered for", () => {
  it("reads the stamp the shell rendered", async () => {
    const { tenantPrecondition } = await import("../resource-request");
    stampShell("org_a");
    expect(tenantPrecondition()).toBe("org_a");
  });

  it("a page with no shell asserts nothing", async () => {
    const { tenantPrecondition, withTenantPrecondition } = await import("../resource-request");
    expect(tenantPrecondition()).toBeNull();
    expect(headerOf(withTenantPrecondition({ method: "DELETE" }))).toBeNull();
  });

  it("an EMPTY stamp asserts nothing rather than asserting an empty string", async () => {
    /*
     * The shell renders the attribute with no value when the reader has no
     * resolved organization — several memberships and no choice, or an outage.
     * Sending `""` would be asserting a tenant, and the server treats a present
     * header as an assertion; it must stay absent instead.
     */
    const { tenantPrecondition } = await import("../resource-request");
    stampShell("");
    expect(tenantPrecondition()).toBeNull();
  });

  it("requestJson attaches it to every read", async () => {
    const { requestJson } = await import("../resource-request");
    stampShell("org_a");

    await requestJson("/api/billing/usage", (b) => (b as { value?: number }).value);

    expect(fetched).toHaveLength(1);
    expect(headerOf(fetched[0]?.init)).toBe("org_a");
  });

  it("withTenantPrecondition attaches it to a raw mutation, keeping the caller's init", async () => {
    const { withTenantPrecondition } = await import("../resource-request");
    stampShell("org_b");

    const init = withTenantPrecondition({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "p1" }),
    });

    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ planId: "p1" }));
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(headerOf(init)).toBe("org_b");
  });

  it("a caller's own explicit precondition is never overwritten", async () => {
    const { withTenantPrecondition } = await import("../resource-request");
    stampShell("org_a");

    const init = withTenantPrecondition({ headers: { [HEADER]: "org_deliberate" } });
    expect(headerOf(init)).toBe("org_deliberate");
  });

  it("the value follows the RENDER: a re-stamped shell changes what is sent", async () => {
    /*
     * The switcher navigates, the server re-renders, and the stamp changes with
     * the page. This models that: the same wrapper, asked twice, reports what
     * is on the screen NOW — never a value it cached from an earlier render.
     */
    const { tenantPrecondition } = await import("../resource-request");
    stampShell("org_a");
    expect(tenantPrecondition()).toBe("org_a");

    document.body.innerHTML = "";
    stampShell("org_b");
    expect(tenantPrecondition()).toBe("org_b");
  });
});

describe("the shell stamps the organization it resolved", () => {
  /**
   * Walk the element tree the shell RETURNS, without rendering it.
   *
   * A React element is a plain object, so the attribute can be read straight
   * off the root — which is the honest thing to check here, because the claim
   * is about what the server render emits, not about how a browser lays it out.
   */
  function attributeOf(node: unknown): string | null | undefined {
    if (!node || typeof node !== "object") return undefined;
    const el = node as { props?: Record<string, unknown> };
    if (!el.props) return undefined;
    if (ATTR in el.props) return el.props[ATTR] as string | null;
    return attributeOf(el.props.children);
  }

  const shellState = { value: {} as Record<string, unknown> };

  it("carries the resolved organization id, and nothing when there is none", async () => {
    vi.resetModules();
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
    vi.doMock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
    vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: async () => ({ id: "u1", role: "admin" }) }));
    vi.doMock("@/lib/organizations/shell-context", () => ({
      getShellOrgContext: async () => shellState.value,
    }));
    vi.doMock("@/i18n/navigation", () => ({ Link: () => null, usePathname: () => "/" }));
    vi.doMock("../../../components/app-shell/AppSidebar", () => ({ AppSidebar: () => null }));

    const { AppShell } = await import("@/components/app-shell/AppShell");

    shellState.value = {
      state: "resolved",
      organizationId: "org_a",
      organizationName: "Alpha",
      selectable: true,
    };
    expect(attributeOf(await AppShell({ children: null }))).toBe("org_a");

    // Several memberships, none chosen: there is no organization to assert.
    shellState.value = { state: "selection" };
    expect(attributeOf(await AppShell({ children: null }))).toBeUndefined();

    // An outage must not stamp a tenant either.
    shellState.value = { state: "unavailable" };
    expect(attributeOf(await AppShell({ children: null }))).toBeUndefined();

    vi.doUnmock("next/headers");
    vi.resetModules();
  });
});
