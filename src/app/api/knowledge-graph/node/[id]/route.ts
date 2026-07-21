import { NextResponse } from "next/server";
import { hasAuthoring } from "@/lib/auth/api-guards";
import { getNodeById } from "@/lib/services/graph-navigation-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

/** GET /api/knowledge-graph/node/[id] — node details and connected edges. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // PHASE 90: private memory projection — authoring only (82C). A non-authoring
  // caller gets the same 404 as a missing node, disclosing no existence.
  if (!(await hasAuthoring())) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const result = await getNodeById(id);
    if (!result) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ storageMode: getStorageMode(), ...result });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
