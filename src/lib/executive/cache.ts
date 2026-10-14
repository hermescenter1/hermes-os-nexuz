/**
 * Executive Management Center — the read-through cache (requirement row 11).
 *
 * The measured baseline (`STAGE-14-SLICE-I-PERFORMANCE.md`) shows where the
 * cost is: a fixed number of statements per page, but several of them are
 * aggregate counts whose cost grows with the number of rows. An index fixed the
 * one count that was scanning the whole table to find a handful of rows; the
 * rest are counts over most of the table, which is what a count legitimately
 * costs. The only remaining lever is not recomputing them for every reader
 * every second.
 *
 * THE RULES THIS MODULE KEEPS, in the order they matter:
 *
 *  1. NOTHING is cached before the permission check. The cache is read with an
 *     already-resolved `ExecutiveScope`, which only exists after
 *     `resolveExecutiveScope()` has established the session, the active
 *     organization, an ACTIVE membership and the authority axes. A reader who
 *     fails that gate never reaches this module, so a cache entry can never be
 *     the thing that lets them in.
 *
 *  2. The KEY carries the whole access shape, so one answer can only ever be
 *     served to a reader who is allowed to see exactly the same thing:
 *     organization, role, the three authority axes, the permitted site ids, the
 *     reporting zone and day cutoff, the range, and the resolved window
 *     boundary. The summary is a pure function of those (its only other inputs
 *     are the clock and the database), which is why sharing between two readers
 *     with an identical shape is correct rather than a leak. It is deliberately
 *     NOT keyed by user: a per-user key would make the cache useless for the
 *     case it exists for, a management team watching the same screen.
 *
 *  3. REVOKING a permission takes effect immediately, by two independent
 *     mechanisms: the gate runs first and refuses before any lookup, and the
 *     authority axes are part of the key, so a reader who has lost an axis
 *     cannot even address the entry that was built while they still had it.
 *
 *  4. A WRITE invalidates. Every key embeds a per-organization generation
 *     counter; a write bumps it, which makes every existing entry of that
 *     organization unaddressable at once. Nothing is served from before the
 *     write. (Without Redis the counter is per process — see below.)
 *
 *  5. The TTL is short and is a CEILING, not a promise. It bounds how stale an
 *     answer can be when something changed without bumping the generation.
 *
 *  6. The reader is always told what they are looking at: the returned state
 *     carries the instant the figures were computed, their age, and whether
 *     that age has passed the stale threshold. The surface shows it.
 *
 *  7. The FROZEN nightly report never comes from here. `report/generate.ts`
 *     calls `buildExecutiveSummary` directly, and a test asserts it keeps doing
 *     so: a report is a record of a finished day, and serving it a cached live
 *     summary would silently replace a historical fact with a recent one.
 *
 * WITHOUT REDIS the store and the generation counter are per process, so a
 * write served by one instance does not invalidate another instance's copy and
 * the TTL is the only bound. That is why the default TTL is one minute, and why
 * `EXECUTIVE_CACHE_TTL_SECONDS=0` (no caching at all) stays a supported
 * setting.
 */
import { createHash } from "node:crypto";
import { getRedis } from "@/lib/redis/client";
import { resolveRange, type ExecutiveRange, type ResolvedRange } from "./period";
import type { ExecutiveScope } from "./contract";
import { buildExecutiveSummary, type ExecutiveSummary } from "./summary";

/** Bumped by hand whenever the cached SHAPE changes, so old entries are dead. */
const KEY_VERSION = "exec-cache-1";

function seconds(raw: string | undefined, fallback: number, max: number): number {
  const n = Number(raw);
  if (raw === undefined || raw === "" || !Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/** Zero disables the cache entirely. Capped so a typo cannot freeze the screen. */
export const CACHE_TTL_SECONDS = seconds(process.env.EXECUTIVE_CACHE_TTL_SECONDS, 60, 900);
/** Past this age the surface marks the figures as stale rather than current. */
export const CACHE_STALE_AFTER_SECONDS = Math.max(
  1,
  seconds(
    process.env.EXECUTIVE_CACHE_STALE_AFTER_SECONDS,
    Math.ceil(CACHE_TTL_SECONDS / 2),
    Math.max(1, CACHE_TTL_SECONDS),
  ),
);
/** The per-process fallback store is bounded: a cache must not become a leak. */
const MEMORY_MAX_ENTRIES = 200;

type Entry = { storedAtMs: number; payload: string };

type Globals = typeof globalThis & {
  __hermesExecCache?: Map<string, Entry>;
  __hermesExecGen?: Map<string, number>;
};
const g = globalThis as Globals;
const memory = (g.__hermesExecCache ??= new Map<string, Entry>());
const generations = (g.__hermesExecGen ??= new Map<string, number>());

export type ExecutiveCacheStore = "redis" | "memory" | "none";

/** What the surface needs in order to be honest about what it is showing. */
export interface ExecutiveCacheState {
  /** False when these figures were computed for this request. */
  readonly hit: boolean;
  /** When the figures were computed, not when they were served. */
  readonly computedAtIso: string;
  readonly ageSeconds: number;
  readonly ttlSeconds: number;
  /** Older than the stale threshold. Always false for a fresh computation. */
  readonly stale: boolean;
  readonly store: ExecutiveCacheStore;
}

export interface CachedExecutiveSummary {
  readonly summary: ExecutiveSummary;
  readonly cache: ExecutiveCacheState;
}

const genKey = (organizationId: string) => `exec:gen:${organizationId}`;
const entryKey = (digest: string) => `exec:sum:${digest}`;

async function readGeneration(organizationId: string): Promise<number> {
  try {
    const redis = await getRedis();
    if (redis) {
      const raw = await redis.get(genKey(organizationId));
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
  } catch {
    // A cache that cannot be reached is a cache miss, never an error.
  }
  return generations.get(organizationId) ?? 0;
}

/**
 * Invalidate every cached summary of one organization.
 *
 * Called by the write paths that change what the summary counts. It bumps a
 * counter that is part of every key rather than deleting keys, so it is one
 * atomic operation whatever the number of cached ranges, and it can never
 * half-succeed and leave a pre-write entry addressable.
 *
 * It never throws: a failed invalidation must not fail the write that caused
 * it. The cost of a failure is bounded by the TTL.
 */
export async function invalidateExecutiveSummary(organizationId: string): Promise<void> {
  if (!organizationId) return;
  try {
    const redis = await getRedis();
    if (redis) {
      await redis.incr(genKey(organizationId));
      return;
    }
  } catch {
    // Fall through to the per-process counter.
  }
  generations.set(organizationId, (generations.get(organizationId) ?? 0) + 1);
}

/**
 * The cache key material. Exported so a test can assert what does and does not
 * separate two readers, rather than inferring it from behaviour.
 */
export function executiveCacheKeyMaterial(args: {
  scope: ExecutiveScope;
  range: ExecutiveRange;
  window: ResolvedRange;
  generation: number;
}): string {
  const { scope, range, window, generation } = args;
  return JSON.stringify({
    v: KEY_VERSION,
    gen: generation,
    org: scope.organizationId,
    role: scope.role,
    // Named one by one, so adding an axis to the contract without deciding
    // whether it separates readers is a type error, not a silent leak.
    authority: {
      operations: scope.authority.operations,
      financial: scope.authority.financial,
      industrial: scope.authority.industrial,
      customers: scope.authority.customers,
    },
    // Sorted: the SET of permitted sites is what matters, not their order.
    sites: [...scope.allowedSiteIds].sort(),
    tz: scope.timeZone,
    cutoff: scope.dayCutoffMinutes,
    range,
    // The window START, not its end: the end moves with the clock, while a
    // change of start (a new day, a new cutoff) is a different question and
    // must miss.
    from: window.current.fromIso,
    baseFrom: window.baseline.fromIso,
  });
}

async function readEntry(key: string): Promise<{ entry: Entry; store: ExecutiveCacheStore } | null> {
  try {
    const redis = await getRedis();
    if (redis) {
      const raw = await redis.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Entry;
      return typeof parsed?.storedAtMs === "number" && typeof parsed?.payload === "string"
        ? { entry: parsed, store: "redis" }
        : null;
    }
  } catch {
    return null;
  }
  const entry = memory.get(key);
  return entry ? { entry, store: "memory" } : null;
}

/**
 * A FAILURE is not a measurement, so it is never stored.
 *
 * `UNAVAILABLE` means a source could not be read. Storing that answer would pin
 * a broken screen in place for the whole TTL after the source recovered, and
 * the next reader would be told the system is down by a cache rather than by
 * the system. Every other status is a true statement about the data (operational
 * figures, an empty set, a refusal the reader is not allowed past) and is
 * cacheable.
 */
function isCacheable(summary: ExecutiveSummary): boolean {
  const sections: Array<{ status?: unknown }> = [
    ...Object.values(summary.sections as Record<string, { status?: unknown }>),
    summary.actions as unknown as { status?: unknown },
  ];
  return !sections.some(s => s?.status === "UNAVAILABLE");
}

async function writeEntry(key: string, entry: Entry): Promise<ExecutiveCacheStore> {
  try {
    const redis = await getRedis();
    if (redis) {
      await redis.set(key, JSON.stringify(entry), "EX", CACHE_TTL_SECONDS);
      return "redis";
    }
  } catch {
    return "none";
  }
  // Oldest-first eviction, so a long-running process cannot grow without bound.
  if (memory.size >= MEMORY_MAX_ENTRIES) {
    const oldest = memory.keys().next();
    if (!oldest.done) memory.delete(oldest.value);
  }
  memory.set(key, entry);
  return "memory";
}

/**
 * The summary a reader should see: from the cache when an entry is addressable
 * and young enough, otherwise computed and stored.
 *
 * `scope` must be the OUTPUT of the executive gate. Nothing here re-checks a
 * permission, because nothing here is reachable without one.
 */
export async function readExecutiveSummary(args: {
  scope: ExecutiveScope;
  range: ExecutiveRange;
  nowMs: number;
  /** Injected only by tests; production always builds the real summary. */
  build?: (a: {
    scope: ExecutiveScope;
    range: ExecutiveRange;
    nowMs: number;
    window: ResolvedRange;
  }) => Promise<ExecutiveSummary>;
}): Promise<CachedExecutiveSummary> {
  const { scope, range, nowMs } = args;
  const build = args.build ?? buildExecutiveSummary;

  // Resolved ONCE and used both for the key and for the computation, so an
  // entry can never describe a different window from the one it is keyed by.
  const window = resolveRange({
    range,
    nowMs,
    timeZone: scope.timeZone,
    cutoffMinutes: scope.dayCutoffMinutes,
  });

  const computed = (): Promise<ExecutiveSummary> => build({ scope, range, nowMs, window });

  const state = (summary: ExecutiveSummary, store: ExecutiveCacheStore): ExecutiveCacheState => ({
    hit: false,
    computedAtIso: summary.generatedAtIso,
    ageSeconds: 0,
    ttlSeconds: CACHE_TTL_SECONDS,
    stale: false,
    store,
  });

  if (CACHE_TTL_SECONDS <= 0) {
    const summary = await computed();
    return { summary, cache: state(summary, "none") };
  }

  const generation = await readGeneration(scope.organizationId);
  const digest = createHash("sha256")
    .update(executiveCacheKeyMaterial({ scope, range, window, generation }))
    .digest("hex");
  const key = entryKey(digest);

  const found = await readEntry(key);
  if (found) {
    const ageSeconds = Math.max(0, Math.floor((nowMs - found.entry.storedAtMs) / 1000));
    // The per-process store has no expiry of its own, so the age is checked
    // here for both stores rather than trusted to Redis.
    if (ageSeconds <= CACHE_TTL_SECONDS) {
      try {
        const summary = JSON.parse(found.entry.payload) as ExecutiveSummary;
        return {
          summary,
          cache: {
            hit: true,
            computedAtIso: summary.generatedAtIso,
            ageSeconds,
            ttlSeconds: CACHE_TTL_SECONDS,
            stale: ageSeconds >= CACHE_STALE_AFTER_SECONDS,
            store: found.store,
          },
        };
      } catch {
        // An unreadable entry is a miss, not a failure.
      }
    }
    if (found.store === "memory") memory.delete(key);
  }

  const summary = await computed();
  if (!isCacheable(summary)) return { summary, cache: state(summary, "none") };
  const store = await writeEntry(key, { storedAtMs: nowMs, payload: JSON.stringify(summary) });
  return { summary, cache: state(summary, store) };
}
