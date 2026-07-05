import { NextResponse } from "next/server";
import {
  createProject,
  listProjects,
  isValidProjectStatus,
} from "@/lib/memory/project-service";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { requireAuthoring, hasAuthoring } from "@/lib/auth/api-guards";

/** GET /api/projects — list all projects, newest first.
 *  Phase 82C: project records go to authoring callers only; everyone else
 *  gets an empty list with the same response shape. */
export async function GET() {
  try {
    if (!await hasAuthoring()) {
      return NextResponse.json({ storageMode: getStorageMode(), projects: [] });
    }
    const projects = await listProjects();
    return NextResponse.json({ storageMode: getStorageMode(), projects });
  } catch {
    return NextResponse.json({ storageMode: getStorageMode(), projects: [] });
  }
}

/**
 * POST /api/projects — create a new project.
 *
 * Required: name
 * Optional: description, status (default "active")
 */
export async function POST(req: Request) {
  const gate = await requireAuthoring();
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const description = String(body.description ?? "").trim();

  const rawStatus = body.status ?? "active";
  if (!isValidProjectStatus(rawStatus)) {
    return NextResponse.json(
      { error: "invalid_status", valid: ["active", "archived", "completed"] },
      { status: 400 }
    );
  }

  try {
    const project = await createProject({ name, description, status: rawStatus });
    return NextResponse.json(
      { storageMode: getStorageMode(), project },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
}
