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
  /**
   * Optional action rendered instead of the retry button, for failures where
   * retrying cannot help — an expired session needs a sign-in link, not another
   * attempt at the same request. Mirrors `EmptyState`'s `action` slot.
   */
  action?: ReactNode;
  className?: string;
}

/**
 * ErrorState (design-system) — an error panel on the new token system.
 * `role="alert"` so screen readers announce it. Distinct from the legacy
 * `@/components/ui/ErrorState`, which is left untouched for its consumers.
 */
export function ErrorState({ title = "Something went wrong", message, onRetry, retryLabel = "Try again", action, className }: ErrorStateProps) {
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
      {/*
        * PHASE 107 STAGE 6-A.1 — `lg` is the design system's 44px size, the
        * mobile touch-target minimum. `sm` is 32px, and a recovery control is
        * exactly the wrong place to be hard to hit: the reader is already
        * stuck, and on a phone a 32px target is the difference between
        * recovering and giving up.
        */}
      {action ?? (onRetry ? (
        <Button variant="secondary" size="lg" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null)}
    </div>
  );
}
