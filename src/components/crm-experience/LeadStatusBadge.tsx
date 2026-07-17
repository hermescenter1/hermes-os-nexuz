import { Badge, type BadgeVariant } from "@/components/ds";
import type { CrmLeadStatus, CrmOpportunityStage } from "@/lib/crm/types";

// PHASE 87G — status/stage badges on ds tokens. Status is never color-only:
// the localized text label is the primary signal; the variant only tints it.

const STATUS_VARIANT: Record<CrmLeadStatus, BadgeVariant> = {
  NEW: "information",
  CONTACTED: "neutral",
  QUALIFIED: "brand",
  PROPOSAL: "hypothesis",
  NEGOTIATION: "warning",
  CONVERTED: "success",
  LOST: "danger",
};

const STAGE_VARIANT: Record<CrmOpportunityStage, BadgeVariant> = {
  DISCOVERY: "neutral",
  QUALIFICATION: "information",
  PROPOSAL: "brand",
  TECHNICAL_REVIEW: "hypothesis",
  COMMERCIAL_REVIEW: "hypothesis",
  NEGOTIATION: "warning",
  WON: "success",
  LOST: "danger",
};

export function LeadStatusBadge({ status, label }: { status: CrmLeadStatus; label: string }) {
  return <Badge variant={STATUS_VARIANT[status]}>{label}</Badge>;
}

export function StageBadge({ stage, label }: { stage: CrmOpportunityStage; label: string }) {
  return <Badge variant={STAGE_VARIANT[stage]}>{label}</Badge>;
}
