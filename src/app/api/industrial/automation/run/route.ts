/**
 * POST /api/industrial/automation/run
 *
 * PHASE 109-C-UI.2-R3 — site-scoped execution, with organisation-wide as an
 * explicit, confirmed, audited exception.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED AND WHY (F-04, F-05, F-06)
 * ─────────────────────────────────────────────────────────────────────────────
 * This endpoint used to take no input at all and run the whole organisation on
 * `manage_industrial` alone. MANAGER holds that permission and does NOT hold
 * implicit access to every site — only OWNER and ADMIN do — so a manager granted
 * one site caused durable analysis records to be written against every other
 * site's equipment. Phase 99 had already ruled on that exact shape for
 * POST /api/industrial/assets: an org permission is not authority over a site.
 *
 * Now:
 *   SITE mode (the default, and the only mode a normal caller can reach)
 *     `siteId` is REQUIRED. It is validated for syntax, checked against the
 *     caller's permitted sites, and then re-authorised with the Phase 99
 *     predicates — `requireSiteActor` (which also proves the site is ACTIVE and
 *     belongs to this organisation) and `requireSitePermission("manage_assets")`.
 *
 *   ORGANISATION mode (the exception)
 *     needs the separate `run_industrial_automation_org_wide` permission
 *     (OWNER/ADMIN only), an explicit two-step confirmation, and a reason that
 *     is stored on the run record and in the audit event.
 *
 * There is no path on which an absent or unusable scope becomes "all sites".
 *
 * Idempotency and concurrency are enforced by database constraints rather than
 * by process memory (F-05), and the counters distinguish assets discovered,
 * attempted, processed and failed (F-06).
 */

import { NextRequest, NextResponse }      from "next/server";
import { requirePlatformAuth }            from "@/lib/api/auth";
import { requireOrgActor }                from "@/lib/org/context";
import { hasScope }                       from "@/lib/api/scopes";
import { can, requirePermission }         from "@/lib/org/rbac";
import { runIntelligenceAutomation }      from "@/lib/industrial/automation";
import { getAllowedSiteIds, requireSiteActor } from "@/lib/site/context";
import { requireSitePermission }          from "@/lib/site/rbac";
import { listSites }                      from "@/lib/industrial/sites";
import { recordAuditEventOrThrow, INDUSTRIAL_AUDIT } from "@/lib/audit/audit-service";
import { getPrisma }                     from "@/lib/db/prisma";
import { enqueueMeteringEvent }           from "@/lib/industrial/metering-outbox";
import {
  emptyCounters,
  ORG_WIDE_PERMISSION,
  ORG_WIDE_SCOPE,
  parseRunRequest,
  type RunRefusalCode,
} from "@/lib/industrial/automation-scope";
import {
  claimRun,
  finishRun,
  markRunning,
  type RunRecord,
} from "@/lib/industrial/automation-run-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-generated. Returned to the caller and carried into every audit row. */
function newRequestId(): string {
  return `iar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

const refusal = (code: RunRefusalCode, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ error: code, ...(extra ?? {}) }, { status });

/** The public projection of a run. Ids and counts — never another site's data. */
function projectRun(run: RunRecord) {
  return {
    requestId: run.requestId,
    idempotencyKey: run.idempotencyKey,
    status: run.status,
    scopeMode: run.scopeMode,
    siteId: run.siteId,
    sitesIncluded: run.sitesIncluded,
    sitesExcluded: run.sitesExcluded,
    ...run.counters,
    failureCode: run.failureCode,
    failures: run.failures,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { ctx } = auth;

  // Unchanged base gate: writing analysis records is an industrial write.
  if (!hasScope(ctx.scopes, "industrial.write")) {
    return NextResponse.json({ error: "Missing required scope: industrial.write" }, { status: 403 });
  }

  let userId: string | null = null;
  let actorRole = "apikey";
  if (ctx.authMethod === "jwt") {
    const member = await requireOrgActor(req, ctx.orgId);
    if ("error" in member) return NextResponse.json({ error: member.error }, { status: member.status });
    const perm = requirePermission(member.ctx.role, "manage_industrial");
    if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status });
    userId = member.ctx.userId;
    actorRole = member.ctx.role;
  }

  /*
    The two axes of "may this caller run the whole estate", resolved separately
    because they answer to different principals. A user answers to the org role
    matrix; an API key answers to its scopes. Neither is inferred from the other,
    and `manage_industrial` grants neither.
  */
  const mayRunOrgWide =
    ctx.authMethod === "jwt"
      ? can(actorRole as Parameters<typeof can>[0], ORG_WIDE_PERMISSION)
      : hasScope(ctx.scopes, ORG_WIDE_SCOPE);

  // A user's permitted sites. `null` means "no user", i.e. an organisation
  // credential — NOT "every site". The distinction is carried all the way into
  // the scope resolution below, where the org credential is still made to name
  // the sites it will touch.
  const allowedSiteIds = userId ? await getAllowedSiteIds(userId, ctx.orgId) : null;

  let body: Record<string, unknown> | null = null;
  const raw = await req.text().catch(() => "");
  if (raw.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(raw);
      // An array or a scalar is not a request object. Coercing it would let
      // `[]` read as "no fields supplied" and fall through to a default.
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return refusal("MALFORMED_REQUEST", 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return refusal("MALFORMED_REQUEST", 400);
    }
  }

  const parsed = parseRunRequest(body, req.nextUrl.searchParams, { allowedSiteIds, mayRunOrgWide });
  if (!parsed.ok) {
    return refusal(parsed.code, parsed.status, parsed.challenge ? { challenge: parsed.challenge } : undefined);
  }
  const request = parsed.request;

  /* ── resolve the exact sites this run will touch ───────────────────────── */

  let siteIds: string[];
  let sitesExcluded: string[] = [];

  if (request.scopeMode === "SITE") {
    const siteId = request.siteId as string;
    if (ctx.authMethod === "jwt") {
      // Phase 99 predicates. `requireSiteActor` also proves the site is ACTIVE
      // and belongs to THIS organisation, which the UserSite allow-list alone
      // does not — a UserSite row survives its site being archived.
      const siteAuth = await requireSiteActor(req, ctx.orgId, siteId);
      // 404, not 403: a site the caller may not use must be indistinguishable
      // from one that does not exist, or the status code enumerates the estate.
      if ("error" in siteAuth) return refusal("SITE_ID_NOT_PERMITTED", 404);
      const sitePerm = requireSitePermission(siteAuth.ctx.role, "manage_assets");
      if (!sitePerm.ok) return refusal("SITE_ID_NOT_PERMITTED", 404);
    } else {
      // An organisation credential has no UserSite rows, so the ownership check
      // is the site's own tenancy and status.
      const sites = await listSites(ctx.orgId);
      const site = sites.find((s) => s.id === siteId);
      if (!site) return refusal("SITE_ID_NOT_PERMITTED", 404);
      if (site.status !== "ACTIVE") return refusal("SITE_NOT_ACTIVE", 409);
    }
    siteIds = [siteId];
  } else {
    const sites = await listSites(ctx.orgId, allowedSiteIds ?? undefined);
    const active = sites.filter((s) => s.status === "ACTIVE");
    siteIds = active.map((s) => s.id);
    sitesExcluded = sites.filter((s) => s.status !== "ACTIVE").map((s) => s.id);
    if (siteIds.length === 0) return refusal("NO_ACCESSIBLE_SITE", 403);
  }

  /* ── claim the scope (F-05) ────────────────────────────────────────────── */

  const requestId = newRequestId();
  const nowMs = Date.now();
  const claim = await claimRun({
    organizationId: ctx.orgId,
    request,
    requestId,
    actorId: userId,
    actorRole,
    authMethod: ctx.authMethod,
    sitesIncluded: siteIds,
    sitesExcluded,
    nowMs,
  });

  if (claim.outcome === "UNAVAILABLE") {
    // Never an empty success. A run that could not be recorded did not happen.
    return NextResponse.json({ error: "RUN_STORE_UNAVAILABLE" }, { status: 503 });
  }
  if (claim.outcome === "SCOPE_BUSY") {
    return NextResponse.json(
      { error: "SCOPE_BUSY", run: claim.run ? projectRun(claim.run) : null },
      { status: 409 },
    );
  }
  if (claim.outcome === "KEY_SCOPE_MISMATCH") {
    // One key, one operation. Returning the stored run would report an
    // operation the caller did not ask for as though it had just happened.
    return NextResponse.json(
      { error: "IDEMPOTENCY_KEY_SCOPE_MISMATCH", run: projectRun(claim.run) },
      { status: 409 },
    );
  }
  if (claim.outcome === "REPLAY") {
    // Deterministic and traceable: the caller gets the ORIGINAL run's requestId
    // and counts, and `replayed` says plainly that nothing ran a second time.
    return NextResponse.json({ replayed: true, run: projectRun(claim.run) }, { status: 200 });
  }

  const run = claim.run;

  /* ── execute ───────────────────────────────────────────────────────────── */

  await markRunning(run.id, nowMs);

  /*
    ── THE RUN AND ITS AUDIT ROW COMMIT OR ROLL BACK TOGETHER (R5) ───────────

    R4 measured the reason. `recordAuditEvent` swallows persistence failures, so
    the audit rows for this endpoint silently never appeared and only a real
    database revealed it. Awaiting a call that discards its own error is not the
    same as recording anything.

    An organisation-wide run is authorised BECAUSE it is audited. A run whose
    analysis is durable while its trail is not is therefore not a successful run
    — it is an unaccountable one, and the owner's R5 ruling is that it must fail
    closed. So the engine's writes and the audit row now live in one interactive
    transaction: if the audit cannot be written, every snapshot, risk score,
    alert and recommendation this run produced is discarded with it.

    What is deliberately OUTSIDE the transaction:
      * `claimRun`, because the run row IS the scope lock and a lock nobody else
        can see is not a lock;
      * `finishRun`, for the same reason — it has to record FAILED on a path
        where the transaction was rolled back;
      * metering, which happens only after the commit, so a rolled-back run is
        never billed.
  */
  const client = await getPrisma();
  if (!client) {
    await finishRun({ runId: run.id, counters: emptyCounters(), failures: [], failureCode: "RUN_STORE_UNAVAILABLE", nowMs: Date.now() });
    return NextResponse.json({ error: "RUN_STORE_UNAVAILABLE" }, { status: 503 });
  }

  const auditAction =
    request.scopeMode === "ORGANISATION"
      ? INDUSTRIAL_AUDIT.AUTOMATION_RUN_ORG_WIDE
      : INDUSTRIAL_AUDIT.AUTOMATION_RUN_SITE;

  let result: Awaited<ReturnType<typeof runIntelligenceAutomation>>;
  try {
    result = await (
      client as unknown as {
        $transaction: <T>(fn: (tx: unknown) => Promise<T>, opts?: unknown) => Promise<T>;
      }
    ).$transaction(
      async (tx) => {
        const r = await runIntelligenceAutomation(ctx.orgId, { siteIds }, tx);
        await recordAuditEventOrThrow(auditPayload(r), tx);
        /*
          PHASE 109-C-UI.2-R7. Metering used to be a fire-and-forget call after
          the response was decided, which R6 measured losing rows in silence.
          The OUTBOX row is written here, in the same transaction as the
          analysis and the audit: it exists exactly when the run exists.

          Only API-key traffic is metered — the recorded contract, so a JWT
          session still cannot inflate usage. Delivery to `UsageRecord` is a
          separate retrying step; a billing outage can no longer take an
          industrial run down with it.
        */
        if (ctx.authMethod === "apikey") {
          await enqueueMeteringEvent(
            {
              organizationId: ctx.orgId,
              siteId: request.siteId ?? null,
              scopeMode: request.scopeMode,
              actorId: userId,
              actorRole,
              authMethod: ctx.authMethod,
              runId: run.id,
              requestId,
              idempotencyKey: request.idempotencyKey,
            },
            tx,
          );
        }
        return r;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch {
    /*
      Either the engine threw, or the audit could not be written. Both land here
      and both mean the same thing: nothing this run produced survives. The run
      row is marked FAILED so the scope is released immediately rather than
      staying locked for the fifteen-minute lease.
    */
    await finishRun({
      runId: run.id,
      counters: emptyCounters(),
      failures: [],
      failureCode: "AUDIT_OR_RUN_FAILED",
      nowMs: Date.now(),
    });
    return NextResponse.json({ error: "AUDIT_OR_RUN_FAILED", requestId }, { status: 500 });
  }

  const finished = await finishRun({
    runId: run.id,
    counters: result.counters,
    failures: result.failures,
    failureCode: result.failureCode ?? undefined,
    nowMs: Date.now(),
  });

  const finalRun = finished ?? run;

  function auditPayload(r: Awaited<ReturnType<typeof runIntelligenceAutomation>>) {
    return {
      userId: userId ?? undefined,
      organizationId: ctx.orgId,
      action: auditAction,
      entityType: "industrial",
      entityId: run.id,
      // The run's own failure code, not the transaction's: an audit written
      // inside the transaction cannot yet know how `finishRun` will record it.
      outcome: r.failureCode === null ? "success" : "failure",
      correlationId: requestId,
      metadata: {
        requestId,
        idempotencyKey: request.idempotencyKey,
        actorRole,
        authMethod: ctx.authMethod,
        scopeMode: request.scopeMode,
        siteId: request.siteId,
        sitesIncluded: siteIds,
        sitesExcluded,
        assetCount: r.counters.assetsDiscovered,
        counters: r.counters,
        failureCode: r.failureCode,
        failureCodes: r.failures.map((f) => f.code),
        reason: request.reason,
        startedAt: run.startedAt,
      },
    };
  }

  /*
    Nothing to do here any more. Metering was enqueued inside the transaction
    above, so it is already durable; a replay never reaches this point, and the
    outbox unique key would refuse a second event even if it did.
  */
  return NextResponse.json({ replayed: false, run: projectRun(finalRun) }, { status: 200 });
}
