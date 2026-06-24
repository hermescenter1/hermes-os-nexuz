import type { ReactNode } from "react";

interface EmptyStateProps {
  title:    string;
  message:  string;
  icon?:    string;
  action?:  ReactNode;
}

export function EmptyState({ title, message, icon = "◎", action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
      {/* Icon container — restrained, no heavy glow */}
      <div
        className="glass rounded-2xl flex items-center justify-center"
        style={{
          width:  56,
          height: 56,
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <span className="text-3xl leading-none select-none opacity-40">
          {icon}
        </span>
      </div>

      <div className="space-y-2 max-w-xs">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="text-xs text-muted leading-relaxed">{message}</p>
      </div>

      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
