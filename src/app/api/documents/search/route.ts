import { NextResponse } from "next/server";
import { searchDocuments, resolveDocumentSearchScope } from "@/lib/documents/search";
import { resolveBrainOwner } from "@/lib/storage/brain-owner";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/auth/config";
import { can } from "@/lib/auth/roles";

/**
 * POST /api/documents/search (Phase 16D).
 *
 * Standalone semantic search over `DocumentTextChunk` embeddings — admin
 * test page. Admin-gated server-side, same as every other `/api/documents*`
 * route, and (F-1) tenant-scoped to the caller's organization.
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

  // F-1: confine the search to the caller's server-resolved tenant. A platform
  // admin with no (or an ambiguous) organization scope gets no matches — never
  // the global index. The body cannot supply or widen the scope.
  const scope = resolveDocumentSearchScope(await resolveBrainOwner());
  const result = await searchDocuments(query, scope);
  return NextResponse.json({ matches: result.matches });
}
