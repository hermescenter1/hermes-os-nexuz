/**
 * Phase 50A — MetricRing.
 * SVG circular progress ring for displaying percentage or scored metrics.
 */

interface MetricRingProps {
  value:       number;       // 0–100
  label?:      string;
  sublabel?:   string;
  color?:      string;
  size?:       number;       // SVG width/height in px. Default 80.
  strokeWidth?: number;      // Default 6.
  showValue?:  boolean;
}

export function MetricRing({
  value,
  label,
  sublabel,
  color = "var(--signal)",
  size = 80,
  strokeWidth = 6,
  showValue = true,
}: MetricRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circ   = 2 * Math.PI * radius;
  const filled = Math.min(Math.max(value, 0), 100) / 100;
  const dash   = filled * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: "rotate(-90deg)" }}
        >
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ - dash}`}
            style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
          />
        </svg>

        {/* Center value */}
        {showValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="metric font-bold leading-none"
              style={{
                fontSize: size > 64 ? "1.2rem" : "0.85rem",
                color,
              }}
            >
              {Math.round(value)}
            </span>
          </div>
        )}
      </div>

      {label && (
        <div className="text-center">
          <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted">{label}</p>
          {sublabel && <p className="text-[0.6rem] text-faint mt-0.5">{sublabel}</p>}
        </div>
      )}
    </div>
  );
}
