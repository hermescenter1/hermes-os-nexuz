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
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-line" />
        <div className="absolute inset-0 rounded-full border-2 border-t-signal border-r-transparent border-b-transparent border-l-transparent animate-spin" />
      </div>
      <p className="text-sm text-muted font-mono">{label}</p>
    </div>
  );
}
