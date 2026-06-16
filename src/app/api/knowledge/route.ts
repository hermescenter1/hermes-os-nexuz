import { NextResponse } from "next/server";
import { knowledgeRepository, type ArticleCreate } from "@/lib/storage/knowledge-repository";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";
import { getCurrentUser } from "@/lib/auth/session";

/** /api/knowledge — Knowledge article drafts (Phase 11B). */

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) return v.split("\n").map((s) => s.trim()).filter(Boolean);
  return [];
}

export async function GET() {
  const repo = knowledgeRepository();
  try {
    return NextResponse.json({ storageMode: getStorageMode(), articles: await repo.list() });
  } catch {
    return NextResponse.json({ storageMode: getStorageMode(), articles: [] });
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const vendor = String(body.vendor ?? "").trim();
  const input: ArticleCreate = {
    title,
    domain: String(body.domain ?? ""),
    ...(vendor ? { vendor } : {}),
    summary: String(body.summary ?? ""),
    content: String(body.content ?? ""),
    failureModes: asArray(body.failureModes),
    diagnosticGuidance: asArray(body.diagnosticGuidance ?? body.diagnostics),
    verificationSteps: asArray(body.verificationSteps ?? body.verification),
    correctiveActions: asArray(body.correctiveActions ?? body.corrective),
    safetyNotes: String(body.safetyNotes ?? body.safety ?? ""),
    tags: asArray(body.tags),
    confidence: Number(body.confidence ?? 70),
    status: (body.status as ArticleCreate["status"]) ?? "draft",
  };

  const repo = knowledgeRepository();
  try {
    const existing = repo.findByTitle ? await repo.findByTitle(title) : null;
    const rec = existing ? await repo.update(existing.id, input) : await repo.create(input);
    const u = await getCurrentUser();
    await recordAuditEvent({
      userId: u?.id ?? null,
      action: existing ? AUDIT_ACTIONS.KNOWLEDGE_UPDATED : AUDIT_ACTIONS.KNOWLEDGE_CREATED,
      entityType: "knowledge",
      entityId: rec?.id ?? null,
      metadata: { title },
    });
    return NextResponse.json({ storageMode: getStorageMode(), article: rec, updated: !!existing });
  } catch {
    return NextResponse.json({ error: "save failed" }, { status: 500 });
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
  const repo = knowledgeRepository();
  try {
    const rec = await repo.update(id, body as Partial<ArticleCreate>);
    if (!rec) return NextResponse.json({ error: "not found" }, { status: 404 });
    const status = String(body.status ?? "");
    const action =
      status === "review"
        ? AUDIT_ACTIONS.KNOWLEDGE_MARKED_READY
        : status === "published"
          ? AUDIT_ACTIONS.KNOWLEDGE_PUBLISHED
          : AUDIT_ACTIONS.KNOWLEDGE_UPDATED;
    const u = await getCurrentUser();
    await recordAuditEvent({
      userId: u?.id ?? null,
      action,
      entityType: "knowledge",
      entityId: id,
      metadata: { status },
    });
    return NextResponse.json({ storageMode: getStorageMode(), article: rec });
  } catch {
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const repo = knowledgeRepository();
  try {
    const ok = await repo.delete(id);
    const u = await getCurrentUser();
    await recordAuditEvent({
      userId: u?.id ?? null,
      action: AUDIT_ACTIONS.KNOWLEDGE_DELETED,
      entityType: "knowledge",
      entityId: id,
      metadata: {},
    });
    return NextResponse.json({ storageMode: getStorageMode(), deleted: ok });
  } catch {
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
