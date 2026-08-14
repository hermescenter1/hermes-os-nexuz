import { describe, it, expect } from "vitest";
import { articleSchema, courseSchema, organizationSchema, webSiteSchema } from "../schemas";
import { ACTIVE_LOCALES } from "@/i18n/locales";

/**
 * PHASE 89B.1 — JSON-LD locale correctness.
 *
 * Proves: article inLanguage per locale (de no longer mislabeled en-US),
 * course inLanguage covers all three locales exactly once, organization
 * availableLanguage includes German, unknown locales use the repository's
 * safe default policy, and no unrelated schema field changed.
 */

const ARTICLE_OPTS = {
  headline: "PLC Diagnostics",
  description: "Deep dive",
  url: "https://www.hermesnovin.com/de/library/plc",
  locale: "de",
};

describe("89B.1 — article schema inLanguage", () => {
  it.each([
    ["fa", "fa-IR"],
    ["en", "en-US"],
    ["de", "de-DE"],
  ])("%s page emits inLanguage %s", (locale, tag) => {
    expect(articleSchema({ ...ARTICLE_OPTS, locale }).inLanguage).toBe(tag);
  });

  it("unknown locale uses the safe default policy (DEFAULT_LOCALE → fa-IR)", () => {
    for (const bad of ["xx", "", "EN", "de-DE", "constructor"]) {
      expect(articleSchema({ ...ARTICLE_OPTS, locale: bad }).inLanguage).toBe("fa-IR");
    }
  });

  it("German schema carries no English mislabel anywhere", () => {
    const json = JSON.stringify(articleSchema({ ...ARTICLE_OPTS, locale: "de" }));
    expect(json).not.toContain("en-US");
    expect(json).not.toContain("en-GB");
    expect(json).toContain('"inLanguage":"de-DE"');
  });

  it("only inLanguage varies between locales — every other field is identical", () => {
    const de = articleSchema({ ...ARTICLE_OPTS, locale: "de" }) as Record<string, unknown>;
    const en = articleSchema({ ...ARTICLE_OPTS, locale: "en" }) as Record<string, unknown>;
    delete de.inLanguage;
    delete en.inLanguage;
    expect(de).toEqual(en);
  });

  it("canonical url, headline and description are preserved verbatim", () => {
    const s = articleSchema({ ...ARTICLE_OPTS, locale: "de" });
    expect(s.url).toBe(ARTICLE_OPTS.url);
    expect(s.headline).toBe(ARTICLE_OPTS.headline);
    expect(s.description).toBe(ARTICLE_OPTS.description);
    expect(s["@type"]).toBe("TechArticle");
  });
});

describe("89B.1 — course schema inLanguage", () => {
  const course = courseSchema({ name: "OPC UA", description: "d", url: "https://x/c" });

  it("contains fa-IR, en-US and de-DE exactly once each", () => {
    expect(course.inLanguage).toEqual(["fa-IR", "en-US", "de-DE"]);
    expect(new Set(course.inLanguage).size).toBe(course.inLanguage.length);
  });

  it("covers every ACTIVE locale (extends automatically with activation)", () => {
    expect(course.inLanguage.length).toBe(ACTIVE_LOCALES.length);
  });
});

describe("89B.1 — organization / website language metadata", () => {
  it("organization availableLanguage lists Persian, English and German", () => {
    const org = organizationSchema();
    expect(org.contactPoint.availableLanguage).toEqual(["Persian", "English", "German"]);
  });

  it("organization shape is otherwise unchanged and valid", () => {
    const org = organizationSchema();
    expect(org["@context"]).toBe("https://schema.org");
    expect(org["@type"]).toBe("Organization");
    expect(org.contactPoint["@type"]).toBe("ContactPoint");
    // PHASE 105 widened this pin: the organisation now carries a stable `@id`,
    // its full legal name, a `founder` reference into the entity graph and
    // `knowsAbout`. The assertion stays exact — it is the guard that stops an
    // unreviewed property appearing in production structured data.
    // `logo` is absent on purpose: a favicon is not a corporate logo, and no
    // verified brand asset exists yet. See the note in lib/seo/config.ts.
    expect(Object.keys(org).sort()).toEqual(
      [
        "@context", "@id", "@type", "alternateName", "contactPoint", "founder",
        "knowsAbout", "legalName", "name", "sameAs", "url",
      ].sort(),
    );
  });

  it("webSite declares every active locale and publishes as the organisation", () => {
    const site = webSiteSchema() as Record<string, unknown>;
    expect(site["@type"]).toBe("WebSite");
    // PHASE 105 replaced the 89B.1 "inLanguage must be absent" pin. The site is
    // genuinely trilingual and one WebSite entity covers all three locales, so
    // declaring the languages is correct rather than a drift risk.
    expect(site.inLanguage).toEqual(["fa-IR", "en-US", "de-DE"]);
  });
});

describe("89B.1 — serialization safety", () => {
  it("no schema serializes an undefined value and all round-trip as valid JSON", () => {
    const schemas = [
      organizationSchema(),
      webSiteSchema(),
      courseSchema({ name: "n", description: "d", url: "https://x" }),
      ...["fa", "en", "de", "xx"].map((locale) => articleSchema({ ...ARTICLE_OPTS, locale })),
    ];
    for (const s of schemas) {
      const json = JSON.stringify(s);
      expect(json).not.toContain("undefined");
      expect(() => JSON.parse(json)).not.toThrow();
      expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(s)));
    }
  });
});
