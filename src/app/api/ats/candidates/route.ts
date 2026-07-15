import { NextResponse }      from "next/server";
import type { NextRequest }   from "next/server";
import { getAuthRole }        from "@/lib/auth/rbac-server";
import { can }                from "@/lib/auth/roles";
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

export async function POST(req: NextRequest) {
  // Phase 86C4B2B1D-SECURITY-8: internal ATS candidate creation (recruiter
  // side). Public applications go through /api/careers/apply. Authorize before
  // reading the body.
  const role = await getAuthRole(req);
  if (!role) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!can(role, "authoring")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

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
