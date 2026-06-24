import type { ReactNode } from "react";

interface EmptyStateProps {
  title:    string;
  message:  string;
  icon?:    string;
  action?:  ReactNode;
}

export function EmptyState({ title, message, icon = "◎", action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">

      {/* Icon with layered ambient glow */}
      <div className="relative flex items-center justify-center w-20 h-20">
        {/* Outer ambient bloom */}
        <div
          className="absolute inset-0 rounded-full animate-ambient-pulse"
          style={{
            background: "radial-gradient(circle, rgba(var(--signal-rgb), 0.18) 0%, transparent 70%)",
          }}
        />
        {/* Glass icon container */}
        <div
          className="relative glass rounded-2xl flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            border: "1px solid rgba(var(--signal-rgb), 0.15)",
          }}
        >
          <span
            className="text-3xl leading-none select-none"
            style={{
              opacity: 0.55,
              filter: "drop-shadow(0 0 10px rgba(var(--signal-rgb), 0.6))",
            }}
          >
            {icon}
          </span>
        </div>
      </div>

      <div className="space-y-1.5 max-w-xs">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="text-xs text-muted leading-relaxed">{message}</p>
      </div>

      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
