import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { requireComplianceOrgScope } from "@/lib/compliance/authz";
import { recordAuditEvent, COMPLIANCE_AUDIT } from "@/lib/audit/audit-service";
import {
  createEvidencePackForOrg, generateEvidencePackForOrg,
  listEvidencePacksForOrg, countEvidencePacksForOrg, getEvidencePackForOrg,
} from "@/lib/compliance/evidence-pack-db";
import { createEvidencePackSchema, resolveEvidenceTarget, toEvidencePackDto } from "@/lib/compliance/evidence-schema";
import type { EvidenceScopeType } from "@/lib/compliance/evidence-governance";

export async function GET(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "view_compliance_evidence", "compliance.evidence_pack.list");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });
  const url = new URL(req.url);
  const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? 50) || 50, 1), 200);
  const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
  const [rows, total] = await Promise.all([
    listEvidencePacksForOrg(scope.organizationId, { take: pageSize, skip: (page - 1) * pageSize }),
    countEvidencePacksForOrg(scope.organizationId),
  ]);
  return NextResponse.json({ packs: rows.map(toEvidencePackDto), total, page, pageSize });
}

/**
 * Request + generate a governed evidence pack (OWNER-only). The scope + same-org target
 * are validated; organizationId + actor are server-derived; generation runs a single
 * REPEATABLE READ snapshot and finalizes atomically. AuditLog is written after commit.
 */
export async function POST(req: NextRequest) {
  const scope = await requireComplianceOrgScope(req, "generate_compliance_evidence", "compliance.evidence_pack.generate");
  if (!scope.ok) return NextResponse.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const parsed = createEvidencePackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "INVALID_INPUT" }, { status: 400 });
  const input = parsed.data;
  const scopeType = input.scopeType as EvidenceScopeType;
  const resolved = resolveEvidenceTarget(scopeType, input);
  if (!resolved.ok) return NextResponse.json({ error: "Invalid evidence scope", code: "INVALID_SCOPE", reason: resolved.reason }, { status: 400 });

  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const created = await createEvidencePackForOrg({ organizationId: scope.organizationId, actorId: scope.userId, idempotencyKey, scopeType, target: resolved.target });
  if (!created.ok) {
    if (created.reason === "TARGET_NOT_FOUND") return NextResponse.json({ error: "Target not found", code: "TARGET_NOT_FOUND" }, { status: 404 });
    if (created.reason === "INVALID_SCOPE") return NextResponse.json({ error: "Invalid evidence scope", code: "INVALID_SCOPE" }, { status: 400 });
    return NextResponse.json({ error: "Evidence pack conflict", code: "CONFLICT" }, { status: 409 });
  }
  const packId = created.row.id;
  if (created.created) {
    await recordAuditEvent({
      userId: scope.userId, action: COMPLIANCE_AUDIT.EVIDENCE_PACK_REQUESTED, entityType: "ComplianceEvidencePack",
      entityId: packId, organizationId: scope.organizationId, outcome: "SUCCESS",
      metadata: { scopeType, targetIncidentId: resolved.target.incidentId, targetProcessingActivityId: resolved.target.processingActivityId, targetPrivacyRequestId: resolved.target.privacyRequestId },
    });
  }

  const generated = await generateEvidencePackForOrg({ id: packId, organizationId: scope.organizationId, actorId: scope.userId });
  const row = generated.ok ? generated.row : (await getEvidencePackForOrg(packId, scope.organizationId));
  if (row && generated.ok && row.lifecycle === "READY" && row.generatedBy === scope.userId) {
    await recordAuditEvent({
      userId: scope.userId, action: COMPLIANCE_AUDIT.EVIDENCE_PACK_GENERATED, entityType: "ComplianceEvidencePack",
      entityId: packId, organizationId: scope.organizationId, outcome: "SUCCESS",
      metadata: { lifecycle: row.lifecycle, readiness: row.readiness, itemCount: row.itemCount, manifestHash: row.manifestHash },
    });
  }
  return NextResponse.json({ pack: row ? toEvidencePackDto(row) : null, generated: generated.ok }, { status: created.created ? 201 : 200 });
}
