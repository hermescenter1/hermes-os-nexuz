import { describe, expect, it, vi } from "vitest";
import { CASES, CASE_CONTENT_LOCALES } from "@/lib/industrial/cases";
import { BASE_URL, LOCALES } from "@/lib/seo/config";

// The page module imports `@/i18n/navigation` for its back link, which reaches
// next-intl's client navigation factory and fails to resolve `next/navigation`
// under this runner. Only `generateMetadata` is under test here, so the
// navigation surface is stubbed rather than exercised — the same pattern the
// app-shell runtime suites use.
vi.mock("@/i18n/navigation", () => ({
  Link: () => null,
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  getPathname: vi.fn(),
  redirect: vi.fn(),
}));

/**
 * `getTranslations` resolved against the REAL catalogs.
 *
 * next-intl's server entry point resolves to its react-client build under this
 * runner and throws. Rather than returning the key back — which would make
 * "Persian copy genuinely differs" pass vacuously — this reads
 * `messages/{locale}.json`, so the metadata under test is the metadata
 * production would emit.
 */
vi.mock("next-intl/server", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = path.resolve(__dirname, "../../../../../..");
  const load = (locale: string) =>
    JSON.parse(fs.readFileSync(path.join(root, "messages", `${locale}.json`), "utf8"));
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

const { generateMetadata } = await import("../[id]/page");

/**
 * DISCOVERY-2A — CASE C.
 *
 * `library/cases/[id]/page.tsx` had NO `generateMetadata` at all. Next.js
 * metadata inherits from the nearest ancestor that declares `alternates`, which
 * is `src/app/[locale]/layout.tsx` — whose canonical is `${BASE_URL}/${locale}`.
 * So all 42 statically generated case pages were telling Google that the
 * canonical version of a root-cause analysis is the locale HOMEPAGE. Google
 * consolidates a canonical group onto the declared target, so the site's
 * strongest technical-evidence corpus was being dropped from the index and its
 * signal folded into a page that does not contain it.
 *
 * These assertions are deliberately written against `${BASE_URL}/${locale}`
 * itself — the exact wrong value — so a regression that removes
 * `generateMetadata` again fails here rather than silently passing.
 */

const SAMPLE = CASES[0]!.id;

async function metaFor(locale: string, id: string) {
  return generateMetadata({ params: Promise.resolve({ locale, id }) });
}

describe("C1 — a case page never canonicalises to the locale homepage", () => {
  it.each(LOCALES)("under /%s the canonical is not the homepage", async (locale) => {
    const meta = await metaFor(locale, SAMPLE);
    for (const l of LOCALES) {
      expect(meta.alternates?.canonical).not.toBe(`${BASE_URL}/${l}`);
    }
    expect(String(meta.alternates?.canonical)).toContain(`/library/cases/${SAMPLE}`);
  });

  it("every one of the 14 cases declares its own canonical", async () => {
    for (const c of CASES) {
      const meta = await metaFor("en", c.id);
      expect(meta.alternates?.canonical, c.id).toBe(
        `${BASE_URL}/en/library/cases/${c.id}`,
      );
    }
  });
});

describe("C2 — self-canonical for the locales the content exists in", () => {
  it("/en is self-canonical", async () => {
    const meta = await metaFor("en", SAMPLE);
    expect(meta.alternates?.canonical).toBe(`${BASE_URL}/en/library/cases/${SAMPLE}`);
  });

  it("/fa is self-canonical", async () => {
    const meta = await metaFor("fa", SAMPLE);
    expect(meta.alternates?.canonical).toBe(`${BASE_URL}/fa/library/cases/${SAMPLE}`);
  });

  it("/de canonicalises to /en, because it serves the English body", async () => {
    // `EngineeringCase` carries `en` and `fa` and no German body; the page reads
    // `locale === "fa" ? c.fa : c.en`. /de is German chrome around English text,
    // so it is not a German representation and must not claim to be one.
    const meta = await metaFor("de", SAMPLE);
    expect(meta.alternates?.canonical).toBe(`${BASE_URL}/en/library/cases/${SAMPLE}`);
  });
});

describe("C3 — only the real en/fa alternates are emitted", () => {
  it("declares exactly en, fa and x-default", async () => {
    const meta = await metaFor("fa", SAMPLE);
    const langs = meta.alternates?.languages as Record<string, string>;
    expect(Object.keys(langs).sort()).toEqual(["en", "fa", "x-default"]);
    expect(langs.en).toBe(`${BASE_URL}/en/library/cases/${SAMPLE}`);
    expect(langs.fa).toBe(`${BASE_URL}/fa/library/cases/${SAMPLE}`);
    expect(langs["x-default"]).toBe(`${BASE_URL}/en/library/cases/${SAMPLE}`);
  });

  it("never advertises a German alternate", async () => {
    for (const locale of LOCALES) {
      const meta = await metaFor(locale, SAMPLE);
      const langs = (meta.alternates?.languages ?? {}) as Record<string, string>;
      expect(langs.de, `under /${locale}`).toBeUndefined();
    }
  });

  it("the declared locale set matches the data model", () => {
    // If a German body is ever added, CASE_CONTENT_LOCALES is the single place
    // that changes and these expectations move with it.
    expect([...CASE_CONTENT_LOCALES]).toEqual(["en", "fa"]);
  });
});

describe("C4 — the page describes itself honestly", () => {
  it("carries a real localized title and description, not a template", async () => {
    const en = await metaFor("en", SAMPLE);
    const fa = await metaFor("fa", SAMPLE);
    expect(String(en.title).length).toBeGreaterThan(5);
    expect(String(en.description).length).toBeGreaterThan(20);
    // Persian copy genuinely differs — the catalogs carry all 14 case titles.
    expect(fa.title).not.toBe(en.title);
  });

  it("invents no publication date", async () => {
    // These records carry no timestamp; a fabricated one is a freshness lie.
    const meta = await metaFor("en", SAMPLE);
    const og = meta.openGraph as Record<string, unknown> | undefined;
    expect(og?.publishedTime).toBeUndefined();
    expect(og?.modifiedTime).toBeUndefined();
  });

  it("an unknown case id is noindex, not a canonical to nowhere", async () => {
    const meta = await metaFor("en", "no-such-case");
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates).toBeUndefined();
  });
});
