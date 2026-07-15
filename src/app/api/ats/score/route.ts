import { NextResponse }   from "next/server";
import type { NextRequest } from "next/server";
import { getAuthRole }     from "@/lib/auth/rbac-server";
import { can }             from "@/lib/auth/roles";
import { JOBS }           from "@/lib/ats/mock-data";
import { scoreCandidate } from "@/lib/ats/scoring";
import type { ScoreRequest } from "@/lib/ats/types";

export async function POST(req: NextRequest) {
  // Phase 86C4B2B1D-SECURITY-8: recruiter-side scoring helper — authorize
  // before doing any work.
  const role = await getAuthRole(req);
  if (!role) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (!can(role, "authoring")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const body: ScoreRequest = await req.json();
  const job = JOBS.find(j => j.id === body.jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const score = scoreCandidate(job, body);
  return NextResponse.json(score);
}
