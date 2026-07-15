import { NextResponse }         from "next/server";
import type { NextRequest }      from "next/server";
import { getAuthRole }           from "@/lib/auth/rbac-server";
import {
  getInterviewsByOrg,
  createInterview,
  getApplicationById,
} from "@/lib/ats/db";
import { getPrisma }             from "@/lib/db/prisma";
import { requireOrgActor }       from "@/lib/org/context";

export async function GET(req: NextRequest) {
  const role = await getAuthRole(req);
  if (!role) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Resolve the org for the current user (first org membership)
  const db = await getPrisma();
  let organizationId: string | null = null;
  if (db) {
    try {
      const at = req.cookies.get("hermes_at")?.value;
      if (at) {
        const { verifyAccessToken } = await import("@/lib/auth/jwt");
        const payload = await verifyAccessToken(at);
        if (payload?.sub) {
          const memberModel = (db as Record<string, unknown>).organizationMember as {
            findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
          };
          const m = await memberModel.findFirst({
            where:   { userId: payload.sub, status: "ACTIVE" },
            orderBy: { createdAt: "asc" },
          });
          organizationId = m ? String(m.organizationId) : null;
        }
      }
    } catch { /* fall through */ }
  }

  if (!organizationId) {
    return NextResponse.json({ interviews: [], total: 0 });
  }

  const { searchParams } = new URL(req.url);
  const upcoming = searchParams.get("upcoming") === "true";

  const interviews = await getInterviewsByOrg(organizationId, { upcoming });
  return NextResponse.json({ interviews: interviews ?? [], total: (interviews ?? []).length });
}

export async function POST(req: NextRequest) {
  const role = await getAuthRole(req);
  if (!role) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  // Phase SECURITY-8: scheduling an interview is a recruiter operation — the
  // previous handler accepted ANY authenticated role (customer/vendor/
  // candidate included). Restrict to staff roles.
  if (!["superadmin", "admin", "engineer"].includes(role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await req.json() as {
    applicationId:   string;
    interviewType?:  string;
    scheduledAt:     string;
    durationMinutes?: number;
    interviewerName?: string;
    location?:       string;
    notes?:          string;
  };

  if (!body.applicationId || !body.scheduledAt) {
    return NextResponse.json(
      { error: "applicationId and scheduledAt are required" },
      { status: 400 }
    );
  }

  const application = await getApplicationById(body.applicationId);
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Phase SECURITY-8: tenant isolation. getApplicationById is id-only, so
  // verify the caller belongs to the application's organization before writing
  // an interview into it — otherwise any authenticated staff user could
  // schedule interviews against another org's applications (cross-tenant).
  const actor = await requireOrgActor(req, application.organizationId);
  if ("error" in actor) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const interview = await createInterview({
    organizationId:  application.organizationId,
    applicationId:   body.applicationId,
    interviewType:   body.interviewType,
    scheduledAt:     new Date(body.scheduledAt),
    durationMinutes: body.durationMinutes,
    interviewerName: body.interviewerName,
    location:        body.location,
    notes:           body.notes,
  });

  if (!interview) {
    return NextResponse.json({ error: "Failed to schedule interview" }, { status: 500 });
  }

  return NextResponse.json({ interview }, { status: 201 });
}
