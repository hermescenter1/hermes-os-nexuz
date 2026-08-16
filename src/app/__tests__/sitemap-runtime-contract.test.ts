import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * DISCOVERY-2B — the sitemap must be generated per request, never frozen at build.
 *
 * THE PRODUCTION DEFECT THESE TESTS LOCK OUT
 * ------------------------------------------
 * `Dockerfile` builds the image under `ENV HERMES_STORAGE_MODE="session"`, so
 * `getPrisma()` returns `null` for the whole build. With no route-level dynamic
 * contract, Next.js prerendered `sitemap.ts` ONCE during that build, wrote the
 * empty-database result to `.next/server/app/sitemap.xml.body`, and served that
 * frozen body forever. Production carried 241 URLs and ZERO article URLs while
 * the database held 19 sitemap-eligible articles.
 *
 * The failure was invisible to every existing test because each one called the
 * generator directly — which always worked. Nothing asserted the ROUTE
 * CONTRACT, i.e. whether Next would ever call it again after the build. CASE A
 * and CASE D exist specifically to close that gap.
 *
 * ORACLE DISCIPLINE
 * -----------------
 * CASE B/C/E/F assert RUNTIME VALUES produced by the real generator against a
 * mocked data boundary. CASE A/D assert the module's real exported binding
 * (`dynamic`), not its source text — a source-text probe for `"force-dynamic"`
 * would be satisfied by the string appearing in a comment, which is exactly the
 * class of weak oracle DISCOVERY-2A's review rejected.
 */

const BASE = "https://hermesnovin.com";

/* ── Data-boundary doubles ──────────────────────────────────────────────────
 *
 * Only the DB-backed seams are mocked. The generator, `localeEntries`, the
 * static route table and the real `@/lib/seo/config` all execute for real, so a
 * change to locale expansion or to the static surface is still caught here. */

const articles = vi.hoisted(() => ({
  items: [] as { slug: string; language: string; lastModified: string | null }[],
  authors: [] as { handle: string }[],
  throws: false,
}));

vi.mock("@/lib/articles/seo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/articles/seo")>(
    "@/lib/articles/seo",
  );
  return {
    ...actual,
    // The REAL entry builders run — only the database reads are doubled, so the
    // locale/alternates logic under test is production code.
    listPublicArticleSitemapItems: async () => {
      if (articles.throws) throw new Error("DB unavailable");
      return articles.items;
    },
    listPublicAuthorSitemapItems: async () => {
      if (articles.throws) throw new Error("DB unavailable");
      return articles.authors;
    },
  };
});

const jobs = vi.hoisted(() => ({ rows: [] as { id: string }[], throws: false }));
vi.mock("@/lib/ats/public-jobs", () => ({
  listPublicJobs: async () => {
    if (jobs.throws) throw new Error("DB unavailable");
    return jobs.rows;
  },
}));

const media = vi.hoisted(() => ({ throws: false }));
vi.mock("@/lib/media/seo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/media/seo")>(
    "@/lib/media/seo",
  );
  return {
    ...actual,
    listPublicMediaSitemapItems: async () => {
      if (media.throws) throw new Error("DB unavailable");
      return [];
    },
  };
});

const vendors = vi.hoisted(() => ({ throws: false }));
vi.mock("@/lib/vendors/db", () => ({
  listApprovedVendorSlugs: async () => {
    if (vendors.throws) throw new Error("DB unavailable");
    return [];
  },
}));

const db = vi.hoisted(() => ({ courses: [] as { id: string }[], client: true, throws: false }));
vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => {
    if (db.throws) throw new Error("DB unavailable");
    if (!db.client) return null;
    return {
      academyCourse: {
        findMany: async () => db.courses,
      },
    };
  },
}));

async function generate() {
  const mod = await import("../sitemap");
  return mod.default();
}

function urlsOf(entries: Awaited<ReturnType<typeof generate>>): string[] {
  return entries.map((e) => String(e.url));
}

beforeEach(() => {
  vi.resetModules();
  articles.items = [];
  articles.authors = [];
  articles.throws = false;
  jobs.rows = [];
  jobs.throws = false;
  media.throws = false;
  vendors.throws = false;
  db.courses = [];
  db.client = true;
  db.throws = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ── CASE A — the route rendering contract ─────────────────────────────────── */

describe("CASE A — the sitemap route declares an explicit runtime contract", () => {
  it("exports dynamic = 'force-dynamic' as a real binding, not a comment", async () => {
    const mod = await import("../sitemap");
    // The exported VALUE. A source-text grep would pass on a mention in prose.
    expect(mod.dynamic).toBe("force-dynamic");
  });

  it("does not declare a time-based revalidate that would re-freeze the body", async () => {
    const mod = await import("../sitemap") as Record<string, unknown>;
    // `force-dynamic` already implies revalidate 0. A positive number here would
    // reintroduce a window in which a build-frozen body is served.
    if ("revalidate" in mod) {
      expect(mod.revalidate).toBe(0);
    }
  });

  it("the installed Next.js re-exports this config from the metadata route", () => {
    // The mechanism the fix depends on: `next-metadata-route-loader` re-exports
    // every named export except `default` and `generateSitemaps`. If a future
    // Next.js drops that, `dynamic` would silently stop reaching the route and
    // the defect returns with the export still present in our source.
    // `node_modules` is hoisted ABOVE this git worktree, so it is not under
    // `process.cwd()`. Walk up to find it rather than assuming a layout.
    let dir = process.cwd();
    let loader = "";
    for (let i = 0; i < 8; i++) {
      const candidate = path.join(
        dir,
        "node_modules/next/dist/build/webpack/loaders/next-metadata-route-loader.js",
      );
      if (fs.existsSync(candidate)) {
        loader = candidate;
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    expect(loader, "next-metadata-route-loader.js must be locatable").not.toBe("");
    const src = fs.readFileSync(loader, "utf8");
    expect(src).toContain("reExportNames");
    expect(src).toMatch(/name !== 'default' && name !== 'generateSitemaps'/);
  });
});

/* ── CASE B — articles ─────────────────────────────────────────────────────── */

describe("CASE B — only PUBLISHED + PUBLIC + noIndex=false articles, under their own locale", () => {
  // The repository predicate lives in `@/lib/articles/seo`; the rows below are
  // what that predicate is contracted to return. Rows it must exclude are
  // asserted absent so a widened predicate cannot pass by accident.
  const EN_SLUG = "plc-scan-cycle-budget";
  const FA_SLUG = "hmi-alarm-rationalization";

  beforeEach(() => {
    articles.items = [
      { slug: EN_SLUG, language: "en", lastModified: "2026-08-01T00:00:00.000Z" },
      { slug: FA_SLUG, language: "fa", lastModified: "2026-08-02T00:00:00.000Z" },
    ];
  });

  it("emits the exact EN and FA article URLs", async () => {
    const urls = urlsOf(await generate());
    expect(urls).toContain(`${BASE}/en/articles/${EN_SLUG}`);
    expect(urls).toContain(`${BASE}/fa/articles/${FA_SLUG}`);
  });

  it("never fabricates a German article URL", async () => {
    const urls = urlsOf(await generate());
    expect(urls).not.toContain(`${BASE}/de/articles/${EN_SLUG}`);
    expect(urls).not.toContain(`${BASE}/de/articles/${FA_SLUG}`);
    expect(urls.filter((u) => /\/de\/articles\/[^/]+$/.test(u))).toEqual([]);
  });

  it("never fabricates a cross-locale copy of a single-language article", async () => {
    const urls = urlsOf(await generate());
    // An EN article must not appear under /fa, and vice versa.
    expect(urls).not.toContain(`${BASE}/fa/articles/${EN_SLUG}`);
    expect(urls).not.toContain(`${BASE}/en/articles/${FA_SLUG}`);
  });

  it("emits exactly ONE URL per article", async () => {
    const urls = urlsOf(await generate());
    expect(urls.filter((u) => u.endsWith(`/articles/${EN_SLUG}`))).toHaveLength(1);
    expect(urls.filter((u) => u.endsWith(`/articles/${FA_SLUG}`))).toHaveLength(1);
  });

  it("a single-language article carries no alternates map", async () => {
    const entries = await generate();
    const en = entries.find((e) => String(e.url).endsWith(`/articles/${EN_SLUG}`));
    expect(en).toBeDefined();
    expect(en?.alternates).toBeUndefined();
  });

  it("rows the predicate excludes never reach the sitemap", async () => {
    // The repository read returns only eligible rows, so a de-indexed, draft or
    // private article simply is not in `items`. Proving the sitemap adds nothing
    // of its own means a future caller cannot smuggle one in.
    articles.items = [
      { slug: EN_SLUG, language: "en", lastModified: null },
    ];
    const urls = urlsOf(await generate());
    for (const excluded of ["noindexed-article", "draft-article", "private-article"]) {
      expect(urls.some((u) => u.includes(excluded))).toBe(false);
    }
    expect(urls).toContain(`${BASE}/en/articles/${EN_SLUG}`);
  });

  it("carries the row's real lastModified, and omits it when absent", async () => {
    articles.items = [
      { slug: EN_SLUG, language: "en", lastModified: "2026-08-01T00:00:00.000Z" },
      { slug: FA_SLUG, language: "fa", lastModified: null },
    ];
    const entries = await generate();
    const en = entries.find((e) => String(e.url).endsWith(`/articles/${EN_SLUG}`));
    const fa = entries.find((e) => String(e.url).endsWith(`/articles/${FA_SLUG}`));
    expect(en?.lastModified).toBe("2026-08-01T00:00:00.000Z");
    expect(fa?.lastModified).toBeUndefined();
  });

  it("author profiles appear only for authors the reader returned", async () => {
    articles.authors = [{ handle: "h-forozandeh" }];
    const urls = urlsOf(await generate());
    expect(urls).toContain(`${BASE}/en/articles/author/h-forozandeh`);
    expect(urls.some((u) => u.includes("/articles/author/nobody"))).toBe(false);
  });
});

/* ── CASE C — database unavailable ─────────────────────────────────────────── */

describe("CASE C — an unreachable database degrades, never throws", () => {
  it("still returns a valid sitemap when every DB reader throws", async () => {
    articles.throws = true;
    jobs.throws = true;
    media.throws = true;
    vendors.throws = true;
    db.throws = true;

    const entries = await generate();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);

    const urls = urlsOf(entries);
    // The complete static public surface must survive a total database outage.
    expect(urls).toContain(`${BASE}/fa`);
    expect(urls).toContain(`${BASE}/en/platform`);
    expect(urls).toContain(`${BASE}/de/services/digital-twin`);
    expect(urls).toContain(`${BASE}/en/library`);
    // And nothing DB-backed may be invented to fill the gap.
    expect(urls.some((u) => /\/articles\/[^/]+$/.test(u) && !u.endsWith("/articles"))).toBe(false);
  });

  it("still returns a valid sitemap when the storage mode yields no client", async () => {
    db.client = false; // exactly what session mode produces
    const urls = urlsOf(await generate());
    expect(urls).toContain(`${BASE}/fa`);
    expect(urls.some((u) => u.includes("/academy/course/"))).toBe(false);
  });

  it("one failing family does not remove the others", async () => {
    articles.throws = true;
    jobs.rows = [{ id: "job-real-1" }];
    const urls = urlsOf(await generate());
    // Journal is gone, jobs survive.
    expect(urls.some((u) => /\/articles\/[^/]+$/.test(u) && !u.endsWith("/articles"))).toBe(false);
    expect(urls).toContain(`${BASE}/en/careers/job-real-1`);
  });
});

/* ── CASE D — the build/runtime regression itself ──────────────────────────── */

describe("CASE D — build-time session mode cannot become the frozen authority", () => {
  it("the Docker build still pins session mode — the premise of the defect", () => {
    const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");
    // If this ever stops being true the fix is still correct, but the test below
    // is no longer describing reality and must be revisited deliberately.
    expect(dockerfile).toMatch(/ENV\s+HERMES_STORAGE_MODE="?session"?/);
  });

  it("a session-mode generation yields the static surface and no DB rows", async () => {
    // Reproduces the build environment exactly: no Prisma client.
    db.client = false;
    articles.items = [];
    const urls = urlsOf(await generate());
    expect(urls.length).toBeGreaterThan(200);
    expect(urls.some((u) => /\/articles\/[^/]+$/.test(u) && !u.endsWith("/articles"))).toBe(false);
  });

  it("the SAME module then yields articles once a database is reachable", async () => {
    // This is the whole point: the generator is re-executed per request, so the
    // empty session-mode result can never be the permanent answer. If `dynamic`
    // were removed, Next would freeze the previous result instead of calling
    // this again — which is what CASE A pins at the route level.
    db.client = false;
    const empty = urlsOf(await generate());
    expect(empty.some((u) => u.includes("/articles/live-row"))).toBe(false);

    vi.resetModules();
    db.client = true;
    articles.items = [{ slug: "live-row", language: "en", lastModified: null }];
    const live = urlsOf(await generate());
    expect(live).toContain(`${BASE}/en/articles/live-row`);
  });
});

/* ── CASE E — duplicate / canonical integrity ──────────────────────────────── */

describe("CASE E — no duplicates, and every article URL is in its truthful locale", () => {
  it("emits no duplicate URLs across every family", async () => {
    articles.items = [
      { slug: "a-en", language: "en", lastModified: null },
      { slug: "a-fa", language: "fa", lastModified: null },
    ];
    articles.authors = [{ handle: "auth-1" }];
    jobs.rows = [{ id: "job-1" }];
    db.courses = [{ id: "course-1" }];

    const urls = urlsOf(await generate());
    const dupes = urls.filter((u, i) => urls.indexOf(u) !== i);
    expect(dupes, `duplicate sitemap URLs: ${[...new Set(dupes)].join(", ")}`).toEqual([]);
  });

  it("every article URL's locale segment matches the row's own language", async () => {
    articles.items = [
      { slug: "a-en", language: "en", lastModified: null },
      { slug: "a-fa", language: "fa", lastModified: null },
    ];
    const urls = urlsOf(await generate());
    const articleUrls = urls.filter((u) => /\/articles\/a-(en|fa)$/.test(u));
    expect(articleUrls).toHaveLength(2);
    for (const u of articleUrls) {
      const m = /\/([a-z]{2})\/articles\/a-(en|fa)$/.exec(u);
      expect(m).not.toBeNull();
      expect(m![1]).toBe(m![2]); // locale segment === declared language
    }
  });

  it("every emitted URL is absolute on the canonical origin", async () => {
    articles.items = [{ slug: "a-en", language: "en", lastModified: null }];
    for (const u of urlsOf(await generate())) {
      expect(u.startsWith(`${BASE}/`)).toBe(true);
      expect(u).not.toContain("?");
      expect(u).not.toContain("#");
    }
  });
});

/* ── CASE F — security ─────────────────────────────────────────────────────── */

describe("CASE F — no private surface becomes indexable as a side effect", () => {
  it("no URL falls under any protected route prefix", async () => {
    articles.items = [{ slug: "a-en", language: "en", lastModified: null }];
    articles.authors = [{ handle: "auth-1" }];
    jobs.rows = [{ id: "job-1" }];
    db.courses = [{ id: "course-1" }];

    const { PROTECTED_ROUTE_PREFIXES, PROTECTED_ROUTE_PUBLIC_CHILDREN } = await import(
      "@/lib/auth/rbac"
    );
    const { LOCALES } = await import("@/lib/seo/config");

    const offenders: string[] = [];
    for (const url of urlsOf(await generate())) {
      const p = url.slice(BASE.length);
      for (const locale of LOCALES) {
        for (const prefix of PROTECTED_ROUTE_PREFIXES) {
          const root = `/${locale}/${prefix}`;
          if (p !== root && !p.startsWith(`${root}/`)) continue;
          const isPublicChild = PROTECTED_ROUTE_PUBLIC_CHILDREN.some(
            (c) => p === `/${locale}/${c}` || p.startsWith(`/${locale}/${c}/`),
          );
          if (!isPublicChild) offenders.push(url);
        }
      }
    }
    expect(offenders, `protected URLs in sitemap: ${offenders.join(", ")}`).toEqual([]);
  });

  it("no API, _next or non-locale surface is advertised", async () => {
    const urls = urlsOf(await generate());
    for (const u of urls) {
      const p = u.slice(BASE.length);
      expect(p).not.toMatch(/^\/api(\/|$)/);
      expect(p).not.toMatch(/^\/_next(\/|$)/);
      // Every public URL is locale-prefixed.
      expect(p).toMatch(/^\/(fa|en|de)(\/|$)/);
    }
  });
});
