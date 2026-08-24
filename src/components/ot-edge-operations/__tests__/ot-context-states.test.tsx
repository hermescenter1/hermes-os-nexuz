// @vitest-environment jsdom
/**
 * PHASE 107 STAGE 6-A — the OT client and its failure states.
 *
 * Two holes the mutation proof found, now closed:
 *
 *   - `ot-operations/api.ts` classified a dropped connection as `FAILED`, so an
 *     operator whose network died was told the server had failed. Nothing tested
 *     the throw site, so folding it back into `FAILED` went unnoticed. The code
 *     is `CONNECTION_FAILED`, not "offline": in an OT console that word is a
 *     claim about a GATEWAY, which the Phase 94C1 gate rightly forbids here.
 *   - Nothing tested which codes offer a retry. Adding
 *     `ORGANIZATION_CONTEXT_REQUIRED` to the retryable set — a button that can
 *     never succeed, in front of an operator who needs to select an
 *     organization — also went unnoticed.
 *
 * These are behaviour tests: what the operator is offered, and when.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";
import { OtFailure, OtSkeleton, OtEmpty } from "../OtStates";
import { fetchGateways, OtRequestError, type OtFailureCode } from "@/lib/ot-operations/api";

const CATALOGUE = { en, de, fa } as const;
type Locale = keyof typeof CATALOGUE;

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

/** The localized copy the real components use, built the same way. */
const copyFor = (locale: Locale): Record<OtFailureCode, { title: string; body: string }> => {
  const s = (CATALOGUE[locale].otEdge as { states: Record<string, string> }).states;
  return {
    UNAUTHENTICATED: { title: s.unauthenticatedTitle, body: s.unauthenticatedBody },
    ORGANIZATION_CONTEXT_REQUIRED: { title: s.orgContextTitle, body: s.orgContextBody },
    SITE_CONTEXT_REQUIRED: { title: s.siteContextTitle, body: s.siteContextBody },
    CONNECTION_FAILED: { title: s.connectionFailedTitle, body: s.connectionFailedBody },
    FORBIDDEN: { title: s.forbiddenTitle, body: s.forbiddenBody },
    NOT_FOUND: { title: s.notFoundTitle, body: s.notFoundBody },
    INVALID_QUERY: { title: s.invalidQueryTitle, body: s.invalidQueryBody },
    RATE_LIMITED: { title: s.rateLimitedTitle, body: s.rateLimitedBody },
    UNAVAILABLE: { title: s.unavailableTitle, body: s.unavailableBody },
    FAILED: { title: s.failedTitle, body: s.failedBody },
  };
};

const render = (locale: Locale, code: OtFailureCode, onRetry?: () => void) =>
  mount(
    <NextIntlClientProvider locale={locale} messages={CATALOGUE[locale]}>
      <OtFailure code={code} copy={copyFor(locale)} onRetry={onRetry} retryLabel="Retry" />
    </NextIntlClientProvider>,
  );

describe("the OT client classifies the network correctly", () => {
  it("reports a dropped connection as CONNECTION_FAILED, not as a server failure", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
    await expect(fetchGateways("")).rejects.toMatchObject({ code: "CONNECTION_FAILED", status: 0 });
  });

  it("still lets the caller's own abort through untouched", async () => {
    globalThis.fetch = vi.fn(async () => { throw new DOMException("aborted", "AbortError"); }) as typeof fetch;
    await expect(fetchGateways("")).rejects.toBeInstanceOf(DOMException);
  });

  it("maps a 409 context refusal, never to an auth failure", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false, status: 409,
      json: async () => ({ ok: false, code: "ORGANIZATION_CONTEXT_REQUIRED" }),
    })) as unknown as typeof fetch;
    await expect(fetchGateways("")).rejects.toMatchObject({ code: "ORGANIZATION_CONTEXT_REQUIRED" });
  });

  it("keeps a genuine 401 a genuine 401", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false, status: 401, json: async () => ({ ok: false, code: "UNAUTHENTICATED" }),
    })) as unknown as typeof fetch;
    await expect(fetchGateways("")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("never turns a failure into an empty page", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false, status: 500, json: async () => ({ ok: false }),
    })) as unknown as typeof fetch;
    await expect(fetchGateways("")).rejects.toBeInstanceOf(OtRequestError);
  });
});

describe("what the operator is offered", () => {
  it("offers no retry for a missing organization — a button that cannot succeed", async () => {
    const onRetry = vi.fn();
    const { container, unmount } = await render("en", "ORGANIZATION_CONTEXT_REQUIRED", onRetry);
    expect(container.querySelector("button")).toBeNull();
    await unmount();
  });

  it("offers no retry for a missing site either", async () => {
    const { container, unmount } = await render("en", "SITE_CONTEXT_REQUIRED", vi.fn());
    expect(container.querySelector("button")).toBeNull();
    await unmount();
  });

  it("DOES offer a retry when the connection to Hermes dropped", async () => {
    const { container, unmount } = await render("en", "CONNECTION_FAILED", vi.fn());
    expect(container.querySelector("button")).not.toBeNull();
    await unmount();
  });

  it("offers no retry for a permission refusal", async () => {
    const { container, unmount } = await render("en", "FORBIDDEN", vi.fn());
    expect(container.querySelector("button")).toBeNull();
    await unmount();
  });
});

describe("what the operator is told", () => {
  it.each(["en", "de", "fa"] as const)("names the missing organization in %s, from the catalogue", async (locale) => {
    const { container, unmount } = await render(locale, "ORGANIZATION_CONTEXT_REQUIRED");
    const text = container.textContent ?? "";
    const s = (CATALOGUE[locale].otEdge as { states: Record<string, string> }).states;

    expect(text).toContain(s.orgContextTitle);
    // Above all: it must not tell a signed-in operator to sign in again.
    expect(text).not.toContain(s.unauthenticatedTitle);
    await unmount();
  });

  it("declares each state distinctly for any tool reading the page", async () => {
    const seen = new Map<OtFailureCode, string | null>();
    for (const code of ["UNAUTHENTICATED", "ORGANIZATION_CONTEXT_REQUIRED", "SITE_CONTEXT_REQUIRED", "FORBIDDEN", "CONNECTION_FAILED"] as const) {
      const { container, unmount } = await render("en", code);
      seen.set(code, container.querySelector("[data-async-state]")?.getAttribute("data-async-state") ?? null);
      await unmount();
    }
    expect(seen.get("UNAUTHENTICATED")).toBe("auth-required");
    expect(seen.get("ORGANIZATION_CONTEXT_REQUIRED")).toBe("org-context-required");
    expect(seen.get("SITE_CONTEXT_REQUIRED")).toBe("site-context-required");
    expect(seen.get("FORBIDDEN")).toBe("forbidden");
    expect(seen.get("CONNECTION_FAILED")).toBe("network-error");
    // Five codes, five states — none may collapse into another.
    expect(new Set(seen.values()).size).toBe(5);
  });

  it("marks loading and empty distinctly too", async () => {
    const loading = await mount(
      <NextIntlClientProvider locale="en" messages={en}><OtSkeleton rows={2} label="Loading" /></NextIntlClientProvider>,
    );
    expect(loading.container.querySelector("[data-async-state]")?.getAttribute("data-async-state")).toBe("loading");
    await loading.unmount();

    const empty = await mount(
      <NextIntlClientProvider locale="en" messages={en}><OtEmpty title="None" body="Nothing yet" /></NextIntlClientProvider>,
    );
    expect(empty.container.querySelector("[data-async-state]")?.getAttribute("data-async-state")).toBe("empty");
    await empty.unmount();
  });
});
