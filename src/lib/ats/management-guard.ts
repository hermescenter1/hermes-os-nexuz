/**
 * ATS management-surface guard.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `src/middleware.ts` excludes the whole API surface from edge authentication:
 *
 *     matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"]
 *
 * so every `/api/**` route is protected ONLY by its own in-route checks. Four
 * ATS management endpoints — `overview`, `analytics`, `pipeline` and the
 * `candidates` listing — had none at all and answered any anonymous caller.
 *
 * They served development fixtures, so nothing real leaked. The hazard was the
 * NEXT change: the moment those handlers query PostgreSQL, an unauthenticated
 * handler becomes a cross-tenant candidate-PII endpoint (name, email, phone,
 * location, score breakdown). Authorization therefore lands FIRST, while the
 * data is still inert, so the database wiring cannot open a hole on its way in.
 *
 * The gate is deliberately identical to `/api/ats/jobs` GET — `getAuthRole()`
 * then `can(role, "authoring")` — so the recruitment surfaces answer one
 * question one way. Narrower recruitment capabilities (recruiter / hiring
 * manager / interviewer / HR) are an open design question recorded in
 * `docs/ats/ATS_BASELINE_AUDIT.md` §7; inventing them here would have silently
 * changed who can reach existing routes.
 *
 * SCOPE — READ THIS BEFORE ASSUMING MORE THAN IT DOES
 * ---------------------------------------------------
 * This guard answers "may this caller reach an ATS management surface at all".
 * It does NOT establish tenant scope, and it deliberately does not call
 * `resolveOrgContext()`. Resolving an organization for a handler that then
 * returns organization-independent fixture rows would look like tenant
 * isolation while isolating nothing. Org scoping arrives in the same change as
 * the real queries, where it can actually constrain a WHERE clause.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthRole } from "@/lib/auth/rbac-server";
import { can, type Role } from "@/lib/auth/roles";
import { refuse, type ContextRefusal } from "@/lib/auth/context-result";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Build a refusal response without inventing a status or a sentence. */
export function recruitmentRefusal(code: ContextRefusal): NextResponse {
  const r = refuse(code);
  return NextResponse.json(
    { error: r.error, code: r.code },
    { status: r.status, headers: NO_STORE },
  );
}

export type RecruitmentReaderResult =
  | { ok: true; role: Role }
  | { ok: false; response: NextResponse };

/**
 * Gate for READ access to an ATS management surface.
 *
 * 401 for an unauthenticated caller and 403 for an authenticated one without
 * the capability — the two are kept apart only AFTER the session is verified,
 * matching the anti-enumeration contract documented in `context-result.ts`.
 */
export async function requireRecruitmentReader(
  req: NextRequest,
): Promise<RecruitmentReaderResult> {
  const role = await getAuthRole(req);
  if (!role) {
    return { ok: false, response: recruitmentRefusal("AUTHENTICATION_REQUIRED") };
  }
  if (!can(role, "authoring")) {
    return { ok: false, response: recruitmentRefusal("FORBIDDEN") };
  }
  return { ok: true, role };
}

export { NO_STORE as RECRUITMENT_NO_STORE };
