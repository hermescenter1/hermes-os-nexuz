import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { atsCan, requireAtsActor } from "@/lib/ats/rbac";
import { getPrisma } from "@/lib/db/prisma";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * ATS-S1 — what a reviewer sees: the application, its latest AI report, the
 * decisions recorded so far and the pipeline history.
 *
 * TENANCY: the application is loaded with the caller's organizationId in the
 * predicate; a miss — including another organization's application — is one
 * 404. The candidate is reached THROUGH the application, never queried by
 * itself, and contact details are projected only for holders of ATS_REVIEW or
 * ATS_MANAGE. Everything else the organization legitimately holds about its
 * own application is returned.
 */
type Row = {
  id: string;
  status: string;
  jobId: string;
  aiReviewCycle: number;
  source: string;
  totalYearsExp: number | null;
  createdAt: Date;
  updatedAt: Date;
  retentionExpiresAt: Date | null;
  withdrawnAt: Date | null;
  anonymizedAt: Date | null;
  candidate: { name: string; email: string; phone: string | null; location: string | null; linkedinUrl: string | null; skills: unknown } | null;
  job: { title: string; department: string } | null;
  aiReviews: Record<string, unknown>[];
  reviewDecisions: Record<string, unknown>[];
  pipelineEvents: Record<string, unknown>[];
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAtsActor(req, "ATS_VIEW");
  if (!actor.ok) return actor.response;
  const { id } = await params;

  const prisma = (await getPrisma()) as unknown as {
    atsApplication?: { findFirst?: (a: unknown) => Promise<Row | null> };
  } | null;
  if (!prisma?.atsApplication?.findFirst) {
    return NextResponse.json({ error: "The request could not be completed." }, { status: 503, headers: NO_STORE });
  }

  let row: Row | null;
  try {
    row = await prisma.atsApplication.findFirst({
      where: { id, organizationId: actor.ctx.orgId, deletedAt: null },
      select: {
        id: true,
        status: true,
        jobId: true,
        aiReviewCycle: true,
        source: true,
        totalYearsExp: true,
        createdAt: true,
        updatedAt: true,
        retentionExpiresAt: true,
        withdrawnAt: true,
        anonymizedAt: true,
        candidate: { select: { name: true, email: true, phone: true, location: true, linkedinUrl: true, skills: true } },
        job: { select: { title: true, department: true } },
        aiReviews: {
          orderBy: { cycle: "desc" },
          take: 1,
          select: {
            id: true,
            cycle: true,
            provider: true,
            modelVersion: true,
            extractorVersion: true,
            rubricVersion: true,
            promptVersion: true,
            policyVersion: true,
            recommendation: true,
            overallScore: true,
            confidence: true,
            hardGatesPassed: true,
            hardGatesFailed: true,
            hardGatesUnknown: true,
            riskFlagCount: true,
            report: true,
            createdAt: true,
          },
        },
        reviewDecisions: {
          orderBy: { createdAt: "asc" },
          select: { id: true, actorUserId: true, actorRole: true, fromStatus: true, toStatus: true, decision: true, reason: true, aiReviewId: true, correlationId: true, createdAt: true },
        },
        pipelineEvents: {
          orderBy: { createdAt: "asc" },
          select: { fromStatus: true, toStatus: true, changedById: true, changedByName: true, notes: true, createdAt: true },
        },
      },
    });
  } catch {
    return NextResponse.json({ error: "The request could not be completed." }, { status: 503, headers: NO_STORE });
  }
  if (!row) return NextResponse.json({ error: "Application not found" }, { status: 404, headers: NO_STORE });

  const seesContact = atsCan(actor.ctx.role, "ATS_REVIEW") || atsCan(actor.ctx.role, "ATS_MANAGE");
  const candidate = row.candidate
    ? {
        name: row.candidate.name,
        location: row.candidate.location,
        skills: Array.isArray(row.candidate.skills) ? row.candidate.skills : [],
        linkedinUrl: row.candidate.linkedinUrl,
        ...(seesContact ? { email: row.candidate.email, phone: row.candidate.phone } : {}),
      }
    : null;

  return NextResponse.json(
    {
      application: {
        id: row.id,
        status: row.status,
        jobId: row.jobId,
        jobTitle: row.job?.title ?? null,
        department: row.job?.department ?? null,
        cycle: row.aiReviewCycle,
        source: row.source,
        yearsExperience: row.totalYearsExp,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        retentionExpiresAt: row.retentionExpiresAt,
        withdrawnAt: row.withdrawnAt,
        anonymizedAt: row.anonymizedAt,
        awaitingHumanDecision: row.status === "PENDING_HUMAN_APPROVAL",
      },
      candidate,
      aiReview: row.aiReviews[0] ?? null,
      decisions: row.reviewDecisions,
      history: row.pipelineEvents,
    },
    { headers: NO_STORE },
  );
}
