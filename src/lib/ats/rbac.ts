/**
 * ATS-S1 — recruitment capabilities, isolated from the platform role model.
 *
 * WHY NOT `roles.ts` OR `org/rbac.ts`
 * ------------------------------------
 * The platform capability model (`src/lib/auth/roles.ts`) has one broad
 * `authoring` capability that every ATS route gated on, and it is held by
 * `engineer` — which is why an engineer could read the whole pipeline. The
 * organization permission catalogue (`src/lib/org/rbac.ts`) is pinned by two
 * test suites to grant NOTHING to HR_MANAGER / RECRUITER / HIRING_MANAGER /
 * INTERVIEWER, with the note that granting is "a policy decision for whoever
 * owns that surface". This module IS that decision, made where its blast
 * radius is exactly the recruitment surface and nowhere else: no entry in
 * either global table changes.
 *
 * The role vocabulary is the tenant contract's fifteen-value
 * `OrganizationRole` — the set the database actually stores — so a membership
 * row carrying `RECRUITER` is spelled here, not cast.
 *
 * DENY BY DEFAULT: a role absent from the matrix holds no ATS capability.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveOrgContext } from "@/lib/billing/context";
import { refuse, type ContextRefusal } from "@/lib/auth/context-result";
import type { OrganizationRole } from "@/lib/tenant/contract";

export type AtsCapability =
  | "ATS_VIEW"      // read jobs, applications, reports of the caller's org
  | "ATS_REVIEW"    // record a human decision on PENDING_HUMAN_APPROVAL
  | "ATS_MANAGE"    // author jobs / criteria, transition later stages
  | "ATS_SCORE"     // request a (re-)review, read full evidence reports
  | "ATS_INTERVIEW" // schedule / record interview feedback
  | "ATS_ADMIN";    // policy, retention actions, worker administration

export const ATS_CAPABILITIES: readonly AtsCapability[] = Object.freeze([
  "ATS_VIEW",
  "ATS_REVIEW",
  "ATS_MANAGE",
  "ATS_SCORE",
  "ATS_INTERVIEW",
  "ATS_ADMIN",
]);

const ALL: readonly AtsCapability[] = ATS_CAPABILITIES;

/**
 * Initial recruitment policy. Owner-adjustable; recorded in
 * docs/ats/ATS_SECURITY_AND_PRIVACY.md. Every row is deliberate:
 *   - OWNER / ADMIN / HR_MANAGER: the accountable recruitment authorities.
 *   - RECRUITER: runs the pipeline and may decide at the gate, but does not
 *     administer policy or retention.
 *   - HIRING_MANAGER: decides at the gate and interviews; does not author.
 *   - INTERVIEWER: sees what it is asked to interview; records feedback.
 *   - MANAGER: read-only visibility.
 *   - ENGINEER / VIEWER / BILLING_ADMIN / MEMBER and the non-recruitment
 *     roles: nothing. Candidate PII is not an engineering resource.
 */
const MATRIX: Partial<Record<OrganizationRole, readonly AtsCapability[]>> = {
  OWNER: ALL,
  ADMIN: ALL,
  HR_MANAGER: ALL,
  RECRUITER: ["ATS_VIEW", "ATS_REVIEW", "ATS_MANAGE", "ATS_SCORE", "ATS_INTERVIEW"],
  HIRING_MANAGER: ["ATS_VIEW", "ATS_REVIEW", "ATS_INTERVIEW"],
  INTERVIEWER: ["ATS_VIEW", "ATS_INTERVIEW"],
  MANAGER: ["ATS_VIEW"],
};

export function atsCan(role: OrganizationRole | string, capability: AtsCapability): boolean {
  const caps = MATRIX[role as OrganizationRole];
  return Array.isArray(caps) && caps.includes(capability);
}

export interface AtsActorContext {
  userId: string;
  orgId: string;
  role: OrganizationRole;
}

export type AtsActorResult =
  | { ok: true; ctx: AtsActorContext }
  | { ok: false; response: NextResponse };

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function atsRefusal(code: ContextRefusal): NextResponse {
  const r = refuse(code);
  return NextResponse.json({ error: r.error, code: r.code }, { status: r.status, headers: NO_STORE });
}

/**
 * Authenticate, resolve the caller's ACTIVE organization membership (with the
 * Phase 110 selection + write-precondition rules), then check the capability.
 *
 * Refusal order preserves the anti-enumeration contract: every pre-auth
 * failure is one 401; org-context refusals (409/428/503) come only after the
 * session is verified; 403 only after membership is proven.
 */
export async function requireAtsActor(
  req: NextRequest,
  capability: AtsCapability,
): Promise<AtsActorResult> {
  const org = await resolveOrgContext(req);
  if (!org.ok) return { ok: false, response: atsRefusal(org.reason) };
  if (!atsCan(org.ctx.role, capability)) {
    return { ok: false, response: atsRefusal("FORBIDDEN") };
  }
  return { ok: true, ctx: { userId: org.ctx.userId, orgId: org.ctx.orgId, role: org.ctx.role } };
}
