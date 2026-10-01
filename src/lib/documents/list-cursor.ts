import { z } from "zod";

/**
 * F-2 — keyset cursor for the tenant document list.
 *
 * The list is ordered `createdAt DESC, id DESC`. A cursor carries the VALUES
 * of the last row of the previous page (its `createdAt` and `id`), not a row
 * reference, so resolving it performs no lookup: an id from another
 * organization — or one that never existed — cannot be used as an existence
 * oracle. The next page is simply "rows of MY organization strictly after
 * (createdAt, id)" in that order, filtered by `tenantId` in the same query.
 *
 * The cursor is opaque to clients (base64url JSON) and validated strictly on
 * the way back in; anything malformed is refused, never guessed at.
 */

export interface DocumentListCursor {
  readonly createdAt: string; // ISO-8601
  readonly id: string;
}

const CURSOR_SCHEMA = z
  .object({
    t: z.iso.datetime({ offset: true }),
    i: z.string().min(1).max(128),
  })
  .strict();

const MAX_CURSOR_LENGTH = 512;

export function encodeDocumentListCursor(cursor: DocumentListCursor): string {
  return Buffer.from(JSON.stringify({ t: cursor.createdAt, i: cursor.id }), "utf8").toString("base64url");
}

/** `null` for anything that is not a cursor this module produced. */
export function decodeDocumentListCursor(raw: string): DocumentListCursor | null {
  if (!raw || raw.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const result = CURSOR_SCHEMA.safeParse(parsed);
  return result.success ? { createdAt: result.data.t, id: result.data.i } : null;
}

/** Same total order as the SQL `ORDER BY "createdAt" DESC, id DESC`. */
export function isAfterCursor(row: { createdAt: string; id: string }, cursor: DocumentListCursor): boolean {
  const rowTime = Date.parse(row.createdAt);
  const cursorTime = Date.parse(cursor.createdAt);
  return rowTime < cursorTime || (rowTime === cursorTime && row.id < cursor.id);
}
