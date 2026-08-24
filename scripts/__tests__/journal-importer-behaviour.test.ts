import { describe, it, expect, beforeAll } from "vitest";
import { loadCorpus } from "../journal/lib/corpus.mjs";
import { createFakePrisma } from "../journal/lib/fake-prisma.mjs";
import {
  importGroup,
  upsertAuthor,
  upsertTaxonomy,
  createCounters,
  isUnchanged,
  articleFields,
} from "../journal/import-articles.mjs";

/**
 * PHASE 106 — the importer's SAFETY CONTRACT, proven by execution.
 *
 * The companion suite (journal-corpus.test.ts) asserts the contract against the
 * source text, which proves the code contains certain constructs. This suite
 * runs the REAL write path against an in-memory store and inspects the result,
 * which proves the behaviour.
 *
 * NOT PROVEN HERE: transactional atomicity. `createFakePrisma` runs a
 * `$transaction` callback directly and has no rollback, so a test claiming
 * atomicity against it would be asserting a guarantee the fixture cannot give.
 * That property belongs to a real-PostgreSQL rehearsal and is left unproven
 * rather than faked.
 */

const corpus = loadCorpus();

/**
 * Counts are DERIVED from the corpus, never pinned to a literal. The corpus
 * grows one editorial batch at a time; a suite that hard-codes "30 editions"
 * turns every content addition into a false test failure and teaches the next
 * author to edit the number rather than read the assertion. The behaviour
 * being proven — create-once, converge, never touch a foreign row — is
 * independent of how many topics exist.
 */
const TOPICS = corpus.records.length;
const EDITIONS = corpus.records.reduce((n, r) => n + r.editions.length, 0);

type Ctx = { authorId: string; categoryIds: Map<string, string>; tagIds: Map<string, string> };

/** Seed author + taxonomy into a fresh store, exactly as `main()` does. */
async function prepare(seed?: { articles?: Record<string, unknown>[] }) {
  const prisma = createFakePrisma(seed ?? {});
  const authorId = await upsertAuthor(prisma, corpus.author);
  const { categoryIds, tagIds } = await upsertTaxonomy(prisma, corpus.taxonomy);
  return { prisma, ctx: { authorId, categoryIds, tagIds } as Ctx };
}

async function runImport(prisma: ReturnType<typeof createFakePrisma>, ctx: Ctx, records = corpus.records) {
  const tally = createCounters();
  for (const record of records) await importGroup(prisma, record, ctx, tally);
  return tally;
}

describe("the corpus loads clean before anything is written", () => {
  it("loads without a validation error, and every topic is trilingual", () => {
    expect(corpus.errors).toEqual([]);
    // A floor, not a pin: it fails on an empty or half-loaded corpus without
    // failing on a corpus that simply grew.
    expect(TOPICS).toBeGreaterThanOrEqual(10);
    expect(EDITIONS).toBe(TOPICS * 3);
  });
});

describe("first import", () => {
  let store: Awaited<ReturnType<typeof prepare>>;
  let tally: ReturnType<typeof createCounters>;

  beforeAll(async () => {
    store = await prepare();
    tally = await runImport(store.prisma, store.ctx);
  });

  it("creates one row per edition and updates nothing", () => {
    expect(tally.created).toBe(EDITIONS);
    expect(tally.updated).toBe(0);
    expect(tally.unchanged).toBe(0);
    expect(tally.conflicts).toBe(0);
  });

  it("stores three language editions under each shared slug", () => {
    const rows = store.prisma._tables.article.rows as { slug: string; language: string }[];
    expect(rows).toHaveLength(EDITIONS);
    const bySlug = new Map<string, string[]>();
    for (const r of rows) bySlug.set(r.slug, [...(bySlug.get(r.slug) ?? []), r.language]);
    expect(bySlug.size).toBe(TOPICS);
    for (const [slug, langs] of bySlug) {
      expect([...langs].sort(), slug).toEqual(["DE", "EN", "FA"]);
    }
  });

  it("publishes every edition publicly and indexable", () => {
    const rows = store.prisma._tables.article.rows as Record<string, unknown>[];
    for (const r of rows) {
      expect(r.status).toBe("PUBLISHED");
      expect(r.visibility).toBe("PUBLIC");
      expect(r.noIndex).toBe(false);
      expect(r.authorId).toBe(store.ctx.authorId);
    }
  });

  it("never writes a cover image URL while no asset exists", () => {
    // The manifest carries a prompt and alt text with `url: null`; writing a
    // path to a file that was never produced would render as a broken image.
    const rows = store.prisma._tables.article.rows as Record<string, unknown>[];
    for (const r of rows) {
      expect(r.coverImageUrl).toBeNull();
      expect(r.ogImageUrl).toBeNull();
    }
  });

  it("attaches the declared tags and knowledge metadata", () => {
    expect(store.prisma._tables.articleTagOnArticle.rows.length).toBeGreaterThan(0);
    expect(store.prisma._tables.articleKnowledgeMetadata.rows).toHaveLength(EDITIONS);
  });
});

describe("idempotency — the property the whole safety contract rests on", () => {
  it("a second identical import updates nothing and creates nothing", async () => {
    const { prisma, ctx } = await prepare();
    const first = await runImport(prisma, ctx);
    const countAfterFirst = prisma._tables.article.rows.length;

    const second = await runImport(prisma, ctx);

    expect(first.created).toBe(EDITIONS);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.unchanged).toBe(EDITIONS);
    // The row count is the real proof: no duplicate edition was created.
    expect(prisma._tables.article.rows).toHaveLength(countAfterFirst);
  });

  it("converges after three runs, not just two", async () => {
    const { prisma, ctx } = await prepare();
    await runImport(prisma, ctx);
    await runImport(prisma, ctx);
    const third = await runImport(prisma, ctx);
    expect(third.unchanged).toBe(EDITIONS);
    expect(prisma._tables.article.rows).toHaveLength(EDITIONS);
  });

  it("re-imports an edition whose content changed, without duplicating it", async () => {
    const { prisma, ctx } = await prepare();
    await runImport(prisma, ctx);

    // Simulate an edited source file.
    const edited = structuredClone(corpus.records);
    edited[0].editions[0].title = "A revised title";

    const tally = await runImport(prisma, ctx, edited);
    expect(tally.updated).toBe(1);
    expect(tally.unchanged).toBe(EDITIONS - 1);
    expect(tally.created).toBe(0);
    expect(prisma._tables.article.rows).toHaveLength(EDITIONS);
  });
});

describe("articles this corpus does not describe are never touched", () => {
  it("preserves an unrelated pre-existing article", async () => {
    const preExisting = {
      id: "human-article-1",
      slug: "an-article-written-by-a-person",
      language: "EN",
      title: "Written by a human",
      authorId: "some-other-author",
      status: "PUBLISHED",
      visibility: "PUBLIC",
    };
    const { prisma, ctx } = await prepare({ articles: [preExisting] });
    await runImport(prisma, ctx);

    const survivor = prisma._tables.article.byId.get("human-article-1") as Record<string, unknown>;
    expect(survivor).toBeDefined();
    expect(survivor.title).toBe("Written by a human");
    expect(survivor.authorId).toBe("some-other-author");
    // Every imported edition + the one that was already there.
    expect(prisma._tables.article.rows).toHaveLength(EDITIONS + 1);
  });

  it("deletes nothing at all from the article table", async () => {
    const { prisma, ctx } = await prepare({
      articles: [{ id: "x", slug: "unrelated", language: "FA", title: "t", authorId: "someone" }],
    });
    await runImport(prisma, ctx);
    expect(prisma._tables.article.writes.deleted).toBe(0);
  });
});

describe("a foreign-authored article on the same slug is a conflict, never an overwrite", () => {
  it("leaves the row untouched and reports it", async () => {
    const target = corpus.records[0];
    const foreign = {
      id: "foreign-1",
      slug: target.slug,
      language: "EN",
      title: "Somebody else got here first",
      content: "original content",
      authorId: "a-different-author",
      status: "PUBLISHED",
      visibility: "PUBLIC",
    };
    const { prisma, ctx } = await prepare({ articles: [foreign] });
    const tally = await runImport(prisma, ctx);

    const row = prisma._tables.article.byId.get("foreign-1") as Record<string, unknown>;
    expect(row.title).toBe("Somebody else got here first");
    expect(row.content).toBe("original content");
    expect(row.authorId).toBe("a-different-author");

    expect(tally.conflicts).toBe(1);
    expect(tally.conflictDetail[0]).toContain(target.slug);
    expect(tally.conflictDetail[0]).toContain("left untouched");
  });

  it("still imports the other two languages of that same group", async () => {
    // A conflict on one edition must not block the translations that are free.
    const target = corpus.records[0];
    const { prisma, ctx } = await prepare({
      articles: [{ id: "foreign-1", slug: target.slug, language: "EN", authorId: "someone-else" }],
    });
    const tally = await runImport(prisma, ctx);

    const langs = (prisma._tables.article.rows as { slug: string; language: string }[])
      .filter((r) => r.slug === target.slug)
      .map((r) => r.language)
      .sort();
    expect(langs).toEqual(["DE", "EN", "FA"]);
    expect(tally.conflicts).toBe(1);
  });
});

describe("the editorial byline is never inflated by an import", () => {
  it("writes verifiedExpert false and a null credibility score", async () => {
    const { prisma } = await prepare();
    const author = prisma._tables.articleAuthorProfile.rows[0] as Record<string, unknown>;
    expect(author.verifiedExpert).toBe(false);
    expect(author.industrialCredibilityScore).toBeNull();
    expect(author.userId).toBe("hermes-editorial-desk");
  });

  it("re-running does not create a second author profile", async () => {
    const { prisma, ctx } = await prepare();
    await runImport(prisma, ctx);
    await upsertAuthor(prisma, corpus.author);
    expect(prisma._tables.articleAuthorProfile.rows).toHaveLength(1);
  });
});

describe("change detection", () => {
  const record = corpus.records[0];
  const edition = record.editions[0];
  const fields = articleFields(record, edition, "author-1", "cat-1");

  it("treats an identical row as unchanged", () => {
    expect(isUnchanged({ ...fields }, fields)).toBe(true);
  });

  it("detects a changed scalar", () => {
    expect(isUnchanged({ ...fields, title: "different" }, fields)).toBe(false);
  });

  it("compares dates by value, not by identity", () => {
    // Prisma hands back a new Date object every read; comparing by reference
    // would report every row as changed and make every run a full rewrite.
    const sameInstant = new Date((fields.publishedAt as Date).getTime());
    expect(isUnchanged({ ...fields, publishedAt: sameInstant }, fields)).toBe(true);
    expect(isUnchanged({ ...fields, publishedAt: new Date(0) }, fields)).toBe(false);
  });
});
