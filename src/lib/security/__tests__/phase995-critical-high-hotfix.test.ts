/**
 * PHASE 99.5 — regression tests for the Phase 99 CRITICAL/HIGH findings that
 * were forward-ported onto main.
 *
 * Every test here reproduces a REAL defect that existed on main at cc16a55 and
 * fails against the unfixed code:
 *
 *   P99-INT-001 (CRITICAL) — session fixation via POST /api/compliance/cookie-consent
 *   P99-INT-002 (HIGH)     — consent read as a subject-evidence oracle, session
 *                            token persisted/logged as the consent identifier,
 *                            and a client-controlled X-Forwarded-For recorded as
 *                            consent evidence
 *   P99-INT-003 (HIGH)     — mass assignment on PUT /api/candidate/profile
 *
 * Offline and deterministic: no database, no network, no Docker. The routes are
 * imported dynamically after their dependencies are mocked, following the
 * existing route-test pattern in `src/app/api/compliance/__tests__/`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/config";
import { CONSENT_ID_COOKIE, isConsentId, newConsentId } from "@/lib/compliance/consent-cookie";

const MOCKED = ["@/lib/compliance/db", "@/lib/auth/jwt", "@/lib/ats/db", "@/lib/auth/token-session"];

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.resetModules();
});

// ── P99-INT-001 — session fixation via the cookie-consent endpoint ────────────
describe("P99-INT-001 — cookie consent must never write the authentication session", () => {
  let upserted: Array<Record<string, unknown>>;

  beforeEach(() => {
    vi.resetModules();
    upserted = [];
    vi.doMock("@/lib/compliance/db", () => ({
      getCookieConsent: async () => null,
      upsertCookieConsent: async (d: Record<string, unknown>) => {
        upserted.push(d);
        return {
          necessary: true, analytics: false, marketing: false, preferences: false,
          locale: "en", consentVersion: "1.0", createdAt: new Date(0), updatedAt: new Date(0),
          userId: "victim-user", ipAddress: "10.0.0.9", sessionId: d.sessionId,
        };
      },
      createConsentRecord: async () => null,
    }));
    vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => null }));
  });

  it("ignores a client-supplied sessionId and never sets the auth cookie", async () => {
    const { POST } = await import("@/app/api/compliance/cookie-consent/route");
    const attackerSession = "attacker.signed.session.token";
    const req = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analytics: true, sessionId: attackerSession }),
    });

    const res = await POST(req);

    // The authentication cookie must not appear in the response at all.
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).not.toContain(`${SESSION_COOKIE}=`);
    // The consent identifier is server-minted and is NOT the supplied value.
    expect(res.cookies.get(CONSENT_ID_COOKIE)?.value).toBeDefined();
    expect(res.cookies.get(CONSENT_ID_COOKIE)?.value).not.toBe(attackerSession);
    expect(isConsentId(res.cookies.get(CONSENT_ID_COOKIE)!.value)).toBe(true);
    // Nothing attacker-controlled reached persistence either.
    expect(upserted[0]?.sessionId).not.toBe(attackerSession);
    expect(isConsentId(String(upserted[0]?.sessionId))).toBe(true);
  });

  it("never reads the authentication cookie as the consent subject", async () => {
    const { POST } = await import("@/app/api/compliance/cookie-consent/route");
    const req = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=victim.signed.session.token`,
      },
      body: JSON.stringify({ analytics: true }),
    });
    await POST(req);
    expect(upserted[0]?.sessionId).not.toBe("victim.signed.session.token");
    expect(isConsentId(String(upserted[0]?.sessionId))).toBe(true);
  });

  it("reuses an existing well-formed consent id but rejects a forged one", async () => {
    const { POST } = await import("@/app/api/compliance/cookie-consent/route");
    const mine = newConsentId();

    const good = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${CONSENT_ID_COOKIE}=${mine}` },
      body: JSON.stringify({ analytics: true }),
    });
    await POST(good);
    expect(upserted[0]?.sessionId).toBe(mine);

    // A value shaped like an auth token (or anything else) is treated as absent.
    const forged = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${CONSENT_ID_COOKIE}=not-a-consent-id` },
      body: JSON.stringify({ analytics: true }),
    });
    await POST(forged);
    expect(upserted[1]?.sessionId).not.toBe("not-a-consent-id");
    expect(isConsentId(String(upserted[1]?.sessionId))).toBe(true);
  });

  it("records the proxy-supplied X-Real-IP, never the client-appendable X-Forwarded-For", async () => {
    const { POST } = await import("@/app/api/compliance/cookie-consent/route");
    const req = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "1.2.3.4, 198.51.100.7",
        "x-real-ip": "198.51.100.7",
      },
      body: JSON.stringify({ analytics: true }),
    });
    await POST(req);
    expect(upserted[0]?.ipAddress).toBe("198.51.100.7");
  });

  it("omits the IP entirely when the proxy header is absent", async () => {
    const { POST } = await import("@/app/api/compliance/cookie-consent/route");
    const req = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify({ analytics: true }),
    });
    await POST(req);
    expect(upserted[0]?.ipAddress).toBeUndefined();
  });
});

// ── P99-INT-002 — consent read must not be an evidence oracle ─────────────────
describe("P99-INT-002 — cookie consent read exposes no subject evidence", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/compliance/db", () => ({
      getCookieConsent: async () => ({
        id: "row-1", sessionId: "c_x", userId: "victim-user",
        necessary: true, analytics: true, marketing: false, preferences: false,
        ipAddress: "203.0.113.9", userAgent: "VictimBrowser/1.0",
        locale: "en", consentVersion: "1.0", createdAt: new Date(0), updatedAt: new Date(0),
      }),
      upsertCookieConsent: async () => null,
      createConsentRecord: async () => null,
    }));
    vi.doMock("@/lib/auth/jwt", () => ({ verifyAccessToken: async () => null }));
  });

  it("treats a non-consent-id cookie as absent", async () => {
    const { GET } = await import("@/app/api/compliance/cookie-consent/route");
    const req = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      headers: { cookie: `${CONSENT_ID_COOKIE}=anon_1700000000000` },
    });
    const body = await (await GET(req)).json();
    expect(body.consent).toBeNull();
    expect(body.defaults).toEqual({ necessary: true, analytics: false, marketing: false, preferences: false });
  });

  it("never keys the lookup on the authentication cookie", async () => {
    const { GET } = await import("@/app/api/compliance/cookie-consent/route");
    const req = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      headers: { cookie: `${SESSION_COOKIE}=victim.signed.session.token` },
    });
    const body = await (await GET(req)).json();
    expect(body.consent).toBeNull();
  });

  it("projects preferences only — never userId, ipAddress or userAgent", async () => {
    const { GET } = await import("@/app/api/compliance/cookie-consent/route");
    const req = new NextRequest("https://app.example/api/compliance/cookie-consent", {
      headers: { cookie: `${CONSENT_ID_COOKIE}=${newConsentId()}` },
    });
    const res = await GET(req);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("victim-user");
    expect(raw).not.toContain("203.0.113.9");
    expect(raw).not.toContain("VictimBrowser");
    expect(JSON.parse(raw).consent.analytics).toBe(true);
  });
});

// ── P99-INT-002 — the consent identifier must never reach the logs ────────────
describe("P99-INT-002 — compliance db helpers keep the subject identifier out of logs", () => {
  beforeEach(() => vi.resetModules());

  it("logs neither the identifier on an upsert failure nor on a read failure", async () => {
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({
        cookieConsent: {
          upsert: async () => { throw new Error("boom"); },
          findUnique: async () => { throw new Error("boom"); },
        },
      }),
    }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { upsertCookieConsent, getCookieConsent } = await import("@/lib/compliance/db");
      const id = newConsentId();
      await upsertCookieConsent({
        sessionId: id,
        preferences: { necessary: true, analytics: false, marketing: false, preferences: false },
      });
      await getCookieConsent(id);
      const logged = spy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
      expect(logged).not.toContain(id);
    } finally {
      spy.mockRestore();
      vi.doUnmock("@/lib/db/prisma");
    }
  });
});

// ── P99-INT-003 — candidate profile mass assignment ───────────────────────────
describe("P99-INT-003 — candidate profile accepts only self-service fields", () => {
  let updateArgs: Record<string, unknown> | null;

  beforeEach(() => {
    vi.resetModules();
    updateArgs = null;
    vi.doMock("@/lib/auth/token-session", () => ({
      getTokenUser: async () => ({ id: "user-1", role: "candidate" }),
    }));
    vi.doMock("@/lib/ats/db", () => ({
      getCandidateByUserId: async () => ({ id: "cand-1" }),
      updateCandidate: async (_id: string, data: Record<string, unknown>) => { updateArgs = data; return { id: "cand-1", ...data }; },
    }));
  });

  it("drops identity and relation fields the client tried to set", async () => {
    const { PUT } = await import("@/app/api/candidate/profile/route");
    const req = new NextRequest("https://app.example/api/candidate/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Legitimate Name",
        email: "victim@example.test",
        userId: "victim-user-id",
        deletedAt: null,
        applications: { connect: { id: "someone-elses-application" } },
      }),
    });
    await PUT(req);

    expect(updateArgs).not.toBeNull();
    expect(updateArgs).toHaveProperty("name", "Legitimate Name");
    for (const forbidden of ["email", "userId", "deletedAt", "applications"]) {
      expect(Object.prototype.hasOwnProperty.call(updateArgs!, forbidden)).toBe(false);
    }
  });

  it("does not invent fields the client never sent", async () => {
    const { PUT } = await import("@/app/api/candidate/profile/route");
    const req = new NextRequest("https://app.example/api/candidate/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "+1 555 0100" }),
    });
    await PUT(req);
    expect(Object.keys(updateArgs!)).toEqual(["phone"]);
  });
});
