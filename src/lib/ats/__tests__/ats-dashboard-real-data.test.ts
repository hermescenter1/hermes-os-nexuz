// @vitest-environment node
/**
 * ATS go-live — the dashboard aggregator reads REAL, tenant-scoped data.
 *
 *   - a fresh organization (no applications) → zeroed counts, empty lists;
 *   - every read is scoped to the organization AND excludes soft-deleted,
 *     anonymised and erased-candidate rows at the query level;
 *   - a store fault returns null (the route turns that into a 503), never a
 *     fixture;
 *   - real rows map to real figures, with no fabricated score for an
 *     unreviewed candidate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => ({
  prisma: null as unknown,
  appWhere: null as unknown,
  jobWhere: null as unknown,
}));

vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.prisma }));

import {
  getAtsOverview, getAtsAnalytics, getAtsPipeline, getAtsCandidates, getAtsHasData,
} from "@/lib/ats/dashboard";

function makeDb(apps: unknown[], jobs: unknown[], opts?: { throwApps?: boolean; throwJobs?: boolean }) {
  return {
    atsApplication: {
      findMany: async (a: { where: unknown }) => {
        h.appWhere = a.where;
        if (opts?.throwApps) throw new Error("db down");
        return apps;
      },
    },
    atsJob: {
      findMany: async (a: { where: unknown }) => {
        h.jobWhere = a.where;
        if (opts?.throwJobs) throw new Error("db down");
        return jobs;
      },
    },
  };
}

function appRow(over: Record<string, unknown> = {}) {
  return {
    id: "a-1", jobId: "job-1", status: "APPLIED", source: "direct", totalYearsExp: 5,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    candidate: { id: "c-1", name: "Real Person", email: "real@example.org", phone: null, location: "Isfahan", skills: ["plc", "scada"] },
    job: { id: "job-1", title: "Senior Accountant", department: "Finance", status: "OPEN" },
    score: null,
    ...over,
  };
}

beforeEach(() => {
  h.prisma = null; h.appWhere = null; h.jobWhere = null;
});

describe("empty organization → honest empty state", () => {
  beforeEach(() => { h.prisma = makeDb([], []); });

  it("overview is all zeros with empty lists", async () => {
    const o = await getAtsOverview("org-A");
    expect(o).not.toBeNull();
    expect(o!.totalCandidates).toBe(0);
    expect(o!.openJobs).toBe(0);
    expect(o!.averageScore).toBe(0);
    expect(o!.recentActivity).toEqual([]);
    expect(o!.topJobs).toEqual([]);
    expect(Object.values(o!.byStage).every((n) => n === 0)).toBe(true);
  });

  it("analytics is zeroed with empty distributions (no fabricated percentages)", async () => {
    const a = await getAtsAnalytics("org-A");
    expect(a!.totalCandidates).toBe(0);
    expect(a!.scoreDistribution).toEqual([]);
    expect(a!.topSkills).toEqual([]);
    expect(a!.averageAtsScore).toBe(0);
  });

  it("pipeline has every stage empty; candidates is empty; hasData is false", async () => {
    const p = await getAtsPipeline("org-A");
    expect(p!.every((c) => c.count === 0 && c.candidates.length === 0)).toBe(true);
    expect(await getAtsCandidates("org-A")).toEqual([]);
    expect(await getAtsHasData("org-A")).toBe(false);
  });
});

describe("tenant scoping and erasure/anonymisation exclusion are enforced at the query", () => {
  beforeEach(() => { h.prisma = makeDb([], []); });

  it("the application query scopes to the org and excludes deleted, anonymised and erased-candidate rows", async () => {
    await getAtsCandidates("org-XYZ");
    const where = h.appWhere as Record<string, unknown>;
    expect(where.organizationId).toBe("org-XYZ");
    expect(where.deletedAt).toBeNull();
    expect(where.anonymizedAt).toBeNull();
    expect(where.candidate).toEqual({ deletedAt: null });
  });

  it("the job query is scoped to the org and excludes soft-deleted jobs", async () => {
    await getAtsOverview("org-XYZ");
    const where = h.jobWhere as Record<string, unknown>;
    expect(where.organizationId).toBe("org-XYZ");
    expect(where.deletedAt).toBeNull();
  });
});

describe("a store fault returns null — never a fixture fallback", () => {
  it("getPrisma null → null", async () => {
    h.prisma = null;
    expect(await getAtsOverview("org-A")).toBeNull();
    expect(await getAtsCandidates("org-A")).toBeNull();
    expect(await getAtsPipeline("org-A")).toBeNull();
    expect(await getAtsAnalytics("org-A")).toBeNull();
    expect(await getAtsHasData("org-A")).toBeNull();
  });

  it("a throwing application query → null", async () => {
    h.prisma = makeDb([], [], { throwApps: true });
    expect(await getAtsCandidates("org-A")).toBeNull();
    expect(await getAtsPipeline("org-A")).toBeNull();
  });
});

describe("real rows map to real figures", () => {
  it("counts, candidate fields and the unscored flag come straight from the records", async () => {
    h.prisma = makeDb(
      [
        appRow({ id: "a-1", status: "APPLIED", score: null }),
        appRow({ id: "a-2", status: "HIRED", candidate: { id: "c-2", name: "Second", email: "two@example.org", phone: "+98", location: "Tehran", skills: ["opcua"] },
          score: { skillScore: 80, experienceScore: 70, locationScore: 60, authorizationScore: 0, salaryScore: 0, industryScore: 0, overallScore: 75, riskFlags: [], explanations: ["ok"] } }),
      ],
      [{ id: "job-1", title: "Senior Accountant", department: "Finance", status: "OPEN" }],
    );

    const cands = await getAtsCandidates("org-A");
    expect(cands!).toHaveLength(2);
    const unscored = cands!.find((c) => c.id === "a-1")!;
    expect(unscored.scored).toBe(false);
    expect(unscored.name).toBe("Real Person");
    expect(unscored.salaryExpectation).toBeNull();
    expect(unscored.workAuthorization).toBe("not-collected");
    const scoredRow = cands!.find((c) => c.id === "a-2")!;
    expect(scoredRow.scored).toBe(true);
    expect(scoredRow.atsScore.total).toBe(75);
    expect(scoredRow.stage).toBe("hired");

    const o = await getAtsOverview("org-A");
    expect(o!.totalCandidates).toBe(2);
    expect(o!.openJobs).toBe(1);
    expect(o!.averageScore).toBe(75); // only the one scored row counts
    expect(o!.byStage.hired).toBe(1);
    expect(o!.byStage.applied).toBe(1);
  });
});

describe("no go-live dashboard surface imports the development fixture", () => {
  it("the four routes, the planner client and the aggregator are free of @/lib/ats/mock-data", () => {
    const files = [
      "src/app/api/ats/overview/route.ts",
      "src/app/api/ats/analytics/route.ts",
      "src/app/api/ats/pipeline/route.ts",
      "src/app/api/ats/candidates/route.ts",
      "src/components/ats/InterviewPlannerClient.tsx",
      "src/lib/ats/dashboard.ts",
    ];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, `${f} must not import the fixture`).not.toMatch(/ats\/mock-data/);
    }
  });
});
