import type { ReactNode } from "react";
import { cn } from "./cn";

export interface EmptyStateProps {
  title: ReactNode;
  message?: ReactNode;
  icon?: ReactNode;
  /** Primary action (e.g. a ds Button). */
  action?: ReactNode;
  className?: string;
}

/**
 * EmptyState (design-system) — restrained "nothing here yet" panel on the new
 * token system. Distinct from the legacy `@/components/ui/EmptyState`, which is
 * left untouched for its existing consumers.
 */
export function EmptyState({ title, message, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 py-16 text-center", className)}>
      {icon ? (
        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border-default bg-surface-primary text-2xl text-text-muted">
          {icon}
        </div>
      ) : null}
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3 className="text-title font-semibold text-text-primary">{title}</h3>
        {message ? <p className="text-body text-text-secondary">{message}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
