import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DISCOVERY-2B (query hardening) — every database read reachable from the
 * PUBLIC /sitemap.xml must be explicitly bounded and projection-minimal.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Making the sitemap per-request turned each of these reads from a once-per-
 * image-build query into one an anonymous crawler can trigger at will. An
 * independent review then found two that had no ceiling at all
 * (`getPublicJobs()` — no `take` AND no `select`, and `listApprovedVendorSlugs()`
 * — no `take`), and proved that removing `take: ARTICLE_SITEMAP_MAX` from BOTH
 * article reads still passed 456 tests.
 *
 * THE ORACLE IS THE ARGUMENT OBJECT PASSED TO PRISMA.
 * The pre-existing article test asserted only that `ARTICLE_SITEMAP_MAX` is a
 * positive finite number — which stays true when the query stops using it.
 * Every assertion below inspects the real `findMany` argument, so a ceiling or
 * a projection cannot disappear silently.
 */

/* ── A recording Prisma double ─────────────────────────────────────────────
 *
 * Not a stub that returns canned rows: it captures the exact argument object
 * each model received, which is the thing under test. */

type Args = Record<string, unknown>;

const calls = vi.hoisted(() => ({ byModel: new Map<string, Args[]>() }));

function record(model: string, args: unknown): Args[] {
  const list = calls.byModel.get(model) ?? [];
  list.push((args ?? {}) as Args);
  calls.byModel.set(model, list);
  return [];
}

const prismaDouble = {
  article: { findMany: (a: unknown) => Promise.resolve(record("article", a)) },
  atsJob: { findMany: (a: unknown) => Promise.resolve(record("atsJob", a)) },
  academyCourse: { findMany: (a: unknown) => Promise.resolve(record("academyCourse", a)) },
  mediaAsset: { findMany: (a: unknown) => Promise.resolve(record("mediaAsset", a)) },
  vendorProfile: { findMany: (a: unknown) => Promise.resolve(record("vendorProfile", a)) },
};

// The ONE seam. Every sitemap family reaches Prisma through this module —
// `articles/seo`, `media/seo`, `vendors/db`, `ats/public-jobs` and the inline
// academy read all call `getPrisma()` from here — so a single double captures
// the whole call graph.
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => prismaDouble }));

function argsFor(model: string): Args[] {
  return calls.byModel.get(model) ?? [];
}

/** Every `findMany` argument object recorded during one sitemap generation. */
async function generateAndCollect(): Promise<Map<string, Args[]>> {
  calls.byModel.clear();
  vi.resetModules();
  const mod = await import("../sitemap");
  await mod.default();
  return calls.byModel;
}

beforeEach(() => {
  calls.byModel.clear();
});

/* ── The bound contract, per family ────────────────────────────────────────── */

describe("every sitemap database read passes an explicit numeric take", () => {
  it("generates without touching an unmocked client", async () => {
    const seen = await generateAndCollect();
    // Premise: if nothing was recorded the assertions below would be vacuous.
    expect(seen.size, "no database read was observed at all").toBeGreaterThan(0);
  });

  it("EVERY recorded query carries a finite positive take", async () => {
    const seen = await generateAndCollect();
    const offenders: string[] = [];
    for (const [model, argsList] of seen) {
      argsList.forEach((args, i) => {
        const take = args.take;
        if (typeof take !== "number" || !Number.isFinite(take) || take <= 0) {
          offenders.push(`${model}[${i}] take=${JSON.stringify(take)}`);
        }
      });
    }
    expect(offenders, `unbounded sitemap reads: ${offenders.join(", ")}`).toEqual([]);
  });

  it("EVERY recorded query carries an explicit projection", async () => {
    const seen = await generateAndCollect();
    const offenders: string[] = [];
    for (const [model, argsList] of seen) {
      argsList.forEach((args, i) => {
        // `select` narrows; `include` widens. A sitemap read must never use
        // `include`, and must never omit both (which loads every column).
        if (args.include !== undefined) offenders.push(`${model}[${i}] uses include`);
        if (args.select === undefined) offenders.push(`${model}[${i}] has no select`);
      });
    }
    expect(offenders, `unprojected sitemap reads: ${offenders.join(", ")}`).toEqual([]);
  });

  it("EVERY recorded query is deterministically ordered", async () => {
    // A bounded read without an order is an arbitrary slice: the same request
    // could advertise different URLs each time.
    const seen = await generateAndCollect();
    const offenders: string[] = [];
    for (const [model, argsList] of seen) {
      argsList.forEach((args, i) => {
        if (args.orderBy === undefined) offenders.push(`${model}[${i}]`);
      });
    }
    expect(offenders, `unordered sitemap reads: ${offenders.join(", ")}`).toEqual([]);
  });
});

/* ── Per-family pinning, against the exported constants ────────────────────── */

describe("articles and authors are pinned to ARTICLE_SITEMAP_MAX", () => {
  it("both article reads pass take: ARTICLE_SITEMAP_MAX", async () => {
    const { ARTICLE_SITEMAP_MAX } = await import("@/lib/articles/seo");
    await generateAndCollect();
    const article = argsFor("article");
    // One read for article URLs, one for author profiles.
    expect(article).toHaveLength(2);
    for (const args of article) {
      expect(args.take).toBe(ARTICLE_SITEMAP_MAX);
    }
  });

  it("the article projection stays minimal — no body, no content column", async () => {
    await generateAndCollect();
    const [articles, authors] = argsFor("article");
    expect(articles.select).toEqual({
      slug: true,
      language: true,
      publishedAt: true,
      updatedAt: true,
    });
    expect(authors.select).toEqual({ author: { select: { handle: true } } });
  });

  it("both article reads keep the published+public+indexable predicate", async () => {
    const { ARTICLE_SITEMAP_WHERE } = await import("@/lib/articles/seo");
    await generateAndCollect();
    for (const args of argsFor("article")) {
      expect(args.where).toEqual(ARTICLE_SITEMAP_WHERE);
    }
  });
});

describe("ATS jobs use the sitemap reader, not the shared API reader", () => {
  it("passes take: JOB_SITEMAP_MAX_POSTINGS", async () => {
    const { JOB_SITEMAP_MAX_POSTINGS } = await import("@/lib/ats/public-jobs");
    await generateAndCollect();
    const jobs = argsFor("atsJob");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].take).toBe(JOB_SITEMAP_MAX_POSTINGS);
  });

  it("selects id + the SIX completeness fields per translation — one shared predicate, no Json column", async () => {
    await generateAndCollect();
    const [args] = argsFor("atsJob");
    // B1.2 — completeness is decided by the ONE in-memory primitive
    // (completeLocalesOf, trim-based), so the reader loads exactly the six
    // fields that primitive inspects, plus the language tag. There is NO
    // nested where: a DB-side clause would be a second, drift-prone predicate
    // (the old one accepted whitespace-only values). The job row itself still
    // projects only `id` — no legacy body, no Json payload column.
    const select = args.select as { id?: boolean; translations?: { where?: unknown; select?: Record<string, boolean> } };
    expect(select.id).toBe(true);
    expect(select.translations?.where).toBeUndefined();
    expect(select.translations?.select).toEqual({
      language: true,
      title: true,
      shortSummary: true,
      description: true,
      departmentLabel: true,
      seoTitle: true,
      seoDescription: true,
    });
    const projected = Object.keys(select as Record<string, unknown>);
    for (const heavy of ["description", "requirements", "responsibilities", "benefits", "skills"]) {
      expect(projected, `the JOB row must not load ${heavy}`).not.toContain(heavy);
    }
    const nested = Object.keys(select.translations?.select ?? {});
    for (const heavy of ["responsibilities", "requirements", "preferredExperience", "localizedSkills"]) {
      expect(nested, `the translation row must not load ${heavy}`).not.toContain(heavy);
    }
  });

  it("keeps the exact public eligibility predicate", async () => {
    await generateAndCollect();
    const [args] = argsFor("atsJob");
    // Restated literally: a widened predicate must fail here, not just differ
    // from a helper that was widened alongside it. PHASE 104-B1 made the
    // public contract STRICTER — a job must also be published (non-future)
    // and unexpired before the sitemap may advertise it.
    const where = args.where as Record<string, unknown>;
    expect(where.status).toBe("OPEN");
    expect(where.isPublic).toBe(true);
    expect(where.deletedAt).toBeNull();
    const publishedAt = where.publishedAt as { not: unknown; lte: unknown };
    expect(publishedAt.not).toBeNull();
    expect(publishedAt.lte).toBeInstanceOf(Date);
    const or = where.OR as Array<Record<string, unknown>>;
    expect(or[0]).toEqual({ closingDate: null });
    expect((or[1].closingDate as { gte: unknown }).gte).toBeInstanceOf(Date);
    expect(Object.keys(where).sort()).toEqual(["OR", "deletedAt", "isPublic", "publishedAt", "status"]);
  });
});

describe("vendor profiles are bounded", () => {
  it("passes take: VENDOR_SITEMAP_MAX_PROFILES and selects only slug", async () => {
    const { VENDOR_SITEMAP_MAX_PROFILES } = await import("@/lib/vendors/db");
    await generateAndCollect();
    const vendors = argsFor("vendorProfile");
    expect(vendors).toHaveLength(1);
    expect(vendors[0].take).toBe(VENDOR_SITEMAP_MAX_PROFILES);
    expect(vendors[0].select).toEqual({ slug: true });
  });

  it("keeps the approved + active + not-deleted predicate", async () => {
    await generateAndCollect();
    const [args] = argsFor("vendorProfile");
    expect(args.where).toEqual({ status: "APPROVED", isActive: true, deletedAt: null });
  });
});

describe("academy and media keep their existing ceilings", () => {
  it("academy passes take: ACADEMY_SITEMAP_MAX_COURSES and publishes only published", async () => {
    await generateAndCollect();
    const courses = argsFor("academyCourse");
    expect(courses).toHaveLength(1);
    expect(courses[0].take).toBe(1000);
    expect(courses[0].where).toEqual({ isPublished: true });
    expect(courses[0].select).toEqual({ id: true });
  });

  it("media passes take: MEDIA_SITEMAP_MAX_ASSETS", async () => {
    const { MEDIA_SITEMAP_MAX_ASSETS } = await import("@/lib/media/seo");
    await generateAndCollect();
    const assets = argsFor("mediaAsset");
    expect(assets).toHaveLength(1);
    expect(assets[0].take).toBe(MEDIA_SITEMAP_MAX_ASSETS);
  });
});

/* ── The whole-request budget ──────────────────────────────────────────────── */

describe("the worst-case budget for one /sitemap.xml request is derivable", () => {
  it("issues exactly six database reads", async () => {
    const seen = await generateAndCollect();
    const total = [...seen.values()].reduce((n, l) => n + l.length, 0);
    // articles + authors + jobs + academy + vendors + media
    expect(total).toBe(6);
  });

  it("the worst-case row count equals the sum of the declared ceilings", async () => {
    const { ARTICLE_SITEMAP_MAX } = await import("@/lib/articles/seo");
    const { MEDIA_SITEMAP_MAX_ASSETS } = await import("@/lib/media/seo");
    const { JOB_SITEMAP_MAX_POSTINGS } = await import("@/lib/ats/public-jobs");
    const { VENDOR_SITEMAP_MAX_PROFILES } = await import("@/lib/vendors/db");
    const ACADEMY_MAX = 1000;

    const seen = await generateAndCollect();
    const observed = [...seen.values()]
      .flat()
      .reduce((n, args) => n + (typeof args.take === "number" ? args.take : Number.NaN), 0);

    const declared =
      ARTICLE_SITEMAP_MAX * 2 +
      JOB_SITEMAP_MAX_POSTINGS +
      ACADEMY_MAX +
      VENDOR_SITEMAP_MAX_PROFILES +
      MEDIA_SITEMAP_MAX_ASSETS;

    // Mechanically derived from source constants, never an estimate.
    expect(Number.isFinite(observed)).toBe(true);
    expect(observed).toBe(declared);
  });
});
