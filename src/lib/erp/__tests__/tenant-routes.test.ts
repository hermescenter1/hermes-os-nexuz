/**
 * HRIS-0.5 — ERP route contract: fail-closed operational modules, origin
 * refusal on writes, strict input, and a repository scan for fixtures and
 * fake-success responses in production ERP paths.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  userId: null as string | null,
  user: null as null | { id: string; role: string },
}));

vi.mock("@/lib/org/context", () => ({
  getUserIdFromRequest: async () => state.userId,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => state.user,
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => null,
}));

vi.mock("@/lib/erp/active-organization", () => ({
  getActiveOrganizationContext: async () =>
    state.user
      ? { ok: true, scope: { userId: state.user.id, organizationId: "org-A", memberId: "m-1", role: "OWNER", canViewCompensation: true } }
      : { ok: false, error: { status: 401, code: "AUTHENTICATION_REQUIRED" } },
}));

const ROOT = join(__dirname, "..", "..", "..", "..");

const OPERATIONAL = [
  ["approvals", "approvals/route"],
  ["inventory", "inventory/route"],
  ["kpis", "kpis/route"],
  ["overview", "overview/route"],
  ["projects", "projects/route"],
  ["tasks", "tasks/route"],
  ["work-orders", "work-orders/route"],
] as const;

async function loadRoute(path: string) {
  return import(/* @vite-ignore */ join(ROOT, "src", "app", "api", "erp", path));
}

const TRUSTED_ORIGIN = "https://www.hermesnovin.com";

beforeEach(() => {
  state.userId = "user-1";
  state.user = { id: "user-1", role: "admin" };
});

describe("operational ERP modules keep the platform gate and fail generically without a database", () => {
  for (const [name, path] of OPERATIONAL) {
    it(`${name}: anonymous caller is refused by the platform gate (401) and reads nothing`, async () => {
      state.user = null;
      const route = await loadRoute(path);
      const res = await route.GET(new NextRequest(`https://www.hermesnovin.com/api/erp/${name}`));
      expect(res.status).toBe(401);
    });

    it(`${name}: admin without a reachable database gets a generic 503 and no list`, async () => {
      const route = await loadRoute(path);
      const res = await route.GET(new NextRequest(`https://www.hermesnovin.com/api/erp/${name}`));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe("SERVICE_UNAVAILABLE");
      expect(res.headers.get("cache-control")).toBe("no-store");
    });
  }
});

describe("write routes refuse untrusted origins before touching data", () => {
  it("POST /api/erp/teams without an Origin header is refused with 403", async () => {
    state.userId = "user-1";
    const route = await loadRoute("teams/route");
    const req = new NextRequest("https://www.hermesnovin.com/api/erp/teams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: "org-A", name: "Line 4" }),
    });
    const res = await route.POST(req);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("POST /api/erp/resources from a foreign origin is refused with 403", async () => {
    state.userId = "user-1";
    const route = await loadRoute("resources/route");
    const req = new NextRequest("https://www.hermesnovin.com/api/erp/resources", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ organizationId: "org-A", name: "Lathe", type: "EQUIPMENT" }),
    });
    const res = await route.POST(req);
    expect(res.status).toBe(403);
  });
});

describe("strict input contracts", () => {
  it("rejects a client-supplied version or unknown key with 400 (no mass assignment)", async () => {
    state.userId = "user-1";
    const route = await loadRoute("teams/route");
    const req = new NextRequest("https://www.hermesnovin.com/api/erp/teams", {
      method: "POST",
      headers: { "content-type": "application/json", origin: TRUSTED_ORIGIN },
      body: JSON.stringify({ organizationId: "org-A", name: "Line 4", version: 99, organizationIdOverride: "org-B" }),
    });
    const res = await route.POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_REQUEST");
  });

  it("rejects cross-entity references (projectId) on resource create", async () => {
    state.userId = "user-1";
    const route = await loadRoute("resources/route");
    const req = new NextRequest("https://www.hermesnovin.com/api/erp/resources", {
      method: "POST",
      headers: { "content-type": "application/json", origin: TRUSTED_ORIGIN },
      body: JSON.stringify({ organizationId: "org-A", name: "Lathe", type: "EQUIPMENT", projectId: "proj-from-another-org" }),
    });
    const res = await route.POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects a non-JSON body with 415", async () => {
    state.userId = "user-1";
    const route = await loadRoute("teams/route");
    const req = new NextRequest("https://www.hermesnovin.com/api/erp/teams", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: TRUSTED_ORIGIN },
      body: "organizationId=org-A",
    });
    const res = await route.POST(req);
    expect(res.status).toBe(415);
  });

  it("answers 401 for an anonymous team list without revealing whether organizations exist", async () => {
    state.user = null;
    const route = await loadRoute("teams/route");
    const res = await route.GET(new NextRequest("https://www.hermesnovin.com/api/erp/teams?organizationId=org-A"));
    expect(res.status).toBe(401);
  });
});

const CHILD_COLLECTIONS = [
  "projects/[id]/milestones",
  "projects/[id]/costs",
  "projects/[id]/tasks",
  "projects/[id]/work-orders",
  "tasks/[id]/comments",
  "work-orders/[id]/activities",
  "inventory/[id]/movements",
  "approvals/[id]/steps",
  "teams/[id]/members",
  "teams/[id]/member-candidates",
] as const;

describe("child collections: refused before any data is read", () => {
  for (const path of CHILD_COLLECTIONS) {
    it(`${path}: anonymous caller is refused with 401`, async () => {
      state.user = null;
      const route = await import(/* @vite-ignore */ join(ROOT, "src", "app", "api", "erp", `${path}/route`));
      const res = await route.GET(new NextRequest(`https://www.hermesnovin.com/api/erp/${path}?limit=10`), { params: Promise.resolve({ id: "x" }) });
      expect(res.status).toBe(401);
    });

    it(`${path}: a client-supplied organizationId is refused by the strict query contract (400)`, async () => {
      const route = await import(/* @vite-ignore */ join(ROOT, "src", "app", "api", "erp", `${path}/route`));
      const res = await route.GET(
        new NextRequest(`https://www.hermesnovin.com/api/erp/${path}?limit=10&organizationId=org-B`),
        { params: Promise.resolve({ id: "x" }) },
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("INVALID_REQUEST");
    });
  }
});

describe("repository scan: no fixtures or fake success in production ERP paths", () => {
  const SCAN_DIRS = [
    join(ROOT, "src", "lib", "erp"),
    join(ROOT, "src", "app", "api", "erp"),
    join(ROOT, "src", "app", "[locale]", "erp"),
    join(ROOT, "src", "components", "erp"),
  ];
  const FORBIDDEN = [/MOCK_[A-Z]/, /mock-data/, /mock mode/i, /status:\s*202/, /lib\/erp\/mock/];

  function files(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === "__tests__") continue;
        out.push(...files(full));
      } else if (/\.(ts|tsx)$/.test(name)) {
        out.push(full);
      }
    }
    return out;
  }

  it("no production ERP file references MOCK_*, mock-data, mock mode or a 202 fake write", () => {
    const hits: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of files(dir)) {
        const text = readFileSync(file, "utf8");
        for (const re of FORBIDDEN) {
          if (re.test(text)) hits.push(`${relative(ROOT, file)} :: ${re}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
