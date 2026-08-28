import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthRole } from "@/lib/auth/rbac-server";
import { can } from "@/lib/auth/roles";
import { resolveOrgContext } from "@/lib/billing/context";
import { refuse } from "@/lib/auth/context-result";
import { createJobDraft, createJobDraftInputSchema } from "@/lib/ats/recruitment";
import { getOrgJobs } from "@/lib/ats/db";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function refusalResponse(reason: Parameters<typeof refuse>[0]) {
  const r = refuse(reason);
  return NextResponse.json({ error: r.error, code: r.code }, { status: r.status, headers: NO_STORE });
}

/**
 * PHASE 104-B1 — this is a MANAGEMENT surface, and it now says so.
 *
 * The previous GET served the development fixture to ANY anonymous caller;
 * the previous POST answered 201 for an in-memory object that no database
 * ever saw. Both are gone:
 *
 *   GET  — authenticated, organization-scoped listing of the caller's own
 *          org's jobs from the database. No fixture, no cross-tenant reads.
 *   POST — wired to the real domain writer `createJobDraft()`: DRAFT/private
 *          only, requisitionKey required, EN/DE/FA translations in the same
 *          transaction, typed audit, no publish flag accepted.
 */
export async function GET(req: NextRequest) {
  const role = await getAuthRole(req);
  if (!role) return refusalResponse("AUTHENTICATION_REQUIRED");
  if (!can(role, "authoring")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403, headers: NO_STORE });
  }
  const org = await resolveOrgContext(req);
  if (!org.ok) return refusalResponse(org.reason);

  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  const jobs = await getOrgJobs(org.ctx.orgId, status ? { status } : undefined);
  if (jobs === null) return refusalResponse("INTERNAL_ERROR");
  return NextResponse.json({ jobs, total: jobs.length }, { headers: NO_STORE });
}

/**
 * The request body is the draft input WITHOUT organizationId (derived from the
 * authenticated context, never from the client) and WITHOUT any owner-gated or
 * publication field — `.strict()` refuses unknown keys, so `isPublic`,
 * `status`, `publishedAt`, `salaryCurrency`, `employmentType` … are all 400s.
 */
const postBodySchema = createJobDraftInputSchema.omit({ organizationId: true });

export async function POST(req: NextRequest) {
  // Authorize BEFORE reading the body (Phase 86C4B2B1D-SECURITY-8 ordering).
  const role = await getAuthRole(req);
  if (!role) return refusalResponse("AUTHENTICATION_REQUIRED");
  if (!can(role, "authoring")) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403, headers: NO_STORE });
  }
  const org = await resolveOrgContext(req);
  if (!org.ok) return refusalResponse(org.reason);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: NO_STORE });
  }

  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid job draft" }, { status: 400, headers: NO_STORE });
  }

  const result = await createJobDraft(
    { ...parsed.data, organizationId: org.ctx.orgId },
    { userId: org.ctx.userId },
  );

  if (!result.ok) {
    switch (result.code) {
      case "STORE_UNAVAILABLE":
        return refusalResponse("INTERNAL_ERROR");
      case "FORBIDDEN":
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403, headers: NO_STORE });
      case "CONFLICT":
        return NextResponse.json({ error: "requisition key already exists" }, { status: 409, headers: NO_STORE });
      case "INVALID_INPUT":
        return NextResponse.json({ error: "invalid job draft" }, { status: 400, headers: NO_STORE });
      default:
        return refusalResponse("INTERNAL_ERROR");
    }
  }

  // 201 ONLY after the transaction committed. The draft is private by
  // construction; the response confirms creation, not publication.
  return NextResponse.json({ jobId: result.jobId, status: "DRAFT", isPublic: false }, { status: 201, headers: NO_STORE });
}

// Zod is imported for the omit() composition above; re-exported nowhere.
void z;
