import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Two public detail routes answered an absent resource with HTTP 200 and a
 * "not found" message (soft 404s, live audit 2026-11-03):
 *
 * - `/careers/[jobId]` rendered the client's not-found state instead of calling
 *   `notFound()`.
 * - `/videos/[org]/[slug]` did call `notFound()`, but only in the page body,
 *   which `videos/loading.tsx` streams after the 200 status is already sent.
 *   The refusal now also happens in `generateMetadata`, which Next resolves
 *   before the response starts (`htmlLimitedBots`).
 *
 * The outage branches must stay non-404: an unreachable store is not proof of
 * absence.
 */

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
