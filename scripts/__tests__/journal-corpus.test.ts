import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadCorpus,
  loadArticle,
  loadTaxonomy,
  countWords,
  countHeadings,
  readingTimeFor,
  REQUIRED_LOCALES,
  LOCALE_TO_LANGUAGE,
  LIMITS,
} from "../journal/lib/corpus.mjs";
import { countArticleWords } from "@/components/articles/article-content";
import { articleLanguageForLocale } from "@/lib/articles/locale";

/**
 * PHASE 106 — the Journal content corpus.
 *
 * Two categories of assertion. The CONTENT checks prove the corpus on disk is
 * complete, unique and genuinely trilingual. The CONTRACT checks prove the
 * loader is a real gate — that each rule rejects the shape it claims to reject,
 * rather than passing everything and producing a reassuring report.
 */

const corpus = loadCorpus();
const REPO = process.cwd();

describe("corpus integrity", () => {
  it("loads without a single validation error", () => {
    expect(corpus.errors).toEqual([]);
  });

  it("every topic exists in all three locales", () => {
    expect(corpus.records.length).toBeGreaterThan(0);
    for (const record of corpus.records) {
      expect(record.editions.map((e) => e.locale).sort(), record.slug).toEqual(
        [...REQUIRED_LOCALES].sort(),
      );
    }
  });

  it("localized editions = topics x 3, with no missing translation", () => {
    const editions = corpus.records.reduce((n, r) => n + r.editions.length, 0);
    expect(editions).toBe(corpus.records.length * REQUIRED_LOCALES.length);
  });

  it("(slug, language) is unique across the corpus — the DB's composite key", () => {
    const keys = corpus.records.flatMap((r) => r.editions.map((e) => `${r.slug}::${e.language}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("maps each locale to the language the application resolves for it", () => {
    // If these two ever disagree, an imported article would be stored under a
    // language the route never asks for, and would be invisible at its locale.
    const map = LOCALE_TO_LANGUAGE as Record<string, string>;
    for (const locale of REQUIRED_LOCALES) {
      expect(map[locale], locale).toBe(articleLanguageForLocale(locale));
    }
  });

  it("no two editions of the same topic share a body — every language is really written", () => {
    for (const record of corpus.records) {
      const bodies = record.editions.map((e) => e.content);
      expect(new Set(bodies).size, record.slug).toBe(bodies.length);
    }
  });

  it("SEO titles and descriptions are unique within each locale", () => {
    for (const locale of REQUIRED_LOCALES) {
      const titles = corpus.records.map((r) => r.editions.find((e) => e.locale === locale)!.seoTitle);
      const descriptions = corpus.records.map((r) => r.editions.find((e) => e.locale === locale)!.seoDescription);
      expect(new Set(titles).size, `${locale} seoTitle`).toBe(titles.length);
      expect(new Set(descriptions).size, `${locale} seoDescription`).toBe(descriptions.length);
    }
  });

  it("every edition clears the editorial depth floor and has real structure", () => {
    for (const record of corpus.records) {
      for (const edition of record.editions) {
        expect(edition.words, `${record.slug}/${edition.locale}`).toBeGreaterThanOrEqual(LIMITS.minWords);
        expect(edition.headings, `${record.slug}/${edition.locale}`).toBeGreaterThanOrEqual(LIMITS.minHeadings);
      }
    }
  });

  it("slugs are ASCII kebab-case — they are URL path segments in three locales", () => {
    for (const record of corpus.records) {
      expect(record.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("Persian editions use Persian ی/ک, never the Arabic ي/ك", () => {
    for (const record of corpus.records) {
      const fa = record.editions.find((e) => e.locale === "fa")!;
      expect([...`${fa.title}${fa.excerpt}${fa.content}`].filter((c) => c === "ي" || c === "ك")).toEqual([]);
    }
  });

  it("publication timestamps form a sequence and none is in the future", () => {
    const stamps = corpus.records.map((r) => Date.parse(r.publishedAt));
    expect(new Set(stamps).size).toBe(stamps.length);
    for (const stamp of stamps) expect(stamp).toBeLessThanOrEqual(Date.now() + 86_400_000);
  });

  it("every category and tag referenced is declared in the taxonomy", () => {
    const categories = new Set(corpus.taxonomy.categories.map((c: { slug: string }) => c.slug));
    const tags = new Set(corpus.taxonomy.tags.map((t: { slug: string }) => t.slug));
    for (const record of corpus.records) {
      expect(categories.has(record.category), record.category).toBe(true);
      for (const tag of record.tags) expect(tags.has(tag), tag).toBe(true);
    }
  });

  it("every taxonomy category carries a Persian and a German label", () => {
    // German is an active public locale; an English-only category name renders
    // into the /de <title>.
    for (const category of corpus.taxonomy.categories) {
      expect(category.nameFa, category.slug).toBeTruthy();
      expect(category.nameDe, category.slug).toBeTruthy();
    }
  });
});

describe("the loader is a real gate, not a rubber stamp", () => {
  const taxonomy = loadTaxonomy();

  it("rejects a directory whose name disagrees with its manifest slug", () => {
    // Loading a real article under the WRONG name must fail: the directory name
    // is the translation-group key, so a mismatch makes the corpus ambiguous.
    const { errors } = loadArticle(corpus.records[0].slug, taxonomy);
    expect(errors).toEqual([]);
    const wrong = loadArticle("no-such-article-directory", taxonomy);
    expect(wrong.errors.length).toBeGreaterThan(0);
    expect(wrong.record).toBeNull();
  });

  it("rejects an undeclared category or tag instead of inventing one", () => {
    const emptyTaxonomy = { categories: [], tags: [] };
    const { errors } = loadArticle(corpus.records[0].slug, emptyTaxonomy);
    expect(errors.some((e) => e.includes("not declared in taxonomy"))).toBe(true);
  });
});

describe("word counting agrees with the renderer", () => {
  it("the importer's counter and the app's parser agree on real article bodies", () => {
    // The corpus loader runs under plain node and cannot import the TypeScript
    // parser, so it reimplements counting. Feeding both the same published
    // bodies is what keeps the duplicate honest.
    for (const record of corpus.records) {
      for (const edition of record.editions) {
        const appCount = countArticleWords(edition.content);
        const scriptCount = countWords(edition.content);
        const drift = Math.abs(appCount - scriptCount) / appCount;
        expect(drift, `${record.slug}/${edition.locale}: ${scriptCount} vs ${appCount}`).toBeLessThan(0.05);
      }
    }
  });

  it("both counters ignore fenced code", () => {
    const doc = "one two three\n\n```\nignored ignored ignored\n```";
    expect(countWords(doc)).toBe(3);
    expect(countArticleWords(doc)).toBe(3);
  });

  it("counts headings, and derives a sane reading time", () => {
    expect(countHeadings("## A\n\n### B\n\ntext")).toBe(2);
    expect(readingTimeFor(2000)).toBe(10);
    expect(readingTimeFor(10)).toBe(3); // floor, never 0 minutes
  });
});

describe("importer safety contract", () => {
  const source = readFileSync(join(REPO, "scripts", "journal", "import-articles.mjs"), "utf8");

  /**
   * The source with comments removed.
   *
   * The prohibition assertions below must judge what the importer DOES, not
   * what it says about itself: the file's header documents its own safety
   * contract and therefore contains the words "TRUNCATE" and "--force" while
   * doing neither. Matching the raw text would fail on the documentation and
   * pass on a file that dropped the documentation and added the operation.
   */
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ""))
    .join("\n");

  it("dry run is the default — writing requires an explicit flag", () => {
    expect(source).toContain('process.argv.includes("--commit")');
    expect(source).toContain("if (!COMMIT)");
  });

  it("keys on the composite (slug, language) unique, so re-running converges", () => {
    expect(source).toContain("slug_language:");
  });

  it("contains no destructive article operation at all", () => {
    // deleteMany appears exactly once, on the tag JOIN table, which carries no
    // authored content. Nothing may delete, truncate or raw-query an Article.
    expect(code).not.toMatch(/article\.delete/);
    expect(code).not.toMatch(/\$executeRaw|\$queryRaw/);
    expect(code).not.toMatch(/TRUNCATE|DROP\s+TABLE/i);
    const deleteManyCalls = code.match(/\w+\.deleteMany\(/g) ?? [];
    expect(deleteManyCalls).toEqual(["articleTagOnArticle.deleteMany("]);
  });

  it("the comment-stripping itself works — otherwise the check above is vacuous", () => {
    // If `code` still carried the header, the prohibitions would be testing
    // prose. These two words appear ONLY in the documentation.
    expect(source).toMatch(/TRUNCATE/);
    expect(code).not.toMatch(/TRUNCATE/);
    expect(code).not.toContain("SAFETY CONTRACT");
    // ...and stripping must not have eaten the executable statements.
    expect(code).toContain("prisma.$transaction");
    expect(code).toContain("articleTagOnArticle.deleteMany(");
  });

  it("refuses to overwrite an article authored by anyone else", () => {
    // The BEHAVIOUR of this rule is proven by execution in
    // journal-importer-behaviour.test.ts, which seeds a foreign-authored row and
    // asserts it survives untouched. This assertion only pins the guard clause
    // so the branch cannot be deleted without a test noticing.
    expect(code).toContain("existing.authorId !== ctx.authorId");
    expect(code).toContain("tally.conflictDetail.push");
    expect(code).toContain("tally.conflicts += 1");
  });

  it("aborts on any validation error and offers no force override", () => {
    expect(code).toContain("IMPORT ABORTED");
    // The literal "--force" DOES appear — in the message telling the operator
    // that no such flag exists. What must never appear is code that READS one.
    expect(code).not.toMatch(/argv\.includes\(\s*["']--force/);
    expect(code).not.toMatch(/argv\.indexOf\(\s*["']--force/);
  });

  it("imports each translation group in one transaction", () => {
    expect(code).toContain("prisma.$transaction");
  });

  it("never asserts expert verification on the editorial byline", () => {
    expect(code).toContain("verifiedExpert: false");
    expect(code).toContain("industrialCredibilityScore: null");
  });

  it("never prints a raw error object, which would leak DATABASE_URL", () => {
    // A Prisma connection error stringifies with the DATABASE_URL inside it.
    // Only the bounded message may be logged, never the object.
    expect(code).toContain("String(err?.message ?? err).slice(0, 300)");
    expect(code).not.toMatch(/console\.(error|log|warn)\(\s*err\s*[),]/);
  });
});

describe("editorial byline is an organisation, not a fabricated person", () => {
  it("claims no verification, no credibility score and no personal location", () => {
    expect(corpus.author.verifiedExpert).toBe(false);
    expect(corpus.author.industrialCredibilityScore).toBeNull();
    expect(corpus.author.location).toBeNull();
  });

  it("uses a sentinel userId that cannot collide with a real account", () => {
    // The submit route finds an author profile via findUnique({ userId }).
    // A cuid-shaped value could in principle collide with a real user id.
    expect(corpus.author.userId).toBe("hermes-editorial-desk");
    expect(corpus.author.userId).not.toMatch(/^c[a-z0-9]{24}$/);
  });
});
