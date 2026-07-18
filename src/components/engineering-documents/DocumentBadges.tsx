import { Badge, type BadgeVariant } from "@/components/ds";
import type {
  EdmsDocumentStatus, EdmsApprovalStatus, EdmsRevisionType,
} from "@/lib/document/types";

// PHASE 87J — EDMS badges on ds tokens. The localized TEXT is the primary
// signal (approval is never color-only); the variant only tints it. Enum
// VALUES stay internal — the caller supplies the display label.
//
// Document status and approval status are DISTINCT concepts and never share a
// component: a document can be APPROVED while a later revision's approval is
// still PENDING.

const DOC_STATUS_VARIANT: Record<EdmsDocumentStatus, BadgeVariant> = {
  DRAFT: "neutral",
  REVIEW: "information",
  APPROVED: "success",
  REJECTED: "danger",
  ARCHIVED: "neutral",
  OBSOLETE: "warning",
};

const APPROVAL_VARIANT: Record<EdmsApprovalStatus, BadgeVariant> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

const REVISION_VARIANT: Record<EdmsRevisionType, BadgeVariant> = {
  MAJOR: "brand",
  MINOR: "information",
  PATCH: "neutral",
};

export function DocumentStatusBadge({ status, label }: { status: EdmsDocumentStatus; label: string }) {
  return <Badge variant={DOC_STATUS_VARIANT[status]}>{label}</Badge>;
}

export function ApprovalStatusBadge({ status, label }: { status: EdmsApprovalStatus; label: string }) {
  return <Badge variant={APPROVAL_VARIANT[status]}>{label}</Badge>;
}

export function RevisionTypeBadge({ type, label }: { type: EdmsRevisionType; label: string }) {
  return <Badge variant={REVISION_VARIANT[type]}>{label}</Badge>;
}
