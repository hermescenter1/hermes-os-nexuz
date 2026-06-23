"use client";

interface ConfidenceRingProps {
  value:      number; // 0–1
  label?:     string;
  formatted?: string;
}

/** Circular SVG ring showing confidence score with neon glow. */
export function ConfidenceRing({ value, label = "Confidence", formatted }: ConfidenceRingProps) {
  const radius    = 40;
  const circumference = 2 * Math.PI * radius;
  const filled    = Math.max(0, Math.min(1, value));
  const dash      = filled * circumference;
  const gap       = circumference - dash;

  const color =
    filled >= 0.7  ? "#38e0b0"  // signal (teal)
    : filled >= 0.4 ? "#e8b339" // warn (amber)
    : "#e85c5c";                // danger (red)

  const display = formatted ?? `${Math.round(filled * 100)}%`;

  return (
    <div className="flex items-center gap-5">
      {/* SVG ring */}
      <div className="relative w-[100px] h-[100px] flex-shrink-0">
        <svg
          width="100"
          height="100"
          viewBox="0 0 100 100"
          className="rotate-[-90deg]"
          aria-hidden="true"
        >
          {/* Track */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="8"
          />
          {/* Progress arc */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            style={{
              filter: `drop-shadow(0 0 6px ${color}80)`,
              transition: "stroke-dasharray 0.6s ease",
            }}
          />
        </svg>
        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="metric text-xl font-bold leading-none"
            style={{ color }}
          >
            {display}
          </span>
        </div>
      </div>

      {/* Labels */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1">
          {label}
        </p>
        <p
          className="text-sm font-semibold"
          style={{ color }}
        >
          {filled >= 0.7
            ? "High confidence"
            : filled >= 0.4
            ? "Moderate confidence"
            : "Low confidence — review required"}
        </p>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          {filled >= 0.7
            ? "Analysis supported by strong knowledge base matches."
            : filled >= 0.4
            ? "Partial match. Verify with site-level documentation."
            : "Insufficient evidence. Escalate to expert review."}
        </p>
      </div>
    </div>
  );
}
