"use client";

/**
 * ENGINEERING-HUB-TRILINGUAL — `title` and `retryLabel` are ADDITIVE optional
 * props. The two strings they replace were hard-coded here with no way for a
 * caller to localize them, so every locale rendered "Something went wrong" and
 * "Try again" in English. The defaults are the previous literals verbatim, so
 * the five existing consumers that pass neither prop render exactly as before.
 */
interface ErrorStateProps {
  title?:      string;
  message?:    string;
  retryLabel?: string;
  onRetry?:    () => void;
}

export function ErrorState({
  title = "Something went wrong",
  message = "Failed to load data",
  retryLabel = "Try again",
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
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-muted max-w-xs leading-relaxed">{message}</p>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          className="ds-focus inline-flex min-h-11 items-center text-xs text-signal hover:text-ink transition-colors font-mono underline underline-offset-2"
          style={{ transition: "color var(--t-fast)" }}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
