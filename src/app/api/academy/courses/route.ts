import { NextResponse }       from "next/server";
import type { NextRequest }    from "next/server";
import { getAuthRole }         from "@/lib/auth/rbac-server";
import { getPublishedCourses, getAllCourses, createCourse, getAcademyStats } from "@/lib/academy/db";
import { getUserEnrollments }  from "@/lib/academy/db";
// PHASE 99 — the scope resolution that used to be inline here now lives in
// `@/lib/academy/request-scope` so the `[id]` detail endpoints, which had no
// tenant predicate at all, resolve the caller exactly the same way.
import { resolveAcademyScope } from "@/lib/academy/request-scope";

export async function GET(req: NextRequest) {
  const role = await getAuthRole(req);
  if (!role) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const ctx = await resolveAcademyScope(req);
  if (!ctx) return NextResponse.json({ courses: [], total: 0 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? undefined;
  const level    = searchParams.get("level")    ?? undefined;
  const search   = searchParams.get("search")   ?? undefined;
  const view     = searchParams.get("view")     ?? "published";

  let courses;
  if (view === "admin" && (role === "admin" || role === "superadmin")) {
    courses = await getAllCourses(ctx.orgId);
  } else {
    courses = await getPublishedCourses({ organizationId: ctx.orgId, category, level, search });
  }

  // Enrich with enrollment status
  const enrollments = await getUserEnrollments(ctx.userId, ctx.orgId) ?? [];
  const enrollmentMap = new Map(enrollments.map((e) => [e.courseId, e]));

  const enriched = (courses ?? []).map((c) => ({
    ...c,
    enrollment: enrollmentMap.get(c.id) ?? null,
  }));

  return NextResponse.json({ courses: enriched, total: enriched.length });
}

export async function POST(req: NextRequest) {
  const role = await getAuthRole(req);
  if (!role || !["admin", "superadmin"].includes(role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const ctx = await resolveAcademyScope(req);
  if (!ctx) return NextResponse.json({ error: "Could not resolve organization" }, { status: 400 });

  const body = await req.json() as {
    title: string; description: string; category?: string; level?: string;
    estimatedHours?: number; instructorName?: string; certificateEnabled?: boolean;
    passingScore?: number;
  };

  if (!body.title || !body.description) {
    return NextResponse.json({ error: "title and description are required" }, { status: 400 });
  }

  const slug = body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const course = await createCourse({
    organizationId:   ctx.orgId,
    title:            body.title,
    slug,
    description:      body.description,
    category:         body.category,
    level:            body.level,
    estimatedHours:   body.estimatedHours,
    instructorName:   body.instructorName,
    certificateEnabled: body.certificateEnabled,
    passingScore:     body.passingScore,
    createdById:      ctx.userId,
  });

  if (!course) {
    return NextResponse.json({ error: "Failed to create course (slug may already exist)" }, { status: 409 });
  }

  return NextResponse.json({ course }, { status: 201 });
}
