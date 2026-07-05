import { NextResponse } from "next/server";
import { knowledgeRepository, type ArticleCreate } from "@/lib/storage/knowledge-repository";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";

/**
 * /api/knowledge — Knowledge article drafts (Phase 11B).
 *
 * Phase 82B hardening (mirrors Phase 82A on /api/cases): writes require the
 * same "authoring" capability that gates Knowledge Studio, and GET returns
 * only published articles to anonymous or non-authoring callers — public
 * consumers (library knowledge service, platform facts) already display
 * published rows only, while Knowledge Studio needs the full draft/review
 * board and keeps it. Org-scoped /api/knowledge/* subroutes have their own
 * requireOrgActor gate and are untouched.
 */

type Gate = { user: CurrentUser } | { user: null; response: NextResponse };

async function requireAuthoring(): Promise<Gate> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 }),
    };
  }
  if (!can(user.role, "authoring")) {
    return {
      user: null,
      response: NextResponse.json({ ok: false, error: "Insufficient permissions." }, { status: 403 }),
    };
  }
  return { user };
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) return v.split("\n").map((s) => s.trim()).filter(Boolean);
  return [];
}

export async function GET() {
  const repo = knowledgeRepository();
  try {
    const user = await getCurrentUser();
    const authoring = can(user?.role, "authoring");
    const articles = await repo.list();
    return NextResponse.json({
      storageMode: getStorageMode(),
      articles: authoring ? articles : articles.filter((a) => a.status === "published"),
    });
  } catch {
    return NextResponse.json({ storageMode: getStorageMode(), articles: [] });
  }
}

export async function POST(req: Request) {
  const gate = await requireAuthoring();
  if (!gate.user) return gate.response;

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
    await recordAuditEvent({
      userId: gate.user.id,
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
  const gate = await requireAuthoring();
  if (!gate.user) return gate.response;

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
    await recordAuditEvent({
      userId: gate.user.id,
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
  const gate = await requireAuthoring();
  if (!gate.user) return gate.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const repo = knowledgeRepository();
  try {
    const ok = await repo.delete(id);
    await recordAuditEvent({
      userId: gate.user.id,
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
