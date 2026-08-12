/**
 * PHASE 102 — the public URL contract of the video library.
 *
 * WHY THIS IS ITS OWN MODULE
 * These names used to live in `src/app/[locale]/videos/data.ts`, next to the
 * loaders. `VideoLibraryFilters.tsx` is a `"use client"` island that needs two
 * of them to rewrite the query string, and importing them from `data.ts`
 * dragged that module's whole import graph into the CLIENT bundle:
 *
 *     VideoLibraryFilters.tsx -> data.ts -> @/lib/db/prisma
 *       -> @prisma/adapter-pg -> pg -> node:tls
 *
 * which failed `next build` with "Module not found: Can't resolve 'tls'".
 * Neither `tsc`, ESLint nor the unit suites catch that — only a real bundle
 * resolution does — so the boundary is now structural instead of incidental.
 *
 * THIS MODULE MUST STAY DEPENDENCY-FREE. No Prisma, no `node:` builtin, no
 * server helper, not even a transitive one. It is imported by client code, so
 * anything reachable from here is shipped to the browser. A guard test
 * (`src/app/[locale]/videos/__tests__/client-server-boundary.test.ts`) fails if
 * that ever stops being true.
 *
 * The values are the wire contract for a shareable, bookmarkable URL — changing
 * one breaks every link already in the wild.
 */

/** The organization namespace selector, mirroring the anonymous media API. */
export const VIDEO_HUB_ORG_PARAM = "org";
/** The category filter, expressed as a public category SLUG (never an id). */
export const VIDEO_HUB_CATEGORY_PARAM = "category";
/** The skill-level filter. */
export const VIDEO_HUB_LEVEL_PARAM = "level";
/** 1-based page number. */
export const VIDEO_HUB_PAGE_PARAM = "page";

/** Kept below the repository's own maximum so one page is one bounded query. */
export const VIDEO_HUB_PAGE_SIZE = 12;
