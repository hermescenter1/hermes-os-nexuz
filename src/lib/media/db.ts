/**
 * PHASE 102 — Hermes Media & Video Hub: the repository layer.
 *
 * Design authority: docs/phase102/architecture.md §3, §5, §8 and §11.
 *
 * Four rules govern every function in this file, and they are enforced HERE rather
 * than being left to callers:
 *
 *  1. PUBLISHED-ONLY VISIBILITY IS THE DEFAULT (§11). The loaders take a
 *     `MediaAudience` that defaults to `PUBLIC_AUDIENCE`, and an editorial caller
 *     must pass a discriminated `{ scope: "EDITORIAL", includeUnpublished: true }`
 *     variant to see anything else. This deliberately corrects
 *     `src/lib/articles/db.ts` `getArticleDetailBySlug`, which applies no status
 *     filter at all and leaves the gate to each caller — one forgotten caller away
 *     from serving a draft.
 *  2. EVERY QUERY IS ORGANIZATION-SCOPED. `organizationId` is a required parameter
 *     on every exported function; it is never read from a row and never optional.
 *  3. EVERY PER-SUBJECT READ FILTERS BY `userId` IN THE `where` CLAUSE (§8). Private
 *     viewing history is never fetched broadly and narrowed in JavaScript.
 *  4. EVERY LIST IS BOUNDED. There is no unbounded `findMany` in this module; page
 *     size and page number are both clamped before they reach Prisma.
 *
 * Lifecycle writes use the compare-and-swap predicate form proven at
 * `src/lib/compliance/export-db.ts:145-148`: `updateMany` carrying the expected
 * current state in the `where` clause, with `affected !== 1` treated as a conflict.
 * That is the only multi-replica-safe concurrency primitive in this repository —
 * there is no leader election, advisory lock or scheduler singleton anywhere.
 */

import { z } from "zod";
import { getPrisma } from "@/lib/db/prisma";
import type { OrgPermission } from "@/lib/org/rbac";
import {
  MEDIA_PUBLISHED_STATUS,
  PROCESSING_STATE_REQUIRED_TO_PUBLISH,
  evaluateProcessingTransition,
  evaluateTransition,
  type MediaProcessingDriver,
} from "./lifecycle";
import {
  MEDIA_VIEW_EVENT_TYPES,
  isMediaLifecycleStatus,
  isMediaProcessingState,
  type MediaLifecycleStatus,
  type MediaProcessingState,
  type MediaViewEventType,
} from "./types";

// ── Result vocabulary ────────────────────────────────────────────────────────

/**
 * Why an operation did not happen.
 *
 * `NOT_FOUND` is returned for a row that exists but belongs to another tenant, or
 * that the audience may not see — exposing the difference would confirm the
 * existence of an inaccessible resource, which CLAUDE.md forbids.
 */
export type MediaFailureReason =
  | "STORAGE_UNAVAILABLE"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "ILLEGAL_TRANSITION"
  | "PROCESSING_NOT_READY"
  | "OPERATOR_ONLY"
  | "INVALID_INPUT"
  | "ERROR";

export type MediaResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: MediaFailureReason };

function fail<T>(reason: MediaFailureReason): MediaResult<T> {
  return { ok: false, reason };
}
function ok<T>(value: T): MediaResult<T> {
  return { ok: true, value };
}

// ── Audience (the published-only gate) ───────────────────────────────────────

/**
 * WHO is asking. This is the typed opt-out described in §11.
 *
 * `PUBLIC` and `ORGANIZATION` both pin `status = PUBLISHED` and
 * `processingState = READY` in the database query. `EDITORIAL` is the ONLY variant
 * that lifts the lifecycle filter, and it cannot be constructed by accident:
 * `includeUnpublished` is typed as the literal `true`, so `{ scope: "EDITORIAL" }`
 * alone does not compile, and the actor's permissions must be supplied with it so
 * the repository can fail closed on its own rather than trusting that some caller
 * upstream ran the check.
 */
export type MediaAudience =
  | { readonly scope: "PUBLIC" }
  | { readonly scope: "ORGANIZATION" }
  | {
      readonly scope: "EDITORIAL";
      readonly includeUnpublished: true;
      readonly permissions: readonly OrgPermission[];
    };

/** The default for every loader. Never widen this. */
export const PUBLIC_AUDIENCE: MediaAudience = { scope: "PUBLIC" };

/** The permission an editorial audience must hold to bypass the published filter. */
const EDITORIAL_READ_PERMISSION: OrgPermission = "view_media";

/**
 * Translate an audience into a Prisma `where` fragment.
 *
 * Exported so the visibility rule can be asserted directly by tests: the fragment
 * a public reader produces must always contain both halves of the gate plus the
 * servability condition, and that is checked without a database.
 */
export function mediaVisibilityWhere(
  audience: MediaAudience,
): MediaResult<Record<string, unknown>> {
  switch (audience.scope) {
    case "PUBLIC":
      return ok({
        status: MEDIA_PUBLISHED_STATUS,
        visibility: "PUBLIC",
        processingState: PROCESSING_STATE_REQUIRED_TO_PUBLISH,
      });
    case "ORGANIZATION":
      return ok({
        status: MEDIA_PUBLISHED_STATUS,
        visibility: { in: ["PUBLIC", "ORGANIZATION"] },
        processingState: PROCESSING_STATE_REQUIRED_TO_PUBLISH,
      });
    case "EDITORIAL":
      // Fail closed: an editorial read without `view_media` is refused outright
      // rather than silently downgraded, so a mis-wired caller is a visible 403
      // instead of a confusing empty list.
      if (!audience.permissions.includes(EDITORIAL_READ_PERMISSION)) {
        return fail("FORBIDDEN");
      }
      return ok({});
  }
}

// ── Pagination bounds (rule 4) ───────────────────────────────────────────────

export const MEDIA_PAGE_SIZE_DEFAULT = 24;
export const MEDIA_PAGE_SIZE_MAX = 50;
/** Caps `skip`, so a hostile `page` cannot ask PostgreSQL to walk the whole table. */
export const MEDIA_PAGE_MAX = 400;

export interface MediaPage<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly hasMore: boolean;
}

function clampPaging(input: { page?: number; pageSize?: number }): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const rawPage = Number.isInteger(input.page) ? (input.page as number) : 1;
  const rawSize = Number.isInteger(input.pageSize)
    ? (input.pageSize as number)
    : MEDIA_PAGE_SIZE_DEFAULT;
  const page = Math.min(Math.max(rawPage, 1), MEDIA_PAGE_MAX);
  const pageSize = Math.min(Math.max(rawSize, 1), MEDIA_PAGE_SIZE_MAX);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// ── Prisma access ────────────────────────────────────────────────────────────

type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;
type TxModels = Record<string, AnyModel>;
type MaybeTxClient = TxModels & {
  $transaction?: <T>(fn: (tx: TxModels) => Promise<T>) => Promise<T>;
};

/**
 * Run `fn` inside a real interactive transaction when the client supports one.
 *
 * Production Prisma always does, so every lifecycle write and its
 * `MediaEditorialEvent` land atomically. Minimal test doubles that omit
 * `$transaction` execute `fn` directly — the same accommodation made at
 * `src/lib/auth/session-store.ts:63-67`. This never weakens production behaviour:
 * the branch is chosen by capability, not by configuration.
 */
async function withTx<T>(client: MaybeTxClient, fn: (tx: TxModels) => Promise<T>): Promise<T> {
  if (typeof client.$transaction === "function") {
    return client.$transaction((tx) => fn(tx));
  }
  return fn(client);
}

async function client(): Promise<MaybeTxClient | null> {
  const db = await getPrisma();
  if (!db) return null;
  return db as unknown as MaybeTxClient;
}

function assetModel(tx: TxModels): AnyModel {
  return tx.mediaAsset;
}

// ── Row projections ──────────────────────────────────────────────────────────

/** The columns this module reads back. Narrower than the table on purpose: a
 *  projection nobody consumes is a column nobody has reasoned about. */
export interface MediaAssetRow {
  id: string;
  organizationId: string;
  siteId: string | null;
  categoryId: string | null;
  instructorId: string | null;
  slug: string;
  primaryLocale: string;
  status: string;
  visibility: string;
  processingState: string;
  skillLevel: string | null;
  storageKey: string | null;
  storageProvider: string;
  contentType: string | null;
  byteSize: number | null;
  durationSeconds: number | null;
  posterStorageKey: string | null;
  viewCount: number;
  saveCount: number;
  completionCount: number;
  publishedAt: Date | string | null;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface MediaWatchProgressRow {
  id: string;
  organizationId: string;
  mediaAssetId: string;
  userId: string;
  positionSeconds: number;
  progressPct: number;
  completedAt: Date | string | null;
  lastWatchedAt: Date | string;
}

export interface MediaSaveRow {
  id: string;
  organizationId: string;
  mediaAssetId: string;
  userId: string;
  createdAt: Date | string;
}

// ── Loaders (rule 1) ─────────────────────────────────────────────────────────

export interface MediaListFilters {
  readonly categoryId?: string;
  readonly instructorId?: string;
  readonly siteId?: string;
  readonly skillLevel?: string;
}

function filterWhere(filters: MediaListFilters | undefined): Record<string, unknown> {
  if (!filters) return {};
  const w: Record<string, unknown> = {};
  if (filters.categoryId) w.categoryId = filters.categoryId;
  if (filters.instructorId) w.instructorId = filters.instructorId;
  if (filters.siteId) w.siteId = filters.siteId;
  if (filters.skillLevel) w.skillLevel = filters.skillLevel;
  return w;
}

/**
 * Load one asset by slug.
 *
 * The audience gate and the tenant predicate are both in the `where` clause, so an
 * unpublished row is never materialised in the first place — there is no in-memory
 * copy of a draft for a later refactor to leak.
 */
export async function getMediaAssetBySlug(params: {
  organizationId: string;
  slug: string;
  audience?: MediaAudience;
}): Promise<MediaResult<MediaAssetRow>> {
  const gate = mediaVisibilityWhere(params.audience ?? PUBLIC_AUDIENCE);
  if (!gate.ok) return gate;
  const c = await client();
  if (!c) return fail("STORAGE_UNAVAILABLE");
  try {
    const row = (await assetModel(c).findFirst({
      where: { organizationId: params.organizationId, slug: params.slug, ...gate.value },
    })) as MediaAssetRow | null;
    return row ? ok(row) : fail("NOT_FOUND");
  } catch {
    return fail("ERROR");
  }
}

/** Load one asset by id, under the same gate as {@link getMediaAssetBySlug}. */
export async function getMediaAssetById(params: {
  organizationId: string;
  id: string;
  audience?: MediaAudience;
}): Promise<MediaResult<MediaAssetRow>> {
  const gate = mediaVisibilityWhere(params.audience ?? PUBLIC_AUDIENCE);
  if (!gate.ok) return gate;
  const c = await client();
  if (!c) return fail("STORAGE_UNAVAILABLE");
  try {
    const row = (await assetModel(c).findFirst({
      where: { organizationId: params.organizationId, id: params.id, ...gate.value },
    })) as MediaAssetRow | null;
    return row ? ok(row) : fail("NOT_FOUND");
  } catch {
    return fail("ERROR");
  }
}

/** Paginated, bounded, tenant-scoped, audience-gated library listing. */
export async function listMediaAssets(params: {
  organizationId: string;
  audience?: MediaAudience;
  filters?: MediaListFilters;
  page?: number;
  pageSize?: number;
}): Promise<MediaResult<MediaPage<MediaAssetRow>>> {
  const gate = mediaVisibilityWhere(params.audience ?? PUBLIC_AUDIENCE);
  if (!gate.ok) return gate;
  const c = await client();
  if (!c) return fail("STORAGE_UNAVAILABLE");
  const { page, pageSize, skip, take } = clampPaging(params);
  const where = {
    organizationId: params.organizationId,
    ...gate.value,
    ...filterWhere(params.filters),
  };
  try {
    const model = assetModel(c);
    const [rows, total] = await Promise.all([
      model.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take,
      }) as Promise<unknown>,
      model.count({ where }) as Promise<unknown>,
    ]);
    const items = (Array.isArray(rows) ? rows : []) as MediaAssetRow[];
    const totalCount = typeof total === "number" ? total : items.length;
    return ok({ items, page, pageSize, total: totalCount, hasMore: skip + items.length < totalCount });
  } catch {
    return fail("ERROR");
  }
}

// ── Per-subject reads (rule 3) ───────────────────────────────────────────────

/**
 * The saved library of ONE user.
 *
 * `userId` is in the `where` clause, and the joined asset carries the audience gate
 * as a relation filter, so a save that survives an asset being archived stops being
 * returned to a public reader at the database, not afterwards.
 */
export async function listSavedMediaForUser(params: {
  organizationId: string;
  userId: string;
  audience?: MediaAudience;
  page?: number;
  pageSize?: number;
}): Promise<MediaResult<MediaPage<MediaSaveRow & { mediaAsset?: MediaAssetRow }>>> {
  const gate = mediaVisibilityWhere(params.audience ?? PUBLIC_AUDIENCE);
  if (!gate.ok) return gate;
  const c = await client();
  if (!c) return fail("STORAGE_UNAVAILABLE");
  const { page, pageSize, skip, take } = clampPaging(params);
  const where = {
    organizationId: params.organizationId,
    userId: params.userId,
    mediaAsset: { ...gate.value },
  };
  try {
    const model = c.mediaSave;
    const [rows, total] = await Promise.all([
      model.findMany({
        where,
        include: { mediaAsset: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }) as Promise<unknown>,
      model.count({ where }) as Promise<unknown>,
    ]);
    const items = (Array.isArray(rows) ? rows : []) as Array<
      MediaSaveRow & { mediaAsset?: MediaAssetRow }
    >;
    const totalCount = typeof total === "number" ? total : items.length;
    return ok({ items, page, pageSize, total: totalCount, hasMore: skip + items.length < totalCount });
  } catch {
    return fail("ERROR");
  }
}

/** One user's position in one asset. Never another user's — `userId` is a predicate. */
export async function getWatchProgressForUser(params: {
  organizationId: string;
  userId: string;
  mediaAssetId: string;
}): Promise<MediaResult<MediaWatchProgressRow | null>> {
  const c = await client();
  if (!c) return fail("STORAGE_UNAVAILABLE");
  try {
    const row = (await c.mediaWatchProgress.findFirst({
      where: {
        organizationId: params.organizationId,
        userId: params.userId,
        mediaAssetId: params.mediaAssetId,
      },
    })) as MediaWatchProgressRow | null;
    return ok(row ?? null);
  } catch {
    return fail("ERROR");
  }
}

/** "Continue watching" — started, not finished, still visible to this audience. */
export async function listContinueWatchingForUser(params: {
  organizationId: string;
  userId: string;
  audience?: MediaAudience;
  page?: number;
  pageSize?: number;
}): Promise<
  MediaResult<MediaPage<MediaWatchProgressRow & { mediaAsset?: MediaAssetRow }>>
> {
  const gate = mediaVisibilityWhere(params.audience ?? PUBLIC_AUDIENCE);
  if (!gate.ok) return gate;
  const c = await client();
  if (!c) return fail("STORAGE_UNAVAILABLE");
  const { page, pageSize, skip, take } = clampPaging(params);
  const where = {
    organizationId: params.organizationId,
    userId: params.userId,
    completedAt: null,
    progressPct: { gt: 0 },
    mediaAsset: { ...gate.value },
  };
  try {
    const model = c.mediaWatchProgress;
    const [rows, total] = await Promise.all([
      model.findMany({
        where,
        include: { mediaAsset: true },
        orderBy: { lastWatchedAt: "desc" },
        skip,
        take,
      }) as Promise<unknown>,
      model.count({ where }) as Promise<unknown>,
    ]);
    const items = (Array.isArray(rows) ? rows : []) as Array<
      MediaWatchProgressRow & { mediaAsset?: MediaAssetRow }
    >;
    const totalCount = typeof total === "number" ? total : items.length;
    return ok({ items, page, pageSize, total: totalCount, hasMore: skip + items.length < totalCount });
  } catch {
    return fail("ERROR");
  }
}

// ── Editorial transitions (compare-and-swap) ─────────────────────────────────

export interface MediaTransitionOutcome {
  readonly id: string;
  readonly from: MediaLifecycleStatus;
  readonly to: MediaLifecycleStatus;
  readonly action: string;
}

const transitionInput = z.object({
  id: z.string().min(1).max(64),
  organizationId: z.string().min(1).max(64),
  actorUserId: z.string().min(1).max(64),
  reason: z.string().max(2000).nullish(),
});

/**
 * Move one asset from its CURRENT status to `to`, atomically.
 *
 * The expected current status is READ INSIDE the transaction rather than supplied by
 * the caller, and so is `processingState` — a caller cannot assert that bytes are
 * READY in order to publish something that is quarantined. The read is then used as
 * the compare-and-swap predicate, and `affected !== 1` means another replica moved
 * the row first: `CONFLICT`, never a silent overwrite.
 *
 * The `MediaEditorialEvent` is written in the SAME transaction as the status change,
 * so there is no window in which a published asset has no record of who published it.
 */
export async function transitionMediaAssetStatus(params: {
  id: string;
  organizationId: string;
  actorUserId: string;
  to: MediaLifecycleStatus;
  permissions: readonly OrgPermission[];
  reason?: string | null;
  now?: Date;
}): Promise<MediaResult<MediaTransitionOutcome>> {
  const parsed = transitionInput.safeParse({
    id: params.id,
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    reason: params.reason ?? null,
  });
  if (!parsed.success) return fail("INVALID_INPUT");

  const c = await client();
  if (!c) return fail("STORAGE_UNAVAILABLE");
  const now = params.now ?? new Date();

  try {
    return await withTx(c, async (tx) => {
      const model = assetModel(tx);
      const current = (await model.findFirst({
        where: { id: params.id, organizationId: params.organizationId },
      })) as MediaAssetRow | null;
      // Cross-tenant and non-existent are indistinguishable on purpose.
      if (!current) return fail<MediaTransitionOutcome>("NOT_FOUND");
      if (!isMediaLifecycleStatus(current.status) || !isMediaProcessingState(current.processingState)) {
        // A value the CHECK constraint should have made impossible. Refuse rather
        // than coerce: the database and this module disagreeing is not a state any
        // transition may be computed from.
        return fail<MediaTransitionOutcome>("CONFLICT");
      }
      const from: MediaLifecycleStatus = current.status;

      const decision = evaluateTransition({
        from,
        to: params.to,
        permissions: params.permissions,
        processingState: current.processingState,
      });
      if (!decision.ok) return fail<MediaTransitionOutcome>(decision.reason);

      const data: Record<string, unknown> = {
        status: params.to,
        updatedBy: params.actorUserId,
        updatedAt: now,
      };
      switch (decision.transition.action) {
        case "SUBMIT":
          data.submittedAt = now;
          break;
        case "START_REVIEW":
          data.reviewedAt = now;
          break;
        case "PUBLISH":
          data.reviewedAt = now;
          // Stamped ONCE. A re-publication after archive/restore keeps the original
          // first-publication instant, which is what the SEO surface and the audit
          // trail both mean by `publishedAt`.
          if (current.publishedAt === null || current.publishedAt === undefined) {
            data.publishedAt = now;
          }
          data.archivedAt = null;
          data.rejectionReason = null;
          break;
        case "REJECT":
          data.reviewedAt = now;
          data.rejectionReason = params.reason ?? null;
          break;
        case "ARCHIVE":
          data.archivedAt = now;
          break;
        case "RESTORE":
          // Back to an editable draft: clear the states that describe why it left.
          data.archivedAt = null;
          data.rejectionReason = null;
          break;
      }

      // Compare-and-swap. The publish edge additionally pins `processingState`, so a
      // quarantine that lands between the read above and this write wins the race.
      const casWhere: Record<string, unknown> = {
        id: params.id,
        organizationId: params.organizationId,
        status: from,
      };
      if (params.to === MEDIA_PUBLISHED_STATUS) {
        casWhere.processingState = PROCESSING_STATE_REQUIRED_TO_PUBLISH;
      }
      const res = (await model.updateMany({ where: casWhere, data })) as { count?: number };
      const affected = typeof res?.count === "number" ? res.count : 0;
      if (affected !== 1) return fail<MediaTransitionOutcome>("CONFLICT");

      await tx.mediaEditorialEvent.create({
        data: {
          organizationId: params.organizationId,
          mediaAssetId: params.id,
          fromStatus: from,
          toStatus: params.to,
          action: decision.transition.action,
          actorUserId: params.actorUserId,
          reason: params.reason ?? null,
          createdAt: now,
        },
      });

      return ok<MediaTransitionOutcome>({
        id: params.id,
        from,
        to: params.to,
        action: decision.transition.action,
      });
    });
  } catch {
    return fail("ERROR");
  }
}

/**
 * Advance the PROCESSING machine (§5) by compare-and-swap.
 *
 * There is no background job runner in this platform, so the `OPERATOR` edges are
 * reachable only from the operator-run CLI. An HTTP caller passing
 * `driver: "REQUEST"` is refused with `OPERATOR_ONLY` for those edges.
 *
 * A quarantine or failure deliberately does NOT unpublish the asset: the public
 * loaders already pin `processingState = READY`, so the bytes stop being served the
 * moment this write commits, while the editorial status stays as the human left it.
 */
export async function transitionMediaProcessingState(params: {
  id: string;
  organizationId: string;
  actorUserId: string;
  from: MediaProcessingState;
  to: MediaProcessingState;
  driver: MediaProcessingDriver;
  permissions?: readonly OrgPermission[];
  failureCode?: string | null;
  now?: Date;
}): Promise<MediaResult<{ id: string; from: MediaProcessingState; to: MediaProcessingState }>> {
  const decision = evaluateProcessingTransition({
    from: params.from,
    to: params.to,
    driver: params.driver,
    permissions: params.permissions,
  });
  if (!decision.ok) {
    return fail(decision.reason === "OPERATOR_ONLY" ? "OPERATOR_ONLY" : decision.reason);
  }
  const c = await client();
  if (!c) return fail("STORAGE_UNAVAILABLE");
  const now = params.now ?? new Date();
  const data: Record<string, unknown> = {
    processingState: params.to,
    updatedBy: params.actorUserId,
    updatedAt: now,
  };
  if (params.to === "FAILED" || params.to === "QUARANTINED") {
    data.processingFailureCode = params.failureCode ?? "UNSPECIFIED";
  }
  try {
    const res = (await assetModel(c).updateMany({
      where: {
        id: params.id,
        organizationId: params.organizationId,
        processingState: params.from,
      },
      data,
    })) as { count?: number };
    const affected = typeof res?.count === "number" ? res.count : 0;
    if (affected !== 1) return fail("CONFLICT");
    return ok({ id: params.id, from: params.from, to: params.to });
  } catch {
    return fail("ERROR");
  }
}

// ── Saves ────────────────────────────────────────────────────────────────────

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

/**
 * Save an asset for ONE user.
 *
 * The asset is re-resolved under the caller's audience inside the transaction, so a
 * user cannot save something they may not see — including another tenant's asset,
 * which is reported as `NOT_FOUND` rather than `FORBIDDEN`.
 *
 * Idempotent: a duplicate is a success that does NOT increment `saveCount` again.
 */
export async function saveMediaForUser(params: {
  organizationId: string;
  userId: string;
  mediaAssetId: string;
  audience?: MediaAudience;
  now?: Date;
}): Promise<MediaResult<{ created: boolean }>> {
  const gate = mediaVisibilityWhere(params.audience ?? PUBLIC_AUDIENCE);
  if (!gate.ok) return gate;
  const c = await client();
  if (!c) return fail("STORAGE_UNAVAILABLE");
  const now = params.now ?? new Date();
  try {
    return await withTx(c, async (tx) => {
      const asset = (await assetModel(tx).findFirst({
        where: {
          id: params.mediaAssetId,
          organizationId: params.organizationId,
          ...gate.value,
        },
      })) as MediaAssetRow | null;
      if (!asset) return fail<{ created: boolean }>("NOT_FOUND");

      const existing = (await tx.mediaSave.findFirst({
        where: {
          organizationId: params.organizationId,
          userId: params.userId,
          mediaAssetId: params.mediaAssetId,
        },
      })) as MediaSaveRow | null;
      if (existing) return ok({ created: false });

      await tx.mediaSave.create({
        data: {
          organizationId: params.organizationId,
          userId: params.userId,
          mediaAssetId: params.mediaAssetId,
          createdAt: now,
        },
      });
      await assetModel(tx).updateMany({
        where: { id: params.mediaAssetId, organizationId: params.organizationId },
        data: { saveCount: { increment: 1 } },
      });
      return ok({ created: true });
    });
  } catch (err) {
    // A concurrent save lost the race on the (userId, mediaAssetId) unique index.
    // The user's intent is already satisfied, so this is a success with no counter
    // movement — the winning transaction incremented it exactly once.
    if (isUniqueViolation(err)) return ok({ created: false });
    return fail("ERROR");
  }
}

/** Remove ONE user's save. `userId` is a delete predicate, never a post-filter. */
export async function unsaveMediaForUser(params: {
  organizationId: string;
  userId: string;
  mediaAssetId: string;
}): Promise<MediaResult<{ removed: boolean }>> {
  const c = await client();
  if (!c) return fail("STORAGE_UNAVAILABLE");
  try {
    return await withTx(c, async (tx) => {
      const res = (await tx.mediaSave.deleteMany({
        where: {
          organizationId: params.organizationId,
          userId: params.userId,
          mediaAssetId: params.mediaAssetId,
        },
      })) as { count?: number };
      const removed = (typeof res?.count === "number" ? res.count : 0) === 1;
      if (!removed) return ok({ removed: false });
      // Bounded by the row that was actually deleted, so the counter cannot be
      // driven negative by repeated calls.
      await assetModel(tx).updateMany({
        where: {
          id: params.mediaAssetId,
          organizationId: params.organizationId,
          saveCount: { gt: 0 },
        },
        data: { saveCount: { decrement: 1 } },
      });
      return ok({ removed: true });
    });
  } catch {
    return fail("ERROR");
  }
}

// ── Watch progress ───────────────────────────────────────────────────────────

/** Progress at or above this percentage counts as a completion. */
export const MEDIA_COMPLETION_THRESHOLD_PCT = 95;

const progressInput = z.object({
  positionSeconds: z.number().int().min(0).max(24 * 60 * 60),
  progressPct: z.number().int().min(0).max(100),
});

/**
 * Record ONE user's position in ONE asset.
 *
 * `completionCount` is incremented only when this user's row ACTUALLY transitions
 * into a completed state — proven by a compare-and-swap on `completedAt: null`
 * inside the transaction, never inferred from a prior read. Replaying the same
 * progress event does not inflate the counter, and neither do two concurrent
 * requests for the same viewer: exactly one of them can observe `count: 1`.
 */
export async function recordWatchProgressForUser(params: {
  organizationId: string;
  userId: string;
  mediaAssetId: string;
  positionSeconds: number;
  progressPct: number;
  audience?: MediaAudience;
  now?: Date;
}): Promise<MediaResult<{ completed: boolean; firstCompletion: boolean }>> {
  const parsed = progressInput.safeParse({
    positionSeconds: params.positionSeconds,
    progressPct: params.progressPct,
  });
  if (!parsed.success) return fail("INVALID_INPUT");
  const gate = mediaVisibilityWhere(params.audience ?? PUBLIC_AUDIENCE);
  if (!gate.ok) return gate;
  const c = await client();
  if (!c) return fail("STORAGE_UNAVAILABLE");
  const now = params.now ?? new Date();
  const completed = parsed.data.progressPct >= MEDIA_COMPLETION_THRESHOLD_PCT;

  try {
    return await withTx(c, async (tx) => {
      const asset = (await assetModel(tx).findFirst({
        where: {
          id: params.mediaAssetId,
          organizationId: params.organizationId,
          ...gate.value,
        },
      })) as MediaAssetRow | null;
      if (!asset) return fail<{ completed: boolean; firstCompletion: boolean }>("NOT_FOUND");

      const existing = (await tx.mediaWatchProgress.findFirst({
        where: {
          organizationId: params.organizationId,
          userId: params.userId,
          mediaAssetId: params.mediaAssetId,
        },
      })) as MediaWatchProgressRow | null;

      const shared: Record<string, unknown> = {
        positionSeconds: parsed.data.positionSeconds,
        progressPct: parsed.data.progressPct,
        lastWatchedAt: now,
        updatedAt: now,
      };

      /**
       * PHASE 102 / RELEASE BLOCKER 8 — the completion counter is claimed by a
       * COMPARE-AND-SET, not decided from a prior read.
       *
       * The previous shape was `firstCompletion = completed && !existing?.completedAt`
       * — a read, a decision in application memory, then an UNCONDITIONAL write.
       * Two concurrent requests for the same viewer both read `completedAt` as
       * null, both concluded they were first, both wrote, and both incremented:
       * one viewer, two completions, on a counter the product presents as
       * "how many people finished this". Nothing prevented it. The update's
       * predicate named the row and its owner but never the state being changed,
       * and the increment was conditioned on the in-memory verdict rather than on
       * anything the database had agreed to.
       *
       * The predicate now includes `completedAt: null`, which is the fact being
       * claimed. Under PostgreSQL's READ COMMITTED — the default for Prisma's
       * interactive transactions — the second writer blocks on the row lock and,
       * when the first commits, re-evaluates its predicate against the NEW row
       * version. `completedAt` is no longer null, so it matches nothing and
       * reports `count: 0`. Exactly one writer can ever see `count: 1`, and only
       * that writer increments.
       *
       * `affected === 1` is therefore evidence from the database, not a guess.
       */
      let firstCompletion = false;

      if (existing) {
        if (completed && !existing.completedAt) {
          // Claim the null → now transition. The `userId` predicate is repeated
          // because the row id alone would satisfy Prisma but would not prove
          // ownership at the database.
          // `getPrisma()` is deliberately untyped here (see the module header),
          // so the affected-row count is asserted the same way every other
          // compare-and-swap in this file does it.
          const claimed = (await tx.mediaWatchProgress.updateMany({
            where: {
              id: existing.id,
              organizationId: params.organizationId,
              userId: params.userId,
              completedAt: null,
            },
            data: { ...shared, completedAt: now },
          })) as { count?: number };
          firstCompletion = (claimed?.count ?? 0) === 1;

          if (!firstCompletion) {
            // Another writer claimed the completion. This request's position and
            // progress are still real and must still be recorded — losing the
            // claim is not a reason to drop the viewer's place in the video.
            await tx.mediaWatchProgress.updateMany({
              where: {
                id: existing.id,
                organizationId: params.organizationId,
                userId: params.userId,
              },
              data: shared,
            });
          }
        } else {
          await tx.mediaWatchProgress.updateMany({
            where: {
              id: existing.id,
              organizationId: params.organizationId,
              userId: params.userId,
            },
            data: shared,
          });
        }
      } else {
        // No row yet. `@@unique([userId, mediaAssetId])` is the compare-and-set
        // here: a concurrent creator loses with a unique violation, which the
        // catch below turns into CONFLICT rather than a second increment.
        await tx.mediaWatchProgress.create({
          data: {
            organizationId: params.organizationId,
            userId: params.userId,
            mediaAssetId: params.mediaAssetId,
            createdAt: now,
            ...shared,
            ...(completed ? { completedAt: now } : {}),
          },
        });
        firstCompletion = completed;
      }

      if (firstCompletion) {
        await assetModel(tx).updateMany({
          where: { id: params.mediaAssetId, organizationId: params.organizationId },
          data: { completionCount: { increment: 1 } },
        });
      }
      return ok({ completed, firstCompletion });
    });
  } catch (err) {
    if (isUniqueViolation(err)) return fail("CONFLICT");
    return fail("ERROR");
  }
}

// ── Analytics (§8) ───────────────────────────────────────────────────────────

/**
 * A SHA-256 hex digest, and nothing else.
 *
 * `MediaViewEvent.ipHash` mirrors `ArticleView.ipHash`: it stores a hash and NEVER a
 * raw address. This regex is the enforcement point — a dotted-quad or a v6 literal
 * cannot satisfy 64 lowercase hex characters, so a caller that forgets to hash gets
 * `INVALID_INPUT` instead of silently persisting personal data.
 */
const IP_HASH_PATTERN = /^[0-9a-f]{64}$/;

const viewEventInput = z.object({
  organizationId: z.string().min(1).max(64),
  mediaAssetId: z.string().min(1).max(64),
  userId: z.string().min(1).max(64).nullish(),
  ipHash: z.string().regex(IP_HASH_PATTERN).nullish(),
  eventType: z.enum(MEDIA_VIEW_EVENT_TYPES),
  positionSeconds: z.number().int().min(0).max(24 * 60 * 60).nullish(),
  locale: z.enum(["fa", "en", "de"]).nullish(),
});

/**
 * Append one play/progress/completion event.
 *
 * `userId` is nullable, so an anonymous play is recorded without inventing an
 * identity. Only `PLAY` moves `viewCount`; `completionCount` is moved exclusively by
 * {@link recordWatchProgressForUser}, which can deduplicate per subject — counting a
 * `COMPLETE` event here as well would double-count every authenticated finish.
 */
export async function recordMediaViewEvent(params: {
  organizationId: string;
  mediaAssetId: string;
  userId?: string | null;
  /** MUST already be hashed. This module never sees, and never accepts, a raw IP. */
  ipHash?: string | null;
  eventType: MediaViewEventType;
  positionSeconds?: number | null;
  locale?: string | null;
  audience?: MediaAudience;
  now?: Date;
}): Promise<MediaResult<{ recorded: true }>> {
  const parsed = viewEventInput.safeParse({
    organizationId: params.organizationId,
    mediaAssetId: params.mediaAssetId,
    userId: params.userId ?? null,
    ipHash: params.ipHash ?? null,
    eventType: params.eventType,
    positionSeconds: params.positionSeconds ?? null,
    locale: params.locale ?? null,
  });
  if (!parsed.success) return fail("INVALID_INPUT");
  const gate = mediaVisibilityWhere(params.audience ?? PUBLIC_AUDIENCE);
  if (!gate.ok) return gate;
  const c = await client();
  if (!c) return fail("STORAGE_UNAVAILABLE");
  const now = params.now ?? new Date();

  try {
    return await withTx(c, async (tx) => {
      const asset = (await assetModel(tx).findFirst({
        where: {
          id: params.mediaAssetId,
          organizationId: params.organizationId,
          ...gate.value,
        },
      })) as MediaAssetRow | null;
      if (!asset) return fail<{ recorded: true }>("NOT_FOUND");

      await tx.mediaViewEvent.create({
        data: {
          organizationId: params.organizationId,
          mediaAssetId: params.mediaAssetId,
          userId: parsed.data.userId ?? null,
          ipHash: parsed.data.ipHash ?? null,
          eventType: parsed.data.eventType,
          positionSeconds: parsed.data.positionSeconds ?? null,
          locale: parsed.data.locale ?? null,
          createdAt: now,
        },
      });

      if (parsed.data.eventType === "PLAY") {
        await assetModel(tx).updateMany({
          where: { id: params.mediaAssetId, organizationId: params.organizationId },
          data: { viewCount: { increment: 1 } },
        });
      }
      return ok<{ recorded: true }>({ recorded: true });
    });
  } catch {
    return fail("ERROR");
  }
}

/** Bounded, tenant-scoped editorial history for one asset. */
export async function listEditorialEventsForAsset(params: {
  organizationId: string;
  mediaAssetId: string;
  permissions: readonly OrgPermission[];
  page?: number;
  pageSize?: number;
}): Promise<MediaResult<MediaPage<Record<string, unknown>>>> {
  if (!params.permissions.includes(EDITORIAL_READ_PERMISSION)) return fail("FORBIDDEN");
  const c = await client();
  if (!c) return fail("STORAGE_UNAVAILABLE");
  const { page, pageSize, skip, take } = clampPaging(params);
  const where = {
    organizationId: params.organizationId,
    mediaAssetId: params.mediaAssetId,
  };
  try {
    const model = c.mediaEditorialEvent;
    const [rows, total] = await Promise.all([
      model.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }) as Promise<unknown>,
      model.count({ where }) as Promise<unknown>,
    ]);
    const items = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
    const totalCount = typeof total === "number" ? total : items.length;
    return ok({ items, page, pageSize, total: totalCount, hasMore: skip + items.length < totalCount });
  } catch {
    return fail("ERROR");
  }
}
