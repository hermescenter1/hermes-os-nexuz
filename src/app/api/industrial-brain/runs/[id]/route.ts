/**
 * PHASE 112 — GET /api/industrial-brain/runs/[id]
 *
 * Read one immutable reasoning run + its artifacts, tenant/site/asset scoped.
 * The stored artifact + manifest digests are VERIFIED before a replay-capable
 * result is returned; a verification failure returns a clear integrity error
 * rather than the snapshots. Foreign or missing run ids return a uniform 404.
 * Responses are `no-store` (private run material).
 */
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limiter";
import { resolveClientIp } from "@/lib/security/request-guards";
import { resolveReasoningRunActor, authorizeRunScope } from "@/lib/reasoning-runs/tenant-adapter";
import { reasoningRunRepository } from "@/lib/reasoning-runs/prisma-repository";
import { ReasoningRunStorageUnavailableError } from "@/lib/reasoning-runs/repository";
import { verifyRunIntegrity } from "@/lib/reasoning-runs/integrity";
import { projectRunView } from "@/lib/reasoning-runs/projections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const actorRes = await resolveReasoningRunActor(req, "view_industrial");
  if (!actorRes.ok) return json({ error: actorRes.error }, actorRes.status);
  const { actor } = actorRes;

  const rlKey = `${actor.orgId}:${actor.userId ?? resolveClientIp(req)}`;
  if (!(await checkRateLimit("reasoning-run-read", rlKey))) {
    return json({ error: "Rate limit exceeded" }, 429);
  }

  try {
    const found = await reasoningRunRepository.findRunWithArtifacts(actor.orgId, id);
    // Uniform 404 for foreign or missing ids (no cross-tenant existence leak).
    if (!found) return json({ error: "Not found" }, 404);

    // Enforce site/asset access on read: a site-restricted user cannot read a
    // run bound to a site/asset they cannot access (also a uniform 404).
    if (found.run.siteId || found.run.assetId) {
      const scope = await authorizeRunScope(req, actor, {
        siteId: found.run.siteId,
        assetId: found.run.assetId,
      });
      if (!scope.ok) return json({ error: "Not found" }, scope.status === 403 ? 403 : 404);
    }

    // Verify integrity before returning a replay-capable result.
    const integrity = verifyRunIntegrity(found.run, found.artifacts);
    if (!integrity.ok) {
      return json(
        { error: "Integrity verification failed", integrityIssues: integrity.issues.map((i) => i.code) },
        409,
      );
    }

    return json(projectRunView(found), 200);
  } catch (e) {
    if (e instanceof ReasoningRunStorageUnavailableError) {
      return json({ error: "Reasoning-run storage is unavailable" }, 503);
    }
    return json({ error: "Internal error" }, 500);
  }
}
