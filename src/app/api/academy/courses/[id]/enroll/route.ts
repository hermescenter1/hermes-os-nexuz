import { NextResponse }       from "next/server";
import type { NextRequest }    from "next/server";
import { getCourseById, getEnrollment, enrollUser } from "@/lib/academy/db";
// The inline scope resolver this route used to carry was a byte-identical copy
// of resolveAcademyScope. Copies are how the tenant predicate went missing here
// while the sibling detail endpoint had it, so the copy is gone.
import { resolveAcademyScope } from "@/lib/academy/request-scope";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolveAcademyScope(req);
  if (!ctx) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id: courseId } = await params;

  // TENANT ISOLATION — this route gated on `isPublished` alone, with no
  // organization predicate, while the sibling GET /api/academy/courses/[id]
  // applies `course.organizationId !== scope.orgId`. A member of org B could
  // therefore enroll in org A's published course, writing an enrollment row
  // owned by B but pointing at A's course. That row is the key to the rest of
  // the surface: POST /api/academy/progress accepts any enrollment and feeds
  // `course.title` into issueCertificate, so A's course title came back to B on
  // a certificate. 404 rather than 403 — a foreign course id must not be an
  // existence oracle, exactly as the detail endpoint decided.
  const course = await getCourseById(courseId);
  if (!course || course.organizationId !== ctx.orgId || !course.isPublished) {
    return NextResponse.json({ error: "Course not found or not available" }, { status: 404 });
  }

  // Check if already enrolled
  const existing = await getEnrollment(courseId, ctx.userId);
  if (existing) {
    return NextResponse.json({ enrollment: existing, alreadyEnrolled: true });
  }

  const enrollment = await enrollUser({
    courseId,
    organizationId: ctx.orgId,
    userId:         ctx.userId,
    source:         "self",
  });

  if (!enrollment) {
    return NextResponse.json({ error: "Enrollment failed" }, { status: 500 });
  }

  return NextResponse.json({ enrollment }, { status: 201 });
}
