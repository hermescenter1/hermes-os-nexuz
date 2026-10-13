/**
 * The settings write guard — behaviour, including ORDER: a cross-site request
 * must be refused before the session, the organization or the database is
 * consulted at all.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  scopeCalls: 0,
  result: null as unknown,
}));

vi.mock("../scope", () => ({
  resolveExecutiveScope: async () => {
    h.scopeCalls += 1;
    return h.result;
  },
  statusForFailure: (code: string) => (code === "AUTHENTICATION_REQUIRED" ? 401 : 403),
}));

vi.mock("@/lib/security/request-guards", () => ({
  requireTrustedOrigin: (req: Request) => ({
    ok: req.headers.get("origin") === "http://localhost:3000",
    reason: "x",
  }),
  isJsonContentType: (req: Request) => (req.headers.get("content-type") ?? "").startsWith("application/json"),
}));

import { authorizeExecutiveSettingsWrite, canUpdateExecutiveSettings } from "../settings-auth";

function req(headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/executive/settings", { method: "PUT", headers }) as never;
}

const scopeFor = (role: string) => ({
  ok: true,
  scope: {
    userId: "u",
    organizationId: "org-a",
    memberId: "m",
    role,
    authority: { operations: true, financial: true, industrial: true },
    allowedSiteIds: [],
    timeZone: "Asia/Tehran",
    dayCutoffMinutes: 0,
    correlationId: "c",
  },
});

const GOOD = { origin: "http://localhost:3000", "content-type": "application/json" };

beforeEach(() => {
  h.scopeCalls = 0;
  h.result = scopeFor("OWNER");
});

describe("authorizeExecutiveSettingsWrite", () => {
  it("refuses a cross-site request before resolving the session", async () => {
    const out = await authorizeExecutiveSettingsWrite(req({ ...GOOD, origin: "https://evil.example" }));
    expect(out).toEqual({ ok: false, status: 403, error: "ORIGIN_NOT_ALLOWED" });
    expect(h.scopeCalls).toBe(0);
  });

  it("refuses a request with no Origin at all", async () => {
    const out = await authorizeExecutiveSettingsWrite(req({ "content-type": "application/json" }));
    expect(out).toMatchObject({ ok: false, error: "ORIGIN_NOT_ALLOWED" });
    expect(h.scopeCalls).toBe(0);
  });

  it("refuses a non-JSON body before resolving the session", async () => {
    const out = await authorizeExecutiveSettingsWrite(req({ ...GOOD, "content-type": "application/x-www-form-urlencoded" }));
    expect(out).toEqual({ ok: false, status: 415, error: "UNSUPPORTED_MEDIA_TYPE" });
    expect(h.scopeCalls).toBe(0);
  });

  it("passes a scope refusal through with its own status", async () => {
    h.result = { ok: false, code: "AUTHENTICATION_REQUIRED", memberships: [] };
    expect(await authorizeExecutiveSettingsWrite(req(GOOD))).toEqual({
      ok: false,
      status: 401,
      error: "AUTHENTICATION_REQUIRED",
    });
  });

  it("refuses a member without update_org", async () => {
    for (const role of ["VIEWER", "MANAGER", "ENGINEER", "MEMBER"]) {
      h.result = scopeFor(role);
      expect(await authorizeExecutiveSettingsWrite(req(GOOD)), role).toEqual({ ok: false, status: 403, error: "FORBIDDEN" });
    }
  });

  it("admits OWNER and ADMIN, returning the SERVER-resolved organization", async () => {
    for (const role of ["OWNER", "ADMIN"]) {
      h.result = scopeFor(role);
      const out = await authorizeExecutiveSettingsWrite(req(GOOD));
      expect(out.ok, role).toBe(true);
      expect(out.ok && out.scope.organizationId).toBe("org-a");
    }
  });
});

describe("canUpdateExecutiveSettings", () => {
  it("fails closed on a role string that is not a known organization role", () => {
    expect(canUpdateExecutiveSettings("SUPERUSER")).toBe(false);
    expect(canUpdateExecutiveSettings("owner")).toBe(false);
    expect(canUpdateExecutiveSettings("")).toBe(false);
  });

  it("matches update_org for known roles", () => {
    expect(canUpdateExecutiveSettings("OWNER")).toBe(true);
    expect(canUpdateExecutiveSettings("ADMIN")).toBe(true);
    expect(canUpdateExecutiveSettings("VIEWER")).toBe(false);
  });
});
