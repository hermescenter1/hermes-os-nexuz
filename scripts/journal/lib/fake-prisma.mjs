/**
 * PHASE 106 — an in-memory stand-in for the Prisma client, used ONLY by tests.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The importer's safety claims — idempotent on `(slug, language)`, additive
 * only, foreign-authored articles left untouched — are behavioural. Asserting
 * them by grepping the source proves the code contains some words. Running the
 * real write path against this store and inspecting the result proves the
 * behaviour.
 *
 * It models exactly the surface `import-articles.mjs` uses, and nothing else:
 * upsert/findUnique/create/update on the handful of models involved, plus
 * `$transaction`. It is deliberately NOT a general Prisma emulator.
 *
 * WHAT IT DELIBERATELY DOES NOT MODEL
 * ───────────────────────────────────
 * Real transactional rollback. `$transaction` here runs the callback directly,
 * so a mid-transaction throw leaves partial state — the opposite of PostgreSQL.
 * Tests must therefore not use this to claim atomicity; that property is
 * asserted separately against the source and belongs to a real database
 * rehearsal. Pretending otherwise would be a test that proves a guarantee the
 * fixture cannot provide.
 */

let idCounter = 0;
const nextId = (prefix) => `${prefix}-${++idCounter}`;

/** A minimal table keyed by one or more unique fields. */
class Table {
  /**
   * @param {string} prefix id prefix for generated rows
   * @param {(row: Record<string, unknown>) => string} keyOf unique-key extractor
   */
  constructor(prefix, keyOf) {
    this.prefix = prefix;
    this.keyOf = keyOf;
    /** @type {Map<string, Record<string, unknown>>} */
    this.byKey = new Map();
    /** @type {Map<string, Record<string, unknown>>} */
    this.byId = new Map();
    this.writes = { created: 0, updated: 0, deleted: 0 };
  }

  /** Resolve a Prisma-style `where` into the row it identifies, or null. */
  find(where) {
    if (where.id) return this.byId.get(where.id) ?? null;
    const key = this.keyOf(flattenWhere(where));
    return this.byKey.get(key) ?? null;
  }

  create(data) {
    const row = { id: data.id ?? nextId(this.prefix), ...data };
    this.byId.set(row.id, row);
    this.byKey.set(this.keyOf(row), row);
    this.writes.created += 1;
    return row;
  }

  update(where, data) {
    const existing = this.find(where);
    if (!existing) throw new Error(`${this.prefix}: update target not found`);
    // A key change must move the key index, exactly as a unique index would.
    this.byKey.delete(this.keyOf(existing));
    Object.assign(existing, data);
    this.byKey.set(this.keyOf(existing), existing);
    this.writes.updated += 1;
    return existing;
  }

  upsert({ where, update, create }) {
    const existing = this.find(where);
    if (existing) return this.update(where, update);
    return this.create(create);
  }

  get rows() {
    return [...this.byId.values()];
  }
}

/**
 * Prisma nests composite-unique lookups under a compound key name, e.g.
 * `{ slug_language: { slug, language } }`. Flatten one level so the key
 * extractor sees plain fields.
 */
function flattenWhere(where) {
  const out = {};
  for (const [k, v] of Object.entries(where)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) Object.assign(out, v);
    else out[k] = v;
  }
  return out;
}

/**
 * Build a fake client.
 *
 * @param {{ articles?: Record<string, unknown>[] }} [seed] rows present before
 *   the import — used to model articles a human authored.
 */
export function createFakePrisma(seed = {}) {
  const article = new Table("art", (r) => `${r.slug}::${r.language}`);
  const articleAuthorProfile = new Table("author", (r) => String(r.userId));
  const articleCategory = new Table("cat", (r) => String(r.slug));
  const articleTag = new Table("tag", (r) => String(r.slug));
  const articleTagOnArticle = new Table("tagon", (r) => `${r.articleId}::${r.tagId}`);
  const articleKnowledgeMetadata = new Table("km", (r) => String(r.articleId));

  for (const row of seed.articles ?? []) article.create(row);
  // Seeding is setup, not import activity.
  article.writes = { created: 0, updated: 0, deleted: 0 };

  const wrap = (table) => ({
    findUnique: async ({ where }) => table.find(where),
    findFirst: async ({ where }) => table.find(where),
    create: async ({ data }) => table.create(data),
    update: async ({ where, data }) => table.update(where, data),
    upsert: async (args) => table.upsert(args),
    count: async () => table.rows.length,
    deleteMany: async ({ where }) => {
      // Only the shape the importer actually uses: articleId + tagId notIn.
      const victims = table.rows.filter((r) => {
        if (where.articleId && r.articleId !== where.articleId) return false;
        if (where.tagId?.notIn) return !where.tagId.notIn.includes(r.tagId);
        return true;
      });
      for (const v of victims) {
        table.byId.delete(v.id);
        table.byKey.delete(table.keyOf(v));
        table.writes.deleted += 1;
      }
      return { count: victims.length };
    },
  });

  const client = {
    article: wrap(article),
    articleAuthorProfile: wrap(articleAuthorProfile),
    articleCategory: wrap(articleCategory),
    articleTag: wrap(articleTag),
    articleTagOnArticle: wrap(articleTagOnArticle),
    articleKnowledgeMetadata: wrap(articleKnowledgeMetadata),
    // NOTE: no rollback — see the module header.
    $transaction: async (fn) => fn(client),
    $disconnect: async () => {},
    /** Test-only access to the underlying tables. */
    _tables: { article, articleAuthorProfile, articleCategory, articleTag, articleTagOnArticle, articleKnowledgeMetadata },
  };

  return client;
}
