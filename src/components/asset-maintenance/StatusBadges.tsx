import { Badge, type BadgeVariant } from "@/components/ds";
import type { AssetStatus, AssetCriticality, AssetRiskState } from "@/lib/assets/types";
import type { MaintenanceStatus, MaintenancePriority } from "@/lib/cmms/types";

// PHASE 87I — asset + maintenance badges on ds tokens. The localized TEXT is
// the primary signal (never color-only); the variant only tints it. Enum
// VALUES stay internal — these render display labels supplied by the caller.

const ASSET_STATUS_VARIANT: Record<AssetStatus, BadgeVariant> = {
  PLANNED: "information", COMMISSIONED: "information", IN_SERVICE: "success",
  DEGRADED: "warning", UNDER_MAINTENANCE: "brand", STANDBY: "neutral",
  RETIRED: "neutral", REPLACED: "neutral", DECOMMISSIONED: "neutral",
};

const CRITICALITY_VARIANT: Record<AssetCriticality, BadgeVariant> = {
  NON_CRITICAL: "neutral", LOW: "neutral", MEDIUM: "information",
  HIGH: "warning", CRITICAL: "danger",
};

const RISK_VARIANT: Record<AssetRiskState, BadgeVariant> = {
  HEALTHY: "success", MONITOR: "information", AT_RISK: "warning",
  CRITICAL: "danger", UNKNOWN: "neutral",
};

const MAINT_STATUS_VARIANT: Record<MaintenanceStatus, BadgeVariant> = {
  DRAFT: "neutral", PLANNED: "information", SCHEDULED: "information",
  IN_PROGRESS: "brand", ON_HOLD: "warning", COMPLETED: "success",
  CANCELLED: "neutral", OVERDUE: "danger",
};

const MAINT_PRIORITY_VARIANT: Record<MaintenancePriority, BadgeVariant> = {
  LOW: "neutral", MEDIUM: "information", HIGH: "warning",
  CRITICAL: "danger", EMERGENCY: "danger",
};

export function AssetStatusBadge({ status, label }: { status: AssetStatus; label: string }) {
  return <Badge variant={ASSET_STATUS_VARIANT[status]}>{label}</Badge>;
}
export function AssetCriticalityBadge({ criticality, label }: { criticality: AssetCriticality; label: string }) {
  return <Badge variant={CRITICALITY_VARIANT[criticality]}>{label}</Badge>;
}
export function AssetRiskBadge({ risk, label }: { risk: AssetRiskState; label: string }) {
  return <Badge variant={RISK_VARIANT[risk]}>{label}</Badge>;
}
export function MaintenanceStatusBadge({ status, label }: { status: MaintenanceStatus; label: string }) {
  return <Badge variant={MAINT_STATUS_VARIANT[status]}>{label}</Badge>;
}
export function MaintenancePriorityBadge({ priority, label }: { priority: MaintenancePriority; label: string }) {
  return <Badge variant={MAINT_PRIORITY_VARIANT[priority]}>{label}</Badge>;
}
