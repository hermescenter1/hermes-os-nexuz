import type { HealthTier, CustomerStatus } from "@/lib/customers/types";

const TIER_BADGE: Record<HealthTier, string> = {
  excellent: "hs-badge hs--reasoning",
  good:      "hs-badge hs--confident",
  fair:      "hs-badge hs--warning",
  poor:      "hs-badge hs--risk",
  critical:  "hs-badge hs--risk",
};

const TIER_SCORE_COLOR: Record<HealthTier, string> = {
  excellent: "text-signal",
  good:      "text-signal",
  fair:      "text-warn",
  poor:      "text-danger",
  critical:  "text-danger",
};

const STATUS_BADGE: Record<CustomerStatus, string> = {
  active:            "hs-badge hs--reasoning",
  "at-risk":         "hs-badge hs--risk",
  churned:           "hs-badge hs--risk",
  "expansion-ready": "hs-badge hs--memory",
  onboarding:        "hs-badge hs--nominal",
};

interface HealthBadgeProps {
  tier:  HealthTier;
  score: number;
  showScore?: boolean;
}

export function CustomerHealthBadge({ tier, score, showScore = true }: HealthBadgeProps) {
  return (
    <div className="flex items-center gap-2">
      {showScore && (
        <span className={`font-mono text-sm font-bold ${TIER_SCORE_COLOR[tier]}`}>{score}</span>
      )}
      <span className={TIER_BADGE[tier]}>
        {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </span>
    </div>
  );
}

interface StatusBadgeProps { status: CustomerStatus }

export function CustomerStatusBadge({ status }: StatusBadgeProps) {
  const labels: Record<CustomerStatus, string> = {
    active:            "Active",
    "at-risk":         "At Risk",
    churned:           "Churned",
    "expansion-ready": "Expansion Ready",
    onboarding:        "Onboarding",
  };
  return <span className={STATUS_BADGE[status]}>{labels[status]}</span>;
}

// Re-export the score color helper for use in other components
export { TIER_SCORE_COLOR };
export { STATUS_BADGE };
