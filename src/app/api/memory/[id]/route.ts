import { NextResponse } from "next/server";
import { getEngineeringMemory } from "@/lib/memory/memory-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

/** GET /api/memory/[id] — retrieve a single memory with all its feedback. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const memory = await getEngineeringMemory(id);
    if (!memory) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ storageMode: getStorageMode(), memory });
  } catch {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
