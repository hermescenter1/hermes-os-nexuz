import { NextResponse } from "next/server";
import { unknownRepository, type UnknownCreate } from "@/lib/storage/unknown-repository";
import { caseRepository } from "@/lib/storage/case-repository";
import { knowledgeRepository } from "@/lib/storage/knowledge-repository";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * /api/unknown — Unknown analysis triage (Phase 11B).
 * PATCH supports status transitions plus two cross-repo actions:
 *  - action "convert"  → creates a draft EngineeringCase from the unknown
 *  - action "library"  → creates a draft KnowledgeArticle from the unknown
 * Both also flip the unknown record's status. Degrades to session safely.
 */

function asArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

export async function GET() {
  const repo = unknownRepository();
  try {
    return NextResponse.json({ storageMode: getStorageMode(), unknowns: await repo.list() });
  } catch {
    return NextResponse.json({ storageMode: getStorageMode(), unknowns: [] });
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const query = String(body.query ?? "").trim();
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  const input: UnknownCreate = {
    query,
    locale: String(body.locale ?? "en"),
    confidence: Number(body.confidence ?? 0.2),
    suggestedDomains: asArray(body.suggestedDomains),
    suggestedVendors: asArray(body.suggestedVendors),
    status: "open",
  };
  const repo = unknownRepository();
  try {
    return NextResponse.json({ storageMode: getStorageMode(), unknown: await repo.create(input) });
  } catch {
    return NextResponse.json({ error: "record failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const repo = unknownRepository();
  const action = String(body.action ?? "");

  try {
    const u = await repo.get(id);
    if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });

    let created: { kind: "case" | "knowledge"; id: string } | null = null;

    if (action === "convert") {
      // Create a draft EngineeringCase seeded from the unknown query.
      const c = await caseRepository().create({
        title: u.query.slice(0, 80),
        vendor: u.suggestedVendors[0] ?? "",
        domain: u.suggestedDomains[0] ?? "",
        problem: u.query,
        rootCause: "",
        secondaryCauses: [],
        verificationSteps: [],
        correctiveActions: [],
        safetyNotes: "",
        tags: [],
        confidence: Math.round(u.confidence * 100),
        status: "draft",
      });
      created = { kind: "case", id: c.id };
      await repo.update(id, { status: "converted" });
      const uu = await getCurrentUser();
      await recordAuditEvent({ userId: uu?.id ?? null, action: AUDIT_ACTIONS.UNKNOWN_CONVERTED, entityType: "unknown", entityId: id, metadata: { caseId: c.id } });
    } else if (action === "library") {
      // Create a draft KnowledgeArticle seeded from the unknown query.
      const a = await knowledgeRepository().create({
        title: u.query.slice(0, 80),
        domain: u.suggestedDomains[0] ?? "",
        ...(u.suggestedVendors[0] ? { vendor: u.suggestedVendors[0] } : {}),
        summary: u.query,
        content: "",
        failureModes: [],
        diagnosticGuidance: [],
        verificationSteps: [],
        correctiveActions: [],
        safetyNotes: "",
        tags: [],
        confidence: Math.round(u.confidence * 100),
        status: "draft",
      });
      created = { kind: "knowledge", id: a.id };
      await repo.update(id, { status: "library" });
      const uu = await getCurrentUser();
      await recordAuditEvent({ userId: uu?.id ?? null, action: AUDIT_ACTIONS.UNKNOWN_TO_LIBRARY, entityType: "unknown", entityId: id, metadata: { articleId: a.id } });
    } else {
      // Plain status update (e.g. resolved).
      const status = body.status as UnknownCreate["status"];
      if (status) {
        await repo.update(id, { status });
        if (status === "resolved") {
          const uu = await getCurrentUser();
          await recordAuditEvent({ userId: uu?.id ?? null, action: AUDIT_ACTIONS.UNKNOWN_RESOLVED, entityType: "unknown", entityId: id, metadata: {} });
        }
      }
    }

    const updated = await repo.get(id);
    return NextResponse.json({ storageMode: getStorageMode(), unknown: updated, created });
  } catch {
    return NextResponse.json({ error: "action failed" }, { status: 500 });
  }
}
