/**
 * PHASE 99 — regression coverage for finding P99-INT-011.
 *
 * Ten anonymous endpoints serve views derived from the engineering knowledge
 * graph. Two things were wrong with that, and both are asserted here:
 *
 *   1. The builder called `list()` and filtered to published records in
 *      JavaScript, so every request read every row of every tenant — drafts
 *      included — out of the database only to discard most of it. The predicate
 *      now lives in the query.
 *   2. None of the ten endpoints was rate limited, so an anonymous caller could
 *      drive an unbounded number of full graph rebuilds.
 *
 * The response contract is deliberately unchanged: the same published articles
 * appear, and a normal visitor never meets the limit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const DERIVED_GRAPH_ROUTES = [
  "src/app/api/eng-graph/route.ts",
  "src/app/api/eng-graph/edges/route.ts",
  "src/app/api/eng-graph/nodes/route.ts",
  "src/app/api/eng-graph/stats/route.ts",
  "src/app/api/eng-graph/node/[id]/route.ts",
  "src/app/api/operations/alerts/route.ts",
  "src/app/api/operations/intelligence/route.ts",
  "src/app/api/operations/overview/route.ts",
  "src/app/api/operations/sites/route.ts",
  "src/app/api/operations/war-room/route.ts",
];

afterEach(() => {
  vi.doUnmock("@/lib/db/prisma");
  vi.doUnmock("@/lib/storage/storage-mode");
  vi.resetModules();
});

describe("P99-INT-011 — the published predicate is pushed into the query", () => {
  let findManyArgs: Array<Record<string, unknown>>;

  beforeEach(() => {
    vi.resetModules();
    findManyArgs = [];
    vi.doMock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => "database" }));
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({
        knowledgeArticle: {
          findMany: async (a: Record<string, unknown>) => {
            findManyArgs.push(a);
            return [
              { id: "a1", title: "Published one", domain: "PLC", status: "published", confidence: 0.9, createdAt: new Date(0), updatedAt: new Date(0) },
            ];
          },
          findUnique: async () => null,
        },
      }),
    }));
  });

  it("asks the database for published rows only", async () => {
    const { knowledgeRepository } = await import("@/lib/storage/knowledge-repository");
    const repo = knowledgeRepository();
    expect(repo.listPublished, "listPublished must exist for the anonymous path").toBeTypeOf("function");

    await repo.listPublished!();
    expect(findManyArgs).toHaveLength(1);
    expect(findManyArgs[0].where).toEqual({ status: "published" });
  });

  it("leaves list() unfiltered, because the authenticated surfaces need drafts", async () => {
    const { knowledgeRepository } = await import("@/lib/storage/knowledge-repository");
    await knowledgeRepository().list();
    expect(findManyArgs).toHaveLength(1);
    expect(findManyArgs[0].where).toBeUndefined();
  });
});

describe("P99-INT-011 — the session repository honours the same contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => "session" }));
  });

  it("returns only published articles from listPublished", async () => {
    const { knowledgeRepository } = await import("@/lib/storage/knowledge-repository");
    const repo = knowledgeRepository();
    await repo.create({ title: "Draft article", domain: "PLC", confidence: 0.5, content: "x" } as never);
    await repo.create({ title: "Published article", domain: "PLC", confidence: 0.5, content: "x", status: "published" } as never);

    const all = await repo.list();
    const published = await repo.listPublished!();
    expect(all.length).toBeGreaterThan(published.length);
    expect(published.every((a) => a.status === "published")).toBe(true);
  });
});

describe("P99-INT-011 — every anonymous derived-graph endpoint is bounded", () => {
  it("all ten routes apply the shared guard", () => {
    for (const file of DERIVED_GRAPH_ROUTES) {
      const src = read(file);
      expect(src, `${file}: missing guardDerivedGraphRequest`).toContain("guardDerivedGraphRequest(req)");
    }
  });

  it("the guard denies once the budget is exhausted and reports Retry-After", async () => {
    vi.resetModules();
    const { guardDerivedGraphRequest, DERIVED_GRAPH_ACTION } = await import("@/lib/eng-graph/public-guard");
    const { limitWindowSeconds } = await import("@/lib/auth/rate-limiter");

    // One dedicated IP so this cannot interact with any other suite.
    const ip = "203.0.113.201";
    const req = new NextRequest("https://app.example/api/eng-graph", { headers: { "x-real-ip": ip } });

    let denied: Response | null = null;
    // The budget is 60/min; drive past it deterministically.
    for (let i = 0; i < 70 && !denied; i += 1) denied = await guardDerivedGraphRequest(req);

    expect(denied, "the guard never denied within 70 requests").not.toBeNull();
    expect(denied!.status).toBe(429);
    expect(denied!.headers.get("Retry-After")).toBeTruthy();
    expect(limitWindowSeconds(DERIVED_GRAPH_ACTION)).toBeGreaterThan(0);
  });

  it("lets a normal visitor through — the response contract is unchanged", async () => {
    vi.resetModules();
    const { guardDerivedGraphRequest } = await import("@/lib/eng-graph/public-guard");
    const req = new NextRequest("https://app.example/api/eng-graph", { headers: { "x-real-ip": "203.0.113.202" } });
    // A page load fetches each view once; several reloads must still pass.
    for (let i = 0; i < 10; i += 1) {
      expect(await guardDerivedGraphRequest(req)).toBeNull();
    }
  });
});
