import { NextResponse } from "next/server";
import {
  createEngineeringMemory,
  listEngineeringMemories,
  isValidOutcome,
} from "@/lib/memory/memory-service";
import { getStorageMode } from "@/lib/storage/storage-mode";
import type { MemoryCreate } from "@/lib/storage/memory-repository";

/** GET /api/memory — list saved engineering memories (newest first).
 *  Accepts optional `?limit=N` query param (default 50, max 200). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(rawLimit ?? 50) || 50, 1), 200);
  try {
    const memories = await listEngineeringMemories(limit);
    return NextResponse.json({ storageMode: getStorageMode(), memories });
  } catch {
    return NextResponse.json({ storageMode: getStorageMode(), memories: [] });
  }
}

/** POST /api/memory — save a new engineering memory.
 *
 *  Required fields: query, domain
 *  Optional: analysisSummary, confidence, relatedCaseIds, relatedDocumentIds,
 *            outcome, notes
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const query = String(body.query ?? "").trim();
  if (!query) return NextResponse.json({ error: "query_required" }, { status: 400 });

  const domain = String(body.domain ?? "").trim();
  if (!domain) return NextResponse.json({ error: "domain_required" }, { status: 400 });

  const rawOutcome = body.outcome ?? "unknown";
  if (!isValidOutcome(rawOutcome)) {
    return NextResponse.json(
      { error: "invalid_outcome", valid: ["unknown", "success", "partial", "failed"] },
      { status: 400 }
    );
  }

  const input: MemoryCreate = {
    query,
    domain,
    analysisSummary: String(body.analysisSummary ?? "").trim(),
    confidence: Math.max(0, Math.min(100, Number(body.confidence ?? 0))),
    relatedCaseIds: asStringArray(body.relatedCaseIds),
    relatedDocumentIds: asStringArray(body.relatedDocumentIds),
    outcome: rawOutcome,
    ...(body.notes != null ? { notes: String(body.notes).trim() } : {}),
  };

  try {
    const memory = await createEngineeringMemory(input);
    return NextResponse.json({ storageMode: getStorageMode(), memory }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}
