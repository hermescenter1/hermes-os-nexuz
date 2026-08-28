// NOTE — deliberately NO `#!/usr/bin/env node` shebang.
//
// scripts/__tests__/phase102-media-processing.test.ts imports parseArgs,
// loadMediaModules, runMediaProcessing and verifyStoredBytes from this file.
// Vitest hoists its CJS interop shims onto line 1 when it transforms the module,
// which pushes a shebang past the start of the file — and `#!` is only legal as
// the very first characters. The whole suite therefore failed to load with
// "SyntaxError: Invalid or unexpected token", reporting zero tests rather than a
// real failure, which is why it looked like an unexplained environment quirk.
//
// The CLI entry point is `npm run media:processing`, i.e.
// `node scripts/media/phase102-media-processing.mjs` — no shebang required.
/**
 * PHASE 102 — media processing operator CLI.
 *
 * DRY-RUN BY DEFAULT. Reports which `MediaAsset` rows would advance through the
 * processing machine and writes NOTHING unless `--apply` is passed. Every run is
 * BOUNDED by `--limit` (default 50, hard cap 500) — there is no unbounded scan
 * and no "process everything" mode.
 *
 * This script is invoked MANUALLY by an operator (or by a maintenance schedule
 * the operator owns and configures on the host) — Phase 102 does NOT schedule it
 * and does NOT run it against production. Design authority:
 * docs/phase102/architecture.md §5.
 *
 * WHY A CLI AND NOT A WORKER
 * --------------------------
 * There is no background job runner in this platform (ADR §2.2): no queue
 * library, no worker container, no cron, no `after()`. The sanctioned substitute
 * is exactly this shape — the same one `scripts/audit-retention.mjs` uses, and
 * for the same stated reason. A durable job queue would additionally flip
 * `REDIS_PERSISTENCE_DECISION` away from `REBUILD_FROM_AUTHORITATIVE_STATE` and
 * fail the Phase 98 DR gate, so it is a DR-policy amendment, not a feature.
 *
 * MULTI-REPLICA SAFETY
 * --------------------
 * Every write is a COMPARE-AND-SWAP: `updateMany` carrying the expected current
 * `processingState` in the `where` clause (the form proven at
 * `src/lib/compliance/export-db.ts:145-148`). `affected !== 1` means another
 * replica, another operator, or an HTTP request moved the row first — that is a
 * SKIP, not an error. This matters because there is no leader election, advisory
 * lock or scheduler singleton anywhere in this repository, so two copies of this
 * CLI running at once must both be correct.
 *
 * WHAT IT ADVANCES
 * ----------------
 *   UPLOADED       → VALIDATING   (claim)
 *   VALIDATING     → READY | QUARANTINED | FAILED   (verdict, from the bytes)
 *   PENDING_UPLOAD → FAILED       (reap an abandoned upload, age-bounded)
 *
 * `PENDING_UPLOAD → VALIDATING` is deliberately NOT performed: it is not an edge
 * in the closed processing table (`src/lib/media/lifecycle.ts`), because an asset
 * that never received bytes has nothing to validate. The only operator-reachable
 * move out of `PENDING_UPLOAD` is the abandonment reap, which is why `--stale-hours`
 * exists. Every edge this CLI takes is checked against that table before the write.
 *
 * BYTES ARE RE-VERIFIED, NOT TRUSTED
 * ----------------------------------
 * Nothing is promoted to `READY` on the strength of what the uploader declared.
 * The stored object is re-statted and its leading bytes are re-sniffed with the
 * SAME magic-byte validator the upload route used (`src/lib/media/validation.ts`)
 * through the SAME storage seam (`src/lib/media/storage.ts`). An asset whose bytes
 * do not match its declared type goes to `QUARANTINED` — never to `READY`. There
 * is no virus scanner in this platform (ADR §9), so `QUARANTINED` is terminal and
 * the remedy is a fresh upload against a new asset, never a release.
 *
 * FAILED vs QUARANTINED — the split is deliberate:
 *   FAILED       operational, RETRYABLE (`FAILED → PENDING_UPLOAD` is an edge).
 *                Missing object, missing content type, empty or oversized file.
 *   QUARANTINED  the bytes are not what the record says they are. TERMINAL.
 *                Magic-byte mismatch, MIME/extension disagreement, unsupported
 *                container, or a stored size that contradicts the row.
 *
 * Never prints DATABASE_URL, credentials, storage keys, filenames or any row
 * content — only identifiers, state names and enumerated reason codes.
 *
 * The processing vocabulary and the transition table are NOT duplicated here:
 * this file imports the real `src/lib/media/lifecycle.ts`, `validation.ts` and
 * `storage.ts` at runtime (see {@link loadMediaModules}). If those modules cannot
 * be loaded the CLI FAILS CLOSED with `MEDIA_MODULE_LOAD_FAILED` — it never falls
 * back to an in-script copy of the signature table, because a second, drifting
 * copy of a security check is worse than no run at all.
 *
 * Usage:
 *   node scripts/media/phase102-media-processing.mjs                 # dry run
 *   node scripts/media/phase102-media-processing.mjs --apply
 *   node scripts/media/phase102-media-processing.mjs --limit 200 --apply
 *   node scripts/media/phase102-media-processing.mjs --organization <orgId>
 *   npm run media:processing -- --apply --limit 25
 */

import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── Bounds ───────────────────────────────────────────────────────────────────

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;
export const DEFAULT_STALE_UPLOAD_HOURS = 24;
export const MIN_STALE_UPLOAD_HOURS = 1;

/** The only states this CLI will pick up. Ordered so the report reads as a pipeline. */
export const CANDIDATE_STATES = ["UPLOADED", "VALIDATING", "PENDING_UPLOAD"];

/** Enumerated failure codes persisted in `MediaAsset.processingFailureCode`. */
export const PROCESSING_FAILURE_CODES = [
  "STORAGE_KEY_INVALID",
  "CONTENT_TYPE_MISSING",
  "OBJECT_MISSING",
  "FILE_EMPTY",
  "FILE_TOO_LARGE",
  "BYTE_SIZE_MISMATCH",
  "UPLOAD_ABANDONED",
  "UNSUPPORTED_MEDIA_TYPE",
  "MIME_EXTENSION_MISMATCH",
  "MIME_TYPE_REQUIRED",
  "MAGIC_BYTES_MISMATCH",
  "BYTES_TOO_SHORT",
  "SUBTITLE_NOT_WEBVTT",
  "MALFORMED_INPUT",
];

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ── Usage ────────────────────────────────────────────────────────────────────

export const USAGE = `Phase 102 — media processing operator CLI (DRY RUN BY DEFAULT).

Advances MediaAsset.processingState by compare-and-swap. Re-verifies the stored
bytes against the Phase 102 magic-byte validator before anything becomes READY.
Phase 102 does not schedule this script and does not run it against production.

Usage:
  node scripts/media/phase102-media-processing.mjs [options]
  npm run media:processing -- [options]

Options:
  --apply                Perform the writes. Without this flag NOTHING is written
                         and the report describes what would have happened.
  --limit <n>            Maximum assets examined in one run.
                         Default ${DEFAULT_LIMIT}, hard cap ${MAX_LIMIT}. Never unbounded.
  --stale-hours <n>      Age after which a PENDING_UPLOAD asset is reaped to
                         FAILED (UPLOAD_ABANDONED). Default ${DEFAULT_STALE_UPLOAD_HOURS}, minimum ${MIN_STALE_UPLOAD_HOURS}.
  --organization <id>    Restrict the run to one organization.
  --asset <id>           Restrict the run to one media asset.
  --help, -h             Print this text and exit 0.

Transitions taken (each checked against the closed table in
src/lib/media/lifecycle.ts before the write):
  UPLOADED        -> VALIDATING                        claim
  VALIDATING      -> READY | QUARANTINED | FAILED      verdict from the bytes
  PENDING_UPLOAD  -> FAILED                            abandoned upload, age-bounded

PENDING_UPLOAD -> VALIDATING is not an edge and is never taken: an asset that
never received bytes has nothing to validate.

Environment:
  DATABASE_URL                       required for --apply and for any real run
  HERMES_DOCUMENT_STORAGE_PROVIDER   must be "local" (default); minio/s3 have no
                                     implemented partial-read adapter
  HERMES_LOCAL_DOCUMENT_STORAGE_DIR  storage root (default .data/documents)

Output: a JSON summary on stdout. Exit 0 on a completed run — including runs that
quarantined or failed assets, which are normal outcomes. Exit 1 on an unexpected
error, 2 on a usage or environment error.
`;

// ── Argument parsing ─────────────────────────────────────────────────────────

class UsageError extends Error {
  constructor(code) {
    super(code);
    this.name = "UsageError";
    this.code = code;
  }
}

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new UsageError(`MISSING_VALUE_FOR_${flag.replace(/^--/, "").toUpperCase()}`);
  }
  return value;
}

function boundedInteger(raw, { min, max, flag }) {
  if (!/^[0-9]+$/.test(raw)) throw new UsageError(`NON_NUMERIC_${flag}`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new UsageError(`NON_NUMERIC_${flag}`);
  return Math.min(Math.max(parsed, min), max);
}

/**
 * Parses argv into a fully-bounded plan. Unknown flags are REFUSED rather than
 * ignored: silently dropping `--aply` would turn an intended write into a
 * dry run that the operator then believes was applied, or vice versa.
 */
export function parseArgs(argv) {
  const plan = {
    help: false,
    apply: false,
    limit: DEFAULT_LIMIT,
    staleUploadHours: DEFAULT_STALE_UPLOAD_HOURS,
    organizationId: null,
    assetId: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case "--help":
      case "-h":
        plan.help = true;
        break;
      case "--apply":
        plan.apply = true;
        break;
      case "--limit":
        plan.limit = boundedInteger(readValue(argv, i, token), {
          min: 1,
          max: MAX_LIMIT,
          flag: "LIMIT",
        });
        i += 1;
        break;
      case "--stale-hours":
        plan.staleUploadHours = boundedInteger(readValue(argv, i, token), {
          min: MIN_STALE_UPLOAD_HOURS,
          max: 24 * 365,
          flag: "STALE_HOURS",
        });
        i += 1;
        break;
      case "--organization":
        plan.organizationId = readValue(argv, i, token);
        i += 1;
        break;
      case "--asset":
        plan.assetId = readValue(argv, i, token);
        i += 1;
        break;
      default:
        throw new UsageError("UNKNOWN_ARGUMENT");
    }
  }

  return plan;
}

// ── Runtime module loading ───────────────────────────────────────────────────

/**
 * Loads the REAL Phase 102 TypeScript modules so this CLI shares one definition
 * of the transition table, the signature table and the storage seam with the
 * application. Nothing here is a copy.
 *
 * Two Node facilities make that possible from a `.mjs` file: on-the-fly type
 * stripping (Node >= 22.18 / >= 23.6, on by default) and an ESM resolve hook that
 * maps the project's `@/` alias and extensionless relative specifiers onto `.ts`
 * files. Both are narrow and both are checked here rather than assumed — if
 * either is unavailable this throws and the caller exits non-zero. It never
 * substitutes a local re-implementation of a security check.
 */
export async function loadMediaModules(root = REPO_ROOT) {
  const rootUrl = pathToFileURL(`${root}${path.sep}`).href;
  const hook = `
const ROOT = ${JSON.stringify(rootUrl)};
export async function resolve(specifier, context, next) {
  let target = specifier;
  if (target.startsWith("@/")) target = new URL("src/" + target.slice(2), ROOT).href;
  try {
    return await next(target, context);
  } catch (error) {
    if (error && error.code !== "ERR_MODULE_NOT_FOUND") throw error;
    try {
      return await next(target + ".ts", context);
    } catch {
      return await next(target + "/index.ts", context);
    }
  }
}
`;
  try {
    register(`data:text/javascript,${encodeURIComponent(hook)}`);
    const base = new URL("src/lib/media/", rootUrl);
    const [lifecycle, validation, storage] = await Promise.all([
      import(new URL("lifecycle.ts", base).href),
      import(new URL("validation.ts", base).href),
      import(new URL("storage.ts", base).href),
    ]);
    return {
      canTransitionProcessing: lifecycle.canTransitionProcessing,
      MEDIA_MAGIC_SNIFF_BYTES: validation.MEDIA_MAGIC_SNIFF_BYTES,
      resolveMediaType: validation.resolveMediaType,
      validateMediaSize: validation.validateMediaSize,
      verifyMediaMagicBytes: validation.verifyMediaMagicBytes,
      isStorageKeyBoundTo: storage.isStorageKeyBoundTo,
      statMediaObject: storage.statMediaObject,
      readMediaByteRange: storage.readMediaByteRange,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new UsageError(`MEDIA_MODULE_LOAD_FAILED: ${detail}`);
  }
}

// ── Verification ─────────────────────────────────────────────────────────────

/** Maps a validator reason code onto the CLI's persisted failure vocabulary. */
function failureCodeFor(reason) {
  const code = String(reason).toUpperCase();
  return PROCESSING_FAILURE_CODES.includes(code) ? code : "MALFORMED_INPUT";
}

/**
 * Re-derives the verdict for one asset FROM THE STORED BYTES.
 *
 * The filename handed to `resolveMediaType` is the last segment of the
 * server-generated storage key — never a client-supplied name — so the
 * MIME/extension cross-check is performed against something the server minted.
 *
 * Returns `{ to, failureCode, reason }`. Pure with respect to the database: it
 * reads bytes and decides, it never writes.
 */
export async function verifyStoredBytes(row, media) {
  // Shape AND tenancy. A shape-only check proves the key is well-formed, never
  // WHOSE it is - and this tool runs with no request context to fall back on,
  // so a row whose key names another organization or another asset would
  // otherwise have its bytes read and its verdict written under the wrong
  // tenant. The row is the authority for both segments, so a key that
  // disagrees with its own row is refused rather than trusted.
  if (!media.isStorageKeyBoundTo(row.storageKey, {
    organizationId: row.organizationId,
    assetId: row.id,
  })) {
    return { to: "FAILED", failureCode: "STORAGE_KEY_INVALID" };
  }
  const declared = typeof row.contentType === "string" ? row.contentType.trim() : "";
  if (!declared) {
    return { to: "FAILED", failureCode: "CONTENT_TYPE_MISSING" };
  }

  const stat = await media.statMediaObject(row.storageKey);
  if (stat === null) {
    return { to: "FAILED", failureCode: "OBJECT_MISSING" };
  }

  // Only the server-generated `<uuid>.<ext>` segment reaches the resolver.
  const keyFilename = row.storageKey.slice(row.storageKey.lastIndexOf("/") + 1);
  const resolved = media.resolveMediaType(declared, keyFilename);
  if (!resolved.ok) {
    // The record and its bytes disagree about what this file is. Terminal.
    return { to: "QUARANTINED", failureCode: failureCodeFor(resolved.reason) };
  }

  const size = media.validateMediaSize(stat.sizeBytes, resolved.rule);
  if (!size.ok) {
    // Operational and retryable: nothing here claims the bytes are a lie.
    return { to: "FAILED", failureCode: failureCodeFor(size.reason) };
  }

  // A stored size that contradicts the row means the record cannot vouch for the
  // object it points at, which is exactly what QUARANTINED is for.
  if (typeof row.byteSize === "number" && row.byteSize !== stat.sizeBytes) {
    return { to: "QUARANTINED", failureCode: "BYTE_SIZE_MISMATCH" };
  }

  const sniffLength = Math.min(media.MEDIA_MAGIC_SNIFF_BYTES, stat.sizeBytes);
  const head = await media.readMediaByteRange(row.storageKey, {
    start: 0,
    end: sniffLength - 1,
  });
  if (head === null) {
    return { to: "FAILED", failureCode: "OBJECT_MISSING" };
  }

  const magic = media.verifyMediaMagicBytes(resolved.rule, head);
  if (!magic.ok) {
    return { to: "QUARANTINED", failureCode: failureCodeFor(magic.reason) };
  }

  return { to: "READY", failureCode: null };
}

// ── The run ──────────────────────────────────────────────────────────────────

/**
 * Advances one asset as far as this run can take it.
 *
 * `store.transition` is the compare-and-swap. `affected !== 1` is reported as
 * `SKIPPED_STALE_STATE` and STOPS the pipeline for that asset — it is not an
 * error and it is not retried in the same run, because the row is no longer in
 * the state this run reasoned about.
 */
async function processAsset(row, ctx) {
  const { store, media, apply, now, staleUploadMs } = ctx;
  const steps = [];

  const move = async (from, to, failureCode) => {
    if (!media.canTransitionProcessing(from, to)) {
      // A move this CLI is not allowed to make. Refuse loudly rather than write.
      throw new Error(`ILLEGAL_PROCESSING_TRANSITION:${from}->${to}`);
    }
    if (!apply) {
      steps.push({ from, to, failureCode: failureCode ?? null, outcome: "WOULD_APPLY" });
      return true;
    }
    const result = await store.transition({
      id: row.id,
      organizationId: row.organizationId,
      from,
      to,
      failureCode: failureCode ?? null,
      now,
    });
    const affected = typeof result?.affected === "number" ? result.affected : 0;
    if (affected !== 1) {
      steps.push({ from, to, failureCode: failureCode ?? null, outcome: "SKIPPED_STALE_STATE" });
      return false;
    }
    steps.push({ from, to, failureCode: failureCode ?? null, outcome: "APPLIED" });
    return true;
  };

  let state = row.processingState;

  if (state === "PENDING_UPLOAD") {
    const stamp = row.updatedAt ?? row.createdAt ?? null;
    const ageMs = stamp instanceof Date ? now.getTime() - stamp.getTime() : Number.NaN;
    if (!Number.isFinite(ageMs) || ageMs < staleUploadMs) {
      return { id: row.id, organizationId: row.organizationId, from: row.processingState, steps, final: state, outcome: "SKIPPED_NOT_STALE" };
    }
    await move("PENDING_UPLOAD", "FAILED", "UPLOAD_ABANDONED");
    const last = steps[steps.length - 1];
    return {
      id: row.id,
      organizationId: row.organizationId,
      from: row.processingState,
      steps,
      final: last.outcome === "SKIPPED_STALE_STATE" ? state : "FAILED",
      outcome: last.outcome === "SKIPPED_STALE_STATE" ? "SKIPPED_STALE_STATE" : "REAPED",
    };
  }

  if (state === "UPLOADED") {
    const claimed = await move("UPLOADED", "VALIDATING");
    if (!claimed) {
      return { id: row.id, organizationId: row.organizationId, from: row.processingState, steps, final: state, outcome: "SKIPPED_STALE_STATE" };
    }
    state = "VALIDATING";
  }

  if (state !== "VALIDATING") {
    return { id: row.id, organizationId: row.organizationId, from: row.processingState, steps, final: state, outcome: "SKIPPED_NOT_CANDIDATE" };
  }

  const verdict = await verifyStoredBytes(row, media);
  const settled = await move("VALIDATING", verdict.to, verdict.failureCode);
  if (!settled) {
    return { id: row.id, organizationId: row.organizationId, from: row.processingState, steps, final: "VALIDATING", outcome: "SKIPPED_STALE_STATE" };
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    from: row.processingState,
    steps,
    final: verdict.to,
    failureCode: verdict.failureCode ?? null,
    outcome: verdict.to === "READY" ? "PROMOTED" : verdict.to === "QUARANTINED" ? "QUARANTINED" : "FAILED",
  };
}

/**
 * The bounded, injectable core. `store` and `media` are parameters so the whole
 * pipeline is exercisable without a database and without spawning a process.
 */
export async function runMediaProcessing(options) {
  const {
    store,
    media,
    apply = false,
    limit = DEFAULT_LIMIT,
    staleUploadHours = DEFAULT_STALE_UPLOAD_HOURS,
    organizationId = null,
    assetId = null,
    now = new Date(),
  } = options;

  const boundedLimit = Math.min(Math.max(Math.floor(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const staleUploadMs = Math.max(staleUploadHours, MIN_STALE_UPLOAD_HOURS) * 60 * 60 * 1000;

  const candidates = await store.listCandidates({
    states: CANDIDATE_STATES,
    limit: boundedLimit,
    organizationId,
    assetId,
  });

  // Belt and braces: a store that ignores `take` must not make this run unbounded.
  const rows = Array.isArray(candidates) ? candidates.slice(0, boundedLimit) : [];

  const ctx = { store, media, apply, now, staleUploadMs };
  const assets = [];
  const errors = [];
  const counts = {
    claimed: 0,
    promoted: 0,
    quarantined: 0,
    failed: 0,
    reaped: 0,
    skippedStaleState: 0,
    skippedNotStale: 0,
    errored: 0,
  };

  for (const row of rows) {
    try {
      const result = await processAsset(row, ctx);
      assets.push(result);
      if (result.steps.some((s) => s.to === "VALIDATING" && s.outcome !== "SKIPPED_STALE_STATE")) {
        counts.claimed += 1;
      }
      switch (result.outcome) {
        case "PROMOTED":
          counts.promoted += 1;
          break;
        case "QUARANTINED":
          counts.quarantined += 1;
          break;
        case "FAILED":
          counts.failed += 1;
          break;
        case "REAPED":
          counts.reaped += 1;
          break;
        case "SKIPPED_STALE_STATE":
          counts.skippedStaleState += 1;
          break;
        case "SKIPPED_NOT_STALE":
        case "SKIPPED_NOT_CANDIDATE":
          counts.skippedNotStale += 1;
          break;
        default:
          break;
      }
    } catch (error) {
      counts.errored += 1;
      // The asset id is an identifier, not row content; the operator needs it to
      // act. The message is the CLI's own code, never a database or driver string.
      errors.push({ id: row?.id ?? null, code: error instanceof Error ? error.message : "UNKNOWN" });
    }
  }

  return {
    result: errors.length === 0 ? "OK" : "FAIL",
    phase: "102",
    mode: apply ? "apply" : "dry-run",
    limit: boundedLimit,
    staleUploadHours: Math.max(staleUploadHours, MIN_STALE_UPLOAD_HOURS),
    scope: { organizationId, assetId },
    candidateStates: CANDIDATE_STATES,
    examined: rows.length,
    counts,
    assets,
    errors,
  };
}

// ── Prisma-backed store ──────────────────────────────────────────────────────

/**
 * The only place this CLI touches the database.
 *
 * The list is bounded by `take` and ordered oldest-first so a run always makes
 * progress on the assets that have waited longest. The update is the
 * compare-and-swap: the expected `processingState` is part of the predicate, and
 * `organizationId` is carried on every write so a run scoped to one tenant can
 * never mutate another's row.
 *
 * `updatedBy` is deliberately NOT set. This CLI has no actor user, and inventing
 * one would put a fabricated identity on an audited column.
 */
export function createPrismaStore(prisma) {
  return {
    async listCandidates({ states, limit, organizationId, assetId }) {
      const where = { processingState: { in: states } };
      if (organizationId) where.organizationId = organizationId;
      if (assetId) where.id = assetId;
      return prisma.mediaAsset.findMany({
        where,
        select: {
          id: true,
          organizationId: true,
          processingState: true,
          storageKey: true,
          contentType: true,
          byteSize: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "asc" },
        take: limit,
      });
    },
    async transition({ id, organizationId, from, to, failureCode, now }) {
      const data = { processingState: to, updatedAt: now };
      if (to === "FAILED" || to === "QUARANTINED") {
        data.processingFailureCode = failureCode ?? "UNSPECIFIED";
      }
      const res = await prisma.mediaAsset.updateMany({
        where: { id, organizationId, processingState: from },
        data,
      });
      return { affected: typeof res?.count === "number" ? res.count : 0 };
    },
  };
}

// ── Entry point ──────────────────────────────────────────────────────────────

export async function main(argv = process.argv.slice(2)) {
  let plan;
  try {
    plan = parseArgs(argv);
  } catch (error) {
    console.error(JSON.stringify({ result: "FAIL", reason: error?.code ?? "USAGE" }));
    return 2;
  }

  if (plan.help) {
    console.log(USAGE);
    return 0;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(JSON.stringify({ result: "FAIL", reason: "DATABASE_URL not set" }));
    return 2;
  }

  let media;
  try {
    media = await loadMediaModules();
  } catch (error) {
    console.error(JSON.stringify({ result: "FAIL", reason: error?.code ?? "MEDIA_MODULE_LOAD_FAILED" }));
    return 2;
  }

  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    const report = await runMediaProcessing({
      store: createPrismaStore(prisma),
      media,
      apply: plan.apply,
      limit: plan.limit,
      staleUploadHours: plan.staleUploadHours,
      organizationId: plan.organizationId,
      assetId: plan.assetId,
    });
    console.log(JSON.stringify(report, null, 2));
    return report.result === "OK" ? 0 : 1;
  } catch (error) {
    // Never surface a driver or Prisma message: it can carry connection details.
    console.error(
      JSON.stringify({
        result: "FAIL",
        reason: error instanceof Error && error.name === "MediaStorageError" ? error.code : "RUN_FAILED",
      }),
    );
    return 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

const invokedDirectly =
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      console.error(JSON.stringify({ result: "FAIL", reason: "RUN_FAILED" }));
      process.exitCode = 1;
    },
  );
}
