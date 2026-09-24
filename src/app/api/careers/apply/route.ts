import { NextResponse } from "next/server";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import {
  resolveClientIp,
  isAllowedOrigin,
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
import { submitApplication } from "@/lib/ats/intake";
import { resolveRequestId } from "@/lib/logger/correlation";

const APPLY_ACTION = "careers-apply";
const MAX_BODY_BYTES = 32 * 1024;
const NO_STORE = { "Cache-Control": "no-store" } as const;
const LOCALES = new Set(["en", "de", "fa"]);

/**
 * The ONE refusal an anonymous applicant sees for anything that is not an
 * accepted application. Unknown job, draft, private, closed, expired,
 * acceptance not yet authorized, retention policy not proven, a concurrent
 * duplicate, a payload that does not match its idempotency key, a store
 * fault — all identical, so the endpoint enumerates nothing and promises
 * nothing it cannot keep.
 */
function notAccepting() {
  return NextResponse.json(
    { error: "Applications are not being accepted for this position at this time." },
    { status: 503, headers: NO_STORE },
  );
}

/**
 * PHASE 104-B1 — /api/careers/apply is fail-closed infrastructure.
 * ATS-B2   — the orchestration behind the gates now exists.
 *
 * What is ENFORCED, in order, all before any write:
 *   1. IP rate limit, Content-Type, bounded body;
 *   2. an Origin header, WHEN PRESENT, must be an allowed origin — a browser
 *      form on another site cannot submit here; absent Origin is permitted
 *      because this endpoint is anonymous (no cookie, no CSRF surface) and
 *      non-browser applicants exist;
 *   3. strict Stage-1 schema — unknown fields (including workAuthorization
 *      and any publish/consent-bypass flag) are a 400;
 *   4. a payload-bound idempotency key header (validated FORMAT);
 *   5. job eligibility by the SHARED public predicate — refusals for
 *      unknown/draft/private/closed/expired are indistinguishable;
 *   6. the owner acceptance gate and the approved-retention-policy gate.
 *
 * ONLY THEN `submitApplication()` runs: atomic claim → in-transaction
 * re-checks → persist (application ends at AI_REVIEW_PENDING) → claim
 * completion. Its every refusal maps to the same generic 503 above. Its
 * success is a 202 carrying an opaque reference and nothing else — not the
 * row id, not whether the candidate or the application already existed.
 *
 * NOTHING HERE LOGS. A correlation id is resolved from the request and stored
 * beside the rows; no applicant field can reach a log line from this file.
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
  const origin = req.headers.get("origin");
  if (origin !== null && !isAllowedOrigin(origin)) {
    return securityError({ error: "forbidden" }, 403);
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
  // create a second application.
  const rawKey = req.headers.get(IDEMPOTENCY_HEADER);
  const keyCheck = validateIdempotencyKey(rawKey);
  if (!keyCheck.ok || !rawKey) {
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

  // ── Acceptance gates — BOTH must hold before any write. ──
  if (!APPLICATION_ACCEPTANCE_AUTHORIZED) {
    return notAccepting();
  }
  if (!(await isRetentionPolicyApproved(organizationId))) {
    return notAccepting();
  }

  const requestedLocale = new URL(req.url).searchParams.get("locale") ?? "en";
  const locale = LOCALES.has(requestedLocale) ? requestedLocale : "en";

  const outcome = await submitApplication({
    app,
    rawIdempotencyKey: rawKey.trim(),
    locale,
    correlationId: resolveRequestId(req),
  });

  if (!outcome.ok) return notAccepting();

  // 202, not 201: the application is RECEIVED and queued for review. The body
  // is the same whether the row is new, a replay of the same key, or a
  // duplicate of an earlier application by the same person.
  return NextResponse.json(
    { received: true, reference: outcome.reference },
    { status: 202, headers: NO_STORE },
  );
}
