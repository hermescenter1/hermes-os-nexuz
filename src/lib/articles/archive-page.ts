/**
 * The `?page=` parameter of the Journal archive at `/{locale}/articles/latest`.
 *
 *  - absent        → the first page, at its canonical URL (no parameter)
 *  - "1"           → the first page under a duplicate URL; the caller
 *                    redirects to the canonical one
 *  - "2", "3", …   → that page
 *  - anything else → not a page ("0", "-1", "2.5", "02", "abc", repeated
 *                    `?page=` values); the caller answers 404 so no
 *                    parameter variant becomes a crawlable duplicate
 */
export type ArchivePageParam =
  | { kind: "first" }
  | { kind: "explicitFirst" }
  | { kind: "page"; page: number }
  | { kind: "invalid" };

/** Upper bound on the accepted digits, so a huge value never reaches `skip`. */
const PAGE_PATTERN = /^[1-9]\d{0,4}$/;

export function parseArchivePage(raw: string | string[] | undefined): ArchivePageParam {
  if (raw === undefined) return { kind: "first" };
  if (typeof raw !== "string" || !PAGE_PATTERN.test(raw)) return { kind: "invalid" };
  const page = Number(raw);
  return page === 1 ? { kind: "explicitFirst" } : { kind: "page", page };
}

/** The archive URL of page `page`: the first page carries no parameter. */
export function archivePageHref(basePath: string, page: number): string {
  return page === 1 ? basePath : `${basePath}?page=${page}`;
}
