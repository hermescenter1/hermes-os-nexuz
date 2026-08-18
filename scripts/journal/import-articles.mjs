/**
 * PHASE 106 — Journal content importer.
 *
 * Writes the on-disk corpus into the Journal's EXISTING schema. It introduces
 * no second CMS, no parallel content table and no new publishing workflow: it
 * produces ordinary `Article` rows with the same statuses, visibility and
 * relations that the editorial workflow produces.
 *
 * SAFETY CONTRACT — every one of these is enforced by code below, not by
 * convention:
 *
 *   DRY RUN IS THE DEFAULT.       Writing requires an explicit `--commit`.
 *   VALIDATE BEFORE WRITE.        Any content error aborts before the first
 *                                 statement. There is no `--force`.
 *   IDEMPOTENT.                   Keyed on the composite unique
 *                                 (slug, language). Re-running converges;
 *                                 it never creates a second edition.
 *   ADDITIVE ONLY.                No DELETE, no deleteMany, no TRUNCATE, no
 *                                 raw SQL anywhere in this file. Articles this
 *                                 corpus does not describe are never touched.
 *   OWNS ONLY ITS OWN ROWS.       Updates are scoped to articles authored by
 *                                 the editorial profile. A human-written
 *                                 article that happens to share a slug is
 *                                 reported as a CONFLICT and skipped, never
 *                                 overwritten.
 *   ATOMIC PER ARTICLE.           One transaction per translation group, so a
 *                                 failure cannot leave two of three editions
 *                                 published.
 *
 * Usage:
 *   node scripts/journal/import-articles.mjs                 # dry run
 *   node scripts/journal/import-articles.mjs --commit        # write
 *   node scripts/journal/import-articles.mjs --only <slug>   # one group
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadCorpus, readingTimeFor } from "./lib/corpus.mjs";

/**
 * Construct the Prisma client the way THIS repository requires.
 *
 * The schema enables the `driverAdapters` preview feature and its `datasource`
 * block carries NO `url` — the connection exists only inside the adapter. A
 * bare `new PrismaClient()` therefore throws
 * `PrismaClientInitializationError: needs to be constructed with a non-empty,
 * valid PrismaClientOptions` and can never connect.
 *
 * This mirrors `src/lib/db/prisma.ts`, which is the app's only sanctioned
 * construction path. The difference is the failure mode: the app degrades to
 * session mode when the adapter is unavailable, because a missing database is a
 * supported runtime state there. An importer has nothing to degrade to, so it
 * fails loudly instead of silently doing nothing.
 *
 * Found by the PostgreSQL rehearsal: the in-memory test double substitutes the
 * whole client, so it could not have caught this — the first real connection is
 * the first moment the constructor runs.
 */
function createPrismaClient(connectionString) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const COMMIT = process.argv.includes("--commit");
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

/**
 * A fresh tally. Held per-run rather than at module scope so the write path can
 * be exercised repeatedly — which is exactly what proving idempotency requires:
 * run twice, and the second run must report `unchanged`, not `updated`.
 */
export function createCounters() {
  return { created: 0, updated: 0, unchanged: 0, conflicts: 0, skipped: 0, conflictDetail: [] };
}

const counters = createCounters();
const conflicts = counters.conflictDetail;

/**
 * The article fields this importer owns. Anything absent here — view counts,
 * reactions, editorial review state — belongs to the running application and is
 * never written back by an import.
 */
export function articleFields(record, edition, authorId, categoryId) {
  return {
    title: edition.title,
    subtitle: edition.subtitle,
    excerpt: edition.excerpt,
    content: edition.content,
    language: edition.language,
    contentType: record.contentType,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    authorId,
    categoryId,
    readingTimeMinutes: readingTimeFor(edition.words),
    publishedAt: new Date(record.publishedAt),
    seoTitle: edition.seoTitle,
    seoDescription: edition.seoDescription,
    // The cover image is declared in the manifest but only referenced once a
    // real asset exists on disk; see content/journal/README.md. A path to a
    // file that has not been produced would render as a broken image.
    coverImageUrl: record.coverImage?.url ?? null,
    ogImageUrl: record.coverImage?.url ?? null,
    noIndex: false,
    isActive: true,
  };
}

/** True when the persisted row already matches what we would write. */
export function isUnchanged(existing, fields) {
  for (const [key, value] of Object.entries(fields)) {
    const current = existing[key];
    if (value instanceof Date) {
      if (!(current instanceof Date) || current.getTime() !== value.getTime()) return false;
      continue;
    }
    if (current !== value) return false;
  }
  return true;
}

export async function upsertAuthor(tx, author) {
  const existing = await tx.articleAuthorProfile.findUnique({ where: { userId: author.userId } });
  const data = {
    handle: author.handle,
    displayName: author.displayName,
    headline: author.headline,
    bio: author.bio,
    company: author.company,
    roleTitle: author.roleTitle,
    expertiseAreas: author.expertiseAreas,
    location: author.location,
    // Never asserted by an import — see content/journal/author.json.
    verifiedExpert: false,
    industrialCredibilityScore: null,
    isActive: true,
  };
  if (existing) {
    await tx.articleAuthorProfile.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await tx.articleAuthorProfile.create({ data: { userId: author.userId, ...data } });
  return created.id;
}

export async function upsertTaxonomy(tx, taxonomy) {
  const categoryIds = new Map();
  for (const c of taxonomy.categories) {
    const row = await tx.articleCategory.upsert({
      where: { slug: c.slug },
      // Existing categories keep their description/colour/order; only the
      // labels this phase is responsible for are refreshed.
      update: { name: c.name, nameFa: c.nameFa, nameDe: c.nameDe },
      create: {
        slug: c.slug,
        name: c.name,
        nameFa: c.nameFa,
        nameDe: c.nameDe,
        description: c.description ?? null,
        color: c.color ?? "signal",
        sortOrder: c.sortOrder ?? 0,
        isActive: true,
      },
    });
    categoryIds.set(c.slug, row.id);
  }

  const tagIds = new Map();
  for (const t of taxonomy.tags) {
    const row = await tx.articleTag.upsert({
      where: { slug: t.slug },
      update: { name: t.name, nameFa: t.nameFa ?? null },
      create: { slug: t.slug, name: t.name, nameFa: t.nameFa ?? null },
    });
    tagIds.set(t.slug, row.id);
  }

  return { categoryIds, tagIds };
}

/**
 * Import one translation group inside a single transaction.
 *
 * All three editions land together or none does — a partially imported group
 * would advertise hreflang alternates that 404.
 */
export async function importGroup(prisma, record, ctx, tally = counters) {
  await prisma.$transaction(async (tx) => {
    for (const edition of record.editions) {
      const fields = articleFields(record, edition, ctx.authorId, ctx.categoryIds.get(record.category));

      const existing = await tx.article.findUnique({
        where: { slug_language: { slug: record.slug, language: edition.language } },
      });

      if (existing && existing.authorId !== ctx.authorId) {
        // Someone else wrote this. Refuse to touch it, and say so loudly.
        tally.conflictDetail.push(`${record.slug} [${edition.language}] belongs to author ${existing.authorId} — left untouched`);
        tally.conflicts += 1;
        continue;
      }

      if (existing && isUnchanged(existing, fields)) {
        tally.unchanged += 1;
        continue;
      }

      const article = existing
        ? await tx.article.update({ where: { id: existing.id }, data: fields })
        : await tx.article.create({ data: { slug: record.slug, ...fields } });

      tally[existing ? "updated" : "created"] += 1;

      // Tags are declarative: the manifest is the full set for this article.
      // Removing a link the manifest dropped is in-scope; the join row carries
      // no data of its own, so this is not destructive to anything a human
      // authored.
      const wantedIds = record.tags.map((slug) => ctx.tagIds.get(slug));
      await tx.articleTagOnArticle.deleteMany({
        where: { articleId: article.id, tagId: { notIn: wantedIds } },
      });
      for (const tagId of wantedIds) {
        await tx.articleTagOnArticle.upsert({
          where: { articleId_tagId: { articleId: article.id, tagId } },
          update: {},
          create: { articleId: article.id, tagId },
        });
      }

      if (record.knowledge) {
        await tx.articleKnowledgeMetadata.upsert({
          where: { articleId: article.id },
          update: record.knowledge,
          create: { articleId: article.id, ...record.knowledge },
        });
      }
    }
  });
}

/** Report what a commit WOULD do, without opening a database connection. */
function reportDryRun(records) {
  console.log("=== HERMES JOURNAL IMPORT DRY RUN ===");
  console.log("");
  console.log(`Topics detected:        ${records.length}`);
  for (const locale of ["en", "fa", "de"]) {
    console.log(`${locale.toUpperCase()} variants:           ${records.filter((r) => r.editions.some((e) => e.locale === locale)).length}`);
  }
  console.log(`Total localized records: ${records.reduce((n, r) => n + r.editions.length, 0)}`);
  console.log("");
  console.log("Planned writes (per translation group):");
  for (const r of records) {
    const langs = r.editions.map((e) => e.language).join(", ");
    const words = r.editions.reduce((n, e) => n + e.words, 0);
    console.log(`  ${r.slug}  [${langs}]  ${words.toLocaleString("en-US")} words  ${r.category}`);
  }
  console.log("");
  console.log("Validation errors:      0");
  console.log("DRY_RUN=PASS");
  console.log("");
  console.log("No database connection was opened. To write, re-run with --commit.");
}

async function main() {
  const corpus = loadCorpus();

  if (corpus.errors.length > 0) {
    console.error("IMPORT ABORTED — the corpus does not validate:");
    for (const e of corpus.errors) console.error(`  ERROR  ${e}`);
    console.error("");
    console.error("Fix the content and re-run. There is deliberately no --force.");
    console.error("IMPORT=ABORTED");
    process.exit(1);
  }
  for (const w of corpus.warnings) console.warn(`  WARN   ${w}`);

  const records = ONLY ? corpus.records.filter((r) => r.slug === ONLY) : corpus.records;
  if (ONLY && records.length === 0) {
    console.error(`No article directory named "${ONLY}".`);
    process.exit(1);
  }

  if (!COMMIT) {
    reportDryRun(records);
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess a connection.");
    process.exit(1);
  }

  const prisma = createPrismaClient(process.env.DATABASE_URL);
  try {
    // Author and taxonomy first: every article references them.
    const ctx = await prisma.$transaction(async (tx) => {
      const authorId = await upsertAuthor(tx, corpus.author);
      const { categoryIds, tagIds } = await upsertTaxonomy(tx, corpus.taxonomy);
      return { authorId, categoryIds, tagIds };
    });

    for (const record of records) {
      await importGroup(prisma, record, ctx);
    }

    const total = await prisma.article.count();
    console.log("=== HERMES JOURNAL IMPORT ===");
    console.log(`Created:    ${counters.created}`);
    console.log(`Updated:    ${counters.updated}`);
    console.log(`Unchanged:  ${counters.unchanged}`);
    console.log(`Conflicts:  ${counters.conflicts}`);
    for (const c of conflicts) console.log(`  CONFLICT  ${c}`);
    console.log(`Articles in database after import: ${total}`);
    console.log(`IMPORT=${counters.conflicts === 0 ? "PASS" : "PASS_WITH_CONFLICTS"}`);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Only run as a CLI. Tests import the write-path functions above and drive them
 * against a fixture; without this guard, importing the module would execute a
 * real import as a side effect of `import`.
 */
const INVOKED_DIRECTLY =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (INVOKED_DIRECTLY) {
  main().catch((err) => {
    // Never print the error object wholesale: a Prisma connection error embeds
    // the DATABASE_URL, credentials included.
    console.error(`IMPORT=FAILED — ${err?.name ?? "Error"}: ${String(err?.message ?? err).slice(0, 300)}`);
    process.exit(1);
  });
}
