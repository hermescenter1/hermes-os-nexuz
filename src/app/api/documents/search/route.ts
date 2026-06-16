import { NextResponse } from "next/server";
import { searchDocuments } from "@/lib/documents/search";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/auth/config";
import { can } from "@/lib/auth/roles";

/**
 * POST /api/documents/search (Phase 16D).
 *
 * Standalone semantic search over `DocumentTextChunk` embeddings — admin
 * test page only. NOT wired into Hermes Brain, does not inject citations
 * anywhere; `searchDocuments()` (src/lib/documents/search.ts) is a fully
 * separate retrieval service. Admin-gated server-side, same as every
 * other `/api/documents*` route.
 *
 * Never returns a 5xx for a query that simply finds nothing or fails
 * internally — `searchDocuments()` never throws, so the only error
 * responses here are auth failures and a malformed request body.
 */
export async function POST(req: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "auth not configured" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { query?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "query_required" }, { status: 400 });
  }

  const result = await searchDocuments(query);
  return NextResponse.json({ matches: result.matches });
}
