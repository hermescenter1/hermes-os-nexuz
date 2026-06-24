type HealthStatus = "healthy" | "degraded" | "critical" | "unknown" | string;

const STATUS_STYLE: Record<string, { text: string; bg: string; border: string; dot: string }> = {
  healthy:  { text: "text-signal",    bg: "bg-signal/8",     border: "border-signalDim/40", dot: "bg-signal"      },
  degraded: { text: "text-[--warn]",  bg: "bg-[--warn]/8",   border: "border-[--warn]/30",  dot: "bg-[--warn]"    },
  critical: { text: "text-[--danger]",bg: "bg-[--danger]/8", border: "border-[--danger]/30",dot: "bg-[--danger]"  },
  unknown:  { text: "text-muted",     bg: "bg-muted/6",      border: "border-line",         dot: "bg-muted"       },
};

interface AssetHealthBadgeProps {
  status: HealthStatus;
  score?: number | null;
  size?: "sm" | "md";
}

export function AssetHealthBadge({ status, score, size = "md" }: AssetHealthBadgeProps) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.unknown;
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  const textClass = size === "sm" ? "text-[0.65rem]" : "text-[0.7rem]";
  const dotClass  = size === "sm" ? "w-1.5 h-1.5"   : "w-2 h-2";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono ${textClass} ${s.text} ${s.bg} ${s.border}`}
    >
      <span className={`rounded-full flex-shrink-0 ${dotClass} ${s.dot}`} />
      {label}
      {score !== null && score !== undefined && (
        <span className="text-muted ms-0.5">{Math.round(score)}</span>
      )}
    </span>
  );
}
