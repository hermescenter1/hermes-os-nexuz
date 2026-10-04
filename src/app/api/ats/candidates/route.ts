import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAtsActor } from "@/lib/ats/rbac";
import { correlationOf } from "@/lib/ats/positions/http";
import { REQUEST_ID_HEADER } from "@/lib/logger/correlation";
import { getAtsCandidates } from "@/lib/ats/dashboard";
import type { PipelineStage } from "@/lib/ats/types";

/**
 * Internal candidate listing — REAL, tenant-scoped.
 *
 * The rows come only from this organization's live applications (see
 * `@/lib/ats/dashboard`), reached THROUGH `AtsApplication` because
 * `AtsCandidate` carries no organization of its own. Erased, anonymised and
 * soft-deleted rows are excluded at the query level, so a candidate who has
 * been erased never appears here or in search. A fresh organization gets an
 * empty list. No fixture is imported; a store fault is a controlled 503.
 *
 * There is no fixture-backed candidate CREATE: real applications arrive only
 * through the public `/api/careers/apply` intake, so POST answers 501 rather
 * than minting an invented person.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

const STAGES: PipelineStage[] = ["applied", "screening", "technical-review", "interview", "offer", "hired", "rejected"];

export async function GET(req: NextRequest) {
  const actor = await requireAtsActor(req, "ATS_VIEW");
  if (!actor.ok) return actor.response;

  const correlationId = correlationOf(req);
  const { searchParams } = new URL(req.url);
  const stageParam = searchParams.get("stage");
  const stage = stageParam && (STAGES as string[]).includes(stageParam) ? (stageParam as PipelineStage) : undefined;

  const rows = await getAtsCandidates(actor.ctx.orgId, stage ? { stage } : undefined);
  if (rows === null) {
    return NextResponse.json(
      { error: "Recruitment data is temporarily unavailable.", code: "STORE_UNAVAILABLE", correlationId },
      { status: 503, headers: { ...NO_STORE, [REQUEST_ID_HEADER]: correlationId } },
    );
  }

  const jobId = searchParams.get("jobId");
  const minScore = searchParams.get("minScore");
  let candidates = rows;
  if (jobId) candidates = candidates.filter((c) => c.jobId === jobId);
  if (minScore) {
    const n = Number(minScore);
    if (Number.isFinite(n)) candidates = candidates.filter((c) => c.scored && c.atsScore.total >= n);
  }
  candidates = [...candidates].sort((a, b) => b.atsScore.total - a.atsScore.total);

  return NextResponse.json(
    { candidates, total: candidates.length },
    { headers: { ...NO_STORE, [REQUEST_ID_HEADER]: correlationId } },
  );
}

export async function POST(req: NextRequest) {
  // Authorize before doing anything else (anti-enumeration), then refuse: there
  // is no internal candidate creation in production. Candidates enter only
  // through the public application intake, which runs the full gate chain.
  const actor = await requireAtsActor(req, "ATS_ADMIN");
  if (!actor.ok) return actor.response;
  const correlationId = correlationOf(req);
  return NextResponse.json(
    {
      error: "Candidates are created only through the public application intake.",
      code: "NOT_IMPLEMENTED",
      correlationId,
    },
    { status: 501, headers: { ...NO_STORE, [REQUEST_ID_HEADER]: correlationId } },
  );
}
