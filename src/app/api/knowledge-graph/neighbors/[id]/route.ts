import { NextResponse } from "next/server";
import { getNodeNeighbors } from "@/lib/services/graph-navigation-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

/** GET /api/knowledge-graph/neighbors/[id] — neighbors of a graph node. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await getNodeNeighbors(id);
    if (!result) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ storageMode: getStorageMode(), ...result });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
