/**
 * PHASE 112 — POST /api/industrial-brain/runs
 *
 * Create an authenticated, tenant-scoped, IMMUTABLE reasoning run. This is a
 * SEPARATE surface from the public, stateless /api/industrial-brain/analyze
 * endpoint, which is never turned into a persistence endpoint.
 *
 * Guards: JSON content-type → bounded body → org auth (manage_industrial) →
 * rate-limit → Zod validation → mandatory idempotency key → server-resolved
 * site/asset authorization. The client supplies only raw input and an
 * idempotency key — never an output snapshot, org/user/site ownership or a
 * precomputed digest. All responses are `no-store`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  isJsonContentType,
  readBoundedJson,
  resolveClientIp,
} from "@/lib/security/request-guards";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import {
  AnalyzeRequestSchema,
  applyFieldAliases,
  firstIssueField,
} from "@/lib/industrial-brain/request-contract";
import { resolveReasoningRunActor, authorizeRunScope } from "@/lib/reasoning-runs/tenant-adapter";
import { createReasoningRun } from "@/lib/reasoning-runs/create-run";
import {
  INDUSTRIAL_BRAIN_ENGINE_ID,
  INDUSTRIAL_BRAIN_ENGINE_VERSION,
} from "@/lib/reasoning-runs/engine-industrial-brain";
import { ReasoningRunStorageUnavailableError } from "@/lib/reasoning-runs/repository";
import { projectRun } from "@/lib/reasoning-runs/projections";
import { recordAuditEvent, REASONING_AUDIT } from "@/lib/audit/audit-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]{16,128}$/;
const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

const CreateRunBodySchema = z.object({
  input: z.record(z.string(), z.unknown()),
  siteId: z.string().trim().min(1).max(64).optional(),
  assetId: z.string().trim().min(1).max(64).optional(),
  idempotencyKey: z.string().trim().regex(IDEMPOTENCY_KEY_PATTERN).optional(),
});

export async function POST(req: NextRequest) {
  if (!isJsonContentType(req)) {
    return json({ error: "Content-Type must be application/json" }, 415);
  }

  // Authentication + org permission (server-resolved tenant).
  const actorRes = await resolveReasoningRunActor(req, "manage_industrial");
  if (!actorRes.ok) return json({ error: actorRes.error }, actorRes.status);
  const { actor } = actorRes;

  // Rate limit the expensive create path, keyed by tenant + user (+ IP fallback).
  const rlKey = `${actor.orgId}:${actor.userId ?? resolveClientIp(req)}`;
  if (!(await checkRateLimit("reasoning-run-create", rlKey))) {
    return json(
      { error: "Rate limit exceeded" },
      429,
    );
  }

  const read = await readBoundedJson(req, MAX_BODY_BYTES);
  if (read.status === "too_large") return json({ error: "Request body too large" }, 413);
  if (read.status === "invalid") return json({ error: "Invalid JSON body" }, 400);

  const parsedBody = CreateRunBodySchema.safeParse(read.value);
  if (!parsedBody.success) {
    return json({ error: "Invalid request", field: parsedBody.error.issues[0]?.path?.[0] }, 400);
  }
  const body = parsedBody.data;

  // Idempotency key is mandatory: a retry must never create a second run.
  const headerKey = req.headers.get("Idempotency-Key")?.trim();
  const idempotencyKey = headerKey || body.idempotencyKey;
  if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return json({ error: "A valid Idempotency-Key is required" }, 400);
  }

  // Validate the Industrial Brain input up front for a clean 400 (never echo the
  // rejected value — return only a safe field name).
  const aliased = applyFieldAliases(body.input);
  const inputCheck = AnalyzeRequestSchema.safeParse(aliased);
  if (!inputCheck.success) {
    return json({ error: "Invalid analysis input", field: firstIssueField(inputCheck.error.issues) }, 400);
  }

  // Server-resolved site/asset authorization (foreign/missing → 404).
  const scope = await authorizeRunScope(req, actor, { siteId: body.siteId, assetId: body.assetId });
  if (!scope.ok) return json({ error: scope.error }, scope.status);

  try {
    const result = await createReasoningRun({
      organizationId: actor.orgId,
      siteId: scope.siteId,
      assetId: scope.assetId,
      initiatedByUserId: actor.userId,
      sourceChannel: "INTERACTIVE",
      rawInput: aliased,
      idempotencyKey,
      engineId: INDUSTRIAL_BRAIN_ENGINE_ID,
      engineVersion: INDUSTRIAL_BRAIN_ENGINE_VERSION,
    });

    if (result.status === "KEY_FINGERPRINT_MISMATCH") {
      return json({ error: "Idempotency-Key was already used for a different request" }, 409);
    }
    if (result.status === "ENGINE_UNAVAILABLE" || result.status === "ENGINE_ERROR" || !result.run) {
      return json({ error: "Reasoning engine error" }, 500);
    }

    const created = result.status === "CREATED";
    recordAuditEvent({
      action: REASONING_AUDIT.RUN_CREATED,
      entityType: "reasoning_run",
      entityId: result.run.id,
      userId: actor.userId ?? undefined,
      outcome: created ? "created" : "idempotent_replay",
      metadata: {
        organizationId: actor.orgId,
        siteId: scope.siteId,
        assetId: scope.assetId,
        engineId: result.run.engineId,
        engineVersion: result.run.engineVersion,
        manifestDigest: result.run.manifestDigest,
      },
    });

    return json({ run: projectRun(result.run) }, created ? 201 : 200);
  } catch (e) {
    if (e instanceof ReasoningRunStorageUnavailableError) {
      return json({ error: "Reasoning-run storage is unavailable" }, 503);
    }
    // Error class only — never a stack trace or a DB error.
    return json({ error: "Internal error" }, 500);
  }
}
