// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount, click } from "@/components/ds/__tests__/_render";
import fa from "../../../../../../messages/fa.json";
import en from "../../../../../../messages/en.json";
import MultiSiteSummaryPage from "../page";

/**
 * `@/i18n/navigation` cannot be imported under vitest: next-intl's
 * `createNavigation` pulls in `next/navigation`, which does not resolve in this
 * ESM test environment (the repository's own `german-enterprise-render.test.tsx`
 * mocks it for the same reason).
 *
 * The stand-in reproduces the ONE behaviour of that helper this page depends
 * on — prefixing a locale-relative href with the active locale — so the test
 * still proves the page's own contribution: that it renders links through the
 * project's locale-aware component and passes it locale-LESS paths. A
 * regression to `next/link` (whose hrefs are emitted verbatim) makes the
 * assertions below fail.
 *
 * It is NOT a test of next-intl's prefixing itself; that is the library's
 * behaviour, configured once in `src/i18n/routing.ts`.
 */
vi.mock("@/i18n/navigation", async () => {
  const { useLocale } = await import("next-intl");
  return {
    Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => {
      const locale = useLocale();
      const to = typeof href === "string" ? href : String(href);
      return <a href={to.startsWith("/") ? `/${locale}${to}` : to} {...rest}>{children}</a>;
    },
  };
});

/**
 * REGRESSION PACK — the Multi-Site enterprise summary must reach a CONTROLLED
 * state for every outcome the network and the API can produce.
 *
 * Production failure this pins:
 *   GET /api/multi-site/summary -> 401 {"error":"Authentication required"}
 *   -> the page did `.then(r => r.json())` with no status check, cast the error
 *      body to `EnterpriseSummary`, and rendered
 *      `data.riskSummary.avgOrgRiskScore` — `TypeError: Cannot read properties
 *      of undefined (reading 'avgOrgRiskScore')` — which took the whole route
 *      into the global error boundary and showed the generic error page.
 *
 * These tests render the REAL component with the REAL message catalog. A render
 * throw is not caught anywhere here, so any reintroduction of the crash fails
 * the test rather than silently degrading: `mount` awaits `act`, which
 * re-throws whatever the component threw.
 *
 * The assertions are on user-visible, localized text — the property that
 * actually matters — not on internal state names.
 */

type Json = Record<string, unknown>;

const M = fa.multiSite as Record<string, string>;

/** A structurally VALID EnterpriseSummaryResponse with sites in scope. */
function validSummary(over: Json = {}): Json {
  return {
    organizationId:    "org_1",
    siteCount:         4,
    latestBenchmarkId: "bm_1",
    latestBenchmarkAt: "2026-08-01T10:00:00.000Z",
    benchmarkStale:    false,
    stalenessWarning:  null,
    riskSummary: { sitesRanked: 4, highestRiskSiteId: "site_2", avgOrgRiskScore: 42.5 },
    kpiSummary:  { sitesCompared: 4, avgOrgAvailability: 97.3, avgOrgHealthScore: 88.1 },
    patternCount:          3,
    knowledgeGraphStale:   false,
    knowledgeGraphBuiltAt: "2026-08-01T09:00:00.000Z",
    noAccessibleSites:     false,
    ...over,
  };
}

/** The zero-accessible-sites payload the route returns (one stable contract). */
function emptyPayload(): Json {
  return validSummary({
    siteCount:         0,
    latestBenchmarkId: null,
    latestBenchmarkAt: null,
    riskSummary: { sitesRanked: 0, highestRiskSiteId: null, avgOrgRiskScore: null },
    kpiSummary:  { sitesCompared: 0, avgOrgAvailability: null, avgOrgHealthScore: null },
    patternCount:          0,
    knowledgeGraphBuiltAt: null,
    noAccessibleSites:     true,
  });
}

/** Build a Response-like object; `body` is raw text so malformed JSON is expressible. */
function reply(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body) as unknown,
  } as unknown as Response;
}

function jsonReply(status: number, body: unknown): Response {
  return reply(status, JSON.stringify(body));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Mount the page inside the real fa catalog and let the effect's promise settle. */
async function render(locale: "fa" | "en" = "fa") {
  const messages = (locale === "fa" ? fa : en) as never;
  const mounted = await mount(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <MultiSiteSummaryPage />
    </NextIntlClientProvider>,
  );
  // The load promise resolves on a later microtask; re-render to flush it.
  await mounted.rerender(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <MultiSiteSummaryPage />
    </NextIntlClientProvider>,
  );
  return mounted;
}

describe("multi-site summary — controlled state for every response", () => {
  it("1. 200 with a valid EnterpriseSummary renders the dashboard", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, validSummary()));
    const { container, unmount } = await render();

    expect(container.textContent).toContain("42.5");   // avgOrgRiskScore
    expect(container.textContent).toContain("97.3%");  // avgOrgAvailability
    expect(container.textContent).not.toContain(M.noSiteAccessTitle);
    expect(container.textContent).not.toContain(M.sessionExpiredTitle);
    await unmount();
  });

  it("2. 200 with zero accessible sites renders the EMPTY state, not a crash", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, emptyPayload()));
    const { container, unmount } = await render();

    expect(container.textContent).toContain(M.noSiteAccessTitle);
    expect(container.textContent).toContain(M.noSiteAccessHint);
    // Not misreported as an error, and no fabricated metrics.
    expect(container.textContent).not.toContain(M.requestFailedTitle);
    expect(container.textContent).not.toContain(M.insufficientData);
    await unmount();
  });

  it("3. 401 renders the UNAUTHORIZED state with a sign-in action (the production defect)", async () => {
    fetchMock.mockResolvedValue(jsonReply(401, { error: "Authentication required" }));
    const { container, unmount } = await render();

    expect(container.textContent).toContain(M.sessionExpiredTitle);
    expect(container.textContent).toContain(M.signIn);
    // The exact crash that reached the global error boundary.
    expect(container.textContent).not.toContain("avgOrgRiskScore");
    expect(container.querySelectorAll("a[href]").length).toBeGreaterThan(0);
    await unmount();
  });

  it("4. 403 renders the FORBIDDEN state, distinct from unauthorized", async () => {
    fetchMock.mockResolvedValue(jsonReply(403, { error: "Forbidden" }));
    const { container, unmount } = await render();

    expect(container.textContent).toContain(M.accessDeniedTitle);
    expect(container.textContent).not.toContain(M.sessionExpiredTitle);
    expect(container.textContent).not.toContain(M.signIn);
    await unmount();
  });

  it("5. 500 renders the SERVER-ERROR state with a retry action", async () => {
    fetchMock.mockResolvedValue(jsonReply(500, { error: "boom" }));
    const { container, unmount } = await render();

    expect(container.textContent).toContain(M.requestFailedTitle);
    expect(container.textContent).toContain(M.retry);
    await unmount();
  });

  it("6. malformed JSON body renders the INVALID-RESPONSE state", async () => {
    fetchMock.mockResolvedValue(reply(200, "<html>502 Bad Gateway</html>"));
    const { container, unmount } = await render();

    expect(container.textContent).toContain(M.invalidResponseTitle);
    await unmount();
  });

  it("7. a 200 whose SHAPE is wrong never reaches the success render", async () => {
    // Well-formed JSON, wrong contract: riskSummary/kpiSummary absent. This is
    // byte-for-byte the shape that used to crash the page.
    fetchMock.mockResolvedValue(jsonReply(200, { data: null, reason: "No accessible sites.", siteCount: 0 }));
    const { container, unmount } = await render();

    expect(container.textContent).toContain(M.invalidResponseTitle);
    await unmount();
  });

  it("7b. a 200 with a malformed NESTED metric object is rejected too", async () => {
    fetchMock.mockResolvedValue(
      jsonReply(200, validSummary({ riskSummary: { sitesRanked: "four", highestRiskSiteId: null, avgOrgRiskScore: null } })),
    );
    const { container, unmount } = await render();

    expect(container.textContent).toContain(M.invalidResponseTitle);
    await unmount();
  });

  it("7c. a network-level failure renders the request-error state, not a crash", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container, unmount } = await render();

    expect(container.textContent).toContain(M.requestFailedTitle);
    await unmount();
  });

  it("8. retry after a controlled failure re-requests and recovers", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonReply(500, { error: "boom" }))
      .mockResolvedValueOnce(jsonReply(200, validSummary()));

    const mounted = await render();
    expect(mounted.container.textContent).toContain(M.requestFailedTitle);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const retryButton = Array.from(mounted.container.querySelectorAll("button"))
      .find((b) => b.textContent === M.retry);
    expect(retryButton).toBeTruthy();

    await click(retryButton ?? null);
    await mounted.rerender(
      <NextIntlClientProvider locale="fa" messages={fa as never} timeZone="UTC">
        <MultiSiteSummaryPage />
      </NextIntlClientProvider>,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mounted.container.textContent).toContain("42.5");
    expect(mounted.container.textContent).not.toContain(M.requestFailedTitle);
    await mounted.unmount();
  });

  it("sends the session cookie explicitly and never treats a body before checking status", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, validSummary()));
    const { unmount } = await render();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/multi-site/summary",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    await unmount();
  });
});

describe("9. locale-aware navigation", () => {
  it("keeps every in-app link under the active locale prefix", async () => {
    fetchMock.mockResolvedValue(jsonReply(200, validSummary()));

    for (const locale of ["fa", "en"] as const) {
      const { container, unmount } = await render(locale);
      const hrefs = Array.from(container.querySelectorAll("a[href]"))
        .map((a) => a.getAttribute("href") ?? "")
        .filter((h) => h.startsWith("/"));

      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(href, `${locale}: ${href}`).toMatch(new RegExp(`^/${locale}(/|$)`));
      }
      // The quick-link grid specifically — the links the page used to emit
      // locale-less via next/link.
      expect(hrefs).toContain(`/${locale}/dashboard/multi-site/risk`);
      expect(hrefs).toContain(`/${locale}/dashboard/multi-site/benchmarks`);
      await unmount();
    }
  });
});
