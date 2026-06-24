"use client";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = "Failed to load data",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      {/* Icon */}
      <div className="relative flex items-center justify-center w-14 h-14">
        <div
          className="absolute inset-0 rounded-full animate-ambient-pulse"
          style={{
            background: "radial-gradient(circle, rgba(var(--danger-rgb), 0.20) 0%, transparent 70%)",
          }}
        />
        <div
          className="relative glass rounded-xl flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            border: "1px solid rgba(var(--danger-rgb), 0.25)",
            boxShadow: "0 0 20px rgba(var(--danger-rgb), 0.12)",
          }}
        >
          <span className="text-lg font-bold text-danger">!</span>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">Something went wrong</p>
        <p className="text-xs text-muted max-w-xs leading-relaxed">{message}</p>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-signal hover:text-ink transition-colors font-mono underline underline-offset-2"
          style={{ transition: "color var(--t-fast)" }}
        >
          Try again
        </button>
      )}
    </div>
  );
}
