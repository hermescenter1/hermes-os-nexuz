import { NextResponse } from "next/server";
import { getProjectTimeline } from "@/lib/analytics/timeline-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

/** GET /api/projects/[id]/timeline — chronological project activity history. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await getProjectTimeline(id);
    if (!result) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const { project, projectId, timeline, stats } = result;
    return NextResponse.json({
      storageMode: getStorageMode(),
      project,
      projectId,
      timeline,
      stats,
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
