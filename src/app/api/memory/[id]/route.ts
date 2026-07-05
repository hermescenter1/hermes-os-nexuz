import { NextResponse } from "next/server";
import { getEngineeringMemory } from "@/lib/memory/memory-service";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { requireAuthoring } from "@/lib/auth/api-guards";

/** GET /api/memory/[id] — retrieve a single memory with all its feedback.
 *  Phase 82C: authoring only — individual memories are internal records. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuthoring();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  try {
    const memory = await getEngineeringMemory(id);
    if (!memory) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ storageMode: getStorageMode(), memory });
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
