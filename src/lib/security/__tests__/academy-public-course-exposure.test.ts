import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * ACADEMY PUBLIC-EXPOSURE REGRESSION SUITE.
 *
 * `GET /api/academy/courses/[id]` already fails closed (Phase 99). Three
 * surfaces around it did not:
 *   1. the public page render      — no isPublished, no deletedAt, no org scope;
 *   2. its `generateMetadata`      — indexable canonical carrying the real title
 *                                    and description of ANY course id;
 *   3. `src/app/sitemap.ts`        — pushed every course id, including drafts,
 *                                    soft-deleted rows and other tenants', to
 *                                    search engines.
 *
 * `AcademyCourse` has no public-visibility column, so the fix is membership
 * based rather than publication based: the page serves member-only content
 * behind exactly the API's predicates, is noindex in every branch, and courses
 * are gone from the sitemap. These tests pin all of that.
 */

const COURSE_TITLE = "Confidential PLC Retrofit Programme";
const COURSE_DESC  = "Internal draft — plant B commissioning secrets";

type CourseOver = Record<string, unknown>;
const course = (over: CourseOver = {}) => ({
  id: "course-1",
  organizationId: "org-A",
  title: COURSE_TITLE,
  slug: "confidential",
  description: COURSE_DESC,
  category: "industrial",
  level: "advanced",
  estimatedHours: 4,
  thumbnailUrl: null,
  isPublished: true,
  isFeatured: false,
  enrollmentType: "open",
  certificateEnabled: true,
  passingScore: 80,
  instructorName: null,
  instructorBio: null,
  ...over,
});

// ── 1. The gate itself ────────────────────────────────────────────────────────

describe("resolveAcademyCourseForViewer — the page gate mirrors the API predicates", () => {
  function mockGate(opts: {
    token?: string | null;
    payload?: { sub: string; role: string; sid?: string } | null;
    sessionActive?: boolean;
    orgId?: string | null;
    course?: CourseOver | null;
    cookiesThrow?: boolean;
  }) {
    vi.doMock("next/headers", () => ({
      cookies: async () => {
        if (opts.cookiesThrow) throw new Error("cookies() outside a request scope");
        return { get: () => (opts.token ? { value: opts.token } : undefined) };
      },
    }));
    vi.doMock("@/lib/auth/jwt", () => ({
      verifyAccessToken: async () => opts.payload ?? null,
    }));
    vi.doMock("@/lib/auth/session-store", () => ({
      isPayloadSessionActive: async () => opts.sessionActive ?? true,
    }));
    vi.doMock("@/lib/academy/request-scope", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/academy/request-scope")>()),
      resolveActiveOrgIdForUser: async () => opts.orgId ?? null,
    }));
    vi.doMock("@/lib/academy/db", () => ({
      getCourseById: async () => opts.course ?? null,
    }));
  }

  async function resolve() {
    const { resolveAcademyCourseForViewer } = await import("@/lib/academy/page-access");
    return resolveAcademyCourseForViewer("course-1");
  }

  const member = { sub: "u1", role: "viewer" };
  const admin  = { sub: "u1", role: "admin" };

  beforeEach(() => vi.resetModules());

  it("denies an anonymous visitor (no access-token cookie)", async () => {
    mockGate({ token: null, orgId: "org-A", course: course() });
    expect(await resolve()).toBeNull();
  });

  it("denies an unverifiable access token", async () => {
    mockGate({ token: "t", payload: null, orgId: "org-A", course: course() });
    expect(await resolve()).toBeNull();
  });

  it("denies a REVOKED session even with a structurally valid token", async () => {
    mockGate({ token: "t", payload: { ...member, sid: "s1" }, sessionActive: false, orgId: "org-A", course: course() });
    expect(await resolve()).toBeNull();
  });

  it("denies a caller with no ACTIVE organization membership", async () => {
    mockGate({ token: "t", payload: member, orgId: null, course: course() });
    expect(await resolve()).toBeNull();
  });

  it("denies a course owned by ANOTHER organization", async () => {
    mockGate({ token: "t", payload: member, orgId: "org-B", course: course() });
    expect(await resolve()).toBeNull();
  });

  it("denies an UNPUBLISHED course to a non-admin member of the owning org", async () => {
    mockGate({ token: "t", payload: member, orgId: "org-A", course: course({ isPublished: false }) });
    expect(await resolve()).toBeNull();
  });

  it("denies a soft-deleted course (getCourseById filters deletedAt and returns null)", async () => {
    mockGate({ token: "t", payload: member, orgId: "org-A", course: null });
    expect(await resolve()).toBeNull();
  });

  it("denies — never allows — when the gate cannot evaluate itself", async () => {
    mockGate({ cookiesThrow: true, orgId: "org-A", course: course() });
    expect(await resolve()).toBeNull();
  });

  it("allows a published course to a member of the owning organization", async () => {
    mockGate({ token: "t", payload: member, orgId: "org-A", course: course() });
    expect((await resolve())?.id).toBe("course-1");
  });

  it("allows an UNPUBLISHED course to an admin of the owning organization", async () => {
    mockGate({ token: "t", payload: admin, orgId: "org-A", course: course({ isPublished: false }) });
    expect((await resolve())?.id).toBe("course-1");
  });
});

// ── 2. The page render + its metadata ────────────────────────────────────────

describe("academy course page — render and metadata fail closed", () => {
  const FALLBACK_TITLE = "Industrial Course";
  const FALLBACK_DESC  = "Generic academy description";

  function mockPage(viewable: ReturnType<typeof course> | null) {
    vi.doMock("@/lib/academy/page-access", () => ({
      resolveAcademyCourseForViewer: async () => viewable,
    }));
    vi.doMock("next/navigation", () => ({
      notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
    }));
    vi.doMock("next-intl/server", () => ({
      setRequestLocale: () => {},
      getTranslations: async () => ({
        raw: (key: string) =>
          key === "pages"
            ? {
                academyCourse: {
                  titleTemplate:       "{name} — Hermes Academy",
                  fallbackTitle:       FALLBACK_TITLE,
                  descriptionFallback: FALLBACK_DESC,
                  keywords:            "industrial training",
                },
              }
            : { home: "Home", academy: "Academy" },
      }),
    }));
    vi.doMock("@/components/academy/CourseDetailClient", () => ({ CourseDetailClient: () => null }));
    vi.doMock("@/components/seo/JsonLd", () => ({ JsonLd: () => null }));
  }

  const params = (courseId = "course-1") => Promise.resolve({ locale: "en", courseId });

  beforeEach(() => vi.resetModules());

  it("404s the page when the viewer may not see the course", async () => {
    mockPage(null);
    const mod = await import("@/app/[locale]/academy/course/[courseId]/page");
    await expect(mod.default({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the page when the viewer may see the course", async () => {
    mockPage(course());
    const mod = await import("@/app/[locale]/academy/course/[courseId]/page");
    await expect(mod.default({ params: params() })).resolves.toBeTruthy();
  });

  it("metadata leaks no course title or description to a denied viewer, and is noindex", async () => {
    mockPage(null);
    const mod = await import("@/app/[locale]/academy/course/[courseId]/page");
    const meta = await mod.generateMetadata({ params: params() });

    const serialized = JSON.stringify(meta);
    expect(serialized).not.toContain(COURSE_TITLE);
    expect(serialized).not.toContain(COURSE_DESC);
    expect(String(meta.title)).toBe(FALLBACK_TITLE);
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("metadata emits no indexable canonical for a denied viewer", async () => {
    mockPage(null);
    const mod = await import("@/app/[locale]/academy/course/[courseId]/page");
    const meta = await mod.generateMetadata({ params: params() });
    expect((meta as { alternates?: unknown }).alternates).toBeUndefined();
  });

  it("member-only content stays noindex even for a viewer who IS allowed to see it", async () => {
    mockPage(course());
    const mod = await import("@/app/[locale]/academy/course/[courseId]/page");
    const meta = await mod.generateMetadata({ params: params() });

    expect(String(meta.title)).toContain(COURSE_TITLE);
    const robots = meta.robots as { index?: boolean; follow?: boolean };
    expect(robots.index).toBe(false);
    expect(robots.follow).toBe(false);
  });
});

// ── 3. The sitemap ────────────────────────────────────────────────────────────

describe("sitemap — Academy courses are never advertised to search engines", () => {
  let academyFindMany: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    academyFindMany = vi.fn(async () => [{ id: "course-1" }, { id: "course-2" }]);
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({ academyCourse: { findMany: academyFindMany } }),
    }));
    vi.doMock("@/lib/vendors/db", () => ({
      listApprovedVendorSlugs: async () => ["acme-automation"],
    }));
  });

  it("emits no /academy/course/ URL even when the database is reachable", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const entries = await sitemap();
    expect(entries.some((e) => e.url.includes("/academy/course/"))).toBe(false);
  });

  it("never queries the course table — no unfiltered cross-tenant read can creep back", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    await sitemap();
    expect(academyFindMany).not.toHaveBeenCalled();
  });

  it("keeps the genuinely public /academy landing page and the vendor profiles", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const entries = await sitemap();
    expect(entries.some((e) => e.url.endsWith("/en/academy"))).toBe(true);
    expect(entries.some((e) => e.url.endsWith("/en/vendors/acme-automation"))).toBe(true);
  });
});
