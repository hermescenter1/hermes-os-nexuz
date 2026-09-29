/**
 * SPRINT 1C-A — the ONE authoritative reader for a PUBLICLY addressable Academy
 * course, and the only place that is allowed to decide what a course id means.
 *
 * THE DEFECT THIS CLOSES
 * ----------------------
 * `/[locale]/academy/course/[courseId]` had no existence check at all. Measured
 * against production on 2026-09-28:
 *
 *     GET /fa/academy/course/sprint1b-synthetic-invalid-id
 *       -> HTTP 200
 *          <meta name="robots" content="index, follow">
 *          <link rel="canonical" href=".../fa/academy/course/sprint1b-synthetic-invalid-id">
 *          three <link rel="alternate" hreflang> entries
 *          Course + BreadcrumbList JSON-LD, named from a generic fallback string
 *
 * Every arbitrary string in that path segment therefore minted an indexable URL
 * carrying a `Course` entity for a course that does not exist. The cardinality
 * of that set is unbounded, which is the worst shape a soft 404 can take: a
 * crawler can generate new "pages" faster than they can ever be removed.
 *
 * WHY A THREE-STATE RESULT AND NOT `Course | null`
 * ------------------------------------------------
 * `@/lib/academy/db#getCourseById` returns `null` for BOTH "the database
 * answered and there is no such row" and "there is no database". A caller that
 * maps `null` to `notFound()` therefore 404s every real course during an outage
 * — it de-indexes the whole catalog on a bad deploy — while a caller that maps
 * `null` to a fallback page publishes fabricated courses, which is the defect
 * above. Neither collapse is acceptable, so this module refuses to make it:
 *
 *   found        the store answered AND the row exists AND it is publicly
 *                visible. Render it, index it, describe it in structured data.
 *   not-found    the store answered AND there is no publicly visible row.
 *                A real 404. No canonical, no hreflang, no Course JSON-LD.
 *   unavailable  the store could not be consulted (session mode, no
 *                DATABASE_URL, client not generated, adapter or query failure).
 *                NOT a 404 — the course may well exist. Fail closed for
 *                indexing instead: serve the page's own unavailable state with
 *                `noindex` and no structured data, so a transient outage can
 *                never be mistaken by a crawler for a permanent removal, and
 *                can never publish a fabricated entity either.
 *
 * NOT-FOUND AND NOT-PUBLIC ARE THE SAME ANSWER, DELIBERATELY
 * ----------------------------------------------------------
 * An unpublished or soft-deleted row is reported as `not-found`, exactly as
 * `GET /api/academy/courses/[id]` already answers 404 rather than 403 for a
 * course the caller may not see (see the PHASE 99 note in that route). A
 * distinguishable answer would turn this public URL into an existence oracle
 * for another tenant's draft catalog.
 *
 * SCOPE NOTE — this module reads PUBLICATION state only. It deliberately does
 * NOT resolve an organization: the public course URL carries no tenant, and
 * `src/app/sitemap.ts` already advertises published courses across tenants.
 * Narrowing that to a per-tenant public catalog is a visibility-policy decision
 * for the owner, not an indexing fix, and nothing here weakens the
 * authenticated `/api/academy/courses/[id]` gate, which keeps its own
 * organization predicate.
 */

import { cache } from "react";
import { getPrisma } from "@/lib/db/prisma";

/** The three answers a public course id can have. */
export type PublicCourseLookup =
  | { state: "found"; course: PublicCourseFacts }
  | { state: "not-found" }
  | { state: "unavailable" };

/**
 * The facts a public surface may publish about a course. Only columns that
 * exist on the row — nothing is defaulted, templated or invented here.
 */
export interface PublicCourseFacts {
  id: string;
  title: string;
  description: string;
}

/** Minimal row shape; kept local so this module needs no generated client. */
interface CourseRow {
  id: unknown;
  title: unknown;
  description: unknown;
}

interface CourseFindFirst {
  findFirst?: (args: unknown) => Promise<CourseRow | null>;
}

/**
 * The public visibility predicate, stated once.
 *
 * `isPublished` is the editorial gate and carries the existing
 * `@@index([organizationId, isPublished])`; `deletedAt: null` excludes soft
 * deletes, matching `getCourseById` in `@/lib/academy/db`. `src/app/sitemap.ts`
 * consumes this same constant so the sitemap can never advertise a URL this
 * module answers 404 for.
 */
export const publicCourseWhere = { isPublished: true, deletedAt: null } as const;

/**
 * Resolve a course id to one of the three states above. Never throws.
 *
 * Exported uncached so it can be exercised directly; route code uses
 * {@link getPublicCourse}, which adds per-request memoisation.
 */
export async function lookupPublicCourse(courseId: string): Promise<PublicCourseLookup> {
  // A malformed segment is a confirmed miss, not an outage: no store needs to
  // be consulted to know that the empty string is not a course id.
  if (typeof courseId !== "string" || courseId.length === 0) {
    return { state: "not-found" };
  }

  let prisma: Awaited<ReturnType<typeof getPrisma>>;
  try {
    prisma = await getPrisma();
  } catch {
    return { state: "unavailable" };
  }
  // `getPrisma()` returns null in session mode, without DATABASE_URL, or when
  // the client was never generated. None of those are evidence about the row.
  if (!prisma) return { state: "unavailable" };

  const model = (prisma as unknown as { academyCourse?: CourseFindFirst }).academyCourse;
  if (typeof model?.findFirst !== "function") return { state: "unavailable" };

  let row: CourseRow | null;
  try {
    row = await model.findFirst({
      where: { id: courseId, ...publicCourseWhere },
      select: { id: true, title: true, description: true },
    });
  } catch {
    // The query itself failed — connection dropped, timeout, migration skew.
    // The row's existence is unknown, so this is an outage, not a 404.
    return { state: "unavailable" };
  }

  // The store answered. `null` here is a FACT about the catalog.
  if (row === null) return { state: "not-found" };

  // A row that cannot supply the columns a public page renders is treated as a
  // miss rather than published with holes — no title is ever substituted.
  if (typeof row.title !== "string" || row.title.length === 0) {
    return { state: "not-found" };
  }
  if (typeof row.description !== "string") {
    return { state: "not-found" };
  }

  return {
    state: "found",
    course: {
      id: typeof row.id === "string" ? row.id : courseId,
      title: row.title,
      description: row.description,
    },
  };
}

/**
 * Request-scoped memoised lookup.
 *
 * `generateMetadata` and the page component both need the same answer for the
 * same id in the same request; `react#cache` collapses that into one query
 * during rendering and is a transparent pass-through outside a request scope,
 * so unit tests observe the real function.
 */
export const getPublicCourse = cache(lookupPublicCourse);
