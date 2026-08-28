import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { jobPostingSchema } from "@/lib/seo/schemas";

// `careers/[jobId]/page.tsx` pulls in the client careers components, which
// reach next-intl's client navigation factory. Only `generateMetadata` is
// exercised here, so those surfaces are stubbed.
vi.mock("@/i18n/navigation", () => ({
  Link: () => null,
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  getPathname: vi.fn(),
  redirect: vi.fn(),
}));

// Resolved against the REAL catalogs: the assertions below check that nothing
// from the fixture leaked into the emitted metadata, which only means something
// if the metadata is built from genuine copy.
vi.mock("next-intl/server", async () => {
  const fs = await import("node:fs");
  const nodePath = await import("node:path");
  const root = nodePath.resolve(__dirname, "../../../..");
  const load = (locale: string) =>
    JSON.parse(fs.readFileSync(nodePath.join(root, "messages", `${locale}.json`), "utf8"));
  return {
    setRequestLocale: () => {},
    getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
      const scope = namespace
        .split(".")
        .reduce<Record<string, unknown>>((acc, k) => acc[k] as Record<string, unknown>, load(locale));
      const t = (key: string) => String(scope[key] ?? `${namespace}.${key}`);
      t.raw = (key: string) => scope[key];
      return t;
    },
  };
});

/**
 * DISCOVERY-2A — CASE F.
 *
 * `src/lib/ats/mock-data.ts` is a development fixture holding five invented
 * vacancies with invented salary bands (EUR 65–85k, USD 85–120k), invented
 * cities (Frankfurt, Dubai), invented visa sponsorship and invented posting
 * dates. Three PUBLIC DISCOVERY SURFACES imported it directly:
 *
 *   - the sitemap advertised fifteen `/careers/{id}` URLs;
 *   - the job detail page emitted `JobPosting` structured data — the format
 *     Google Jobs ingests — carrying those numbers as fact;
 *   - the admin SEO dashboard counted them as real routes.
 *
 * An authoritative source existed the whole time (`AtsJob` +
 * `getPublicJobs()`), and the `/api/careers` routes already preferred it. The
 * defect was that the surfaces search engines read never consulted it.
 *
 * This test is a STATIC IMPORT AUDIT rather than a behavioural one: the failure
 * mode is a developer adding one import line, and no runtime assertion catches
 * that as directly as reading the file does.
 */

const SRC = path.resolve(__dirname, "../../..");

/** Modules whose output is read by a search engine. */
const DISCOVERY_SURFACES = [
  "app/sitemap.ts",
  "app/robots.ts",
  "app/llms.txt/route.ts",
  "app/[locale]/careers/[jobId]/page.tsx",
  "app/[locale]/careers/page.tsx",
  "app/[locale]/admin/seo/page.tsx",
  "lib/seo/schemas.ts",
  "lib/seo/metadata.ts",
  "lib/ats/public-jobs.ts",
] as const;

function read(rel: string): string {
  const file = path.join(SRC, rel);
  expect(fs.existsSync(file), `${rel} must exist`).toBe(true);
  return fs.readFileSync(file, "utf8");
}

/**
 * Source with comments removed.
 *
 * The files that were FIXED document what they used to import, so a naive text
 * search finds the fixture path inside a `/* … *\/` block and reports the very
 * file that closed the hole. An import audit must look at code, not at prose.
 */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("F1 — no public discovery surface imports the ATS fixture", () => {
  it.each(DISCOVERY_SURFACES)("%s does not import @/lib/ats/mock-data", (rel) => {
    const src = code(rel);
    expect(src).not.toMatch(/from\s+["'][^"']*ats\/mock-data["']/);
    expect(src).not.toMatch(/import\(\s*["'][^"']*ats\/mock-data["']\s*\)/);
    expect(src).not.toMatch(/require\(\s*["'][^"']*ats\/mock-data["']\s*\)/);
  });

  it("the comment-stripper does not blind the audit", () => {
    // If `code()` ever stripped too much, every assertion above would pass
    // vacuously. Prove it still sees a real import statement.
    expect(code("app/sitemap.ts")).toMatch(/from\s+["']@\/lib\/industrial\/cases["']/);
  });

  it("the fixture still exists — this phase did not delete a legitimate dev fixture", () => {
    // Ten internal consumers (the authenticated /api/ats/* routes and the
    // careers API's documented development fallback) still use it. The boundary
    // is about DISCOVERY, not about deleting fixtures.
    expect(fs.existsSync(path.join(SRC, "lib/ats/mock-data.ts"))).toBe(true);
  });
});

describe("F2 — the discovery surfaces read the authoritative source", () => {
  it("the sitemap reads AtsJob through @/lib/ats/public-jobs", () => {
    expect(read("app/sitemap.ts")).toContain("@/lib/ats/public-jobs");
  });

  it("the job detail page reads AtsJob through @/lib/ats/public-jobs", () => {
    expect(read("app/[locale]/careers/[jobId]/page.tsx")).toContain("@/lib/ats/public-jobs");
  });

  it("the admin SEO dashboard counts authoritative jobs", () => {
    expect(read("app/[locale]/admin/seo/page.tsx")).toContain("listPublicJobs");
  });

  it("public-jobs applies the public predicate and never falls back", async () => {
    const mod = await import("../public-jobs");
    const base = {
      id: "j1",
      location: "Isfahan, Iran",
      organizationId: "o1",
      title: "t",
      description: "d",
      requirements: [],
      responsibilities: [],
      benefits: [],
      skills: [],
      addressLocality: "Isfahan",
      addressRegion: "Isfahan Province",
      addressCountry: "IR",
      locationType: "onsite",
      department: "Automation",
      salaryCurrency: "EUR",
      salaryMin: null,
      salaryMax: null,
      closingDate: null,
      postedById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // PHASE 104-B1 — the public contract is STRICTER now: OPEN + isPublic
    // alone no longer suffice. A row must also carry a real, non-future
    // publishedAt, and an expired closingDate withdraws it.
    const now = new Date("2026-08-24T12:00:00.000Z");
    const published = new Date("2026-08-01T00:00:00.000Z");
    const open = { ...base, status: "OPEN", isPublic: true };

    expect(mod.isPubliclyListedJob({ ...open, publishedAt: published }, now)).toBe(true);
    // No publishedAt → not public, even when OPEN + isPublic.
    expect(mod.isPubliclyListedJob(open, now)).toBe(false);
    // A FUTURE publishedAt is not a publication.
    expect(mod.isPubliclyListedJob({ ...open, publishedAt: new Date("2026-09-01T00:00:00.000Z") }, now)).toBe(false);
    // An expired closingDate withdraws the posting.
    expect(
      mod.isPubliclyListedJob(
        { ...open, publishedAt: published, closingDate: new Date("2026-08-10T00:00:00.000Z") },
        now,
      ),
    ).toBe(false);
    expect(mod.isPubliclyListedJob({ ...base, status: "DRAFT", isPublic: true, publishedAt: published }, now)).toBe(false);
    expect(mod.isPubliclyListedJob({ ...base, status: "CLOSED", isPublic: true, publishedAt: published }, now)).toBe(false);
    expect(mod.isPubliclyListedJob({ ...base, status: "OPEN", isPublic: false, publishedAt: published }, now)).toBe(false);
  });

  it("public discovery FAILS EMPTY when the database is unreachable", async () => {
    // In the test environment `getPrisma()` yields no client, so `getPublicJobs`
    // returns null. The contract is that this becomes `[]` — never the fixture.
    const { listPublicJobs, getPublicJobById } = await import("../public-jobs");
    await expect(listPublicJobs()).resolves.toEqual([]);
    // "job-001" is a real id IN THE FIXTURE. It must not resolve here.
    await expect(getPublicJobById("job-001")).resolves.toBeNull();
  });
});

describe("F3 — JobPosting never publishes a value the source cannot back", () => {
  it("omits baseSalary when either bound is null", () => {
    const schema = jobPostingSchema({
      requisitionKey: "HNM-TEST-001",
      title: "Senior PLC Engineer",
      description: "d",
      addressLocality: "Isfahan",
      addressRegion: "Isfahan Province",
      addressCountry: "IR",
      currency: "EUR",
      salaryMin: null,
      salaryMax: null,
      datePosted: "2026-01-01T00:00:00.000Z",
      skills: ["PLC"],
    });
    expect(schema).not.toHaveProperty("baseSalary");
  });

  it("emits baseSalary only when currency and both bounds are present", () => {
    const schema = jobPostingSchema({
      requisitionKey: "HNM-TEST-001",
      title: "t",
      description: "d",
      addressLocality: "Isfahan",
      addressRegion: "Isfahan Province",
      addressCountry: "IR",
      currency: "EUR",
      salaryMin: 65000,
      salaryMax: 85000,
      datePosted: "2026-01-01T00:00:00.000Z",
      skills: [],
    });
    expect(schema).toHaveProperty("baseSalary");
  });

  it("omits employmentType when the record has no owner-approved value", () => {
    // `AtsJob` has `locationType` (onsite/remote/hybrid) and NO employment-type
    // column. The old builder defaulted an unknown contract to FULL_TIME, which
    // published a term the platform had never been told.
    const schema = jobPostingSchema({
      requisitionKey: "HNM-TEST-001",
      title: "t",
      description: "d",
      addressLocality: "Isfahan",
      addressRegion: "Isfahan Province",
      addressCountry: "IR",
      datePosted: "2026-01-01T00:00:00.000Z",
      skills: [],
    });
    expect(schema).not.toHaveProperty("employmentType");
  });

  it("an unrecognised contract type is dropped, not defaulted to FULL_TIME", () => {
    const schema = jobPostingSchema({
      requisitionKey: "HNM-TEST-001",
      title: "t",
      description: "d",
      addressLocality: "Isfahan",
      addressRegion: "Isfahan Province",
      addressCountry: "IR",
      employmentType: "who-knows",
      datePosted: "2026-01-01T00:00:00.000Z",
      skills: [],
    });
    expect(schema).not.toHaveProperty("employmentType");
  });

  it("carries validThrough when the source has a closing date", () => {
    const schema = jobPostingSchema({
      requisitionKey: "HNM-TEST-001",
      title: "t",
      description: "d",
      addressLocality: "Isfahan",
      addressRegion: "Isfahan Province",
      addressCountry: "IR",
      datePosted: "2026-01-01T00:00:00.000Z",
      validThrough: "2026-03-01T00:00:00.000Z",
      skills: [],
    });
    expect(schema.validThrough).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("F4 — a fixture-only job page is never indexable", () => {
  it("generateMetadata answers noindex when no authoritative job exists", async () => {
    const { generateMetadata } = await import("@/app/[locale]/careers/[jobId]/page");
    const meta = await generateMetadata({
      params: Promise.resolve({ locale: "en", jobId: "job-001" }),
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
    // A noindex page must not also advertise a canonical URL.
    expect(meta.alternates).toBeUndefined();
    // Nothing from the fixture leaked into the tab title.
    const serialised = JSON.stringify(meta);
    expect(serialised).not.toContain("Frankfurt");
    expect(serialised).not.toContain("85000");
  });
});
