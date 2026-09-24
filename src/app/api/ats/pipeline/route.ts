import { NextResponse }             from "next/server";
import type { NextRequest }         from "next/server";
import { CANDIDATES }               from "@/lib/ats/mock-data";
import { STAGE_ORDER, STAGE_LABELS } from "@/lib/ats/types";
import type { PipelineColumn }       from "@/lib/ats/types";
import { requireRecruitmentReader, RECRUITMENT_NO_STORE } from "@/lib/ats/management-guard";

/**
 * Recruitment pipeline board — a MANAGEMENT surface.
 *
 * This was the most exposed of the four unauthenticated ATS endpoints: its
 * response carries whole candidate records (name, email, phone, location,
 * salary expectation, score breakdown). Anonymous access is now refused.
 *
 * STILL FIXTURE-BACKED — the rows are invented people from
 * `@/lib/ats/mock-data`, identical for every organization. Nothing here is
 * tenant-scoped yet, and this handler must not be pointed at PostgreSQL
 * without an organization predicate in the same change.
 */
export async function GET(req: NextRequest) {
  const reader = await requireRecruitmentReader(req);
  if (!reader.ok) return reader.response;

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

  return NextResponse.json({ columns, total: pool.length }, { headers: RECRUITMENT_NO_STORE });
}
