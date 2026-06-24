import { NextResponse } from "next/server";
import { getJobById }   from "@/lib/ats/db";
import { JOBS }         from "@/lib/ats/mock-data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const dbJob = await getJobById(jobId);
  if (dbJob !== null) {
    return NextResponse.json({ job: dbJob, source: "db" });
  }

  // Mock fallback
  const job = JOBS.find((j) => j.id === jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const mockJob = {
    id: job.id,
    title: job.title,
    description: job.description,
    department: job.department,
    location: job.location,
    locationType: "onsite",
    salaryCurrency: job.currency,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    skills: job.requiredSkills,
    requirements: job.requiredSkills,
    responsibilities: [],
    benefits: [],
    status: "OPEN",
    isPublic: true,
    createdAt: new Date(job.openedAt),
    updatedAt: new Date(job.openedAt),
  };

  return NextResponse.json({ job: mockJob, source: "mock" });
}
