import { NextResponse }       from "next/server";
import type { NextRequest }    from "next/server";
import { getAuthRole }         from "@/lib/auth/rbac-server";
import { getCourseById, getCourseModules, getCourseLessons, getCourseQuizzes, updateCourse } from "@/lib/academy/db";
import { resolveAcademyScope, canSeeUnpublishedAcademyContent } from "@/lib/academy/request-scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // PHASE 99 SECURITY — this detail endpoint had no gate at all while the
  // sibling list endpoint required authentication, resolved the caller's
  // organization and served published courses only. An anonymous caller holding
  // a course id therefore received another tenant's DRAFT course. Apply the same
  // three predicates the list endpoint applies, and answer 404 (not 403) for a
  // foreign or unpublished course so the response is not an existence oracle.
  const role = await getAuthRole(req);
  if (!role) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const scope = await resolveAcademyScope(req);
  if (!scope) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const { id } = await params;

  const course = await getCourseById(id);
  if (!course || course.organizationId !== scope.orgId) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (!course.isPublished && !canSeeUnpublishedAcademyContent(role)) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const [modules, lessons, quizzes] = await Promise.all([
    getCourseModules(id),
    getCourseLessons(id),
    getCourseQuizzes(id),
  ]);

  // Build module tree: modules → lessons
  const modulesWithLessons = (modules ?? []).map((mod) => ({
    ...mod,
    lessons: (lessons ?? []).filter((l) => l.moduleId === mod.id),
  }));

  return NextResponse.json({
    course,
    modules: modulesWithLessons,
    lessons: lessons ?? [],
    quizzes: quizzes ?? [],
    totalLessons: (lessons ?? []).length,
    totalDuration: (lessons ?? []).reduce((s, l) => s + l.durationMinutes, 0),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getAuthRole(req);
  if (!role || !["admin", "superadmin"].includes(role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  // Phase SECURITY-8 amendment: explicit field allow-list — the raw body was
  // cast straight into Prisma `data`, letting a client inject id/createdAt/
  // slug/other columns. Only editable course-content fields pass.
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data = {
    title:              raw.title,
    description:        raw.description,
    category:           raw.category,
    level:              raw.level,
    estimatedHours:     raw.estimatedHours,
    isPublished:        raw.isPublished,
    isFeatured:         raw.isFeatured,
    certificateEnabled: raw.certificateEnabled,
    passingScore:       raw.passingScore,
    instructorName:     raw.instructorName,
    instructorBio:      raw.instructorBio,
    thumbnailUrl:       raw.thumbnailUrl,
    enrollmentType:     raw.enrollmentType,
  } as Parameters<typeof updateCourse>[1];

  const course = await updateCourse(id, data);
  if (!course) {
    return NextResponse.json({ error: "Course not found or update failed" }, { status: 404 });
  }

  return NextResponse.json({ course });
}
