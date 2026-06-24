import { NextResponse }             from "next/server";
import { CANDIDATES }               from "@/lib/ats/mock-data";
import { STAGE_ORDER, STAGE_LABELS } from "@/lib/ats/types";
import type { PipelineColumn }       from "@/lib/ats/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  const pool = jobId ? CANDIDATES.filter(c => c.jobId === jobId) : CANDIDATES;

  const columns: PipelineColumn[] = STAGE_ORDER.map(stage => {
    const stageCandidates = pool
      .filter(c => c.stage === stage)
      .sort((a, b) => b.atsScore.total - a.atsScore.total);
    return {
      stage,
      label: STAGE_LABELS[stage],
      candidates: stageCandidates,
      count: stageCandidates.length,
    };
  });

  return NextResponse.json({ columns, total: pool.length });
}
