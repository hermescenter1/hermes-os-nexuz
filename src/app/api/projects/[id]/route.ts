import { NextResponse } from "next/server";
import { getProject } from "@/lib/memory/project-service";

/** GET /api/projects/[id] — fetch a single project by id. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const project = await getProject(id);
    if (!project) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
