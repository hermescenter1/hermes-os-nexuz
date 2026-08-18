import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadCorpus } from "../lib/corpus.mjs";
import { importGroup, upsertAuthor, upsertTaxonomy, createCounters } from "../import-articles.mjs";

/**
 * PHASE 106 — transactional atomicity of a translation-group import, proven
 * against real PostgreSQL.
 *
 * WHY THIS FILE EXISTS
 * `journal-importer-behaviour.test.ts` proves idempotency and conflict safety
 * against an in-memory double. It deliberately does NOT claim atomicity,
 * because `fake-prisma.mjs` executes a `$transaction` callback directly and has
 * no rollback: a test asserting atomicity there would be asserting a guarantee
 * the fixture cannot provide. This file supplies the missing proof.
 *
 * HOW THE FAILURE IS INJECTED — AND WHY IT IS NOT A PRODUCTION BACKDOOR
 * `importGroup(prisma, record, ctx, tally)` already takes its client as a
 * parameter. The test passes a PROXY around the real client whose `article`
 * delegate throws on the Nth `create`. Nothing in `import-articles.mjs`
 * changes; there is no flag, no env var and no hook reachable from the CLI. The
 * production path constructs its own client and can never receive this proxy.
 *
 * SAFETY: this suite writes to whatever DATABASE_URL points at and is excluded
 * from `npm run test`. It refuses to run unless the database name looks like a
 * rehearsal/test target, so a mistyped environment cannot touch real data.
 */

const RAW_URL = process.env.DATABASE_URL ?? "";

/** Parse only the database name; never log the credentials. */
function databaseName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
}

const DB_NAME = databaseName(RAW_URL);
/**
 * Fail closed on anything that is not obviously disposable. The suite writes
 * and deliberately aborts transactions; pointing it at a real database would be
 * destructive, so "looks local" is not accepted as evidence — the NAME must say
 * rehearsal or test.
 */
const SAFE_TARGET = /(_rehearsal|_test|_ci)$/.test(DB_NAME);

let prisma: PrismaClient;
let ctx: { authorId: string; categoryIds: Map<string, string>; tagIds: Map<string, string> };

const corpus = loadCorpus();
/** A slug that exists in no manifest, so it cannot collide with Batch 1. */
const PROBE_SLUG = "phase106-rollback-probe-topic";

/** A synthetic translation group built from a real record's shape. */
function probeRecord() {
  const source = corpus.records[0];
  return {
    ...source,
    slug: PROBE_SLUG,
    editions: source.editions.map((e: Record<string, unknown>) => ({
      ...e,
      title: `probe ${e.language}`,
    })),
  };
}

/**
 * Wrap a client so the Nth `article.create` inside the transaction throws.
 * Everything else delegates untouched, so the code under test is the real one.
 */
function withFailingCreate(real: PrismaClient, failOnCall: number) {
  let creates = 0;
  const wrapTx = (tx: Record<string, unknown>) =>
    new Proxy(tx, {
      get(target, prop) {
        if (prop !== "article") return Reflect.get(target, prop);
        const article = Reflect.get(target, prop) as Record<string, unknown>;
        return new Proxy(article, {
          get(aTarget, aProp) {
            if (aProp !== "create") return Reflect.get(aTarget, aProp);
            return async (args: unknown) => {
              creates += 1;
              if (creates === failOnCall) {
                throw new Error(`INJECTED_FAILURE_ON_CREATE_${failOnCall}`);
              }
              return (Reflect.get(aTarget, aProp) as (a: unknown) => Promise<unknown>)(args);
            };
          },
        });
      },
    });

  return new Proxy(real, {
    get(target, prop) {
      if (prop !== "$transaction") return Reflect.get(target, prop);
      return (fn: (tx: unknown) => Promise<unknown>) =>
        (target.$transaction as (f: (tx: unknown) => Promise<unknown>) => Promise<unknown>)((tx) =>
          fn(wrapTx(tx as Record<string, unknown>)),
        );
    },
  }) as PrismaClient;
}

const rowsFor = (slug: string) =>
  prisma.article.findMany({
    where: { slug },
    select: { slug: true, language: true, title: true },
    orderBy: { language: "asc" },
  });

beforeAll(async () => {
  if (!RAW_URL) throw new Error("DATABASE_URL is required for the Phase 106 PostgreSQL rehearsal.");
  if (!SAFE_TARGET) {
    throw new Error(
      `Refusing to run: database "${DB_NAME}" is not a recognised rehearsal target ` +
        `(name must end in _rehearsal, _test or _ci).`,
    );
  }
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: RAW_URL }) });
  const authorId = await upsertAuthor(prisma, corpus.author);
  const { categoryIds, tagIds } = await upsertTaxonomy(prisma, corpus.taxonomy);
  ctx = { authorId, categoryIds, tagIds };
  // Start from a clean probe slug — only ever this synthetic slug.
  await prisma.article.deleteMany({ where: { slug: PROBE_SLUG } });
});

afterAll(async () => {
  if (prisma) {
    await prisma.article.deleteMany({ where: { slug: PROBE_SLUG } });
    await prisma.$disconnect();
  }
});

describe("guard rails", () => {
  it("refuses to run against anything that is not a rehearsal database", () => {
    expect(SAFE_TARGET, `database name was "${DB_NAME}"`).toBe(true);
    expect(DB_NAME).not.toMatch(/prod/i);
  });

  it("is talking to a real PostgreSQL server, not a double", async () => {
    const rows = await prisma.$queryRaw<Array<{ v: string }>>`SELECT version() AS v`;
    expect(rows[0].v).toContain("PostgreSQL");
  });
});

describe("a translation group imports atomically", () => {
  it("writes all three editions when nothing fails", async () => {
    const tally = createCounters();
    await importGroup(prisma, probeRecord(), ctx, tally);
    const rows = await rowsFor(PROBE_SLUG);
    expect(rows.map((r) => r.language).sort()).toEqual(["DE", "EN", "FA"]);
    expect(tally.created).toBe(3);
    await prisma.article.deleteMany({ where: { slug: PROBE_SLUG } });
  });
});

describe("POSTGRES_TRANSACTION_ROLLBACK", () => {
  it("persists NOTHING when the third edition fails after two succeeded", async () => {
    const before = await rowsFor(PROBE_SLUG);
    expect(before, "probe slug must start empty").toHaveLength(0);

    const failing = withFailingCreate(prisma, 3);
    const tally = createCounters();

    await expect(importGroup(failing, probeRecord(), ctx, tally)).rejects.toThrow(
      /INJECTED_FAILURE_ON_CREATE_3/,
    );

    // The two earlier creates DID execute inside the transaction — the tally
    // proves the failure was not injected before any work happened.
    expect(tally.created, "two editions were written before the injected failure").toBe(2);

    // ...and yet the database holds none of them.
    const after = await rowsFor(PROBE_SLUG);
    expect(after, "PARTIAL GROUP PERSISTED — this is a release blocker").toEqual([]);
  });

  it("leaves no EN-only or EN+FA partial state for any injection point", async () => {
    for (const failAt of [1, 2, 3]) {
      await prisma.article.deleteMany({ where: { slug: PROBE_SLUG } });
      const failing = withFailingCreate(prisma, failAt);
      await expect(
        importGroup(failing, probeRecord(), ctx, createCounters()),
      ).rejects.toThrow(/INJECTED_FAILURE/);
      const rows = await rowsFor(PROBE_SLUG);
      expect(rows, `failure injected at create #${failAt} left ${rows.length} row(s)`).toEqual([]);
    }
  });

  it("does not damage a PRE-EXISTING group when a later edition fails", async () => {
    // Import the group cleanly, capture it, then fail an update pass over it.
    await importGroup(prisma, probeRecord(), ctx, createCounters());
    const before = await rowsFor(PROBE_SLUG);
    expect(before).toHaveLength(3);

    // Force an update pass by changing every title, and fail during it.
    const edited = probeRecord();
    edited.editions = edited.editions.map((e: Record<string, unknown>) => ({
      ...e,
      title: `MUTATED ${e.language}`,
    }));

    // Updates go through `update`, not `create`, so make the knowledge-metadata
    // upsert the failure point instead: wrap so the 2nd upsert throws.
    let upserts = 0;
    const failingUpdate = new Proxy(prisma, {
      get(target, prop) {
        if (prop !== "$transaction") return Reflect.get(target, prop);
        return (fn: (tx: unknown) => Promise<unknown>) =>
          (target.$transaction as (f: (tx: unknown) => Promise<unknown>) => Promise<unknown>)((tx) =>
            fn(
              new Proxy(tx as Record<string, unknown>, {
                get(t, p) {
                  if (p !== "articleKnowledgeMetadata") return Reflect.get(t, p);
                  const km = Reflect.get(t, p) as Record<string, unknown>;
                  return new Proxy(km, {
                    get(kTarget, kProp) {
                      if (kProp !== "upsert") return Reflect.get(kTarget, kProp);
                      return async (args: unknown) => {
                        upserts += 1;
                        if (upserts === 2) throw new Error("INJECTED_FAILURE_ON_KM_UPSERT");
                        return (Reflect.get(kTarget, kProp) as (a: unknown) => Promise<unknown>)(args);
                      };
                    },
                  });
                },
              }),
            ),
          );
      },
    }) as PrismaClient;

    await expect(
      importGroup(failingUpdate, edited, ctx, createCounters()),
    ).rejects.toThrow(/INJECTED_FAILURE_ON_KM_UPSERT/);

    const after = await rowsFor(PROBE_SLUG);
    expect(after, "the pre-existing group must be byte-identical after the abort").toEqual(before);
    expect(after.every((r) => !r.title.startsWith("MUTATED"))).toBe(true);

    await prisma.article.deleteMany({ where: { slug: PROBE_SLUG } });
  });
});

describe("the imported corpus remains intact after all failure injection", () => {
  // Counts are DERIVED from the corpus on disk, never pinned to a literal.
  // A pinned number here silently becomes a false failure the moment the
  // corpus grows — which is exactly what happened when Batch 1's "29 rows
  // across 10 slugs" met the completed 50-topic corpus.
  it("still holds one editorial row per (slug, language) in the corpus", async () => {
    const expectedSlugs = corpus.records.length;
    const expectedRows = corpus.records.reduce((n, r) => n + r.editions.length, 0);

    const editorial = await prisma.article.findMany({
      where: { author: { userId: "hermes-editorial-desk" } },
      select: { slug: true, language: true },
    });

    // The probe slug is synthetic and is cleaned up by each test; anything
    // else present must be the corpus, complete and unduplicated.
    const corpusRows = editorial.filter((r) => r.slug !== PROBE_SLUG);
    expect(corpusRows).toHaveLength(expectedRows);
    expect(new Set(corpusRows.map((r) => r.slug)).size).toBe(expectedSlugs);
    expect(new Set(corpusRows.map((r) => `${r.slug}|${r.language}`)).size).toBe(expectedRows);
  });

  it("left no probe row behind", async () => {
    expect(await rowsFor(PROBE_SLUG)).toEqual([]);
  });
});
