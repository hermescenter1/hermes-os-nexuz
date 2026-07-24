// PHASE 94C1 — the distinct outcomes an OT list can have.
//
// WHY EACH STATE IS SEPARATE
// "No data" is four different situations to an operator: nothing is registered
// yet, nothing matches the filters they just set, they are not allowed to see
// it, or the platform cannot answer right now. Only the second is fixed by
// changing a filter and only the last is worth retrying, so collapsing them
// into one message would send people down the wrong path.
//
// No server text is ever rendered here. The API's `message` strings are fixed
// English; the caller passes a failure CODE and this module picks the localized
// wording, so a server change cannot alter what a user reads.

import { Alert, Button, EmptyState, Skeleton } from "@/components/ds";
import type { OtFailureCode } from "@/lib/ot-operations/api";

export interface OtStateCopy {
  title: string;
  body: string;
}

/**
 * A table-shaped loading placeholder.
 *
 * `aria-hidden` with a polite live region beside it: a screen reader is told
 * "loading records" once, instead of being read a lattice of empty boxes.
 */
export function OtSkeleton({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <div>
      <p role="status" aria-live="polite" className="sr-only">
        {label}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Nothing exists yet, or nothing matches — the caller decides which copy. */
export function OtEmpty({ title, body }: OtStateCopy) {
  return <EmptyState title={title} message={body} />;
}

export interface OtFailureProps {
  code: OtFailureCode;
  copy: Record<OtFailureCode, OtStateCopy>;
  /** Offered only for codes where another attempt can plausibly succeed. */
  onRetry?: () => void;
  retryLabel: string;
}

/**
 * Codes worth retrying.
 *
 * A 403 or a rejected filter will fail identically on every attempt, and a
 * retry button on those merely invites an operator to burn their rate-limit
 * budget against a decision the server has already made.
 */
const RETRYABLE: ReadonlySet<OtFailureCode> = new Set<OtFailureCode>(["UNAVAILABLE", "FAILED", "RATE_LIMITED"]);

export function OtFailure({ code, copy, onRetry, retryLabel }: OtFailureProps) {
  const { title, body } = copy[code];
  const canRetry = Boolean(onRetry) && RETRYABLE.has(code);

  return (
    <Alert variant={code === "UNAUTHENTICATED" || code === "FORBIDDEN" ? "warning" : "danger"} title={title}>
      <p>{body}</p>
      {canRetry ? (
        <p className="mt-3">
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        </p>
      ) : null}
    </Alert>
  );
}
