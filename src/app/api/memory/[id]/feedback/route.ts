import { NextResponse } from "next/server";
import { addMemoryFeedback, isValidOutcome } from "@/lib/memory/memory-service";
import { getStorageMode } from "@/lib/storage/storage-mode";
import type { FeedbackCreate } from "@/lib/storage/memory-repository";
import { requireAuthoring } from "@/lib/auth/api-guards";

/** POST /api/memory/[id]/feedback — record field outcome feedback for a memory.
 *
 *  Required fields: outcome ("unknown" | "success" | "partial" | "failed")
 *  Optional: notes, submittedBy
 *
 *  Also updates `EngineeringMemory.outcome` to the new value so list views
 *  reflect the latest field status without loading all feedback rows.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Phase 82C: feedback mutates memory outcome state — authoring only
  const gate = await requireAuthoring();
  if (!gate.ok) return gate.response;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rawOutcome = body.outcome;
  if (!isValidOutcome(rawOutcome)) {
    return NextResponse.json(
      { error: "invalid_outcome", valid: ["unknown", "success", "partial", "failed"] },
      { status: 400 }
    );
  }

  const input: FeedbackCreate = {
    memoryId: id,
    outcome: rawOutcome,
    ...(body.notes != null ? { notes: String(body.notes).trim() } : {}),
    ...(body.submittedBy != null ? { submittedBy: String(body.submittedBy).trim() } : {}),
  };

  try {
    const feedback = await addMemoryFeedback(id, input);
    if (!feedback) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ storageMode: getStorageMode(), feedback }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "feedback_failed" }, { status: 500 });
  }
}
