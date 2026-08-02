// PHASE 95 runtime — Prisma-backed AI execution-trace persistence.
//
// Best-effort and privacy-preserving: stores the trace RECORD (hashes + ids +
// classifications) built by buildExecutionTrace. Never stores a raw prompt, raw
// response or secret. Never throws — trace persistence must not break the
// governed request.

import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ExecutionTraceRecord } from "../execution-trace";

export async function persistExecutionTrace(rec: ExecutionTraceRecord): Promise<boolean> {
  try {
    const client = (await getPrisma()) as unknown as PrismaClient | null;
    if (!client) return false;
    await client.aiExecutionTrace.create({
      data: {
        traceId: rec.traceId,
        organizationId: rec.organisationId,
        siteId: rec.siteId,
        userId: rec.userId,
        workflow: rec.workflow,
        executionMode: rec.executionMode,
        providerRegistryId: rec.providerRegistryId,
        modelId: rec.modelId,
        policyVersion: rec.policyVersion,
        deterministicResultVersion: rec.deterministicResultVersion,
        inputHash: rec.inputHash,
        outputHash: rec.outputHash,
        sourceReferenceIds: rec.sourceReferenceIds,
        citationVerificationStatus: rec.citationVerificationStatus,
        evidenceSufficiency: rec.evidenceSufficiency,
        confidence: rec.confidence,
        safetyDecision: rec.safetyDecision,
        humanApprovalRequired: rec.humanApprovalRequired,
        fallbackReason: rec.fallbackReason,
        providerAttempted: rec.providerAttempted,
        providerSucceeded: rec.providerSucceeded,
        latencyMs: rec.latencyMs,
        inputTokenCount: rec.inputTokenCount,
        outputTokenCount: rec.outputTokenCount,
      },
    });
    return true;
  } catch {
    return false; // never throw
  }
}
