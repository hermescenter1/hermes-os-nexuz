import { NextResponse } from "next/server";
import { getPublicJobs } from "@/lib/ats/db";
import { JOBS }          from "@/lib/ats/mock-data";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const department = searchParams.get("department") ?? undefined;
  const search     = searchParams.get("search")     ?? undefined;

  // Try DB first, fall back to mock data
  const dbJobs = await getPublicJobs({ department, search });

  if (dbJobs !== null) {
    return NextResponse.json({ jobs: dbJobs, total: dbJobs.length, source: "db" });
  }

  // Mock fallback
  let jobs = JOBS.filter((j) => j.status === "open");
  if (department) jobs = jobs.filter((j) => j.department === department);
  if (search) {
    const q = search.toLowerCase();
    jobs = jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.department.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q)
    );
  }

  const mockJobs = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    department: j.department,
    location: j.location,
    locationType: "onsite",
    salaryCurrency: j.currency,
    salaryMin: j.salaryMin,
    salaryMax: j.salaryMax,
    skills: j.requiredSkills,
    status: "OPEN",
    isPublic: true,
    createdAt: new Date(j.openedAt),
    updatedAt: new Date(j.openedAt),
  }));

  return NextResponse.json({ jobs: mockJobs, total: mockJobs.length, source: "mock" });
}
