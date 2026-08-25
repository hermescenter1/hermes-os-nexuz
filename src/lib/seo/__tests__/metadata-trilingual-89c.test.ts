import { describe, it, expect, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

/**
 * PHASE 89C — trilingual metadata certification.
 *
 * Locks the fixes for every route whose generateMetadata previously emitted
 * hardcoded English on fa/de: vendors directory, vendor profile, demo,
 * careers job, library article, academy course (DB-unavailable branch),
 * privacy-center, and the six auth tab titles. Also proves the new
 * meta.breadcrumbs / meta.pages leaves keep exact fa/en/de parity.
 */

type Cat = typeof en;
const CATALOGS: Record<string, Cat> = { fa: fa as Cat, en: en as Cat, de: de as Cat };

// Importing route modules pulls in next-intl navigation + client components;
// stub the navigation seams so metadata functions run standalone in node.
vi.mock("@/i18n/navigation", () => ({
  Link: () => null,
  redirect: () => {},
  usePathname: () => "/",
  useRouter: () => ({}),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({}),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * DISCOVERY-2A — one AUTHORITATIVE `AtsJob` row.
 *
 * The careers job page reads `@/lib/ats/public-jobs`, which reads `AtsJob` and
 * never the development fixture. `getJobById` is stubbed (not
 * `getPublicJobById`) so the real OPEN + isPublic predicate still runs on the
 * way through.
 */
/**
 * B1.1 — the careers job page now reads the PRISMA posting projection
 * (translation-complete, locale-specific), so the authoritative row lives in
 * a prisma mock: one eligible job with three COMPLETE translations whose
 * seoTitle/seoDescription differ per locale. getJobById stays stubbed for
 * legacy callers.
 */
const B1_TRANSLATIONS = [
  { language: "EN", title: "SCADA Architect", shortSummary: "s", description: "Designs enterprise SCADA systems.", departmentLabel: "Automation Engineering", seoTitle: "SCADA Architect — Careers at Hermes OS", seoDescription: "Architect enterprise SCADA for industrial plants.", localizedSkills: { scada: "SCADA" }, responsibilities: [], requirements: [], preferredExperience: [] },
  { language: "DE", title: "SCADA-Architekt", shortSummary: "s", description: "Entwirft Enterprise-SCADA-Systeme.", departmentLabel: "Automatisierungstechnik", seoTitle: "SCADA-Architekt — Karriere bei Hermes OS", seoDescription: "Enterprise-SCADA für Industrieanlagen entwerfen.", localizedSkills: { scada: "SCADA" }, responsibilities: [], requirements: [], preferredExperience: [] },
  { language: "FA", title: "معمار اسکادا", shortSummary: "s", description: "طراحی سامانه‌های اسکادای سازمانی.", departmentLabel: "مهندسی اتوماسیون", seoTitle: "معمار اسکادا — فرصت‌های شغلی هرمس", seoDescription: "طراحی اسکادای سازمانی برای کارخانه‌های صنعتی.", localizedSkills: { scada: "اسکادا" }, responsibilities: [], requirements: [], preferredExperience: [] },
];
const B1_JOB = {
  id: "job-db-1",
  organizationId: "org-1",
  status: "OPEN",
  isPublic: true,
  deletedAt: null,
  publishedAt: new Date("2026-05-02T00:00:00.000Z"),
  closingDate: null,
  department: "Automation Engineering",
  location: "Isfahan",
  addressLocality: "Isfahan",
  addressRegion: "Isfahan Province",
  addressCountry: "IR",
  locationType: null,
  salaryCurrency: null,
  salaryMin: null,
  salaryMax: null,
  skills: ["scada"],
  requisitionKey: "HNM-SCADA-1",
  employmentType: null,
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
};
vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    atsJob: {
      findFirst: async (a: { where?: { id?: string }; include?: { translations?: { where?: { language?: string } } } }) => {
        const lang = a.include?.translations?.where?.language;
        if (a.where?.id === "job-en-only") {
          // complete EN, nothing else — the DE/FA pages must be noindex
          const enOnly = B1_TRANSLATIONS.filter((t) => t.language === "EN");
          return { ...B1_JOB, id: "job-en-only", translations: lang ? enOnly.filter((t) => t.language === lang) : enOnly };
        }
        if (a.where?.id !== "job-db-1") return null;
        return { ...B1_JOB, translations: lang ? B1_TRANSLATIONS.filter((t) => t.language === lang) : B1_TRANSLATIONS };
      },
      findMany: async () => [],
    },
  }),
}));

vi.mock("@/lib/ats/db", () => ({
  getPublicJobs: async () => [],
  getJobById: async (id: string) =>
    id === "job-db-1"
      ? {
          id: "job-db-1",
          organizationId: "org-1",
          title: "SCADA Architect",
          description: "Design and architect enterprise SCADA systems.",
          requirements: [],
          responsibilities: [],
          benefits: [],
          skills: ["SCADA", "OPC UA"],
          location: "Isfahan",
          locationType: "onsite",
          department: "Automation Engineering",
          salaryCurrency: "EUR",
          salaryMin: null,
          salaryMax: null,
          status: "OPEN",
          closingDate: null,
          postedById: null,
          isPublic: true,
          // PHASE 104-B1 — the public predicate now also requires a real,
          // non-future publishedAt; without it this authoritative row would
          // correctly stop being public.
          publishedAt: new Date("2026-05-02T00:00:00.000Z"),
          deletedAt: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        }
      : null,
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  setRequestLocale: () => {},
  getTranslations: async (arg: { locale: string; namespace: string } | string) => {
    const locale = typeof arg === "string" ? "en" : arg.locale;
    const namespace = typeof arg === "string" ? arg : arg.namespace;
    return createTranslator({
      locale,
      messages: CATALOGS[locale] as never,
      namespace: namespace as never,
    });
  },
}));

vi.mock("@/lib/vendors/db", () => ({
  getVendorBySlug: async () => ({
    id: "v1",
    slug: "acme-automation",
    nameEn: "Acme Automation",
    nameFa: "اکمه اتوماسیون",
    descriptionEn: null,
    descriptionFa: null,
    vendorType: "SYSTEM_INTEGRATOR",
    websiteUrl: null,
    contactEmail: null,
    headquartersCity: null,
    headquartersCountry: null,
  }),
  listApprovedVendors: async () => [],
}));

const P = (locale: string) => Promise.resolve({ locale });

describe("89C — catalog parity for the new meta leaves", () => {
  const paths = (o: unknown, p = ""): string[] =>
    o !== null && typeof o === "object"
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => paths(v, p ? `${p}.${k}` : k))
      : [p];

  it("meta.breadcrumbs and new meta.pages sub-trees are structurally identical in fa/en/de", () => {
    for (const sub of ["breadcrumbs"]) {
      const ke = paths((en.meta as Record<string, unknown>)[sub]).sort();
      expect(ke.length).toBeGreaterThan(0);
      expect(paths((fa.meta as Record<string, unknown>)[sub]).sort()).toEqual(ke);
      expect(paths((de.meta as Record<string, unknown>)[sub]).sort()).toEqual(ke);
    }
    for (const page of ["demo", "vendorProfile", "academyCourse", "libraryArticle", "careersJob"]) {
      const ke = paths((en.meta.pages as Record<string, unknown>)[page]).sort();
      expect(ke.length).toBeGreaterThan(0);
      expect(paths((fa.meta.pages as Record<string, unknown>)[page]).sort()).toEqual(ke);
      expect(paths((de.meta.pages as Record<string, unknown>)[page]).sort()).toEqual(ke);
    }
  });

  it("German leaves are genuinely German (never the English carryover)", () => {
    const get = (c: Cat, dotted: string) =>
      dotted.split(".").reduce((x: unknown, k) => (x as Record<string, unknown>)[k], c);
    for (const p of [
      "meta.breadcrumbs.home",
      "meta.pages.demo.title",
      "meta.pages.vendorProfile.titleTemplate",
      "meta.pages.academyCourse.fallbackTitle",
      "meta.pages.libraryArticle.titleTemplate",
      "meta.pages.careersJob.titleTemplate",
    ]) {
      expect(get(de as Cat, p), p).not.toBe(get(en, p));
    }
  });
});

describe("89C — vendors directory metadata is localized", () => {
  it.each(["fa", "en", "de"] as const)("%s emits the catalog title", async (loc) => {
    const { generateMetadata } = await import("@/app/[locale]/vendors/page");
    const m = await generateMetadata({ params: P(loc) });
    expect(String(m.title)).toBe(CATALOGS[loc].meta.pages.vendors.title);
  });

  it("German directory metadata contains no English boilerplate", async () => {
    const { generateMetadata } = await import("@/app/[locale]/vendors/page");
    const m = await generateMetadata({ params: P("de") });
    expect(String(m.title)).not.toContain("Vendor Directory");
    expect(String(m.description)).not.toContain("Browse certified");
  });
});

describe("89C — vendor profile metadata", () => {
  it("German page uses the German template; Persian page uses the Persian vendor name", async () => {
    const { generateMetadata } = await import("@/app/[locale]/vendors/[vendorId]/page");
    const deM = await generateMetadata({ params: Promise.resolve({ locale: "de", vendorId: "acme-automation" }) });
    expect(String(deM.title)).toBe("Acme Automation — Anbieterprofil | Hermes OS");
    expect(String(deM.description)).toContain("verifizierter Anbieterpartner");
    const faM = await generateMetadata({ params: Promise.resolve({ locale: "fa", vendorId: "acme-automation" }) });
    expect(String(faM.title)).toContain("اکمه اتوماسیون");
    expect(String(faM.title)).not.toContain("Vendor Profile");
  });
});

describe("89C — demo, careers job, library article, academy fallback, privacy-center", () => {
  it("demo drops the fa-else-en ternary: German gets German", async () => {
    const { generateMetadata } = await import("@/app/[locale]/demo/page");
    const m = await generateMetadata({ params: P("de") });
    expect(String(m.title)).toBe(CATALOGS.de.meta.pages.demo.title);
    expect(String(m.title)).not.toContain("Request Industrial Brain Demo");
  });

  it("careers job title/keywords use the localized template on de", async () => {
    // DISCOVERY-2A — this used to read `JOBS[0]` from `@/lib/ats/mock-data`,
    // which is exactly the import the public job page no longer makes: five
    // invented vacancies were being published as `JobPosting` rich data. The
    // assertion's INTENT — "the German title template is applied, not English"
    // — is unchanged; it is now proven against an AUTHORITATIVE `AtsJob` row.
    const { generateMetadata } = await import("@/app/[locale]/careers/[jobId]/page");
    // B1.1 — three locales, three DIFFERENT titles/descriptions, each from
    // THAT locale's translation row (never the legacy English column, never a
    // template over an untranslated name).
    const en = await generateMetadata({ params: Promise.resolve({ locale: "en", jobId: "job-db-1" }) });
    const de = await generateMetadata({ params: Promise.resolve({ locale: "de", jobId: "job-db-1" }) });
    const fa = await generateMetadata({ params: Promise.resolve({ locale: "fa", jobId: "job-db-1" }) });
    expect(String(en.title)).toBe("SCADA Architect — Careers at Hermes OS");
    expect(String(de.title)).toBe("SCADA-Architekt — Karriere bei Hermes OS");
    expect(String(fa.title)).toBe("معمار اسکادا — فرصت‌های شغلی هرمس");
    expect(new Set([String(en.title), String(de.title), String(fa.title)]).size).toBe(3);
    expect(en.description).toBe("Architect enterprise SCADA for industrial plants.");
    expect(de.description).toBe("Enterprise-SCADA für Industrieanlagen entwerfen.");
    expect(fa.description).toBe("طراحی اسکادای سازمانی برای کارخانه‌های صنعتی.");
    expect(new Set([en.description, de.description, fa.description]).size).toBe(3);
    const m = de;
    void m;

    // An id with no authoritative row keeps the localized not-found title AND
    // is refused indexing — a fixture-only page must never be advertised.
    const missing = await generateMetadata({ params: Promise.resolve({ locale: "de", jobId: "nope" }) });
    expect(String(missing.title)).toBe("Stelle nicht gefunden");
    expect(missing.robots).toEqual({ index: false, follow: false });

    // B1.1 — a job translated ONLY in English is noindex on de/fa: no
    // canonical, no localized title, and NEVER an English fallback title.
    const deOfEnOnly = await generateMetadata({ params: Promise.resolve({ locale: "de", jobId: "job-en-only" }) });
    expect(deOfEnOnly.robots).toEqual({ index: false, follow: false });
    expect(String(deOfEnOnly.title)).not.toContain("SCADA Architect");
    expect(deOfEnOnly.alternates?.canonical ?? undefined).toBeUndefined();
    const enOfEnOnly = await generateMetadata({ params: Promise.resolve({ locale: "en", jobId: "job-en-only" }) });
    expect(String(enOfEnOnly.title)).toBe("SCADA Architect — Careers at Hermes OS");
  });

  it("library article title suffix is localized; not-found title is localized", async () => {
    const { generateMetadata } = await import("@/app/[locale]/library/[article]/page");
    const { KNOWLEDGE } = await import("@/lib/industrial/knowledge");
    const lib = KNOWLEDGE[0];
    const m = await generateMetadata({ params: Promise.resolve({ locale: "de", article: lib.id }) });
    expect(String(m.title)).toContain("— Industrielle Wissensbibliothek");
    expect(String(m.title)).not.toContain("Industrial Knowledge Library");
    const nf = await generateMetadata({ params: Promise.resolve({ locale: "fa", article: "missing" }) });
    expect(String(nf.title)).toBe("مقاله یافت نشد");
  });

  it("academy course DB-unavailable fallback is localized per locale", async () => {
    const { generateMetadata } = await import("@/app/[locale]/academy/course/[courseId]/page");
    const m = await generateMetadata({ params: Promise.resolve({ locale: "de", courseId: "c1" }) });
    expect(String(m.title)).toBe(CATALOGS.de.meta.pages.academyCourse.fallbackTitle);
    expect(String(m.title)).not.toContain("Industrial Course");
  });

  it("privacy-center no longer appends an English suffix", async () => {
    const { generateMetadata } = await import("@/app/[locale]/privacy-center/page");
    const m = await generateMetadata({ params: P("de") });
    expect(String(m.title)).not.toContain("| Privacy Center");
  });
});

describe("89C — auth tab titles are localized (noindex preserved)", () => {
  const cases = [
    ["login", "loginTitle"],
    ["register", "requestAccessTitle"],
    ["forgot-password", "forgotPasswordTitle"],
    ["reset-password", "resetPasswordTitle"],
    ["verify-email", "verifyEmailTitle"],
    ["accept-invite", "acceptInviteTitle"],
  ] as const;

  it.each(cases)("auth/%s uses auth.%s per locale and keeps robots noindex", async (page, key) => {
    const mod = await import(`@/app/[locale]/auth/${page}/page`);
    for (const loc of ["fa", "en", "de"] as const) {
      const m = await mod.generateMetadata({ params: P(loc) });
      expect(String(m.title)).toBe((CATALOGS[loc].auth as Record<string, string>)[key]);
      expect(m.robots).toEqual({ index: false, follow: false });
    }
  });
});

describe("89C — vendor JSON-LD entity URL follows the page locale", () => {
  it("de page emits /de/vendors/…, unknown falls back to the default locale", async () => {
    const { buildVendorSchema } = await import("@/lib/seo/schemas");
    const vendor = {
      id: "v1", slug: "acme", nameEn: "Acme",
      descriptionEn: null, websiteUrl: null, contactEmail: null,
      headquartersCity: null, headquartersCountry: null, vendorType: "OEM",
    } as never;
    expect(buildVendorSchema(vendor, "de").url).toContain("/de/vendors/acme");
    expect(buildVendorSchema(vendor, "en").url).toContain("/en/vendors/acme");
    expect(buildVendorSchema(vendor, "xx").url).toContain("/fa/vendors/acme");
    expect(buildVendorSchema(vendor).url).toContain("/fa/vendors/acme");
  });
});
