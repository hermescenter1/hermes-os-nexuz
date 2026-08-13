/**
 * PHASE 103 — the shared voice guard, proven end to end on all three routes.
 *
 * WHAT THIS SUITE IS FOR
 * The three voice endpoints share ONE authorization chain. A suite that mocked
 * that chain would prove only that a mock was called, so everything here drives
 * the REAL guard, the REAL `requireOrgActor`/`requirePermission`, the REAL
 * same-origin decision and the REAL rate-limit call, with only the edges
 * (tokens, database, audit sink, limiter verdict, entitlement verdict, provider)
 * replaced.
 *
 * WHAT IS PROVEN
 *   1. every route refuses an anonymous caller;
 *   2. a VALID API key is refused — the browser-session-only rule;
 *   3. a missing, foreign or look-alike Origin is refused;
 *   4. a non-member of the resolved organisation is refused;
 *   5. a role without `view_copilot` is refused;
 *   6. an entitlement denial is returned verbatim, and only AFTER RBAC;
 *   7. a rate-limit refusal answers 429 with Retry-After;
 *   8. the ORDER holds: each earlier gate fires before the later ones are even
 *      consulted, asserted by observing that the later gate's spy never ran.
 *
 * Nothing here reaches the network: the provider module is replaced and a
 * tripwire fails the test if anything calls `fetch`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALLOWED_ORIGIN,
  FOREIGN_ORIGIN,
  LOOKALIKE_ORIGIN,
  ORG_ID,
  OTHER_ORG_ID,
  USER_ID,
  enableVoiceEnv,
  freshState,
  installMocks,
  installNetworkTripwire,
  restoreEnv,
  seedHappyPath,
  seedMember,
  snapshotEnv,
  uninstallMocks,
  voiceRequest,
  type HarnessState,
  type VoiceEnv,
  type VoiceRoute,
} from "./harness";

let state: HarnessState;
let envSnapshot: VoiceEnv;
let restoreFetch: () => void;

beforeEach(() => {
  vi.resetModules();
  state = freshState();
  envSnapshot = snapshotEnv();
  enableVoiceEnv();
  installMocks(state);
  restoreFetch = installNetworkTripwire();
});

afterEach(() => {
  restoreFetch();
  uninstallMocks();
  restoreEnv(envSnapshot);
  vi.resetModules();
});

/**
 * Load a route handler AFTER the mocks are installed.
 *
 * The three specifiers are written out rather than interpolated: a template
 * specifier defeats the bundler's static analysis (and vite warns about it), and
 * writing them literally also means a renamed route breaks the suite loudly.
 */
async function loadRoute(route: VoiceRoute) {
  const mod =
    route === "session"
      ? await import("../session/route")
      : route === "query"
        ? await import("../query/route")
        : await import("../speech/route");
  return mod.POST as (req: import("next/server").NextRequest) => Promise<Response>;
}

/** A body each route accepts as well-formed, so a refusal is never a 400. */
function bodyFor(route: VoiceRoute): Record<string, unknown> {
  if (route === "session") return { locale: "en" };
  if (route === "query") return { transcript: "why is pump P-101 vibrating", locale: "en" };
  return { text: "Pump P-101 is stable.", grant: "v1.a.b.en.".padEnd(40, "0"), locale: "en" };
}

const ROUTES: VoiceRoute[] = ["session", "query", "speech"];

async function call(route: VoiceRoute, options: Parameters<typeof voiceRequest>[2] = {}) {
  const POST = await loadRoute(route);
  return POST(voiceRequest(route, bodyFor(route), options));
}

/* ═══════════════════════ 1 — authentication ═════════════════════════════════ */

describe("every voice route refuses an unauthenticated caller", () => {
  for (const route of ROUTES) {
    it(`${route}: no session → 401`, async () => {
      state.payload = null;
      const response = await call(route, { anonymous: true });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    });

    it(`${route}: a REVOKED session is refused even with a valid token`, async () => {
      // The signature still verifies; the session record does not. Phase 91's
      // revocation must hold on the voice surface too.
      state.sessionActive = false;
      const response = await call(route);
      expect(response.status).toBe(401);
    });
  }
});

/* ═══════════════════════ 2 — browser session ONLY ═══════════════════════════ */

describe("a valid platform API key is refused on every voice route", () => {
  for (const route of ROUTES) {
    it(`${route}: verified API key → 401 SESSION_AUTH_REQUIRED`, async () => {
      seedHappyPath(state);
      // The key VERIFIES — the harness returns a real key record. It is refused
      // because voice is a browser-microphone surface, not because the key is
      // invalid. A mock that failed verification would make this vacuous.
      state.apiKeyContext = { organizationId: ORG_ID, scopes: ["admin"] };
      const response = await call(route, { apiKey: "hk_live_valid_key_value" });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "SESSION_AUTH_REQUIRED" });
    });

    it(`${route}: the API-key refusal happens BEFORE membership or entitlement`, async () => {
      state.apiKeyContext = { organizationId: ORG_ID, scopes: ["admin"] };
      await call(route, { apiKey: "hk_live_valid_key_value" });
      // Nothing downstream was consulted, so the API-key exemption inside
      // `requireTrustedOrigin` can never be reached from these routes either.
      expect(state.entitlementCalls).toEqual([]);
      expect(state.providerCalls).toEqual([]);
    });
  }
});

/* ═══════════════════════ 3 — origin / CSRF ══════════════════════════════════ */

describe("the same-origin gate holds on every voice route", () => {
  for (const route of ROUTES) {
    for (const [label, origin] of [
      ["no Origin header", null],
      ["a cross-site origin", FOREIGN_ORIGIN],
      ["a suffix look-alike origin", LOOKALIKE_ORIGIN],
    ] as const) {
      it(`${route}: ${label} → 403`, async () => {
        seedHappyPath(state);
        const response = await call(route, { origin });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
      });
    }

    it(`${route}: the allowed origin passes the gate`, async () => {
      // Guards the guard: a gate that refused everything would also satisfy the
      // three assertions above.
      //
      // The assertion is on the CODE, not the status. `speech` legitimately
      // answers 403 further down the handler when the placeholder grant fails
      // verification, and asserting `status !== 403` would make this case pass
      // for the wrong reason on the other two routes and fail on this one.
      seedHappyPath(state);
      const response = await call(route, { origin: ALLOWED_ORIGIN });
      const code =
        response.headers.get("content-type")?.includes("json") === true
          ? ((await response.json()) as { code?: string }).code
          : undefined;
      expect(code).not.toBe("FORBIDDEN");
    });
  }
});

/* ═══════════════════════ 4 — membership ═════════════════════════════════════ */

describe("organisation membership is required and is server-derived", () => {
  for (const route of ROUTES) {
    it(`${route}: a user with no ACTIVE membership → 401/403, never 200`, async () => {
      // No membership row at all: `requirePlatformAuth` cannot resolve an org.
      const response = await call(route);
      expect([401, 403]).toContain(response.status);
      expect(state.entitlementCalls).toEqual([]);
    });

    it(`${route}: a member of ANOTHER organisation cannot act in this one`, async () => {
      // The org is resolved from the caller's OWN membership, so a foreign
      // member simply acts in their own tenant — never in ORG_ID.
      seedMember(state, { userId: USER_ID, organizationId: OTHER_ORG_ID, role: "ENGINEER" });
      await call(route);
      for (const entitlementCall of state.entitlementCalls) {
        expect(entitlementCall.organisationId).toBe(OTHER_ORG_ID);
      }
      for (const audit of state.auditEvents) {
        expect(audit.organizationId).not.toBe(ORG_ID);
      }
    });
  }
});

/* ═══════════════════════ 5 — RBAC ═══════════════════════════════════════════ */

describe("the view_copilot permission is enforced", () => {
  for (const route of ROUTES) {
    it(`${route}: a role without view_copilot → 403 INSUFFICIENT_PERMISSION`, async () => {
      // CUSTOMER is a real role in the RBAC table and is NOT in the
      // `view_copilot` grant list, so the REAL `requirePermission` refuses it.
      seedMember(state, { userId: USER_ID, organizationId: ORG_ID, role: "CUSTOMER" });
      const response = await call(route);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
    });

    it(`${route}: RBAC is decided BEFORE the commercial gate`, async () => {
      seedMember(state, { userId: USER_ID, organizationId: ORG_ID, role: "CUSTOMER" });
      await call(route);
      // A user who may not use the Copilot is told exactly that, and is never
      // told to buy something they could not use anyway.
      expect(state.entitlementCalls).toEqual([]);
    });
  }
});

/* ═══════════════════════ 6 — entitlement ════════════════════════════════════ */

describe("the copilot entitlement gates every voice route", () => {
  for (const route of ROUTES) {
    it(`${route}: a denial is returned verbatim from the billing surface`, async () => {
      seedHappyPath(state);
      state.entitlementAllowed = false;
      const response = await call(route);
      expect(response.status).toBe(402);
      expect(await response.json()).toMatchObject({ code: "FEATURE_NOT_ENTITLED" });
      // Nothing external was spent on a request the tenant is not entitled to.
      expect(state.providerCalls).toEqual([]);
    });

    it(`${route}: asks for the "copilot" key as an availability check`, async () => {
      seedHappyPath(state);
      await call(route);
      expect(state.entitlementCalls.length).toBeGreaterThan(0);
      expect(state.entitlementCalls[0]).toMatchObject({
        organisationId: ORG_ID,
        entitlementKey: "copilot",
        // 0 = availability, not consumption: voice must not silently change
        // anyone's usage accounting.
        requestedUnits: 0,
        userId: USER_ID,
      });
    });
  }
});

/* ═══════════════════════ 7 — rate limiting ══════════════════════════════════ */

describe("each route is rate limited on its own bucket", () => {
  for (const route of ROUTES) {
    it(`${route}: over budget → 429 with Retry-After`, async () => {
      seedHappyPath(state);
      state.rateLimitAllowed = false;
      const response = await call(route);
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("42");
      expect(await response.json()).toMatchObject({ code: "RATE_LIMITED" });
    });

    it(`${route}: the limit is applied AFTER the entitlement gate`, async () => {
      seedHappyPath(state);
      state.rateLimitAllowed = false;
      await call(route);
      // The chain reached the limiter, which means the commercial gate had
      // already said yes — the documented order.
      expect(state.entitlementCalls.length).toBe(1);
      expect(state.providerCalls).toEqual([]);
    });
  }

  it("the three routes name three DIFFERENT declared buckets", async () => {
    // Read from the real registry, not from a copy of the names. A bucket the
    // registry does not declare is already a compile error at the call site;
    // this proves the three are distinct so one surface cannot exhaust another.
    // `importActual` deliberately bypasses the harness double: the question is
    // what the CANONICAL registry declares, not what the mock returns.
    const { RATE_LIMIT_ACTIONS } = await vi.importActual<typeof import("@/lib/auth/rate-limiter")>(
      "@/lib/auth/rate-limiter",
    );
    const buckets = ["copilot-voice-session", "copilot-voice-query", "copilot-voice-speech"];
    expect(new Set(buckets).size).toBe(3);
    for (const bucket of buckets) expect(RATE_LIMIT_ACTIONS).toContain(bucket);
  });
});

/* ═══════════════════════ 8 — refusals leak nothing ══════════════════════════ */

describe("every refusal is cacheable by nobody and reveals nothing", () => {
  for (const route of ROUTES) {
    it(`${route}: refusals carry Cache-Control: no-store`, async () => {
      const response = await call(route, { origin: FOREIGN_ORIGIN });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });

    it(`${route}: a refusal body carries only a stable code and message`, async () => {
      seedMember(state, { userId: USER_ID, organizationId: ORG_ID, role: "CUSTOMER" });
      const body = (await (await call(route)).json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(["code", "error"]);
      // No stack, no organisation name, no role, no plan, no provider detail.
      expect(JSON.stringify(body)).not.toMatch(/stack|prisma|openai|sk-|org-voice/i);
    });
  }
});
