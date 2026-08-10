/**
 * PHASE 102 — an in-memory Prisma double for the media route suites.
 *
 * This is NOT a mock of `src/lib/media/db.ts`. The repository runs FOR REAL against
 * this double, which is the whole point: the assertions about the published-only
 * gate and about per-subject isolation are then assertions about the `where` clause
 * the real repository actually produced, not about a stub that agreed with the test.
 *
 * It implements only the Prisma surface the media routes and repository genuinely
 * use. An accidental new query shape therefore fails loudly (undefined is not a
 * function) instead of silently returning `[]` and turning a broken test green.
 *
 * Not a test file — no `*.test.ts` suffix, so vitest does not collect it.
 */

export type Row = Record<string, unknown>;

export interface RecordedCall {
  model: string;
  op: string;
  args: Record<string, unknown>;
}

/** Relation fields the double knows how to resolve for a nested `where`. */
const RELATION_TO_ASSET = new Set([
  "mediaSave",
  "mediaWatchProgress",
  "mediaViewEvent",
  "mediaAssetTranslation",
  "mediaChapter",
  "mediaSubtitleTrack",
]);

export interface Double {
  tables: Record<string, Row[]>;
  calls: RecordedCall[];
  client: Record<string, unknown>;
  /** Every `where` a given model saw, in order. */
  wheres(model: string, op?: string): Record<string, unknown>[];
  reset(): void;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

export function createMediaPrismaDouble(seed: Record<string, Row[]>): Double {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }
  const calls: RecordedCall[] = [];
  let sequence = 0;

  function matchScalar(actual: unknown, expected: unknown): boolean {
    if (expected === null) return actual === null || actual === undefined;
    if (isPlainObject(expected)) {
      const e = expected;
      if ("in" in e) {
        const list = Array.isArray(e.in) ? e.in : [];
        return list.includes(actual as never);
      }
      if ("gt" in e) return typeof actual === "number" && actual > (e.gt as number);
      if ("gte" in e) return typeof actual === "number" && actual >= (e.gte as number);
      if ("lt" in e) return typeof actual === "number" && actual < (e.lt as number);
      if ("not" in e) return !matchScalar(actual, e.not);
      if ("contains" in e) {
        const needle = String(e.contains);
        if (typeof actual !== "string") return false;
        return e.mode === "insensitive"
          ? actual.toLowerCase().includes(needle.toLowerCase())
          : actual.includes(needle);
      }
      return false;
    }
    if (expected instanceof Date && actual instanceof Date) {
      return expected.getTime() === actual.getTime();
    }
    return actual === expected;
  }

  function matches(model: string, row: Row, where: Record<string, unknown> | undefined): boolean {
    if (!where) return true;
    for (const [key, expected] of Object.entries(where)) {
      if (key === "OR") {
        const branches = Array.isArray(expected) ? expected : [];
        if (!branches.some((b) => matches(model, row, b as Record<string, unknown>))) return false;
        continue;
      }
      if (key === "AND") {
        const branches = Array.isArray(expected) ? expected : [];
        if (!branches.every((b) => matches(model, row, b as Record<string, unknown>))) return false;
        continue;
      }
      // Relation filter onto the owning asset, e.g. `mediaAsset: { status: … }`.
      if (key === "mediaAsset" && RELATION_TO_ASSET.has(model)) {
        const asset = (tables.mediaAsset ?? []).find((a) => a.id === row.mediaAssetId);
        if (!asset) return false;
        if (!matches("mediaAsset", asset, expected as Record<string, unknown>)) return false;
        continue;
      }
      if (!matchScalar(row[key], expected)) return false;
    }
    return true;
  }

  function firstOrderKey(orderBy: unknown): { key: string; dir: string } | null {
    const spec = Array.isArray(orderBy) ? orderBy[0] : orderBy;
    if (!isPlainObject(spec)) return null;
    const [key, dir] = Object.entries(spec)[0] ?? [];
    if (typeof key !== "string" || typeof dir !== "string") return null;
    return { key, dir };
  }

  function sorted(rows: Row[], orderBy: unknown): Row[] {
    const order = firstOrderKey(orderBy);
    if (!order) return rows;
    const sign = order.dir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = a[order.key];
      const bv = b[order.key];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const an = av instanceof Date ? av.getTime() : av;
      const bn = bv instanceof Date ? bv.getTime() : bv;
      return (an < bn ? -1 : 1) * sign;
    });
  }

  function hydrate(model: string, row: Row, include: unknown): Row {
    if (!isPlainObject(include)) return { ...row };
    const out: Row = { ...row };
    if (include.mediaAsset && RELATION_TO_ASSET.has(model)) {
      const asset = (tables.mediaAsset ?? []).find((a) => a.id === row.mediaAssetId);
      out.mediaAsset = asset ? { ...asset } : null;
    }
    return out;
  }

  function applyData(row: Row, data: Record<string, unknown>): Row {
    const next: Row = { ...row };
    for (const [key, value] of Object.entries(data)) {
      if (isPlainObject(value) && "increment" in value) {
        next[key] = ((next[key] as number) ?? 0) + (value.increment as number);
        continue;
      }
      if (isPlainObject(value) && "decrement" in value) {
        next[key] = ((next[key] as number) ?? 0) - (value.decrement as number);
        continue;
      }
      next[key] = value;
    }
    return next;
  }

  function model(name: string) {
    tables[name] ??= [];
    const rows = () => tables[name];
    const record = (op: string, args: unknown) => {
      calls.push({ model: name, op, args: (args ?? {}) as Record<string, unknown> });
    };
    return {
      findFirst: async (args?: unknown) => {
        record("findFirst", args);
        const a = (args ?? {}) as Record<string, unknown>;
        const found = sorted(
          rows().filter((r) => matches(name, r, a.where as Record<string, unknown>)),
          a.orderBy,
        )[0];
        return found ? hydrate(name, found, a.include) : null;
      },
      findUnique: async (args?: unknown) => {
        record("findUnique", args);
        const a = (args ?? {}) as Record<string, unknown>;
        const found = rows().find((r) => matches(name, r, a.where as Record<string, unknown>));
        return found ? hydrate(name, found, a.include) : null;
      },
      findMany: async (args?: unknown) => {
        record("findMany", args);
        const a = (args ?? {}) as Record<string, unknown>;
        const filtered = sorted(
          rows().filter((r) => matches(name, r, a.where as Record<string, unknown>)),
          a.orderBy,
        );
        const skip = typeof a.skip === "number" ? a.skip : 0;
        const take = typeof a.take === "number" ? a.take : filtered.length;
        return filtered.slice(skip, skip + take).map((r) => hydrate(name, r, a.include));
      },
      count: async (args?: unknown) => {
        record("count", args);
        const a = (args ?? {}) as Record<string, unknown>;
        return rows().filter((r) => matches(name, r, a.where as Record<string, unknown>)).length;
      },
      create: async (args?: unknown) => {
        record("create", args);
        const a = (args ?? {}) as Record<string, unknown>;
        sequence += 1;
        const row: Row = { id: `${name}-gen-${sequence}`, ...(a.data as Row) };
        rows().push(row);
        return { ...row };
      },
      updateMany: async (args?: unknown) => {
        record("updateMany", args);
        const a = (args ?? {}) as Record<string, unknown>;
        let count = 0;
        const list = rows();
        for (let i = 0; i < list.length; i += 1) {
          if (matches(name, list[i], a.where as Record<string, unknown>)) {
            list[i] = applyData(list[i], a.data as Record<string, unknown>);
            count += 1;
          }
        }
        return { count };
      },
      deleteMany: async (args?: unknown) => {
        record("deleteMany", args);
        const a = (args ?? {}) as Record<string, unknown>;
        const list = rows();
        const keep: Row[] = [];
        let count = 0;
        for (const row of list) {
          if (matches(name, row, a.where as Record<string, unknown>)) count += 1;
          else keep.push(row);
        }
        tables[name] = keep;
        return { count };
      },
    };
  }

  const MODELS = [
    "organization",
    "mediaAsset",
    "mediaAssetTranslation",
    "mediaChapter",
    "mediaSubtitleTrack",
    "mediaCategory",
    "mediaInstructor",
    "mediaSave",
    "mediaWatchProgress",
    "mediaViewEvent",
    "mediaEditorialEvent",
    "auditLog",
  ];

  const client: Record<string, unknown> = {};
  for (const name of MODELS) {
    tables[name] ??= [];
    client[name] = model(name);
  }
  // The repository opts into a real interactive transaction when one is available.
  client.$transaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(client);

  return {
    tables,
    calls,
    client,
    wheres(modelName: string, op?: string) {
      return calls
        .filter((c) => c.model === modelName && (op === undefined || c.op === op))
        .map((c) => (c.args.where ?? {}) as Record<string, unknown>);
    },
    reset() {
      calls.length = 0;
    },
  };
}

// ── Seed helpers ─────────────────────────────────────────────────────────────

export const ORG_A = { id: "org-A", slug: "hermes-a", name: "Hermes A" };
export const ORG_B = { id: "org-B", slug: "hermes-b", name: "Hermes B" };

export function asset(id: string, organizationId: string, slug: string, over: Row = {}): Row {
  return {
    id,
    organizationId,
    siteId: null,
    categoryId: null,
    instructorId: null,
    slug,
    primaryLocale: "en",
    status: "PUBLISHED",
    visibility: "PUBLIC",
    processingState: "READY",
    skillLevel: "BEGINNER",
    storageKey: `media/${organizationId}/${id}.mp4`,
    storageProvider: "local",
    contentType: "video/mp4",
    byteSize: 1024,
    checksumSha256: "a".repeat(64),
    durationSeconds: 600,
    posterStorageKey: `media/${organizationId}/${id}.png`,
    viewCount: 5,
    saveCount: 0,
    completionCount: 0,
    rejectionReason: null,
    processingFailureCode: null,
    createdBy: "seed",
    updatedBy: null,
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    archivedAt: null,
    createdAt: new Date("2025-12-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  };
}

export function translation(
  mediaAssetId: string,
  organizationId: string,
  locale: string,
  title: string,
  over: Row = {},
): Row {
  return {
    id: `${mediaAssetId}-${locale}`,
    organizationId,
    mediaAssetId,
    locale,
    title,
    summary: `${title} summary`,
    description: `${title} description`,
    seoTitle: null,
    seoDescription: null,
    keywords: [],
    ...over,
  };
}
