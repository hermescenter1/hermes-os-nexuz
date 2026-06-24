import { NextResponse } from "next/server";
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

export async function POST(req: Request) {
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
