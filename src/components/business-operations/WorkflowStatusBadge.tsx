import { Badge, type BadgeVariant } from "@/components/ds";
import type {
  ErpProjectStatus, ErpTaskStatus, ErpWorkOrderStatus, ErpApprovalStatus,
} from "@/lib/erp/types";

// PHASE 87H — workflow status badges on ds tokens. Status is never color-only:
// the localized text label is the primary signal; the variant only tints it.
// Enum VALUES are internal — the label is display-only.

const PROJECT_VARIANT: Record<ErpProjectStatus, BadgeVariant> = {
  PLANNED: "information", ACTIVE: "brand", ON_HOLD: "warning",
  COMPLETED: "success", CANCELLED: "neutral",
};
const TASK_VARIANT: Record<ErpTaskStatus, BadgeVariant> = {
  TODO: "neutral", IN_PROGRESS: "brand", BLOCKED: "danger",
  REVIEW: "hypothesis", DONE: "success", CANCELLED: "neutral",
};
const WORKORDER_VARIANT: Record<ErpWorkOrderStatus, BadgeVariant> = {
  OPEN: "information", ASSIGNED: "brand", IN_PROGRESS: "brand",
  WAITING_APPROVAL: "warning", COMPLETED: "success", CANCELLED: "neutral",
};
const APPROVAL_VARIANT: Record<ErpApprovalStatus, BadgeVariant> = {
  PENDING: "warning", APPROVED: "success", REJECTED: "danger", CANCELLED: "neutral",
};

export function ProjectStatusBadge({ status, label }: { status: ErpProjectStatus; label: string }) {
  return <Badge variant={PROJECT_VARIANT[status]}>{label}</Badge>;
}
export function TaskStatusBadge({ status, label }: { status: ErpTaskStatus; label: string }) {
  return <Badge variant={TASK_VARIANT[status]}>{label}</Badge>;
}
export function WorkOrderStatusBadge({ status, label }: { status: ErpWorkOrderStatus; label: string }) {
  return <Badge variant={WORKORDER_VARIANT[status]}>{label}</Badge>;
}
export function ApprovalStatusBadge({ status, label }: { status: ErpApprovalStatus; label: string }) {
  return <Badge variant={APPROVAL_VARIANT[status]}>{label}</Badge>;
}
