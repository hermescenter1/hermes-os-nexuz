import { NextResponse }              from "next/server";
import { JOBS, CANDIDATES, HIRING_VELOCITY_DAYS } from "@/lib/ats/mock-data";
import { STAGE_ORDER, STAGE_LABELS }  from "@/lib/ats/types";
import type { AtsAnalytics, ApplicationSource } from "@/lib/ats/types";

export async function GET() {
  const openJobs       = JOBS.filter(j => j.status === "open").length;
  const closedJobs     = JOBS.filter(j => j.status === "closed" || j.status === "paused").length;
  const totalCandidates  = CANDIDATES.length;
  const hiredCandidates  = CANDIDATES.filter(c => c.stage === "hired").length;
  const rejectedCandidates = CANDIDATES.filter(c => c.stage === "rejected").length;
  const averageAtsScore  = totalCandidates > 0
    ? Math.round(CANDIDATES.reduce((s, c) => s + c.atsScore.total, 0) / totalCandidates)
    : 0;

  const byStage = STAGE_ORDER.map(stage => ({
    stage,
    label: STAGE_LABELS[stage],
    count: CANDIDATES.filter(c => c.stage === stage).length,
  }));

  // Top skills from all candidates
  const skillCount: Record<string, number> = {};
  CANDIDATES.forEach(c => {
    c.skills.forEach(s => {
      skillCount[s] = (skillCount[s] ?? 0) + 1;
    });
  });
  const topSkills = Object.entries(skillCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)
    .map(([skill, count]) => ({ skill, count }));

  // By department
  const deptMap: Record<string, { jobs: number; candidates: number }> = {};
  JOBS.forEach(j => {
    if (!deptMap[j.department]) deptMap[j.department] = { jobs: 0, candidates: 0 };
    deptMap[j.department].jobs++;
  });
  CANDIDATES.forEach(c => {
    const job = JOBS.find(j => j.id === c.jobId);
    if (job) {
      if (!deptMap[job.department]) deptMap[job.department] = { jobs: 0, candidates: 0 };
      deptMap[job.department].candidates++;
    }
  });
  const byDepartment = Object.entries(deptMap)
    .map(([department, v]) => ({ department, ...v }))
    .sort((a, b) => b.candidates - a.candidates);

  // By source
  const sourceCount: Record<string, number> = {};
  CANDIDATES.forEach(c => {
    sourceCount[c.source] = (sourceCount[c.source] ?? 0) + 1;
  });
  const bySources = (Object.entries(sourceCount) as [ApplicationSource, number][])
    .sort(([, a], [, b]) => b - a)
    .map(([source, count]) => ({ source, count }));

  // Rejection reasons (derived from ATS scores of rejected candidates)
  const rejected = CANDIDATES.filter(c => c.stage === "rejected");
  const reasonCount: Record<string, number> = {};
  rejected.forEach(c => {
    c.atsScore.riskFlags.forEach(f => {
      reasonCount[f] = (reasonCount[f] ?? 0) + 1;
    });
    if (c.atsScore.riskFlags.length === 0) {
      reasonCount["Below minimum requirements"] = (reasonCount["Below minimum requirements"] ?? 0) + 1;
    }
  });
  const rejectionReasons = Object.entries(reasonCount)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => ({ reason, count }));

  // Score distribution
  const RANGES = [
    { range: "0–30",   min: 0,  max: 30  },
    { range: "31–50",  min: 31, max: 50  },
    { range: "51–70",  min: 51, max: 70  },
    { range: "71–85",  min: 71, max: 85  },
    { range: "86–100", min: 86, max: 100 },
  ];
  const scoreDistribution = RANGES.map(r => ({
    range: r.range,
    count: CANDIDATES.filter(c => c.atsScore.total >= r.min && c.atsScore.total <= r.max).length,
  }));

  const analytics: AtsAnalytics = {
    openJobs, closedJobs, totalCandidates, hiredCandidates, rejectedCandidates,
    averageAtsScore, byStage, topSkills, byDepartment, bySources,
    rejectionReasons, hiringVelocityDays: HIRING_VELOCITY_DAYS, scoreDistribution,
  };

  return NextResponse.json(analytics);
}
