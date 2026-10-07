/**
 * Cursor pagination for ERP child collections (HRIS-0.5).
 *
 * A collection is never returned as a silent prefix, whether it is a child list or a
 * top-level ERP list. `hasMore` says whether rows
 * exist beyond `items`, and `nextCursor` (the id of the last item) continues the
 * same ordered list through the collection's own GET route. Aggregates are never
 * computed from a page: totals and counts come from database count/aggregate
 * queries over the whole parent.
 */

import { z } from "zod";

export interface ChildPage<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** First page size embedded in a detail response. */
export const CHILD_DETAIL_PAGE = 50;
/** Largest page a child GET route returns. */
export const CHILD_PAGE_MAX = 100;

export const ChildListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(CHILD_PAGE_MAX).default(CHILD_DETAIL_PAGE),
    cursor: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export type ChildListQuery = z.infer<typeof ChildListQuerySchema>;

/**
 * Prisma cursor arguments that continue an ordered list after the row `cursor`
 * (the id of the last row already returned). The cursor row itself is skipped.
 */
export function cursorArgs(cursor: string | undefined): { cursor?: { id: string }; skip?: number } {
  return cursor ? { cursor: { id: cursor }, skip: 1 } : {};
}

/**
 * Builds a page from `limit + 1` fetched rows: the extra row only proves that more
 * exist and is never returned.
 */
export function pageOf<R extends { id: string }, T>(rows: R[], limit: number, map: (row: R) => T): ChildPage<T> {
  const hasMore = rows.length > limit;
  const kept = rows.slice(0, limit);
  return {
    items: kept.map(map),
    hasMore,
    nextCursor: hasMore ? kept[kept.length - 1].id : null,
  };
}

/**
 * The GET route of a collection with its current filters, so that "load more" asks
 * for the same ordered list the first page came from. Undefined filters are omitted.
 */
export function collectionEndpoint(path: string, filters: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
