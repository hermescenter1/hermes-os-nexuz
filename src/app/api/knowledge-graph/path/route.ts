import { NextResponse } from "next/server";
import { getPath } from "@/lib/services/graph-navigation-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

/**
 * GET /api/knowledge-graph/path?from=<nodeId>&to=<nodeId>
 *
 * Returns the shortest undirected path between two graph nodes.
 * Node IDs must be URL-encoded (e.g. "project%3Ap1" for "project:p1").
 * Returns { found: false, path: null } when both nodes exist but no path
 * connects them.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fromId = searchParams.get("from") ?? "";
  const toId   = searchParams.get("to")   ?? "";

  if (!fromId || !toId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const storageMode = getStorageMode();
  try {
    const path = await getPath(fromId, toId);
    return NextResponse.json({ storageMode, found: path !== null, fromId, toId, path });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
