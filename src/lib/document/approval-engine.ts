// Phase 69 — EDMS approval engine (deterministic, no AI-generated decisions)

import type { EdmsApproval, EdmsApprovalStatus } from "./types";

export interface ApprovalStageResult {
  stage:     number;
  status:    EdmsApprovalStatus;
  canDecide: boolean;
  overdue:   boolean;
}

export function getApprovalStages(approvals: EdmsApproval[]): ApprovalStageResult[] {
  return approvals
    .sort((a, b) => a.stage - b.stage)
    .map(a => ({
      stage:     a.stage,
      status:    a.status,
      canDecide: a.status === "PENDING",
      overdue:   a.status === "PENDING" && !!a.dueDate && new Date(a.dueDate) < new Date(),
    }));
}

export function getDocumentApprovalStatus(approvals: EdmsApproval[]): EdmsApprovalStatus {
  if (approvals.length === 0) return "PENDING";
  if (approvals.some(a => a.status === "REJECTED")) return "REJECTED";
  if (approvals.every(a => a.status === "APPROVED")) return "APPROVED";
  return "PENDING";
}

export function isFullyApproved(approvals: EdmsApproval[]): boolean {
  return approvals.length > 0 && approvals.every(a => a.status === "APPROVED");
}

export function hasRejection(approvals: EdmsApproval[]): boolean {
  return approvals.some(a => a.status === "REJECTED");
}

export function getPendingApprovers(approvals: EdmsApproval[]): string[] {
  return approvals.filter(a => a.status === "PENDING" && a.assignedTo).map(a => a.assignedTo!);
}

export function getApprovalProgress(approvals: EdmsApproval[]): { done: number; total: number; pct: number } {
  const done  = approvals.filter(a => a.status !== "PENDING").length;
  const total = approvals.length;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}
