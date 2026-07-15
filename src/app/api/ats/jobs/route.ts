import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthRole }  from "@/lib/auth/rbac-server";
import { can }          from "@/lib/auth/roles";
import { JOBS }         from "@/lib/ats/mock-data";
import type { Job }     from "@/lib/ats/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const dept   = searchParams.get("department");

  let jobs = [...JOBS];
  if (status) jobs = jobs.filter(j => j.status === status);
  if (dept)   jobs = jobs.filter(j => j.department === dept);

  return NextResponse.json({ jobs, total: jobs.length });
}

export async function POST(req: NextRequest) {
  // Phase 86C4B2B1D-SECURITY-8: ATS job creation is an internal recruiter
  // operation, not a public one (the public path is /api/careers/apply).
  // Authorize (authoring capability) BEFORE reading the body.
  const role = await getAuthRole(req);
  if (!role) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!can(role, "authoring")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const body: Partial<Job> = await req.json();
  const created: Job = {
    id:                 `job-${Date.now()}`,
    title:              body.title              ?? "New Position",
    department:         body.department         ?? "General",
    location:           body.location           ?? "Remote",
    contractType:       body.contractType       ?? "full-time",
    salaryMin:          body.salaryMin          ?? 0,
    salaryMax:          body.salaryMax          ?? 0,
    currency:           body.currency           ?? "USD",
    requiredSkills:     body.requiredSkills     ?? [],
    niceToHaveSkills:   body.niceToHaveSkills   ?? [],
    visaSponsorship:    body.visaSponsorship    ?? false,
    status:             body.status             ?? "draft",
    description:        body.description        ?? "",
    minExperienceYears: body.minExperienceYears ?? 0,
    openedAt:           new Date().toISOString().split("T")[0],
    applicantCount:     0,
  };
  return NextResponse.json(created, { status: 201 });
}
