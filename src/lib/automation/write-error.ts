/**
 * One mapping from "why the workflow write did not happen" to an HTTP answer,
 * shared by every route that performs one.
 *
 * The distinction is the point: a failed transaction used to reach the client
 * as 404 "not found", which reads as "your workflow is gone" when in fact
 * nothing was written and the workflow is intact. Only a genuinely absent (or
 * soft-deleted) workflow may answer 404.
 *
 * The bodies are deliberately opaque tokens — no SQL text, no Prisma error, no
 * connection detail — matching the codes already used across this API
 * (`service_unavailable` / 503, `update_failed` / 500).
 */
import type { WorkflowWriteFailure } from "./db";

export function workflowWriteErrorResponse(
  reason: WorkflowWriteFailure,
): { body: { error: string }; status: number } {
  switch (reason) {
    case "not_found":
      return { body: { error: "not_found" }, status: 404 };
    case "unavailable":
      return { body: { error: "service_unavailable" }, status: 503 };
    case "write_failed":
      return { body: { error: "update_failed" }, status: 500 };
  }
}
