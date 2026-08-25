/**
 * PHASE 104-B1.2 — ONE truth record for locale availability.
 *
 *   §3: canonical / hreflang / x-default / sitemap all derive from the SAME
 *       completeLocalesOf record:
 *         EN-only    → canonical EN, NO hreflang map, NO x-default; DE/FA noindex
 *         EN+DE      → exactly those two, mutual alternates
 *         EN+DE+FA   → all three, mutual alternates
 *   §4: completeness is trim-based in the ONE primitive — every one of the six
 *       fields with "" and with "   " disqualifies; padded REAL values pass.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null, redirect: () => {}, usePathname: () => "/", useRouter: () => ({}) }));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => {
    const t = (k: string) => `t:${k}`;
    (t as unknown as { raw: (k: string) => unknown }).raw = (k: string) =>
      k === "pages"
        ? { careersJob: { notFoundTitle: "not found", titleTemplate: "{name}", keywordsSuffix: "ks" } }
        : { home: "h", careers: "c" };
    return t;
  },
  setRequestLocale: () => {},
}));

import { completeLocalesOf, isTranslationComplete } from "../eligibility";
import { getPublicJobPosting, listPublicJobSitemapItems } from "../public-jobs";

const FIELDS = ["title", "shortSummary", "description", "departmentLabel", "seoTitle", "seoDescription"] as const;
const T = (language: string, over: Partial<Record<(typeof FIELDS)[number], string>> = {}) => ({
  language,
  title: "t", shortSummary: "s", description: "d",
  departmentLabel: "dep", seoTitle: "st", seoDescription: "sd",
  responsibilities: [], requirements: [], preferredExperience: [], localizedSkills: {},
  ...over,
});

const JOB = (id: string, translations: unknown[]) => ({
  id,
  organizationId: "org-1",
  status: "OPEN",
  isPublic: true,
  deletedAt: null,
  publishedAt: new Date("2026-08-01T00:00:00.000Z"),
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
  skills: [],
  requisitionKey: "HNM-1",
  employmentType: null,
  translations,
});

function db(rows: ReturnType<typeof JOB>[]) {
  return {
    atsJob: {
      findFirst: async (a: { where: { id?: string }; include?: { translations?: { where?: { language?: string } } | boolean } }) => {
        const row = rows.find((r) => r.id === a.where.id);
        if (!row) return null;
        const inc = a.include?.translations;
        if (inc && typeof inc === "object" && inc.where?.language) {
          return { ...row, translations: (row.translations as { language: string }[]).filter((t) => t.language === inc.where!.language) };
        }
        return row;
      },
      findMany: async () => rows,
    },
  };
}

beforeEach(() => { h.db = null; });

describe("§4 — the completeness truth table (trim-based, per field)", () => {
  for (const field of FIELDS) {
    it(`${field}: "" and "   " both disqualify; a padded real value passes`, () => {
      expect(isTranslationComplete(T("EN", { [field]: "" }) as never)).toBe(false);
      expect(isTranslationComplete(T("EN", { [field]: "   " }) as never)).toBe(false);
      expect(isTranslationComplete(T("EN", { [field]: "  real  " }) as never)).toBe(true);
    });
  }
  it("completeLocalesOf applies the same rule per locale, in en→de→fa order", () => {
    const locales = completeLocalesOf([
      T("FA") as never,
      T("DE", { seoTitle: "   " }) as never,
      T("EN") as never,
    ]);
    expect(locales).toEqual(["en", "fa"]);
  });
});

describe("§3 — posting record, metadata alternates and sitemap agree", () => {
  async function metadataFor(locale: string, jobId: string) {
    vi.resetModules();
    const { generateMetadata } = await import("@/app/[locale]/careers/[jobId]/page");
    return generateMetadata({ params: Promise.resolve({ locale, jobId }) });
  }
  const altLocales = (m: { alternates?: { languages?: Record<string, string> } }) =>
    Object.keys(m.alternates?.languages ?? {}).sort();

  it("EN-only: canonical EN, NO hreflang languages, NO x-default; DE is noindex; sitemap emits /en only", async () => {
    h.db = db([JOB("j-en", [T("EN"), T("DE", { description: "   " })])]);
    const posting = await getPublicJobPosting("j-en", "en");
    expect(posting!.availableLocales).toEqual(["en"]);

    const en = await metadataFor("en", "j-en");
    expect(String(en.alternates?.canonical ?? "")).toContain("/en/careers/j-en");
    expect(en.alternates?.languages ?? undefined).toBeUndefined();

    const de = await metadataFor("de", "j-en");
    expect(de.robots).toEqual({ index: false, follow: false });
    expect(de.alternates?.canonical ?? undefined).toBeUndefined();

    const items = await listPublicJobSitemapItems();
    expect(items.find((i) => i.id === "j-en")?.locales).toEqual(["en"]);
  });

  it("EN+DE: exactly those two as mutual alternates; FA noindex; sitemap = en+de", async () => {
    h.db = db([JOB("j-ende", [T("EN"), T("DE"), T("FA", { title: "" })])]);
    const posting = await getPublicJobPosting("j-ende", "de");
    expect(posting!.availableLocales).toEqual(["en", "de"]);

    const de = await metadataFor("de", "j-ende");
    expect(altLocales(de as never)).toEqual(["de", "en", "x-default"].sort());
    const langs = (de.alternates?.languages ?? {}) as Record<string, string>;
    expect(Object.keys(langs)).not.toContain("fa");

    const fa = await metadataFor("fa", "j-ende");
    expect(fa.robots).toEqual({ index: false, follow: false });

    const items = await listPublicJobSitemapItems();
    expect(items.find((i) => i.id === "j-ende")?.locales).toEqual(["en", "de"]);
  });

  it("EN+DE+FA: all three mutual alternates; sitemap = all three", async () => {
    h.db = db([JOB("j-all", [T("EN"), T("DE"), T("FA")])]);
    const posting = await getPublicJobPosting("j-all", "fa");
    expect(posting!.availableLocales).toEqual(["en", "de", "fa"]);

    const fa = await metadataFor("fa", "j-all");
    const langs = Object.keys((fa.alternates?.languages ?? {}) as Record<string, string>).sort();
    expect(langs).toEqual(["de", "en", "fa", "x-default"].sort());

    const items = await listPublicJobSitemapItems();
    expect(items.find((i) => i.id === "j-all")?.locales).toEqual(["en", "de", "fa"]);
  });
});
