/**
 * PHASE 106 — the Journal content corpus: load, validate, and shape for import.
 *
 * ONE LOADER, TWO CONSUMERS. `validate-content.mjs` and `import-articles.mjs`
 * both read the corpus through this module, so the importer can never accept a
 * record the validator would have rejected — the usual failure mode when a
 * "check" script and a "write" script parse the same files independently.
 *
 * NO DATABASE, NO NETWORK. This module only reads files. Everything it returns
 * is plain data; the decision to write anything belongs to the importer alone.
 *
 * ON-DISK SHAPE
 * ─────────────
 *   content/journal/
 *     taxonomy.json                     categories + tags (upserted, never invented)
 *     author.json                       the editorial author identity
 *     articles/<slug>/
 *       article.json                    metadata shared + per-edition
 *       en.md  fa.md  de.md             the three bodies
 *
 * The directory name MUST equal the manifest slug, and that slug is the
 * translation-group key: all three editions are stored under it, distinguished
 * by `language` (see prisma/schema.prisma, Article @@unique([slug, language])).
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..", "..");
export const CONTENT_DIR = join(REPO, "content", "journal");
export const ARTICLES_DIR = join(CONTENT_DIR, "articles");

/** The locales an article must exist in. Order is the platform's own. */
export const REQUIRED_LOCALES = ["fa", "en", "de"];

/** locale -> Prisma ArtLanguage. Mirrors src/lib/articles/locale.ts. */
export const LOCALE_TO_LANGUAGE = { fa: "FA", en: "EN", de: "DE" };

/** Valid Prisma ArtContentType values. */
const CONTENT_TYPES = new Set([
  "TECHNICAL_ARTICLE",
  "INDUSTRIAL_CASE_STUDY",
  "TROUBLESHOOTING_REPORT",
  "PROJECT_REPORT",
  "MAINTENANCE_INSIGHT",
  "PLC_SCADA_TUTORIAL",
  "FAILURE_ANALYSIS",
  "ASSET_RELIABILITY_NOTE",
  "ENGINEERING_OPINION",
  "RESEARCH_SUMMARY",
  "FIELD_COMMISSIONING_NOTE",
  "SAFETY_COMPLIANCE_NOTE",
]);

/**
 * EDITORIAL FLOORS.
 *
 * These are quality gates, not stylistic preferences. An "article" that is 400
 * words long is a note, and shipping it under an engineering-authority banner
 * devalues everything beside it. The word floor is deliberately below the
 * 1,800-word editorial target so a genuinely dense, shorter piece is not
 * blocked — it catches stubs, not concision.
 *
 * SEO lengths follow what search engines actually render, and are checked as
 * WARNINGS rather than errors: a truncated title is a missed opportunity, not a
 * broken page.
 */
export const LIMITS = {
  minWords: 900,
  seoTitleMin: 40,
  seoTitleMax: 70,
  seoDescriptionMin: 120,
  seoDescriptionMax: 170,
  excerptMin: 80,
  minHeadings: 5,
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** Strip the `$comment` documentation key used inside the JSON sources. */
const stripComments = (obj) => {
  const { $comment, ...rest } = obj;
  void $comment;
  return rest;
};

export function loadTaxonomy() {
  return stripComments(readJson(join(CONTENT_DIR, "taxonomy.json")));
}

export function loadAuthor() {
  return stripComments(readJson(join(CONTENT_DIR, "author.json")));
}

/** Article directory names, sorted so every run is deterministic. */
export function listArticleSlugs() {
  if (!existsSync(ARTICLES_DIR)) return [];
  return readdirSync(ARTICLES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => {
      try {
        return statSync(join(ARTICLES_DIR, name, "article.json")).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

/**
 * Count words the way the app's parser does — prose, list items and table cells,
 * never code blocks. Duplicated here rather than imported because this script
 * runs under plain node with no TypeScript transform; the two are covered by a
 * test that feeds both the same document.
 */
export function countWords(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
  let words = 0;
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const text = line
      .replace(/^\s*#{1,3}\s+/, "")
      .replace(/^\s*[-*]\s+/, "")
      .replace(/^\s*\d+[.)]\s+/, "")
      .replace(/^\s*>\s?/, "")
      .replace(/\|/g, " ")
      .replace(/`[^`]*`/g, " ")
      .replace(/\*\*/g, "");
    // A table delimiter row carries no words.
    if (/^[\s:|-]+$/.test(line)) continue;
    words += text.split(/\s+/).filter(Boolean).length;
  }
  return words;
}

/** Distinct `##`/`###` headings — a proxy for real structure. */
export function countHeadings(markdown) {
  return String(markdown)
    .split("\n")
    .filter((l) => /^#{2,3}\s+\S/.test(l.trim())).length;
}

/**
 * Load one article directory into the shape the importer writes.
 *
 * Returns `{ record, errors, warnings }`. A record with errors is still
 * returned so the validator can report EVERY problem in one run instead of
 * stopping at the first bad file.
 */
export function loadArticle(slug, taxonomy) {
  const errors = [];
  const warnings = [];
  const dir = join(ARTICLES_DIR, slug);
  const manifestPath = join(dir, "article.json");

  let manifest;
  try {
    manifest = stripComments(readJson(manifestPath));
  } catch (err) {
    return { record: null, errors: [`${slug}: article.json is unreadable — ${err.message}`], warnings };
  }

  const fail = (msg) => errors.push(`${slug}: ${msg}`);
  const warn = (msg) => warnings.push(`${slug}: ${msg}`);

  // The directory name is the slug. Anything else makes the corpus ambiguous.
  if (manifest.slug !== slug) fail(`manifest slug "${manifest.slug}" != directory name "${slug}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail("slug must be lowercase-kebab ASCII");

  if (!CONTENT_TYPES.has(manifest.contentType)) fail(`unknown contentType "${manifest.contentType}"`);

  const categorySlugs = new Set(taxonomy.categories.map((c) => c.slug));
  if (!categorySlugs.has(manifest.category)) fail(`category "${manifest.category}" is not declared in taxonomy.json`);

  const tagSlugs = new Set(taxonomy.tags.map((t) => t.slug));
  const tags = Array.isArray(manifest.tags) ? manifest.tags : [];
  if (tags.length === 0) fail("at least one tag is required");
  for (const tag of tags) {
    if (!tagSlugs.has(tag)) fail(`tag "${tag}" is not declared in taxonomy.json`);
  }

  const publishedAt = manifest.publishedAt;
  if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) {
    fail(`publishedAt "${publishedAt}" is not a valid ISO timestamp`);
  }

  const editions = [];
  for (const locale of REQUIRED_LOCALES) {
    const meta = manifest.editions?.[locale];
    const bodyPath = join(dir, `${locale}.md`);

    if (!meta) {
      fail(`missing "${locale}" edition metadata`);
      continue;
    }
    if (!existsSync(bodyPath)) {
      fail(`missing body file ${locale}.md`);
      continue;
    }

    const content = readFileSync(bodyPath, "utf8").replace(/\r\n?/g, "\n").trim();
    const words = countWords(content);
    const headings = countHeadings(content);

    for (const field of ["title", "excerpt", "seoTitle", "seoDescription"]) {
      if (!meta[field] || String(meta[field]).trim().length === 0) {
        fail(`${locale}: "${field}" is empty`);
      }
    }

    if (content.length === 0) fail(`${locale}: body is empty`);
    if (words < LIMITS.minWords) fail(`${locale}: ${words} words is below the ${LIMITS.minWords}-word editorial floor`);
    if (headings < LIMITS.minHeadings) {
      fail(`${locale}: ${headings} section headings is below the ${LIMITS.minHeadings} required for a structured article`);
    }
    if (meta.excerpt && meta.excerpt.length < LIMITS.excerptMin) {
      warn(`${locale}: excerpt is only ${meta.excerpt.length} characters`);
    }
    if (meta.seoTitle) {
      const n = meta.seoTitle.length;
      if (n < LIMITS.seoTitleMin || n > LIMITS.seoTitleMax) {
        warn(`${locale}: seoTitle is ${n} characters (target ${LIMITS.seoTitleMin}–${LIMITS.seoTitleMax})`);
      }
    }
    if (meta.seoDescription) {
      const n = meta.seoDescription.length;
      if (n < LIMITS.seoDescriptionMin || n > LIMITS.seoDescriptionMax) {
        warn(`${locale}: seoDescription is ${n} characters (target ${LIMITS.seoDescriptionMin}–${LIMITS.seoDescriptionMax})`);
      }
    }

    // Persian orthography — the repository standard (CLAUDE.md): Persian ی/ک,
    // never the Arabic ي/ك. A single Arabic character makes the whole page
    // render in a different typeface on some systems.
    if (locale === "fa") {
      const arabic = [...`${meta.title}${meta.excerpt ?? ""}${content}`].filter((ch) => ch === "ي" || ch === "ك");
      if (arabic.length > 0) {
        fail(`fa: contains ${arabic.length} Arabic ي/ك character(s) — use Persian ی/ک`);
      }
    }

    editions.push({
      locale,
      language: LOCALE_TO_LANGUAGE[locale],
      title: String(meta.title ?? "").trim(),
      subtitle: meta.subtitle ? String(meta.subtitle).trim() : null,
      excerpt: String(meta.excerpt ?? "").trim(),
      seoTitle: String(meta.seoTitle ?? "").trim(),
      seoDescription: String(meta.seoDescription ?? "").trim(),
      content,
      words,
      headings,
    });
  }

  // Every edition must be genuinely written, not copy-pasted from a sibling.
  // Identical bodies across two locales is the signature of an untranslated
  // placeholder, which is exactly what this corpus must never ship.
  for (let i = 0; i < editions.length; i++) {
    for (let j = i + 1; j < editions.length; j++) {
      if (editions[i].content === editions[j].content) {
        fail(`${editions[i].locale} and ${editions[j].locale} bodies are byte-identical — one is not translated`);
      }
      if (editions[i].title === editions[j].title) {
        warn(`${editions[i].locale} and ${editions[j].locale} share the same title`);
      }
    }
  }

  const record = {
    slug,
    contentType: manifest.contentType,
    category: manifest.category,
    tags,
    publishedAt,
    coverImage: manifest.coverImage ?? null,
    knowledge: manifest.knowledge ?? null,
    editions,
  };

  return { record, errors, warnings };
}

/** Load the whole corpus. Never throws on content problems — it reports them. */
export function loadCorpus() {
  const taxonomy = loadTaxonomy();
  const author = loadAuthor();
  const slugs = listArticleSlugs();

  const records = [];
  const errors = [];
  const warnings = [];

  for (const slug of slugs) {
    const result = loadArticle(slug, taxonomy);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    if (result.record) records.push(result.record);
  }

  // A slug collision cannot happen through directory names, but a manifest slug
  // that disagrees with its directory could produce one — check explicitly.
  const seen = new Map();
  for (const record of records) {
    for (const edition of record.editions) {
      const key = `${record.slug}::${edition.language}`;
      if (seen.has(key)) errors.push(`duplicate (slug, language) pair: ${key}`);
      seen.set(key, true);
    }
  }

  return { taxonomy, author, records, errors, warnings };
}

/**
 * Reading time in minutes from the word count.
 *
 * 200 wpm is a conventional figure for technical prose and is applied
 * identically to all three languages: it is an approximate reading aid, and
 * pretending to per-language precision would be false rigour. Minimum 3.
 */
export function readingTimeFor(words) {
  return Math.max(3, Math.round(words / 200));
}
