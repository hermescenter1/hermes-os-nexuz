import { NextResponse }      from "next/server";
import { CANDIDATES, JOBS }  from "@/lib/ats/mock-data";
import { scoreCandidate }    from "@/lib/ats/scoring";
import type { Candidate, PipelineStage } from "@/lib/ats/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId    = searchParams.get("jobId");
  const stage    = searchParams.get("stage") as PipelineStage | null;
  const minScore = searchParams.get("minScore");

  let candidates = [...CANDIDATES];
  if (jobId)    candidates = candidates.filter(c => c.jobId === jobId);
  if (stage)    candidates = candidates.filter(c => c.stage === stage);
  if (minScore) candidates = candidates.filter(c => c.atsScore.total >= Number(minScore));

  candidates.sort((a, b) => b.atsScore.total - a.atsScore.total);

  return NextResponse.json({ candidates, total: candidates.length });
}

export async function POST(req: Request) {
  const body: Partial<Candidate> = await req.json();
  const job = body.jobId ? JOBS.find(j => j.id === body.jobId) : null;

  const created: Candidate = {
    id:                 `cand-${Date.now()}`,
    jobId:              body.jobId              ?? "",
    name:               body.name               ?? "Unknown",
    email:              body.email              ?? "",
    phone:              body.phone              ?? "",
    location:           body.location           ?? "",
    workAuthorization:  body.workAuthorization  ?? "citizen",
    experienceYears:    body.experienceYears    ?? 0,
    skills:             body.skills             ?? [],
    cvSummary:          body.cvSummary          ?? "",
    source:             body.source             ?? "direct",
    stage:              "applied",
    salaryExpectation:  body.salaryExpectation  ?? 0,
    appliedAt:          new Date().toISOString().split("T")[0],
    atsScore: job
      ? scoreCandidate(job, {
          jobId:              body.jobId             ?? "",
          location:           body.location          ?? "",
          workAuthorization:  body.workAuthorization ?? "citizen",
          experienceYears:    body.experienceYears   ?? 0,
          skills:             body.skills            ?? [],
          salaryExpectation:  body.salaryExpectation ?? 0,
        })
      : { total: 0, skillScore: 0, experienceScore: 0, locationScore: 0, authorizationScore: 0, salaryScore: 0, industryScore: 0, riskFlags: [], explanations: [] },
  };

  return NextResponse.json(created, { status: 201 });
}
