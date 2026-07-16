"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";
import { Button } from "./Button";

export interface ErrorStateProps {
  title?: ReactNode;
  message: ReactNode;
  /** Optional retry handler — renders a secondary retry button. */
  onRetry?: () => void;
  retryLabel?: ReactNode;
  className?: string;
}

/**
 * ErrorState (design-system) — an error panel on the new token system.
 * `role="alert"` so screen readers announce it. Distinct from the legacy
 * `@/components/ui/ErrorState`, which is left untouched for its consumers.
 */
export function ErrorState({ title = "Something went wrong", message, onRetry, retryLabel = "Try again", className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center gap-4 py-16 text-center", className)}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-status-danger-border bg-status-danger-subtle text-2xl text-status-danger">
        ⚠
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3 className="text-title font-semibold text-text-primary">{title}</h3>
        <p className="text-body text-text-secondary">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
