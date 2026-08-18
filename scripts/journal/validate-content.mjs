/**
 * PHASE 106 — Journal content validator.
 *
 * Reads the on-disk corpus and reports whether it is fit to import. Touches no
 * database and opens no network connection, so it is safe to run anywhere and
 * is the gate the importer's dry-run depends on.
 *
 * The exit code is the contract: 0 only when CONTENT_VALIDATION=PASS.
 *
 * Usage:
 *   node scripts/journal/validate-content.mjs
 *   node scripts/journal/validate-content.mjs --json    # machine-readable
 */

import { loadCorpus, REQUIRED_LOCALES, LIMITS } from "./lib/corpus.mjs";

const JSON_OUT = process.argv.includes("--json");

/**
 * Cross-article checks: everything that cannot be judged by looking at one
 * article in isolation.
 */
function corpusChecks(records) {
  const errors = [];
  const warnings = [];

  // Unique slugs (the translation-group key).
  const slugCounts = new Map();
  for (const r of records) slugCounts.set(r.slug, (slugCounts.get(r.slug) ?? 0) + 1);
  for (const [slug, n] of slugCounts) {
    if (n > 1) errors.push(`duplicate slug across article directories: ${slug} (${n}x)`);
  }

  // Unique SEO metadata. Two articles sharing a meta description compete with
  // each other for the same query and teach a crawler they are the same page.
  const seenTitles = new Map();
  const seenDescriptions = new Map();
  for (const r of records) {
    for (const e of r.editions) {
      const tKey = `${e.locale}::${e.seoTitle}`;
      const dKey = `${e.locale}::${e.seoDescription}`;
      if (seenTitles.has(tKey)) errors.push(`duplicate ${e.locale} seoTitle shared by ${seenTitles.get(tKey)} and ${r.slug}`);
      else seenTitles.set(tKey, r.slug);
      if (seenDescriptions.has(dKey)) errors.push(`duplicate ${e.locale} seoDescription shared by ${seenDescriptions.get(dKey)} and ${r.slug}`);
      else seenDescriptions.set(dKey, r.slug);
    }
  }

  // Publication timestamps should form an editorial sequence rather than a
  // single bulk-insert instant — 150 articles all stamped the same second is
  // visibly machine-generated.
  const stamps = new Set(records.map((r) => r.publishedAt));
  if (records.length > 1 && stamps.size === 1) {
    warnings.push(`all ${records.length} articles share one publishedAt timestamp`);
  }

  // Nothing may claim to have been published before it was written.
  const now = Date.now();
  for (const r of records) {
    if (Date.parse(r.publishedAt) > now + 86_400_000) {
      warnings.push(`${r.slug}: publishedAt is more than a day in the future`);
    }
  }

  return { errors, warnings };
}

function main() {
  const corpus = loadCorpus();
  const cross = corpusChecks(corpus.records);

  const errors = [...corpus.errors, ...cross.errors];
  const warnings = [...corpus.warnings, ...cross.warnings];

  const perLocale = Object.fromEntries(
    REQUIRED_LOCALES.map((locale) => [
      locale,
      corpus.records.filter((r) => r.editions.some((e) => e.locale === locale)).length,
    ]),
  );
  const totalEditions = corpus.records.reduce((n, r) => n + r.editions.length, 0);
  const missingTranslations = corpus.records.reduce(
    (n, r) => n + (REQUIRED_LOCALES.length - r.editions.length),
    0,
  );
  const wordsByLocale = Object.fromEntries(
    REQUIRED_LOCALES.map((locale) => [
      locale,
      corpus.records.reduce((n, r) => n + (r.editions.find((e) => e.locale === locale)?.words ?? 0), 0),
    ]),
  );

  const pass = errors.length === 0;

  if (JSON_OUT) {
    console.log(JSON.stringify({
      topics: corpus.records.length,
      editions: totalEditions,
      perLocale,
      wordsByLocale,
      missingTranslations,
      errors,
      warnings,
      verdict: pass ? "PASS" : "FAIL",
    }, null, 2));
    process.exit(pass ? 0 : 1);
  }

  const expected = corpus.records.length * REQUIRED_LOCALES.length;
  console.log("HERMES JOURNAL CONTENT VALIDATION");
  console.log("");
  console.log(`Topics:                       ${corpus.records.length}`);
  console.log(`Expected localized editions:  ${expected}`);
  console.log(`Actual localized editions:    ${totalEditions}`);
  for (const locale of REQUIRED_LOCALES) {
    console.log(`  ${locale}:                          ${perLocale[locale]}  (${wordsByLocale[locale].toLocaleString("en-US")} words)`);
  }
  console.log(`Missing translations:         ${missingTranslations}`);
  console.log(`Editorial word floor:         ${LIMITS.minWords} per edition`);
  console.log("");
  console.log(`Errors:                       ${errors.length}`);
  for (const e of errors) console.log(`  ERROR   ${e}`);
  console.log(`Warnings:                     ${warnings.length}`);
  for (const w of warnings) console.log(`  WARN    ${w}`);
  console.log("");
  console.log(`CONTENT_VALIDATION=${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}

main();
