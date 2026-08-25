import { NextResponse }       from "next/server";
import type { NextRequest }    from "next/server";
import { getAuthRole }         from "@/lib/auth/rbac-server";
import { getCourseById, getEnrollment, enrollUser } from "@/lib/academy/db";
import { resolveAcademyScope } from "@/lib/academy/request-scope";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // PHASE 99 SECURITY — this endpoint gated on `isPublished` alone and never
  // compared the course's organization with the caller's, while the sibling
  // detail endpoint already applied exactly that predicate. A member of org B
  // holding a course id from org A could therefore enroll in it: enrollUser()
  // stamps the CALLER's organizationId onto the row, so a local enrollment
  // ended up pointing at a foreign course, and the progress path later read
  // that course's title back out through the issued certificate. Apply the
  // detail endpoint's predicate and answer 404 — never 403 — so the response
  // cannot be used as an existence oracle for another tenant's ids. The scope
  // resolver this route carried inline was a verbatim copy of
  // resolveAcademyScope, so it is gone in favour of the shared definition.
  const role = await getAuthRole(req);
  if (!role) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const scope = await resolveAcademyScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Course not found or not available" }, { status: 404 });
  }

  const { id: courseId } = await params;

  const course = await getCourseById(courseId);
  if (!course || course.organizationId !== scope.orgId || !course.isPublished) {
    return NextResponse.json({ error: "Course not found or not available" }, { status: 404 });
  }

  // Check if already enrolled
  const existing = await getEnrollment(courseId, scope.userId);
  if (existing) {
    return NextResponse.json({ enrollment: existing, alreadyEnrolled: true });
  }

  const enrollment = await enrollUser({
    courseId,
    organizationId: scope.orgId,
    userId:         scope.userId,
    source:         "self",
  });

  if (!enrollment) {
    return NextResponse.json({ error: "Enrollment failed" }, { status: 500 });
  }

  return NextResponse.json({ enrollment }, { status: 201 });
}
