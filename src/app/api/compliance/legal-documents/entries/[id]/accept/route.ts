import { NextResponse }         from "next/server";
import type { NextRequest }      from "next/server";
import { verifyAccessToken }     from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE }   from "@/lib/auth/config";
import { isPayloadSessionActive } from "@/lib/auth/session-store";
import {
  getPublishedDocumentById,
  isActiveMemberOfOrg,
  getActiveAcceptanceForUser,
  recordGovernedAcceptance,
  withdrawAcceptanceById,
} from "@/lib/compliance/db";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";

/**
 * Governed legal acceptance for the authenticated subject.
 *
 * SECURITY / EVIDENCE — the acceptance binds to the IMMUTABLE published document
 * version (the id points at a specific version row; a later version is a new
 * row, so this record is never rewritten). Only a PUBLISHED document may be
 * accepted; a tenant-owned document may be accepted only by an active member of
 * that organization; a non-published / foreign document returns a uniform 404.
 * Evidence stores safe fields only — never raw IP, user agent, JWT or cookie.
 * Terms acceptance is NOT marketing consent and creates no ConsentRecord here.
 */
async function authSubject(req: NextRequest): Promise<{ sub: string } | null> {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = token ? await verifyAccessToken(token) : null;
  if (!payload?.sub) return null;
  if (!(await isPayloadSessionActive(payload))) return null;
  return { sub: payload.sub };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const subject = await authSubject(req);
  if (!subject) return NextResponse.json({ error: "Authentication required", code: "AUTHENTICATION_REQUIRED" }, { status: 401 });

  const { id } = await params;
  const doc = await getPublishedDocumentById(id);
  if (!doc) return NextResponse.json({ error: "Document not available for acceptance", code: "NOT_FOUND" }, { status: 404 });

  // Tenant-owned documents are acceptable only by an active member of that org.
  if (doc.organizationId !== null) {
    const member = await isActiveMemberOfOrg(subject.sub, doc.organizationId);
    if (!member) return NextResponse.json({ error: "Document not available for acceptance", code: "NOT_FOUND" }, { status: 404 });
  }

  // Duplicate acceptance of the SAME immutable version is idempotent.
  const existing = await getActiveAcceptanceForUser(id, subject.sub);
  if (existing) {
    return NextResponse.json({ accepted: true, alreadyAccepted: true, documentType: doc.documentType, version: doc.version });
  }

  const correlationId = req.headers.get("x-correlation-id");
  const result = await recordGovernedAcceptance({
    legalDocumentId: id,
    userId:          subject.sub,
    organizationId:  doc.organizationId,
    locale:          doc.locale,
    documentType:    doc.documentType,
    documentVersion: doc.version,
    sourceClass:     "AUTHENTICATED_WEB",
    correlationId:   correlationId && /^[A-Za-z0-9._-]{1,128}$/.test(correlationId) ? correlationId : null,
  });
  if (!result.ok) {
    // The concurrent-insert race lost to the partial-unique index: read the
    // winner and answer idempotently — never a spurious PERSIST_FAILED.
    if (result.reason === "DUPLICATE") {
      const winner = await getActiveAcceptanceForUser(id, subject.sub);
      if (winner) return NextResponse.json({ accepted: true, alreadyAccepted: true, documentType: doc.documentType, version: doc.version });
    }
    return NextResponse.json({ error: "Could not record acceptance", code: "PERSIST_FAILED" }, { status: 503 });
  }
  const acceptance = result.acceptance;

  await recordAuditEvent({
    userId:         subject.sub,
    action:         COMPLIANCE_AUDIT.LEGAL_ACCEPTANCE_CREATED,
    entityType:     "LegalAcceptance",
    entityId:       acceptance.id,
    organizationId: doc.organizationId,
    outcome:        "SUCCESS",
    // Immutable version identifiers + closed classification only.
    metadata: { legalDocumentId: id, documentType: doc.documentType, documentVersion: doc.version, sourceClass: "AUTHENTICATED_WEB" },
  });

  return NextResponse.json({ accepted: true, documentType: doc.documentType, version: doc.version }, { status: 201 });
}

/** Withdraw the subject's active acceptance — historical evidence is preserved. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const subject = await authSubject(req);
  if (!subject) return NextResponse.json({ error: "Authentication required", code: "AUTHENTICATION_REQUIRED" }, { status: 401 });

  const { id } = await params;
  // Bind to the SPECIFIC active acceptance row (its id / org / version), so the
  // audit records the acceptance — not the document — and a uniform 404 hides
  // whether any acceptance existed.
  const active = await getActiveAcceptanceForUser(id, subject.sub);
  if (!active) return NextResponse.json({ error: "No active acceptance", code: "NOT_FOUND" }, { status: 404 });

  const { affected } = await withdrawAcceptanceById({ acceptanceId: active.id, userId: subject.sub });
  if (affected < 1) return NextResponse.json({ error: "No active acceptance", code: "NOT_FOUND" }, { status: 404 });

  await recordAuditEvent({
    userId:         subject.sub,
    action:         COMPLIANCE_AUDIT.LEGAL_ACCEPTANCE_WITHDRAWN,
    entityType:     "LegalAcceptance",
    entityId:       active.id,
    organizationId: active.organizationId,
    outcome:        "SUCCESS",
    // Safe evidence only — never IP/UA/JWT/cookie/email/title/content.
    metadata: {
      legalDocumentId: id,
      documentType:    active.documentType,
      documentVersion: active.documentVersion,
      sourceClass:     active.sourceClass,
    },
  });
  return NextResponse.json({ withdrawn: true });
}
