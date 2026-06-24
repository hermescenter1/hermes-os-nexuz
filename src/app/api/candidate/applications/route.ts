import { NextResponse }                       from "next/server";
import { getTokenUser }                       from "@/lib/auth/token-session";
import { getCandidateByUserId, getApplicationsByCandidate, getJobById } from "@/lib/ats/db";
import { JOBS }                               from "@/lib/ats/mock-data";

export async function GET() {
  const user = await getTokenUser();
  if (!user || user.role !== "candidate") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const candidate = await getCandidateByUserId(user.id);
  if (!candidate) {
    return NextResponse.json({ applications: [], total: 0 });
  }

  const applications = await getApplicationsByCandidate(candidate.id);
  if (applications === null) {
    return NextResponse.json({ applications: [], total: 0 });
  }

  // Enrich with job details
  const enriched = await Promise.all(
    applications.map(async (app) => {
      const dbJob = await getJobById(app.jobId);
      const mockJob = JOBS.find((j) => j.id === app.jobId);
      const jobTitle = dbJob?.title ?? mockJob?.title ?? "Unknown Position";
      const jobDept  = dbJob?.department ?? mockJob?.department ?? "";
      const jobLoc   = dbJob?.location  ?? mockJob?.location   ?? "";
      return { ...app, jobTitle, jobDepartment: jobDept, jobLocation: jobLoc };
    })
  );

  return NextResponse.json({ applications: enriched, total: enriched.length });
}
