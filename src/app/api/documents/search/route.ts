import { NextRequest, NextResponse } from "next/server";
import { searchDocuments } from "@/lib/documents/search";
import { isUsableChunkSearchScope } from "@/lib/documents/chunk-vector-store";
import { requirePlatformAuth } from "@/lib/api/auth";
import { requireOrgActor, orgActorRefusalCode } from "@/lib/org/context";
import { requirePermission } from "@/lib/org/rbac";

/**
 * POST /api/documents/search (Phase 16D; F-1 tenant scope; F-2 org guard).
 *
 * Standalone semantic search over `DocumentTextChunk` embeddings — admin
 * test page. Requires `view_documents` in the caller's active organization.
 *
 * F-1/F-2: the search scope is the organization proven by `requireOrgActor`,
 * never a request value. An unresolved or ambiguous organization is refused
 * by `requirePlatformAuth` (409) before any search runs; the chunk store then
 * joins every chunk to its parent Document and matches `tenantId` exactly.
 *
 * Never returns a 5xx for a query that simply finds nothing or fails
 * internally — `searchDocuments()` never throws, so the only error
 * responses here are guard refusals and a malformed request body.
 */

export const dynamic = "force-dynamic";

function refuse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return refuse(auth.status, auth.code);
  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return refuse(member.status, orgActorRefusalCode(member.status));
  const perm = requirePermission(member.ctx.role, "view_documents");
  if (!perm.ok) return refuse(perm.status, "forbidden");

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

  const scope = { orgId: member.ctx.orgId };
  if (!isUsableChunkSearchScope(scope)) return NextResponse.json({ matches: [] });
  const result = await searchDocuments(query, scope);
  return NextResponse.json({ matches: result.matches });
}
