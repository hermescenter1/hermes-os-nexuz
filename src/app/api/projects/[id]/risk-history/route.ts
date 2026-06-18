import { NextResponse } from "next/server";
import { getProjectRisk } from "@/lib/services/project-risk-service";
import { getStorageMode } from "@/lib/storage/storage-mode";

/** GET /api/projects/[id]/risk-history — project risk evolution over time. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await getProjectRisk(id);
    if (!result) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const { projectId, currentRisk, riskTrend, history } = result;
    return NextResponse.json({
      storageMode: getStorageMode(),
      projectId,
      currentRisk,
      riskTrend,
      history,
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
