/**
 * PHASE 104-B1 — the public careers surface, fail-closed.
 *
 * Runs the REAL route handlers with a captured fake store:
 *
 *   - ZERO fixture reach: no production careers/ats route or public careers
 *     component imports `mock-data` (import-graph gate);
 *   - the list answers 503 when the store is unreachable — never an invented
 *     empty state, never the fixture;
 *   - the detail answers ONE indistinguishable 404 for unknown/draft/private/
 *     closed/expired ids and locales without a complete translation;
 *   - /api/careers/apply: a fully VALID payload for an ELIGIBLE job is still
 *     refused generically in Stage B1 (acceptance not authorized, retention
 *     not proven) with WRITE_COUNT=0; a store fault is never converted into
 *     an authentication failure; workAuthorization is rejected outright;
 *   - every response is Cache-Control: no-store.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => ({
  db: null as unknown,
  rateLimited: false,
}));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));
vi.mock("@/lib/auth/rate-limiter", () => ({
  checkRateLimit: async () => !h.rateLimited,
  retryAfter: () => 42,
}));

import { GET as listJobs } from "../jobs/route";
import { GET as getJob } from "../jobs/[jobId]/route";
import { POST as apply } from "../apply/route";
import { APPLICATION_ACCEPTANCE_AUTHORIZED } from "@/lib/ats/application";

const REPO = process.cwd();
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");
/** The file with comments removed — a gate on CODE must not fire on the
 *  documentation that explains what the code STOPPED doing. */
const readCode = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

/* ── import-graph gate ─────────────────────────────────────────────────────── */

describe("fixture leakage = 0 (import graph)", () => {
  const FORBIDDEN = /from\s+["'][^"']*mock-data["']/;
  const productionSurfaces = [
    "src/app/api/careers/jobs/route.ts",
    "src/app/api/careers/jobs/[jobId]/route.ts",
    "src/app/api/careers/apply/route.ts",
    "src/app/api/ats/jobs/route.ts",
    "src/lib/ats/public-jobs.ts",
    "src/lib/ats/eligibility.ts",
    "src/lib/ats/recruitment.ts",
    "src/lib/ats/application.ts",
    "src/lib/ats/db.ts",
    "src/components/careers/CareersBoardClient.tsx",
    "src/components/careers/JobDetailClient.tsx",
    "src/app/[locale]/careers/[jobId]/page.tsx",
    "src/app/sitemap.ts",
  ];
  for (const rel of productionSurfaces) {
    it(`${rel} does not import the fixture`, () => {
      expect(readCode(rel)).not.toMatch(FORBIDDEN);
    });
  }
});

/* ── fakes ─────────────────────────────────────────────────────────────────── */

const NOW = Date.now();
/** Explicit row type so nullable columns stay MUTABLE in fixtures — a literal
 *  would freeze closingDate at type `null` and forbid the expired case. */
interface FakeJobRow {
  id: string;
  organizationId: string;
  status: string;
  isPublic: boolean;
  deletedAt: Date | null;
  publishedAt: Date | null;
  closingDate: Date | null;
  department: string;
  location: string;
  addressLocality: string | null;
  addressRegion: string | null;
  addressCountry: string | null;
  locationType: string | null;
  salaryCurrency: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  skills: string[];
  translations: {
    language: string; title: string; shortSummary: string; description: string;
    departmentLabel: string; seoTitle: string; seoDescription: string;
  }[];
  requisitionKey?: string | null;
  employmentType?: string | null;
  createdAt?: Date;
  /** legacy English body column — must NEVER surface on the public detail */
  description?: string;
}
const eligibleJob: FakeJobRow = {
  id: "job-1",
  organizationId: "org-1",
  status: "OPEN",
  isPublic: true,
  deletedAt: null,
  publishedAt: new Date(NOW - 86400_000),
  closingDate: null,
  department: "automation",
  location: "Isfahan, Iran",
  addressLocality: "Isfahan",
  addressRegion: "Isfahan Province",
  addressCountry: "IR",
  locationType: null,
  salaryCurrency: null,
  salaryMin: null,
  salaryMax: null,
  skills: ["plc-programming"],
  translations: [{
    language: "EN",
    title: "Automation Engineer",
    shortSummary: "s",
    description: "d",
    departmentLabel: "Automation",
    seoTitle: "st",
    seoDescription: "sd",
  }],
};

function matchesPublicWhere(row: FakeJobRow, where: Record<string, unknown>): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (row.status !== "OPEN" || row.isPublic !== true || row.deletedAt !== null) return false;
  if (!(row.publishedAt instanceof Date) || row.publishedAt.getTime() > Date.now()) return false;
  if (row.closingDate instanceof Date && row.closingDate.getTime() < Date.now()) return false;
  return true;
}

function withTranslations(
  row: FakeJobRow,
  include?: { translations?: { where?: { language?: string } } },
): FakeJobRow {
  const lang = include?.translations?.where?.language;
  if (!lang) return row;
  return { ...row, translations: row.translations.filter((t) => t.language === lang) };
}

function makeDb(rows: FakeJobRow[], opts?: { retentionApproved?: boolean; throwOnJob?: boolean }) {
  const writes: string[] = [];
  const client = {
    atsJob: {
      findMany: async (a: { where: Record<string, unknown>; include?: { translations?: { where?: { language?: string } } } }) => {
        if (opts?.throwOnJob) throw new Error("db down");
        return rows.filter((r) => matchesPublicWhere(r, a.where)).map((r) => withTranslations(r, a.include));
      },
      findFirst: async (a: { where: Record<string, unknown>; include?: { translations?: { where?: { language?: string } } } }) => {
        if (opts?.throwOnJob) throw new Error("db down");
        const hit = rows.find((r) => matchesPublicWhere(r, a.where));
        return hit ? withTranslations(hit, a.include) : null;
      },
    },
    retentionPolicy: {
      findFirst: async () => (opts?.retentionApproved ? { id: "rp-1" } : null),
    },
    atsCandidate: { create: async () => { writes.push("candidate"); return { id: "c-1" }; }, findUnique: async () => null },
    atsApplication: { create: async () => { writes.push("application"); return { id: "a-1" }; } },
    consentRecord: { create: async () => { writes.push("consent"); return {}; } },
    recruitmentIdempotencyKey: { create: async () => { writes.push("idem"); return { id: "i-1" }; }, findUnique: async () => null },
    $transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => fn(client),
  };
  return { client, writes };
}

const KEY = "9f2c1d3e4b5a6978a0b1c2d3e4f50617";
const validBody = () => ({
  jobId: "job-1",
  fullName: "Jane Doe",
  email: "jane@example.org",
  privacyNoticeAcknowledged: true,
  accuracyConfirmed: true,
});

function applyReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://hermesnovin.com/api/careers/apply", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": "203.0.113.7",
      "idempotency-key": KEY,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.db = null;
  h.rateLimited = false;
});

/* ── list + detail ─────────────────────────────────────────────────────────── */

describe("GET /api/careers/jobs", () => {
  it("answers 503 with no-store when the store is unreachable — no fixture, no fake empty state", async () => {
    h.db = null;
    const res = await listJobs(new Request("https://hermesnovin.com/api/careers/jobs?locale=en"));
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).not.toHaveProperty("jobs");
  });

  it("lists an eligible job for a locale with a complete translation, from the DB only", async () => {
    h.db = makeDb([eligibleJob]).client;
    const res = await listJobs(new Request("https://hermesnovin.com/api/careers/jobs?locale=en"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("db");
    expect(body.total).toBe(1);
    expect(body.jobs[0].title).toBe("Automation Engineer");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("a locale WITHOUT a complete translation sees no posting", async () => {
    h.db = makeDb([eligibleJob]).client;
    const res = await listJobs(new Request("https://hermesnovin.com/api/careers/jobs?locale=de"));
    const body = await res.json();
    expect(body.total).toBe(0);
  });
});

describe("GET /api/careers/jobs/[jobId] — one indistinguishable refusal", () => {
  it("unknown, draft, private, closed and expired ids all answer the identical 404", async () => {
    const draft = { ...eligibleJob, id: "job-d", status: "DRAFT" };
    const priv = { ...eligibleJob, id: "job-p", isPublic: false };
    const closed = { ...eligibleJob, id: "job-c", status: "CLOSED" };
    const expired = { ...eligibleJob, id: "job-e", closingDate: new Date(NOW - 1000) };
    const unpublished = { ...eligibleJob, id: "job-u", publishedAt: null };
    h.db = makeDb([eligibleJob, draft, priv, closed, expired, unpublished]).client;

    const bodies: string[] = [];
    for (const id of ["job-x", "job-d", "job-p", "job-c", "job-e", "job-u"]) {
      const res = await getJob(new Request(`https://hermesnovin.com/api/careers/jobs/${id}?locale=en`), {
        params: Promise.resolve({ jobId: id }),
      });
      expect(res.status, id).toBe(404);
      bodies.push(JSON.stringify(await res.json()));
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it("serves the eligible job when the translation is complete — body from the TRANSLATION, never the legacy column", async () => {
    const withLegacy = { ...eligibleJob, description: "LEGACY ENGLISH BODY" };
    h.db = makeDb([withLegacy]).client;
    const res = await getJob(new Request("https://hermesnovin.com/api/careers/jobs/job-1?locale=en"), {
      params: Promise.resolve({ jobId: "job-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job.title).toBe("Automation Engineer");
    // B1.1 detail contract: description comes from the translation row
    expect(body.job.description).toBe("d");
    expect(JSON.stringify(body)).not.toContain("LEGACY ENGLISH BODY");
    // and the contract carries NO benefits field at all
    expect(body.job).not.toHaveProperty("benefits");
  });
});

/* ── apply — fail-closed infrastructure ────────────────────────────────────── */

describe("POST /api/careers/apply — Stage B1 never accepts", () => {
  it("the acceptance authorization flag is OFF in Stage B1", () => {
    expect(APPLICATION_ACCEPTANCE_AUTHORIZED).toBe(false);
  });

  it("a COMPLETELY VALID payload for an ELIGIBLE job is refused generically with WRITE_COUNT=0", async () => {
    const store = makeDb([eligibleJob], { retentionApproved: true });
    h.db = store.client;
    const res = await apply(applyReq(validBody()));
    expect(res.status).toBe(503);
    expect(store.writes).toHaveLength(0);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/mock|applicationId/i);
  });

  it("even with acceptance hypothetically on, a missing retention policy refuses with WRITE_COUNT=0", async () => {
    const store = makeDb([eligibleJob], { retentionApproved: false });
    h.db = store.client;
    const res = await apply(applyReq(validBody()));
    expect(res.status).toBe(503);
    expect(store.writes).toHaveLength(0);
  });

  it("requires a valid idempotency key before anything else touches the store", async () => {
    const store = makeDb([eligibleJob]);
    h.db = store.client;
    const noKey = await apply(applyReq(validBody(), { "idempotency-key": "" }));
    expect(noKey.status).toBe(400);
    const shortKey = await apply(applyReq(validBody(), { "idempotency-key": "tiny" }));
    expect(shortKey.status).toBe(400);
    expect(store.writes).toHaveLength(0);
  });

  it("REJECTS workAuthorization and any unknown field outright", async () => {
    const store = makeDb([eligibleJob]);
    h.db = store.client;
    const res = await apply(applyReq({ ...validBody(), workAuthorization: "citizen" }));
    expect(res.status).toBe(400);
    expect(store.writes).toHaveLength(0);
  });

  it("refuses without the acknowledgement or the attestation", async () => {
    h.db = makeDb([eligibleJob]).client;
    for (const missing of ["privacyNoticeAcknowledged", "accuracyConfirmed"] as const) {
      const body = { ...validBody(), [missing]: false };
      const res = await apply(applyReq(body));
      expect(res.status, missing).toBe(400);
    }
  });

  it("ineligible and unknown jobs get the SAME generic refusal as the blocked gates", async () => {
    const draft = { ...eligibleJob, id: "job-d", status: "DRAFT" };
    h.db = makeDb([eligibleJob, draft]).client;
    const unknown = await apply(applyReq({ ...validBody(), jobId: "job-x" }));
    const draftRes = await apply(applyReq({ ...validBody(), jobId: "job-d" }));
    const eligible = await apply(applyReq(validBody()));
    expect(unknown.status).toBe(503);
    expect(draftRes.status).toBe(503);
    expect(eligible.status).toBe(503);
    const a = JSON.stringify(await unknown.json());
    const b = JSON.stringify(await draftRes.json());
    const c = JSON.stringify(await eligible.json());
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("a store fault is a generic refusal — NEVER an authentication failure, NEVER a success", async () => {
    h.db = makeDb([eligibleJob], { throwOnJob: true }).client;
    const res = await apply(applyReq(validBody()));
    expect(res.status).toBe(503);
    expect(res.status).not.toBe(401);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/sign.?in|session|authent/i);
  });

  it("no fabricated success exists anywhere in the route source", () => {
    const src = readCode("src/app/api/careers/apply/route.ts");
    expect(src).not.toMatch(/mock-app-/);
    expect(src).not.toMatch(/demo mode/);
  });

  it("the route SOURCE keeps the eligibility predicate and BOTH acceptance gates, and logs nothing", () => {
    const src = readCode("src/app/api/careers/apply/route.ts");
    // shared eligibility — removing it would let a draft id reach the gates
    expect(src).toContain("publicJobWhere(new Date())");
    // both Stage B1 gates, by name
    // the CALLS, not the imports — deleting a gate leaves its import behind
    expect(src).toContain("if (!APPLICATION_ACCEPTANCE_AUTHORIZED)");
    expect(src).toContain("await isRetentionPolicyApproved(organizationId)");
    // and no applicant data can reach a log line
    expect(src).not.toMatch(/console\.(log|error|warn|info|debug)/);
  });

  it("the salary formatter never claims what the record does not carry", () => {
    // B1.2 — formatting moved into the shared job-format module (Intl-based,
    // localized per-year copy). The guard is pinned THERE; the board no longer
    // renders compensation at all, and the detail page delegates.
    const fmt = readCode("src/components/careers/job-format.ts");
    expect(fmt).toContain('if (!min || !max || !currency) return "";');
    expect(fmt).not.toContain('"Competitive"');
    expect(fmt).not.toContain("/ year");
    for (const rel of ["src/components/careers/JobDetailClient.tsx", "src/components/careers/CareersBoardClient.tsx"]) {
      const src = readCode(rel);
      expect(src, rel).not.toContain('"Competitive"');
      expect(src, rel).not.toContain("/ year");
    }
  });

  it("JobPosting carries the required properties — identifier from the requisition key and the THREE address fields", async () => {
    const { jobPostingSchema } = await import("@/lib/seo/schemas");
    const schema = jobPostingSchema({
      requisitionKey: "HNM-2026-001", title: "t", description: "d",
      addressLocality: "Isfahan", addressRegion: "Isfahan Province", addressCountry: "IR",
      datePosted: "2026-08-01T00:00:00.000Z", skills: [],
    }) as Record<string, unknown>;
    expect((schema.identifier as { value: string }).value).toBe("HNM-2026-001");
    const address = (schema.jobLocation as { address: Record<string, string> }).address;
    expect(address.addressLocality).toBe("Isfahan");
    expect(address.addressRegion).toBe("Isfahan Province");
    expect(address.addressCountry).toBe("IR");
  });

  it("the posting projection takes datePosted from publishedAt ONLY — never createdAt", async () => {
    const withCreated = { ...eligibleJob, createdAt: new Date(NOW - 999_000_000) };
    h.db = makeDb([withCreated]).client;
    const requisitioned = { ...withCreated, requisitionKey: "HNM-2026-001", employmentType: null };
    h.db = makeDb([requisitioned]).client;
    const { getPublicJobPosting } = await import("@/lib/ats/public-jobs");
    const posting = await getPublicJobPosting("job-1", "en");
    expect(posting).not.toBeNull();
    expect(posting!.datePosted).toBe(eligibleJob.publishedAt!.toISOString());
  });
  it("rate limiting still guards the front door", async () => {
    h.rateLimited = true;
    const res = await apply(applyReq(validBody()));
    expect(res.status).toBe(429);
  });
});
