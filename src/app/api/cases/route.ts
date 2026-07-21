import { NextResponse } from "next/server";
import { resolveBrainOwner } from "@/lib/storage/brain-owner";
import { caseRepository, listPublishedCases, type CaseCreate } from "@/lib/storage/case-repository";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";

/**
 * /api/cases — Engineering case drafts (Phase 11B).
 * Mode-agnostic: the repository picks session or database. Never crashes if
 * the database is unavailable (the repo degrades to session). Every response
 * carries storageMode so the client can show the indicator.
 *
 * Phase 82A hardening: writes require the same "authoring" capability that
 * gates Case Studio, and GET returns only published cases to anonymous or
 * non-authoring callers — public consumers (library case explorer,
 * knowledge service, platform facts) already display published rows only,
 * while Case Studio needs the full draft board and keeps it.
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
  try {
    const user = await getCurrentUser();
    const authoring = can(user?.role, "authoring");

    // PHASE 90: two genuinely different reads.
    //  - Anonymous / non-authoring callers get the PUBLISHED corpus, which is
    //    public knowledge by definition and therefore deliberately not
    //    tenant-scoped (unchanged public behavior).
    //  - Authoring callers get their own tenant's rows — drafts included —
    //    scoped by the session-derived owner, so one tenant's unpublished work
    //    is never visible to another.
    const cases = authoring
      ? await caseRepository(await resolveBrainOwner()).list()
      : await listPublishedCases();

    return NextResponse.json({ storageMode: getStorageMode(), cases });
  } catch {
    return NextResponse.json({ storageMode: getStorageMode(), cases: [] });
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

  const input: CaseCreate = {
    title,
    vendor: String(body.vendor ?? ""),
    domain: String(body.domain ?? ""),
    problem: String(body.problem ?? ""),
    rootCause: String(body.rootCause ?? body.primary ?? ""),
    secondaryCauses: asArray(body.secondaryCauses ?? body.secondary),
    verificationSteps: asArray(body.verificationSteps ?? body.verification),
    correctiveActions: asArray(body.correctiveActions ?? body.corrective),
    safetyNotes: String(body.safetyNotes ?? body.safety ?? ""),
    tags: asArray(body.tags),
    confidence: Number(body.confidence ?? 70),
    status: (body.status as CaseCreate["status"]) ?? "draft",
  };

  const repo = caseRepository(await resolveBrainOwner());
  try {
    // Prevent duplicate titles: update the existing record instead.
    const existing = repo.findByTitle ? await repo.findByTitle(title) : null;
    const rec = existing
      ? await repo.update(existing.id, input)
      : await repo.create(input);
    await recordAuditEvent({
      userId: gate.user.id,
      action: existing ? AUDIT_ACTIONS.CASE_UPDATED : AUDIT_ACTIONS.CASE_CREATED,
      entityType: "case",
      entityId: rec?.id ?? null,
      metadata: { title },
    });
    return NextResponse.json({ storageMode: getStorageMode(), case: rec, updated: !!existing });
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
  const repo = caseRepository(await resolveBrainOwner());
  try {
    const rec = await repo.update(id, body as Partial<CaseCreate>);
    if (!rec) return NextResponse.json({ error: "not found" }, { status: 404 });
    const status = String(body.status ?? "");
    const action =
      status === "ready"
        ? AUDIT_ACTIONS.CASE_MARKED_READY
        : status === "published"
          ? AUDIT_ACTIONS.CASE_PUBLISHED
          : AUDIT_ACTIONS.CASE_UPDATED;
    await recordAuditEvent({
      userId: gate.user.id,
      action,
      entityType: "case",
      entityId: id,
      metadata: { status },
    });
    return NextResponse.json({ storageMode: getStorageMode(), case: rec });
  } catch {
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const gate = await requireAuthoring();
  if (!gate.user) return gate.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const repo = caseRepository(await resolveBrainOwner());
  try {
    const ok = await repo.delete(id);
    // PHASE 90: only record the audit event when the delete actually happened.
    // repo.delete returns false for a missing row and — since Phase 90 — for a
    // row owned by another tenant, so the unconditional write was manufacturing
    // CASE_DELETED entries for deletions that never occurred.
    if (ok) {
      await recordAuditEvent({
        userId: gate.user.id,
        action: AUDIT_ACTIONS.CASE_DELETED,
        entityType: "case",
        entityId: id,
        metadata: {},
      });
    }
    return NextResponse.json({ storageMode: getStorageMode(), deleted: ok });
  } catch {
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
