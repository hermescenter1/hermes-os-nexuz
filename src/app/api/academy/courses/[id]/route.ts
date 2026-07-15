import { NextResponse }       from "next/server";
import type { NextRequest }    from "next/server";
import { getAuthRole }         from "@/lib/auth/rbac-server";
import { getCourseById, getCourseModules, getCourseLessons, getCourseQuizzes, updateCourse } from "@/lib/academy/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [course, modules, lessons, quizzes] = await Promise.all([
    getCourseById(id),
    getCourseModules(id),
    getCourseLessons(id),
    getCourseQuizzes(id),
  ]);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

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
