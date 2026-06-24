import { NextResponse }   from "next/server";
import { JOBS }           from "@/lib/ats/mock-data";
import { scoreCandidate } from "@/lib/ats/scoring";
import type { ScoreRequest } from "@/lib/ats/types";

export async function POST(req: Request) {
  const body: ScoreRequest = await req.json();
  const job = JOBS.find(j => j.id === body.jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const score = scoreCandidate(job, body);
  return NextResponse.json(score);
}
