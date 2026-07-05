import { NextResponse } from "next/server";
import { getProject } from "@/lib/memory/project-service";
import { requireAuthoring } from "@/lib/auth/api-guards";

/** GET /api/projects/[id] — fetch a single project by id.
 *  Phase 82C: authoring only. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuthoring();
  if (!gate.ok) return gate.response;

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
