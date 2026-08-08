import { NextRequest, NextResponse } from "next/server";
import { analyzeIndustrialFault } from "@/lib/industrial-brain/analyzer";
import {
  AnalyzeRequestSchema,
  applyFieldAliases,
  firstIssueField,
} from "@/lib/industrial-brain/request-contract";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import {
  resolveClientIp,
  isJsonContentType,
  readBoundedTextBody,
  securityError,
} from "@/lib/security/request-guards";

export const dynamic = "force-dynamic";

/**
 * PHASE 93B — the request schema and the alias map now live in
 * `@/lib/industrial-brain/request-contract`, which the workspace form imports
 * too. One contract, one source of truth: the client can no longer drift into
 * sending a body this route is guaranteed to reject.
 *
 * Validation is unchanged in strictness — see the contract module for the two
 * legitimate normalisations (documented aliases, and `""` meaning "not stated"
 * for the optional impact selects).
 */
/**
 * PHASE 99 SECURITY — abuse controls for an anonymous analysis endpoint.
 *
 * The Zod schema bounds each FIELD, but only after `req.json()` has already
 * parsed the whole body, so the parse itself was unbounded and there was no
 * rate limit or media-type check at all. `POST /api/copilot/demo` — the same
 * "public deterministic analysis" role — already carries all three; match it.
 * The analysis itself reaches no database, provider or LLM, so this is a
 * resource boundary, not an authorization one.
 */
const ANALYZE_ACTION = "industrial-brain-analyze";
const MAX_BODY_BYTES = 32 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = resolveClientIp(req);
  if (!(await checkRateLimit(ANALYZE_ACTION, ip))) {
    return securityError({ ok: false, error: "Too many requests. Please try again later." }, 429, {
      "Retry-After": String(retryAfter(ANALYZE_ACTION, ip)),
    });
  }
  if (!isJsonContentType(req)) {
    return securityError({ ok: false, error: "unsupported media type" }, 415);
  }
  const read = await readBoundedTextBody(req, MAX_BODY_BYTES);
  if (read.status === "too_large") {
    return securityError({ ok: false, error: "payload too large" }, 413);
  }
  if (read.status === "error") {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = applyFieldAliases(JSON.parse(read.text));
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    // The message and the field NAME are safe to return; the rejected VALUE is
    // never echoed — it may carry plant evidence the caller mistyped.
    const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
    const field = firstIssueField(parsed.error.issues);
    return NextResponse.json(
      { ok: false, error: firstError, ...(field ? { field } : {}) },
      { status: 400 },
    );
  }

  try {
    const analysis = analyzeIndustrialFault(parsed.data);
    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    // Error CLASS only — never the input, which is private industrial evidence.
    const errorClass = err instanceof Error ? err.name : "UnknownError";
    console.error("[industrial-brain/analyze] analysis failed:", errorClass);
    return NextResponse.json(
      { ok: false, error: "Analysis could not be completed. Please try again." },
      { status: 500 },
    );
  }
}
