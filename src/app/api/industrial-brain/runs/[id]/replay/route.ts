/**
 * PHASE 112 — POST /api/industrial-brain/runs/[id]/replay
 *
 * Replay an immutable reasoning run. ARCHIVAL (view_industrial) verifies hashes
 * and returns the snapshots; EXECUTION (manage_industrial) re-runs the exact
 * registered engine version and compares the canonical semantic-output digest.
 *
 * A replay NEVER mutates the original run and triggers NO OT action, work order,
 * notification, automation or external side effect. Foreign/missing ids → 404.
 * Responses are `no-store`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isJsonContentType, readBoundedJson, resolveClientIp } from "@/lib/security/request-guards";
import { checkRateLimit } from "@/lib/auth/rate-limiter";
import { requirePermission } from "@/lib/org/rbac";
import { resolveReasoningRunActor, authorizeRunScope } from "@/lib/reasoning-runs/tenant-adapter";
import { reasoningRunRepository } from "@/lib/reasoning-runs/prisma-repository";
import { ReasoningRunStorageUnavailableError } from "@/lib/reasoning-runs/repository";
import { replayReasoningRun } from "@/lib/reasoning-runs/replay-run";
import { projectArtifact } from "@/lib/reasoning-runs/projections";
import { recordAuditEvent, REASONING_AUDIT } from "@/lib/audit/audit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;
const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

const ReplayBodySchema = z.object({ mode: z.enum(["ARCHIVAL", "EXECUTION"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isJsonContentType(req)) {
    return json({ error: "Content-Type must be application/json" }, 415);
  }

  // Baseline: any replay requires at least read access.
  const actorRes = await resolveReasoningRunActor(req, "view_industrial");
  if (!actorRes.ok) return json({ error: actorRes.error }, actorRes.status);
  const { actor } = actorRes;

  const read = await readBoundedJson(req, MAX_BODY_BYTES);
  if (read.status === "too_large") return json({ error: "Request body too large" }, 413);
  if (read.status === "invalid") return json({ error: "Invalid JSON body" }, 400);
  const parsed = ReplayBodySchema.safeParse(read.value);
  if (!parsed.success) return json({ error: "mode must be ARCHIVAL or EXECUTION" }, 400);
  const { mode } = parsed.data;

  // Execution replay re-runs the engine — require the stronger permission.
  if (mode === "EXECUTION") {
    const perm = requirePermission(actor.role, "manage_industrial");
    if (!perm.ok) return json({ error: perm.error }, perm.status);
  }

  const rlKey = `${actor.orgId}:${actor.userId ?? resolveClientIp(req)}`;
  if (!(await checkRateLimit("reasoning-run-replay", rlKey))) {
    return json({ error: "Rate limit exceeded" }, 429);
  }

  const correlationId = req.headers.get("x-request-id")?.slice(0, 120) || null;

  try {
    // Scope pre-check: enforce site/asset access before replaying (uniform 404).
    const found = await reasoningRunRepository.findRunWithArtifacts(actor.orgId, id);
    if (!found) return json({ error: "Not found" }, 404);
    if (found.run.siteId || found.run.assetId) {
      const scope = await authorizeRunScope(req, actor, {
        siteId: found.run.siteId,
        assetId: found.run.assetId,
      });
      if (!scope.ok) return json({ error: "Not found" }, scope.status === 403 ? 403 : 404);
    }

    const result = await replayReasoningRun({
      organizationId: actor.orgId,
      runId: id,
      requestedByUserId: actor.userId,
      mode,
      correlationId,
    });

    if (result.kind === "NOT_FOUND") return json({ error: "Not found" }, 404);

    recordAuditEvent({
      action: mode === "EXECUTION" ? REASONING_AUDIT.RUN_REPLAY_EXECUTION : REASONING_AUDIT.RUN_REPLAY_ARCHIVAL,
      entityType: "reasoning_run",
      entityId: id,
      userId: actor.userId ?? undefined,
      outcome: result.outcome,
      metadata: {
        organizationId: actor.orgId,
        mode,
        originalOutputDigest: result.originalOutputDigest,
        replayedOutputDigest: result.replayedOutputDigest,
      },
    });

    if (result.outcome === "INTEGRITY_FAILURE") {
      return json(
        { mode: result.mode, outcome: result.outcome, integrityIssues: result.integrityIssues },
        409,
      );
    }

    return json(
      {
        mode: result.mode,
        outcome: result.outcome,
        originalOutputDigest: result.originalOutputDigest,
        replayedOutputDigest: result.replayedOutputDigest,
        artifacts: result.artifacts ? result.artifacts.map(projectArtifact) : undefined,
      },
      200,
    );
  } catch (e) {
    if (e instanceof ReasoningRunStorageUnavailableError) {
      return json({ error: "Reasoning-run storage is unavailable" }, 503);
    }
    return json({ error: "Internal error" }, 500);
  }
}
