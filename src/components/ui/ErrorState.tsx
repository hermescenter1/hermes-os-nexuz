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
      <div className="w-12 h-12 rounded-full flex items-center justify-center"
        style={{ background: "rgba(232, 92, 92, 0.12)" }}>
        <span className="text-xl font-bold text-[--danger]">!</span>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">Something went wrong</p>
        <p className="text-xs text-muted max-w-xs">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-signal hover:text-ink transition-colors font-mono underline underline-offset-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}
