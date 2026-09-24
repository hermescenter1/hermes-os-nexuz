import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { JOBS, CANDIDATES, RECENT_ACTIVITY, HIRING_VELOCITY_DAYS, STAGE_COUNTS } from "@/lib/ats/mock-data";
import type { AtsOverview } from "@/lib/ats/types";
import { requireRecruitmentReader, RECRUITMENT_NO_STORE } from "@/lib/ats/management-guard";

/**
 * ATS overview — a MANAGEMENT surface.
 *
 * It previously answered every anonymous caller, because `/api/**` is outside
 * the middleware matcher and this handler had no check of its own.
 *
 * STILL FIXTURE-BACKED. The numbers below come from `@/lib/ats/mock-data`, are
 * the same for every organization, and are NOT a report on any tenant's real
 * hiring. Authentication landed first, on purpose, so that wiring this handler
 * to PostgreSQL cannot be the change that exposes candidate PII. Org scoping
 * and the real queries arrive together — see `docs/ats/ATS_BASELINE_AUDIT.md`.
 */
export async function GET(req: NextRequest) {
  const reader = await requireRecruitmentReader(req);
  if (!reader.ok) return reader.response;

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

  return NextResponse.json(overview, { headers: RECRUITMENT_NO_STORE });
}
