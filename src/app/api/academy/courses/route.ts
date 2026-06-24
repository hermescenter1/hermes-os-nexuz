import { NextResponse }       from "next/server";
import type { NextRequest }    from "next/server";
import { getAuthRole }         from "@/lib/auth/rbac-server";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";
import { getPublishedCourses, getAllCourses, createCourse, getAcademyStats } from "@/lib/academy/db";
import { getUserEnrollments }  from "@/lib/academy/db";

async function resolveUser(req: NextRequest) {
  const db = await getPrisma();
  if (!db) return null;
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!at) return null;
  const payload = await verifyAccessToken(at);
  if (!payload?.sub) return null;
  const memberModel = (db as Record<string, unknown>).organizationMember as {
    findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  };
  const row = await memberModel.findFirst({
    where: { userId: payload.sub, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  return row ? { userId: payload.sub, orgId: String(row.organizationId) } : null;
}

export async function GET(req: NextRequest) {
  const role = await getAuthRole(req);
  if (!role) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const ctx = await resolveUser(req);
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

  const ctx = await resolveUser(req);
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
