import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Two public detail routes answered an absent resource with HTTP 200 and a
 * "not found" message (soft 404s, live audit 2026-11-03):
 *
 * - `/careers/[jobId]` rendered the client's not-found state instead of calling
 *   `notFound()`.
 * - `/videos/[org]/[slug]` called `notFound()`, but `videos/loading.tsx`
 *   wrapped it in a Suspense boundary, so the 200 status was streamed before
 *   any `notFound()` ran. Moving the refusal into `generateMetadata` did NOT
 *   help: live, it still answered 200. Only removing the boundary does.
 *
 * The outage branches must stay non-404: an unreachable store is not proof of
 * absence.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Every directory from `[locale]` down to a route that answers an absent
 * resource with `notFound()`. A `loading.tsx` in any of them makes Next stream
 * the response before the page renders, which turns every refusal into a 200.
 */
const NOT_FOUND_ROUTES = [
  ["videos", "[org]", "[slug]"],
  ["careers", "[jobId]"],
  ["articles", "[slug]"],
  ["library", "[article]"],
  ["academy", "course", "[courseId]"],
];

describe("no loading boundary above a route that must answer 404", () => {
  it.each(NOT_FOUND_ROUTES.map((r) => [r.join("/"), r]))("/%s", (_label, segments) => {
    const base = join(process.cwd(), "src", "app", "[locale]");
    const dirs = [base, ...segments.map((_, i) => join(base, ...segments.slice(0, i + 1)))];
    for (const dir of dirs) {
      expect(existsSync(join(dir, "loading.tsx")), `${dir}/loading.tsx streams a 200 before notFound()`).toBe(false);
    }
  });
});

class NotFoundSignal extends Error {
  constructor() { super("NEXT_NOT_FOUND"); }
}

vi.mock("next/navigation", () => ({
  notFound: () => { throw new NotFoundSignal(); },
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async () => Object.assign((k: string) => k, { raw: () => new Proxy({}, { get: () => ({}) }) }),
}));
vi.mock("@/components/careers/JobDetailClient", () => ({ JobDetailClient: () => null }));
vi.mock("@/components/media", () => ({
  InstructorCard: () => null, MediaPlayer: () => null, MediaSkillLevelBadge: () => null, RelatedVideos: () => null,
}));

const jobs = { detail: null as unknown, posting: null as unknown };
vi.mock("@/lib/ats/public-jobs", () => ({
  getPublicJobDetail: async () => jobs.detail,
  getPublicJobPosting: async () => jobs.posting,
}));

const videos = { scope: null as unknown, view: null as unknown };
vi.mock("@/app/[locale]/videos/data", () => ({
  resolveVideoHubScope: async () => videos.scope,
  loadVideoWatch: async () => videos.view,
}));

async function outcome(run: () => Promise<unknown>): Promise<"404" | "rendered"> {
  try {
    await run();
    return "rendered";
  } catch (e) {
    if (e instanceof NotFoundSignal) return "404";
    throw e;
  }
}

describe("/careers/[jobId]", () => {
  const params = Promise.resolve({ locale: "en", jobId: "missing" });

  beforeEach(() => {
    jobs.detail = null;
    jobs.posting = null;
  });

  it("answers a real 404 when the store says no eligible posting exists", async () => {
    const { default: Page } = await import("@/app/[locale]/careers/[jobId]/page");
    expect(await outcome(() => Page({ params }))).toBe("404");
  });

  it("still renders the outage state when the store is unreachable", async () => {
    jobs.detail = "UNAVAILABLE";
    const { default: Page } = await import("@/app/[locale]/careers/[jobId]/page");
    expect(await outcome(() => Page({ params }))).toBe("rendered");
  });
});

describe("/videos/[org]/[slug] metadata", () => {
  const params = Promise.resolve({ locale: "en", org: "acme", slug: "missing" });

  beforeEach(() => {
    videos.scope = null;
    videos.view = null;
  });

  it("refuses with notFound() for an unknown organization", async () => {
    const { generateMetadata } = await import("@/app/[locale]/videos/[org]/[slug]/page");
    expect(await outcome(() => generateMetadata({ params }))).toBe("404");
  });

  it("refuses with notFound() for an unknown asset in a known organization", async () => {
    videos.scope = { organizationId: "org_1", orgSlug: "acme" };
    const { generateMetadata } = await import("@/app/[locale]/videos/[org]/[slug]/page");
    expect(await outcome(() => generateMetadata({ params }))).toBe("404");
  });
});
