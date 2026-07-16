import type { ReactNode } from "react";
import { cn } from "./cn";
import { statusDotClass, type StatusKind } from "./logic";

export { statusDotClass };
export type { StatusKind };

export interface StatusIndicatorProps {
  status: StatusKind;
  /** Always present — status is NEVER communicated by colour alone (WCAG 1.4.1). */
  label: ReactNode;
  /** Subtle Intelligence-Pulse on the dot for live/active states. */
  pulse?: boolean;
  className?: string;
}

export function StatusIndicator({ status, label, pulse, className }: StatusIndicatorProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-label text-text-secondary", className)}>
      <span
        aria-hidden="true"
        className={cn("h-2 w-2 shrink-0 rounded-full", statusDotClass(status), pulse && "ds-pulse")}
      />
      <span>{label}</span>
    </span>
  );
}
