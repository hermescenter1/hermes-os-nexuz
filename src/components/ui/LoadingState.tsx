interface LoadingStateProps {
  label?:   string;
  compact?: boolean;
  size?:    "sm" | "md" | "lg";
}

export function LoadingState({
  label = "Loading…",
  compact,
  size = "md",
}: LoadingStateProps) {
  const dim = size === "sm" ? 36 : size === "lg" ? 72 : 52;
  const py  = compact ? "py-8" : "py-20";

  return (
    <div className={`flex flex-col items-center justify-center gap-5 ${py}`}>
      {/* Rings */}
      <div className="relative" style={{ width: dim, height: dim }}>
        {/* Outer static ring */}
        <div
          className="absolute inset-0 rounded-full border border-line"
          style={{ borderColor: "rgba(26, 37, 53, 0.8)" }}
        />
        {/* Spinning arc — primary */}
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-signal"
          style={{
            animation: "spinRing 1.1s linear infinite",
            filter: "drop-shadow(0 0 6px var(--signal))",
          }}
        />
        {/* Counter-spinning arc — secondary, ice blue */}
        <div
          className="absolute rounded-full border border-transparent"
          style={{
            inset: "6px",
            borderTopColor: "rgba(125, 211, 252, 0.35)",
            borderRightColor: "rgba(125, 211, 252, 0.12)",
            animation: "spinRing 1.9s linear infinite reverse",
          }}
        />
        {/* Inner static ring */}
        <div
          className="absolute rounded-full border"
          style={{
            inset: "10px",
            borderColor: "rgba(var(--signal-rgb), 0.08)",
          }}
        />
        {/* Center glow dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="rounded-full bg-signal animate-pulse"
            style={{
              width: size === "sm" ? 4 : 6,
              height: size === "sm" ? 4 : 6,
              boxShadow: "0 0 8px var(--signal)",
            }}
          />
        </div>
      </div>

      {/* Label */}
      <p
        className="text-xs text-muted font-mono uppercase"
        style={{ letterSpacing: "0.2em" }}
      >
        {label}
      </p>
    </div>
  );
}
