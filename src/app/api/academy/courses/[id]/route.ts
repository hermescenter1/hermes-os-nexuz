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
  const body = await req.json() as Record<string, unknown>;

  const course = await updateCourse(id, body as Parameters<typeof updateCourse>[1]);
  if (!course) {
    return NextResponse.json({ error: "Course not found or update failed" }, { status: 404 });
  }

  return NextResponse.json({ course });
}
