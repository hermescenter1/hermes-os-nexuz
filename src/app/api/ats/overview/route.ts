import { NextResponse } from "next/server";
import { JOBS, CANDIDATES, RECENT_ACTIVITY, HIRING_VELOCITY_DAYS, STAGE_COUNTS } from "@/lib/ats/mock-data";
import type { AtsOverview } from "@/lib/ats/types";

export async function GET() {
  const openJobs      = JOBS.filter(j => j.status === "open").length;
  const totalCandidates = CANDIDATES.length;
  const averageScore  = totalCandidates > 0
    ? Math.round(CANDIDATES.reduce((s, c) => s + c.atsScore.total, 0) / totalCandidates)
    : 0;

  const topJobs = JOBS
    .filter(j => j.status === "open")
    .sort((a, b) => b.applicantCount - a.applicantCount)
    .slice(0, 4)
    .map(j => ({ jobId: j.id, title: j.title, count: j.applicantCount }));

  const overview: AtsOverview = {
    openJobs,
    totalCandidates,
    averageScore,
    byStage: { ...STAGE_COUNTS },
    recentActivity: RECENT_ACTIVITY,
    topJobs,
    hiringVelocityDays: HIRING_VELOCITY_DAYS,
  };

  return NextResponse.json(overview);
}
