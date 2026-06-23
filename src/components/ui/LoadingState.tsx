interface LoadingStateProps {
  label?: string;
  compact?: boolean;
}

export function LoadingState({ label = "Loading…", compact }: LoadingStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 ${
        compact ? "py-8" : "py-20"
      }`}
    >
      <div className="relative w-12 h-12">
        {/* Outer static ring */}
        <div className="absolute inset-0 rounded-full border border-line" />
        {/* Spinning arc */}
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-signal animate-spin"
          style={{ animationDuration: "1.1s" }}
        />
        {/* Inner ring */}
        <div className="absolute inset-[4px] rounded-full border border-signalDim/20" />
        {/* Center pulse dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
        </div>
      </div>
      <p className="text-xs text-muted font-mono tracking-[0.18em] uppercase">
        {label}
      </p>
    </div>
  );
}
