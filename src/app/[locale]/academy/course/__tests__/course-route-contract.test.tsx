import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator } from "next-intl";
import en from "../../../../../../messages/en.json";

/**
 * SPRINT 1C-A - `/[locale]/academy/course/[courseId]` answers from evidence.
 *
 * THE DEFECT THIS PINS SHUT
 * -------------------------
 * Measured against production on 2026-09-28:
 *
 *     GET /fa/academy/course/sprint1b-synthetic-invalid-id  ->  HTTP 200
 *       <meta name="robots" content="index, follow">
 *       <link rel="canonical" href=".../fa/academy/course/sprint1b-synthetic-invalid-id">
 *       three <link rel="alternate" hreflang="...">
 *       Course + BreadcrumbList JSON-LD named from a generic fallback string
 *
 * The route had no existence check, so every arbitrary path segment minted an
 * indexable URL carrying a `Course` entity for a course that does not exist.
 *
 * WHAT THIS FILE PROVES, BEHAVIOURALLY
 * ------------------------------------
 * The REAL route module and the REAL `@/lib/academy/public-course` reader run
 * against a Prisma double whose `findFirst` records the `where` clause it was
 * given. Nothing is stubbed at the decision boundary, so a regression that
 * reinstates the fallback page, drops the publication predicate, or collapses
 * an outage into a 404 fails here rather than in production.
 *
 *   A. a confirmed miss is a real 404 with no indexable metadata, no canonical,
 *      no hreflang and no structured data;
 *   B. an unpublished and a soft-deleted row are the SAME answer as a miss -
 *      the URL is not an existence oracle;
 *   C. a confirmed public course keeps its real metadata and publishes a
 *      `Course` whose name is the row's own title, never a catalog fallback;
 *   D. an outage is never a 404 and never an indexable generic course.
 */

const MESSAGES = en as unknown as Record<string, unknown>;
const NOT_FOUND = "NEXT_NOT_FOUND_SENTINEL";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error(NOT_FOUND);
  },
}));

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async ({ locale, namespace }: { locale?: string; namespace?: string } = {}) =>
    createTranslator({
      locale: locale ?? "en",
      messages: MESSAGES as never,
      namespace: (namespace ?? "meta") as never,
    }),
}));

// The course body is a client component with its own data fetching; this suite
// is about what the SERVER asserts around it, so it is replaced by a marker.
vi.mock("@/components/academy/CourseDetailClient", () => ({
  CourseDetailClient: ({ courseId }: { courseId: string }) => (
    <div data-testid="course-body" data-course-id={courseId} />
  ),
}));

/** Row shape the double stores; only the columns the route reads. */
interface Row {
  id: string;
  title: string;
  description: string;
  isPublished: boolean;
  deletedAt: Date | null;
}

const store = vi.hoisted(() => ({
  mode: "up" as "up" | "no-client" | "getPrisma-throws" | "query-throws",
  rows: [] as Row[],
  /** Every `where` clause the route caused to be issued. */
  queries: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => {
    if (store.mode === "getPrisma-throws") throw new Error("adapter init failed");
    if (store.mode === "no-client") return null;
    return {
      academyCourse: {
        findFirst: async (args: { where: Record<string, unknown> }) => {
          store.queries.push(args.where);
          if (store.mode === "query-throws") throw new Error("connection reset");
          const w = args.where as { id: string; isPublished?: boolean; deletedAt?: null };
          const row = store.rows.find((r) => r.id === w.id) ?? null;
          if (!row) return null;
          // The double honours the predicate it was GIVEN rather than
          // re-implementing visibility: a route that stopped sending the
          // predicate would start seeing hidden rows and fail case B.
          if (w.isPublished === true && !row.isPublished) return null;
          if (w.deletedAt === null && row.deletedAt !== null) return null;
          return row;
        },
      },
    };
  },
}));

const PUBLIC_ID = "course-public-1";
const DRAFT_ID = "course-draft-1";
const DELETED_ID = "course-deleted-1";
const SYNTHETIC_ID = "sprint1b-synthetic-invalid-id";

const PUBLIC_TITLE = "Industrial Alarm Rationalisation";
const PUBLIC_DESC =
  "Alarm philosophy, rationalisation and performance review for plant operations.";

function seed() {
  store.mode = "up";
  store.queries = [];
  store.rows = [
    { id: PUBLIC_ID, title: PUBLIC_TITLE, description: PUBLIC_DESC, isPublished: true, deletedAt: null },
    { id: DRAFT_ID, title: "Unreleased Draft", description: "Not published.", isPublished: false, deletedAt: null },
    {
      id: DELETED_ID,
      title: "Withdrawn Course",
      description: "Soft deleted.",
      isPublished: true,
      deletedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];
}

type Meta = {
  title?: unknown;
  description?: unknown;
  robots?: { index?: boolean; follow?: boolean };
  alternates?: { canonical?: unknown; languages?: unknown };
};

type PageFn = (a: { params: Promise<{ locale: string; courseId: string }> }) => Promise<React.ReactElement>;

async function meta(locale: string, courseId: string): Promise<Meta> {
  const { generateMetadata } = await import("../[courseId]/page");
  return (await generateMetadata({ params: Promise.resolve({ locale, courseId }) })) as Meta;
}

/** Render the page; returns markup, or the sentinel when it 404s. */
async function render(locale: string, courseId: string): Promise<{ markup: string | null; notFound: boolean }> {
  const mod = await import("../[courseId]/page");
  const Page = mod.default as unknown as PageFn;
  try {
    const el = await Page({ params: Promise.resolve({ locale, courseId }) });
    return { markup: renderToStaticMarkup(el), notFound: false };
  } catch (e) {
    if (e instanceof Error && e.message === NOT_FOUND) return { markup: null, notFound: true };
    throw e;
  }
}

/** The JSON-LD blocks the page actually emitted, parsed back. */
function jsonLd(markup: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup)) !== null) {
    out.push(JSON.parse(m[1].replace(/\\u003c/g, "<")) as Record<string, unknown>);
  }
  return out;
}

const FALLBACK_TITLE = (MESSAGES.meta as { pages: { academyCourse: { fallbackTitle: string } } })
  .pages.academyCourse.fallbackTitle;

beforeEach(() => {
  seed();
});

describe("A - a confirmed miss is a real 404 and asserts nothing", () => {
  it("the measured synthetic identifier 404s instead of rendering", async () => {
    const r = await render("fa", SYNTHETIC_ID);
    expect(r.notFound).toBe(true);
    expect(r.markup).toBeNull();
  });

  it("its metadata is noindex, nofollow", async () => {
    const m = await meta("fa", SYNTHETIC_ID);
    expect(m.robots).toEqual({ index: false, follow: false });
  });

  it("it emits NO canonical and NO hreflang - not even the inherited ones", async () => {
    const m = await meta("fa", SYNTHETIC_ID);
    // `alternates: {}` is the load-bearing detail: Next merges metadata per key
    // across the segment chain, so an ABSENT key would silently inherit the
    // Academy layout's canonical and language map onto a 404.
    expect(m.alternates).toBeDefined();
    expect(m.alternates?.canonical).toBeUndefined();
    expect(m.alternates?.languages).toBeUndefined();
  });

  it("holds for every active locale", async () => {
    for (const locale of ["fa", "en", "de"]) {
      const m = await meta(locale, SYNTHETIC_ID);
      expect(m.robots, locale).toEqual({ index: false, follow: false });
      expect(m.alternates?.canonical, locale).toBeUndefined();
      expect((await render(locale, SYNTHETIC_ID)).notFound, locale).toBe(true);
    }
  });

  it("an empty identifier is a miss without consulting the store", async () => {
    store.queries = [];
    const r = await render("en", "");
    expect(r.notFound).toBe(true);
    expect(store.queries).toHaveLength(0);
  });
});

describe("B - unpublished and soft-deleted answer exactly like a miss", () => {
  it("an unpublished course 404s", async () => {
    expect((await render("en", DRAFT_ID)).notFound).toBe(true);
  });

  it("a soft-deleted course 404s", async () => {
    expect((await render("en", DELETED_ID)).notFound).toBe(true);
  });

  it("neither can emit indexable metadata or structured data", async () => {
    for (const id of [DRAFT_ID, DELETED_ID]) {
      const m = await meta("en", id);
      expect(m.robots, id).toEqual({ index: false, follow: false });
      expect(m.alternates?.canonical, id).toBeUndefined();
      expect((await render("en", id)).markup, id).toBeNull();
    }
  });

  it("the route issues the publication predicate, so hidden rows are excluded in the QUERY", async () => {
    store.queries = [];
    await render("en", DRAFT_ID);
    expect(store.queries.length).toBeGreaterThan(0);
    for (const w of store.queries) {
      expect(w).toMatchObject({ isPublished: true, deletedAt: null });
    }
  });
});

describe("C - a confirmed public course keeps its real identity", () => {
  it("metadata is indexable, self-canonical and titled from the row", async () => {
    const m = await meta("en", PUBLIC_ID);
    expect(m.robots).toMatchObject({ index: true, follow: true });
    expect(m.alternates?.canonical).toBe(
      `https://hermesnovin.com/en/academy/course/${PUBLIC_ID}`,
    );
    expect(String(m.title)).toContain(PUBLIC_TITLE);
    expect(String(m.title)).not.toBe(FALLBACK_TITLE);
    expect(m.description).toBe(PUBLIC_DESC);
  });

  it("every active locale is offered as an alternate for a fully-catalogued page", async () => {
    const m = await meta("de", PUBLIC_ID);
    expect(Object.keys(m.alternates?.languages as Record<string, string>).sort())
      .toEqual(["de", "en", "fa", "x-default"]);
  });

  it("the Course entity is named from the row, never from the catalog fallback", async () => {
    const r = await render("en", PUBLIC_ID);
    expect(r.notFound).toBe(false);
    const course = jsonLd(r.markup!).find((b) => b["@type"] === "Course");
    expect(course).toBeDefined();
    expect(course!.name).toBe(PUBLIC_TITLE);
    expect(course!.name).not.toBe(FALLBACK_TITLE);
    expect(course!.description).toBe(PUBLIC_DESC);
    expect(course!.url).toBe(`https://hermesnovin.com/en/academy/course/${PUBLIC_ID}`);
  });

  it("the breadcrumb trail names the real course, and the body renders", async () => {
    const r = await render("en", PUBLIC_ID);
    const crumbs = jsonLd(r.markup!).find((b) => b["@type"] === "BreadcrumbList");
    expect(crumbs).toBeDefined();
    const items = crumbs!.itemListElement as { position: number; name: string }[];
    expect(items.at(-1)!.name).toBe(PUBLIC_TITLE);
    expect(r.markup).toContain('data-testid="course-body"');
  });

  it("neither entry point reads the course more than once", async () => {
    store.queries = [];
    await meta("en", PUBLIC_ID);
    await render("en", PUBLIC_ID);
    // Two entry points, one query each at most; the shared `react#cache` loader
    // collapses them further inside a real request scope.
    expect(store.queries.length).toBeLessThanOrEqual(2);
  });
});

describe("D - an outage is never a 404 and never an indexable course", () => {
  const OUTAGES = ["no-client", "getPrisma-throws", "query-throws"] as const;

  it.each(OUTAGES)("%s does not produce a false confirmed 404", async (mode) => {
    store.mode = mode;
    const r = await render("en", PUBLIC_ID);
    expect(r.notFound).toBe(false);
    expect(r.markup).toContain('data-testid="course-body"');
  });

  it.each(OUTAGES)("%s fails closed for indexing", async (mode) => {
    store.mode = mode;
    const m = await meta("en", PUBLIC_ID);
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(m.alternates?.canonical).toBeUndefined();
    expect(m.alternates?.languages).toBeUndefined();
  });

  it.each(OUTAGES)("%s emits no structured data at all", async (mode) => {
    store.mode = mode;
    const r = await render("en", PUBLIC_ID);
    expect(jsonLd(r.markup!)).toEqual([]);
  });

  it.each(OUTAGES)("%s cannot publish a generic fallback course", async (mode) => {
    store.mode = mode;
    const r = await render("en", SYNTHETIC_ID);
    expect(r.markup ?? "").not.toContain(FALLBACK_TITLE);
    expect(jsonLd(r.markup ?? "").some((b) => b["@type"] === "Course")).toBe(false);
  });
});
