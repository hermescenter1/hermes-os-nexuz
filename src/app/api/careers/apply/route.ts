import { NextResponse } from "next/server";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import {
  resolveClientIp,
  isJsonContentType,
  readBoundedTextBody,
  securityError,
} from "@/lib/security/request-guards";
import { getPrisma } from "@/lib/db/prisma";
import { publicJobWhere } from "@/lib/ats/eligibility";
import {
  APPLICATION_ACCEPTANCE_AUTHORIZED,
  isRetentionPolicyApproved,
  stage1ApplicationSchema,
} from "@/lib/ats/application";
import { IDEMPOTENCY_HEADER, validateIdempotencyKey } from "@/lib/ats/idempotency";

const APPLY_ACTION = "careers-apply";
const MAX_BODY_BYTES = 32 * 1024;
const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * The ONE refusal an anonymous applicant sees for anything that is not an
 * accepted application. Unknown job, draft, private, closed, expired,
 * acceptance not yet authorized, retention policy not proven — all identical,
 * so the endpoint enumerates nothing and promises nothing it cannot keep.
 */
function notAccepting() {
  return NextResponse.json(
    { error: "Applications are not being accepted for this position at this time." },
    { status: 503, headers: NO_STORE },
  );
}

/**
 * PHASE 104-B1 — /api/careers/apply is fail-closed infrastructure.
 *
 * What is GONE: the `mock-app-${Date.now()}` fabricated success, the fixture
 * job lookup, silent persistence without idempotency, the untyped consent
 * trail and the workAuthorization field.
 *
 * What is ENFORCED, in order, all before any write:
 *   1. IP rate limit, Content-Type, bounded body   (pre-existing, kept);
 *   2. strict Stage-1 schema — unknown fields (including workAuthorization
 *      and any publish/consent-bypass flag) are a 400;
 *   3. a payload-bound idempotency key header (validated FORMAT: base64url
 *      alphabet, 22..128 chars — a length floor, never an entropy guarantee);
 *   4. job eligibility by the SHARED public predicate — refusals for
 *      unknown/draft/private/closed/expired are indistinguishable;
 *   5. the owner acceptance gate and the approved-retention-policy gate —
 *      in Stage B1 these ALWAYS refuse, with WRITE_COUNT=0.
 *
 * A store failure refuses generically (503) — it is never converted into an
 * authentication failure and never into a fabricated success.
 */
export async function POST(req: Request) {
  const ip = resolveClientIp(req);
  if (!(await checkRateLimit(APPLY_ACTION, ip))) {
    return securityError({ error: "Too many applications. Please try again later." }, 429, {
      "Retry-After": String(retryAfter(APPLY_ACTION, ip)),
    });
  }
  if (!isJsonContentType(req)) {
    return securityError({ error: "unsupported media type" }, 415);
  }
  const read = await readBoundedTextBody(req, MAX_BODY_BYTES);
  if (read.status === "too_large") {
    return securityError({ error: "payload too large" }, 413);
  }
  if (read.status === "error") {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: NO_STORE });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(read.text);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: NO_STORE });
  }

  const parsed = stage1ApplicationSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid application" }, { status: 400, headers: NO_STORE });
  }
  const app = parsed.data;

  // Idempotency is not optional: a retried request must never be able to
  // create a second application once acceptance is enabled.
  const keyCheck = validateIdempotencyKey(req.headers.get(IDEMPOTENCY_HEADER));
  if (!keyCheck.ok) {
    return NextResponse.json({ error: "a valid Idempotency-Key header is required" }, { status: 400, headers: NO_STORE });
  }

  // Job eligibility — the SHARED public predicate, evaluated now. The refusal
  // is identical for every ineligible or unknown id.
  let organizationId: string | null = null;
  try {
    const prisma = await getPrisma();
    if (!prisma) return notAccepting();
    const model = (prisma as unknown as {
      atsJob?: { findFirst?: (a: unknown) => Promise<{ id: string; organizationId: string } | null> };
    }).atsJob;
    if (!model?.findFirst) return notAccepting();
    const job = await model.findFirst({
      where: { id: app.jobId, ...publicJobWhere(new Date()) },
      select: { id: true, organizationId: true },
    });
    if (!job) return notAccepting();
    organizationId = job.organizationId;
  } catch {
    // A store fault is an outage, answered generically — never an auth error,
    // never a fabricated success.
    return notAccepting();
  }

  // ── Stage B1 acceptance gates — BOTH must hold before any write. ──
  if (!APPLICATION_ACCEPTANCE_AUTHORIZED) {
    return notAccepting();
  }
  if (!(await isRetentionPolicyApproved(organizationId))) {
    return notAccepting();
  }

  // Unreachable in Stage B1 (both gates above refuse). Submission UTILITIES
  // live in src/lib/ats/application.ts and idempotency.ts, but the
  // ORCHESTRATION that would join them — atomic claim, in-transaction
  // eligibility re-check, persist, claim completion — is NOT implemented
  // (APPLICATION_ORCHESTRATION_IMPLEMENTED=NO, B2_REQUIRED=YES). B2 builds
  // it under its own owner authorization; acceptance is not a one-flag flip.
  return notAccepting();
}
