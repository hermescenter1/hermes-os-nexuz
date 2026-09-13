// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PHASE 110-A1.0b R6.1 — WHERE the precondition comes from, and what a page
 * that has none actually gets.
 *
 * `tenant-precondition.test.tsx` proves the stamp is read and sent. R6.1 was
 * asked for something stricter: that the value is the organization the server
 * actually RESOLVED for this render, and that "the wrapper was called" is not
 * accepted as proof a call site is protected.
 *
 * Two distinct claims, and they fail in opposite directions:
 *
 *   PROVENANCE — the stamp is the resolver's own answer, not a prop, not client
 *   state, not a value any caller chose. Proved by mocking the RESOLVER (not
 *   the shell helper that wraps it) and reading what the shell emits.
 *
 *   CONSEQUENCE — a mutation from a page with no stamp sends no header, and
 *   since R6 the server refuses it with 428. That is a BROKEN feature, not a
 *   protected one, and the client must render it as a refusal the reader can
 *   act on rather than as a generic failure with a retry button that will send
 *   the identical empty assertion again.
 */

const ATTR = "data-hermes-organization";
const HEADER = "x-hermes-organization";

let fetched: { url: string; init?: RequestInit }[] = [];
let nextResponse: () => Response;

beforeEach(() => {
  fetched = [];
  document.body.innerHTML = "";
  nextResponse = () =>
    new Response(JSON.stringify({ value: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    fetched.push({ url, init });
    return nextResponse();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const headerOf = (init?: RequestInit): string | null => new Headers(init?.headers).get(HEADER);

/* ── provenance ──────────────────────────────────────────────────────────── */

describe("R6.1 — the stamp is the RESOLVER's answer, not something a caller chose", () => {
  /** Walk the element tree the shell returns, without rendering it. */
  function attributeOf(node: unknown): string | null | undefined {
    if (!node || typeof node !== "object") return undefined;
    const el = node as { props?: Record<string, unknown> };
    if (!el.props) return undefined;
    if (ATTR in el.props) return el.props[ATTR] as string | null;
    return attributeOf(el.props.children);
  }

  const decision = { value: {} as Record<string, unknown> };

  async function shellWithResolver() {
    vi.resetModules();
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
    vi.doMock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
    vi.doMock("@/lib/auth/session", () => ({
      getCurrentUser: async () => ({ id: "u1", role: "admin" }),
    }));
    /*
     * The RESOLVER is mocked here, one layer deeper than the other file mocks.
     * `getShellOrgContext` is left real, so the chain under test is the one
     * that ships: resolver -> shell context -> rendered attribute.
     */
    vi.doMock("@/lib/tenant-selection/selection", () => ({
      resolveTenantDecisionFromSession: async () => decision.value,
    }));
    vi.doMock("@/i18n/navigation", () => ({ Link: () => null, usePathname: () => "/" }));
    vi.doMock("../../../components/app-shell/AppSidebar", () => ({ AppSidebar: () => null }));
    const { AppShell } = await import("@/components/app-shell/AppShell");
    return AppShell;
  }

  it("a granted decision is stamped verbatim", async () => {
    decision.value = {
      granted: true,
      userId: "u1",
      organizationId: "org_from_resolver",
      organizationSlug: "alpha",
      organizationRole: "OWNER",
      selectable: true,
    };
    const AppShell = await shellWithResolver();
    expect(attributeOf(await AppShell({ children: null }))).toBe("org_from_resolver");
  });

  it("a refusal stamps NOTHING — there is no organization to assert", async () => {
    for (const code of [
      "AUTHENTICATION_REQUIRED",
      "ORGANIZATION_CONTEXT_REQUIRED",
      "ORGANIZATION_SELECTION_REQUIRED",
      "ORGANIZATION_CONTEXT_UNAVAILABLE",
    ]) {
      decision.value = { granted: false, code, ...(code === "ORGANIZATION_SELECTION_REQUIRED" ? { options: [] } : {}) };
      const AppShell = await shellWithResolver();
      expect(attributeOf(await AppShell({ children: null })), code).toBeUndefined();
    }
  });
});

/* ── consequence ─────────────────────────────────────────────────────────── */

describe("R6.1 — a mutation from an unstamped page is refused, and says so", () => {
  it("sends no header at all, which since R6 the server refuses", async () => {
    const { withTenantPrecondition } = await import("@/lib/client/resource-request");
    // No shell in this document: nothing to assert.
    await fetch("/api/platform/keys", withTenantPrecondition({ method: "POST" }));

    expect(headerOf(fetched[0]?.init)).toBeNull();
  });

  it("428 is its own failure code — not the generic FAILED it used to be", async () => {
    const { classifyFailure } = await import("@/lib/client/resource-request");

    expect(classifyFailure(428, "ORGANIZATION_PRECONDITION_REQUIRED")).toBe(
      "ORGANIZATION_PRECONDITION_REQUIRED",
    );
    // A bare 428 with no code: 428 has exactly one meaning in this application.
    expect(classifyFailure(428)).toBe("ORGANIZATION_PRECONDITION_REQUIRED");
    // And it is emphatically not a success.
    expect(classifyFailure(428)).not.toBe("FAILED");
  });

  it("is NOT retryable — the retry would send the identical empty assertion", async () => {
    const { isRetryable } = await import("@/lib/client/resource-request");

    expect(isRetryable("ORGANIZATION_PRECONDITION_REQUIRED")).toBe(false);
    // The regression guard: as FAILED it WAS retryable, which is the loop.
    expect(isRetryable("FAILED")).toBe(true);
  });

  it("requestJson raises it rather than returning a value", async () => {
    const { requestJson, ResourceRequestError } = await import("@/lib/client/resource-request");
    nextResponse = () =>
      new Response(JSON.stringify({ error: "…", code: "ORGANIZATION_PRECONDITION_REQUIRED" }), {
        status: 428,
        headers: { "content-type": "application/json" },
      });

    await expect(requestJson("/api/platform/usage", (j) => j)).rejects.toBeInstanceOf(
      ResourceRequestError,
    );
    await expect(requestJson("/api/platform/usage", (j) => j)).rejects.toMatchObject({
      code: "ORGANIZATION_PRECONDITION_REQUIRED",
      status: 428,
    });
  });

  it("has its own words and its own machine state — it does not borrow the conflict's", async () => {
    const { ASYNC_STATE } = await import("@/components/ui/ResourceFailureNotice");

    expect(ASYNC_STATE.ORGANIZATION_PRECONDITION_REQUIRED).toBe("org-precondition-required");
    expect(ASYNC_STATE.ORGANIZATION_PRECONDITION_REQUIRED).not.toBe(
      ASYNC_STATE.ORGANIZATION_CONTEXT_CONFLICT,
    );
  });

  it("the copy exists in all three catalogues and is genuinely different per locale", async () => {
    const [fa, en, de] = await Promise.all([
      import("../../../../messages/fa.json"),
      import("../../../../messages/en.json"),
      import("../../../../messages/de.json"),
    ]);
    const leafOf = (m: { default: Record<string, never> }, k: string) =>
      (m.default as unknown as { errors: { resource: Record<string, string> } }).errors.resource[k];

    for (const key of ["orgPreconditionTitle", "orgPreconditionHint"]) {
      for (const [name, m] of [["fa", fa], ["en", en], ["de", de]] as const) {
        expect(leafOf(m as never, key), `${name}.${key}`).toBeTruthy();
      }
      // Not an English carryover in the other two, and not the conflict copy.
      expect(leafOf(fa as never, key)).not.toBe(leafOf(en as never, key));
      expect(leafOf(de as never, key)).not.toBe(leafOf(en as never, key));
      expect(leafOf(en as never, key)).not.toBe(
        leafOf(en as never, key.replace("Precondition", "Conflict")),
      );
    }
  });
});
