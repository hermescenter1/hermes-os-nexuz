import { NextResponse }         from "next/server";
import type { NextRequest }      from "next/server";
import {
  getLegalDocumentForScope,
  updateLegalDocumentContentForScope,
  transitionLegalDocumentForScope,
  publishLegalDocumentForScope,
} from "@/lib/compliance/db";
import {
  requireComplianceOrgScope,
  requirePlatformSuperadmin,
} from "@/lib/compliance/authz";
import { verifyAccessToken }     from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }   from "@/lib/auth/config";
import { requirePermission, type OrgPermission } from "@/lib/org/rbac";
import type { OrgRole }          from "@/lib/org/types";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import { toAdminLegalDocumentDto } from "@/lib/compliance/legal-document-view";
import {
  transitionAction,
  isContentEditableLifecycle,
  isKnownLifecycle,
  type LegalDocumentAction,
} from "@/lib/compliance/legal-document-lifecycle";
import type { LegalDocumentType } from "@/lib/compliance/types";

const CONTENT_FIELDS = ["title", "content", "locale", "version", "documentType", "effectiveDate"] as const;

type Resolved =
  | { ok: true; isPlatform: boolean; organizationScope: string | null; userId: string; role: OrgRole | null }
  | { ok: false; status: number; code: string; error: string };

/**
 * Resolve the authoritative scope for a legal-document operation. A superadmin
 * acts on GLOBAL templates through the strict platform boundary (scope = null);
 * everyone else acts within their single authoritative organization. The base
 * gate requires only read; the caller re-checks the action-specific permission.
 */
async function resolveScope(req: NextRequest): Promise<Resolved> {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = token ? await verifyAccessToken(token) : null;
  if (payload?.role === "superadmin") {
    const platform = await requirePlatformSuperadmin(req, "compliance.legal_documents.admin");
    if (!platform.ok) return platform;
    return { ok: true, isPlatform: true, organizationScope: null, userId: platform.userId, role: null };
  }
  const scope = await requireComplianceOrgScope(req, "view_legal_documents", "compliance.legal_documents.admin");
  if (!scope.ok) return scope;
  return { ok: true, isPlatform: false, organizationScope: scope.organizationId, userId: scope.userId, role: scope.role };
}

const ACTION_PERMISSION: Record<LegalDocumentAction, OrgPermission> = {
  manage:  "manage_legal_documents",
  approve: "approve_legal_documents",
  publish: "publish_legal_documents",
};

/** Enforce the action permission — always allowed on the platform boundary. */
function ensurePermission(resolved: Extract<Resolved, { ok: true }>, action: LegalDocumentAction): boolean {
  if (resolved.isPlatform) return true;               // platform superadmin authority over globals
  if (!resolved.role) return false;
  return requirePermission(resolved.role, ACTION_PERMISSION[action]).ok;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveScope(req);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error, code: resolved.code }, { status: resolved.status });
  const { id } = await params;
  const doc = await getLegalDocumentForScope(id, resolved.organizationScope);
  if (!doc) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ document: toAdminLegalDocumentDto(doc) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveScope(req);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error, code: resolved.code }, { status: resolved.status });

  const { id } = await params;
  const body = await req.json().catch(() => null) as (Record<string, unknown> & { transition?: string }) | null;
  if (!body) return NextResponse.json({ error: "Invalid body", code: "INVALID_INPUT" }, { status: 400 });

  // The row must exist within the caller's authoritative scope (uniform 404).
  const existing = await getLegalDocumentForScope(id, resolved.organizationScope);
  if (!existing) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  // ── Lifecycle transition mode ───────────────────────────────────────────────
  if (typeof body.transition === "string") {
    const to = body.transition;
    if (!isKnownLifecycle(to)) return NextResponse.json({ error: "Unknown lifecycle", code: "INVALID_TRANSITION" }, { status: 409 });
    const action = transitionAction(existing.lifecycle, to);
    if (!action) return NextResponse.json({ error: "Transition not allowed", code: "INVALID_TRANSITION" }, { status: 409 });
    if (!ensurePermission(resolved, action)) {
      return NextResponse.json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, { status: 403 });
    }

    if (to === "PUBLISHED") {
      const result = await publishLegalDocumentForScope({ id, organizationScope: resolved.organizationScope, actorId: resolved.userId });
      if (!result.ok) {
        const status = result.code === "NOT_APPROVED" ? 409 : result.code === "NOT_FOUND" ? 404 : 409;
        return NextResponse.json({ error: "Publication failed", code: result.code }, { status });
      }
    } else {
      const { affected } = await transitionLegalDocumentForScope({
        id, organizationScope: resolved.organizationScope, fromLifecycle: existing.lifecycle, toLifecycle: to, actorId: resolved.userId,
      });
      if (affected !== 1) return NextResponse.json({ error: "Transition conflict", code: "TRANSITION_CONFLICT" }, { status: 409 });
    }

    await recordAuditEvent({
      userId: resolved.userId,
      action: COMPLIANCE_AUDIT.LEGAL_DOCUMENT_TRANSITIONED,
      entityType: "LegalDocument",
      entityId: id,
      organizationId: resolved.organizationScope,
      outcome: "SUCCESS",
      metadata: { fromLifecycle: existing.lifecycle, toLifecycle: to, action },
    });
    const updated = await getLegalDocumentForScope(id, resolved.organizationScope);
    return NextResponse.json({ document: updated ? toAdminLegalDocumentDto(updated) : null });
  }

  // ── Content-edit mode (DRAFT only) ──────────────────────────────────────────
  if (!ensurePermission(resolved, "manage")) {
    return NextResponse.json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, { status: 403 });
  }
  const data: Record<string, unknown> = {};
  for (const f of CONTENT_FIELDS) {
    if (body[f] !== undefined) {
      data[f] = f === "effectiveDate" ? (body[f] ? new Date(body[f] as string) : null)
              : f === "documentType" ? (body[f] as LegalDocumentType)
              : body[f];
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No editable field supplied", code: "INVALID_INPUT" }, { status: 400 });
  }
  // A published (or any non-DRAFT) version is immutable in place.
  if (!isContentEditableLifecycle(existing.lifecycle)) {
    return NextResponse.json({ error: "Document is immutable in its current state", code: "DOCUMENT_IMMUTABLE" }, { status: 409 });
  }
  const { affected } = await updateLegalDocumentContentForScope({ id, organizationScope: resolved.organizationScope, data });
  if (affected !== 1) {
    // Lost a race to a lifecycle change — the row is no longer DRAFT.
    return NextResponse.json({ error: "Document is immutable in its current state", code: "DOCUMENT_IMMUTABLE" }, { status: 409 });
  }

  await recordAuditEvent({
    userId: resolved.userId,
    action: COMPLIANCE_AUDIT.LEGAL_DOCUMENT_CONTENT_UPDATED,
    entityType: "LegalDocument",
    entityId: id,
    organizationId: resolved.organizationScope,
    outcome: "SUCCESS",
    // Which FIELDS changed (closed set) — never the content/title values.
    metadata: { fieldsUpdated: Object.keys(data).sort(), lifecycle: existing.lifecycle },
  });
  const updated = await getLegalDocumentForScope(id, resolved.organizationScope);
  return NextResponse.json({ document: updated ? toAdminLegalDocumentDto(updated) : null });
}
