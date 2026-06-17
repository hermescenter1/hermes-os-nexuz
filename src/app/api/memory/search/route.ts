import { NextResponse } from "next/server";
import { searchEngineeringMemories } from "@/lib/memory/memory-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

/**
 * POST /api/memory/search — rank stored engineering memories against a query.
 *
 * Input  { query: string, domain?: string, limit?: number }
 * Output { storageMode, matches: MemoryMatch[] }
 *
 * Ranking is fully deterministic (no embeddings, no LLM):
 *   domain match (0–30) + keyword overlap (0–40) + confidence (0–15)
 *   + outcome weight (0–10) + recency boost (0–5)
 *
 * Never throws — returns an empty matches array on any internal failure.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const query = String(body.query ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "query_required" }, { status: 400 });
  }

  const domain = body.domain != null ? String(body.domain).trim() || undefined : undefined;

  const rawLimit = Number(body.limit ?? 20);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.round(rawLimit), 1), 100)
    : 20;

  try {
    const matches = await searchEngineeringMemories(query, { domain, limit });
    return NextResponse.json({ storageMode: getStorageMode(), matches });
  } catch {
    return NextResponse.json(
      { storageMode: getStorageMode(), matches: [] },
      { status: 200 }
    );
  }
}
