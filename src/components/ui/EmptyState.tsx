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
      {/* Icon with ambient glow */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute w-16 h-16 rounded-full blur-2xl opacity-20"
          style={{ background: "var(--signal)" }}
        />
        <span
          className="relative text-5xl"
          style={{
            opacity: 0.22,
            filter: "drop-shadow(0 0 14px var(--signal))",
          }}
        >
          {icon}
        </span>
      </div>

      <div className="space-y-1.5 max-w-xs">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="text-xs text-muted leading-relaxed">{message}</p>
      </div>

      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
