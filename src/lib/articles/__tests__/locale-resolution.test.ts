import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  articleLanguageForLocale,
  localeForArticleLanguage,
  langTagForArticleLanguage,
  directionForArticleLanguage,
  categoryNameForLocale,
  ART_LANGUAGES,
} from "../locale";
import { ACTIVE_LOCALES } from "@/i18n/locales";

/**
 * PHASE 106 — locale <-> article-language mapping.
 *
 * The Journal now stores three language editions of one article under ONE slug.
 * That only works if every surface agrees on which edition a locale wants, so
 * this mapping is the contract the detail route, the feed, the listings, the
 * importer and the validator all depend on.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("locale -> article language", () => {
  it("covers every active public locale", () => {
    for (const locale of ACTIVE_LOCALES) {
      expect(articleLanguageForLocale(locale), locale).not.toBeNull();
    }
  });

  it("maps the three platform locales to the three article languages", () => {
    expect(articleLanguageForLocale("fa")).toBe("FA");
    expect(articleLanguageForLocale("en")).toBe("EN");
    expect(articleLanguageForLocale("de")).toBe("DE");
  });

  it("returns null for an unmodelled locale instead of guessing a default", () => {
    // A guessed default would hide every article behind the wrong language.
    // null means "no preference", which callers turn into an unscoped query.
    expect(articleLanguageForLocale("ru")).toBeNull();
    expect(articleLanguageForLocale("")).toBeNull();
    expect(articleLanguageForLocale("FA")).toBeNull(); // locales are lowercase
  });

  it("round-trips in both directions", () => {
    for (const locale of ACTIVE_LOCALES) {
      const language = articleLanguageForLocale(locale)!;
      expect(localeForArticleLanguage(language)).toBe(locale);
    }
    expect(localeForArticleLanguage("RU")).toBeNull();
  });

  it("enumerates exactly as many article languages as there are active locales", () => {
    expect([...ART_LANGUAGES].sort()).toEqual(["DE", "EN", "FA"]);
    expect(ART_LANGUAGES).toHaveLength(ACTIVE_LOCALES.length);
  });
});

describe("language tags and direction", () => {
  it("emits real BCP-47 tags for JSON-LD inLanguage", () => {
    expect(langTagForArticleLanguage("FA")).toBe("fa-IR");
    expect(langTagForArticleLanguage("EN")).toBe("en-GB");
    expect(langTagForArticleLanguage("DE")).toBe("de-DE");
  });

  it("degrades an unknown language to a plausible tag rather than null", () => {
    // Structured data with a null inLanguage is worse than an imprecise one.
    expect(langTagForArticleLanguage("RU")).toBe("ru");
  });

  it("marks Persian content RTL and the others LTR", () => {
    expect(directionForArticleLanguage("FA")).toBe("rtl");
    expect(directionForArticleLanguage("EN")).toBe("ltr");
    expect(directionForArticleLanguage("DE")).toBe("ltr");
  });
});

describe("category labels", () => {
  const category = { name: "Industrial Networks", nameFa: "شبکه‌های صنعتی", nameDe: "Industrielle Netzwerke" };

  it("returns the label for each locale", () => {
    expect(categoryNameForLocale(category, "fa")).toBe("شبکه‌های صنعتی");
    expect(categoryNameForLocale(category, "de")).toBe("Industrielle Netzwerke");
    expect(categoryNameForLocale(category, "en")).toBe("Industrial Networks");
  });

  it("falls back to the English name when a localized label is missing", () => {
    // nameDe is nullable in the schema — pre-Phase-106 rows have none, and a
    // German category page must show something rather than an empty heading.
    const partial = { name: "Instrumentation", nameFa: "ابزار دقیق", nameDe: null };
    expect(categoryNameForLocale(partial, "de")).toBe("Instrumentation");
    expect(categoryNameForLocale({ name: "X" }, "fa")).toBe("X");
  });
});

describe("the detail route resolves by locale, with a legacy fallback", () => {
  const db = read("src/lib/articles/db.ts");
  const page = read("src/app/[locale]/articles/[slug]/page.tsx");

  it("looks up the reader's own edition first", () => {
    expect(db).toContain("where: { slug: lookupSlug, language }");
  });

  it("still resolves an article that has no edition in this language", () => {
    // A single-language legacy article must keep resolving at every locale —
    // this fallback IS the entire pre-Phase-106 behaviour.
    expect(db).toContain("row ??= await articleModel.findFirst({ where: { slug: lookupSlug }, include })");
  });

  it("both the page and its metadata resolve the same edition", () => {
    // If generateMetadata resolved a different edition than the page body, the
    // title and description would describe a translation the reader never sees.
    expect(page).toContain("getArticleDetailBySlug(slug, locale)");
    expect(page.match(/getArticleDetailBySlug\(slug, locale\)/g)).toHaveLength(2);
  });

  it("declares inLanguage from the row, not from the route locale", () => {
    expect(page).toContain("langTagForArticleLanguage(article.language)");
    expect(page).not.toContain('article.language === "FA" ? "fa" : "en"');
  });
});

describe("list reads never load article bodies", () => {
  const db = read("src/lib/articles/db.ts");

  it("the list projection omits content", () => {
    const select = db.slice(db.indexOf("const LIST_SELECT"), db.indexOf("} as const;"));
    expect(select).toContain("excerpt: true");
    expect(select).not.toContain("content: true");
  });

  it("every listing read is bounded", () => {
    // An unbounded findMany over a growing public corpus is a latent full scan.
    expect(db).toContain("const LIST_MAX");
    const listingReads = db.match(/select: LIST_SELECT/g) ?? [];
    const takes = db.match(/take: (LIST_MAX|Math\.min\()/g) ?? [];
    expect(listingReads.length).toBeGreaterThan(0);
    expect(takes.length).toBeGreaterThanOrEqual(listingReads.length - 1); // getPublicArticles uses a clamped limit
  });

  it("the tag listing actually queries the database", () => {
    // It previously returned mock data unconditionally, so every tag page was
    // wrong in production regardless of what had been imported.
    const fn = db.slice(db.indexOf("export async function getArticlesByTag_"));
    expect(fn.slice(0, 900)).toContain("tags: { some: { tag: { slug: tagSlug } } }");
  });
});
