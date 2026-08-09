/**
 * Academy course access for SERVER COMPONENTS (the public course page).
 *
 * ── Why this exists, and the visibility decision it encodes ──────────────────
 *
 * `/{locale}/academy/course/{courseId}` is an UNAUTHENTICATED URL: `rbac.ts`
 * guards only `academy/admin`, so the middleware lets anyone reach it. The page
 * nevertheless renders TENANT-OWNED content: `AcademyCourse.organizationId` is
 * non-null and every read path in `@/lib/academy/db` pairs `isPublished: true`
 * with an organization predicate. `isPublished` therefore means "published
 * INSIDE the owning organization", NOT "visible to the public internet", and
 * the schema has no public-visibility column at all — contrast
 * `Article.visibility === "PUBLIC"` and `JobPosting.isPublic`, which are the
 * repository's two explicit public-exposure flags.
 *
 * So an `isPublished`-only gate would not have been a fix: it would have
 * deliberately published every tenant's internal course catalogue to the
 * internet. Absent an explicit public-visibility signal, the fail-closed answer
 * is that an anonymous visitor sees NOTHING.
 *
 * DECISION: the route stays a public URL serving MEMBER-ONLY content. It
 * applies exactly the three predicates that `GET /api/academy/courses/[id]`
 * already applies — the endpoint this page's client component renders against —
 * and answers `notFound()` for everything else, so the URL is not an existence
 * oracle either. The page is additionally `noIndex` in every branch: member-only
 * content must never enter a search index, and `src/app/sitemap.ts` no longer
 * advertises course URLs.
 *
 * Making a course genuinely public is a FUTURE, EXPLICIT change: add a
 * visibility column to `AcademyCourse`, gate on it here, and only then re-add
 * the sitemap entries. Do not widen this predicate without that column.
 */

import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { isPayloadSessionActive } from "@/lib/auth/session-store";
import { getCourseById } from "./db";
import { resolveActiveOrgIdForUser, canSeeUnpublishedAcademyContent } from "./request-scope";
import type { DbAcademyCourse } from "./types";

/**
 * Resolve the course a server component is allowed to render, or null.
 *
 * Null means "render `notFound()`" — never "render it anyway". The predicates,
 * in the same order the API applies them:
 *   1. a valid, NON-REVOKED access token (the legacy session cookie alone is
 *      not enough — `resolveAcademyScope` reads the access token only, so the
 *      API would answer 404 for such a caller and the page must match);
 *   2. an ACTIVE organization membership, and the course must belong to it;
 *   3. the course must be published, unless the caller's role may see
 *      unpublished Academy content inside its own organization.
 * `getCourseById` already excludes soft-deleted rows (`deletedAt: null`).
 *
 * Every failure — including an unexpected one, such as `cookies()` being
 * unavailable or the database throwing — resolves to null. A gate that cannot
 * evaluate itself must deny.
 */
export async function resolveAcademyCourseForViewer(
  courseId: string,
): Promise<DbAcademyCourse | null> {
  try {
    const jar = await cookies();
    const token = jar.get(ACCESS_TOKEN_COOKIE)?.value;
    if (!token) return null;

    const payload = await verifyAccessToken(token);
    if (!payload?.sub) return null;
    if (!(await isPayloadSessionActive(payload))) return null;

    const orgId = await resolveActiveOrgIdForUser(payload.sub);
    if (!orgId) return null;

    const course = await getCourseById(courseId);
    if (!course || course.organizationId !== orgId) return null;
    if (!course.isPublished && !canSeeUnpublishedAcademyContent(payload.role)) return null;

    return course;
  } catch {
    return null;
  }
}
