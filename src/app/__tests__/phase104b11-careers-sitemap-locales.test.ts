/**
 * PHASE 104-B1.1 — the careers sitemap emits ONLY locales whose translation
 * is COMPLETE.
 *
 * One eligible job whose EN translation is complete and whose DE/FA are not:
 * exactly one URL family (/en/careers/{id}) may appear. A blanket
 * three-locale expansion — or dropping the per-job locale list — must fail
 * here, not ship a German URL that answers noindex.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  jobRows: [] as unknown[],
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () =>
    new Proxy(
      {},
      {
        get: (_t, model: string) => {
          if (model === "atsJob") {
            return {
              findMany: async () => h.jobRows,
              findFirst: async () => null,
            };
          }
          // every other family answers empty — this test is about careers only
          return {
            findMany: async () => [],
            findFirst: async () => null,
            count: async () => 0,
          };
        },
      },
    ),
}));

async function generate(): Promise<{ url: string }[]> {
  vi.resetModules();
  const mod = await import("../sitemap");
  return (await mod.default()) as { url: string }[];
}

beforeEach(() => {
  h.jobRows = [];
});

const T = (language: string, over: Record<string, string> = {}) => ({
  language,
  title: "t", shortSummary: "s", description: "d",
  departmentLabel: "dep", seoTitle: "st", seoDescription: "sd",
  ...over,
});

describe("careers sitemap locale filtering", () => {
  it("a job with ONLY a complete EN translation gets exactly the /en URL — no DE, no FA", async () => {
    // B1.2 — completeness is decided IN MEMORY by the shared primitive
    // (completeLocalesOf); the fake returns full translation rows and the
    // reader itself must exclude the incomplete ones.
    h.jobRows = [{ id: "job-en-only", translations: [T("EN")] }];
    const urls = (await generate()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/en/careers/job-en-only"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/de/careers/job-en-only"))).toBe(false);
    expect(urls.some((u) => u.endsWith("/fa/careers/job-en-only"))).toBe(false);
  });

  it("a WHITESPACE-ONLY field disqualifies the locale exactly like an empty one (§4)", async () => {
    h.jobRows = [{
      id: "job-ws",
      translations: [T("EN"), T("DE", { description: "   " })],
    }];
    const urls = (await generate()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/en/careers/job-ws"))).toBe(true);
    // "   " passed the old DB-side NOT:{description:""} clause; the shared
    // trim-based primitive must refuse it here too
    expect(urls.some((u) => u.endsWith("/de/careers/job-ws"))).toBe(false);
  });

  it("a fully translated job gets all three locale URLs", async () => {
    h.jobRows = [{ id: "job-full", translations: [T("EN"), T("DE"), T("FA")] }];
    const urls = (await generate()).map((e) => e.url);
    for (const l of ["en", "de", "fa"]) {
      expect(urls.some((u) => u.endsWith(`/${l}/careers/job-full`)), l).toBe(true);
    }
  });

  it("a job whose completeness query returns NO language emits nothing at all", async () => {
    h.jobRows = [{ id: "job-none", translations: [] }];
    const urls = (await generate()).map((e) => e.url);
    expect(urls.some((u) => u.includes("/careers/job-none"))).toBe(false);
  });
});
