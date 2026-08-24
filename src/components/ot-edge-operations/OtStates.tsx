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
import { asyncStateForFailure } from "@/lib/client/async-state";
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
    <div data-async-state="loading">
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
  return (
    <div data-async-state="empty" style={{ display: "contents" }}>
      <EmptyState title={title} message={body} />
    </div>
  );
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
/**
 * Refusals a person can act on, shown as a warning rather than a system fault.
 * "You need to select an organization" is not the same kind of news as "the
 * data layer is down".
 */
const WARNING_CODES: ReadonlySet<OtFailureCode> = new Set<OtFailureCode>([
  "UNAUTHENTICATED", "FORBIDDEN", "ORGANIZATION_CONTEXT_REQUIRED", "SITE_CONTEXT_REQUIRED",
]);

// PHASE 107 STAGE 6-A — CONNECTION_FAILED joins the retryable set: a dropped
// connection is the most retryable failure there is. The two CONTEXT codes deliberately do
// NOT. No number of retries selects an organization, and the product has no
// organization selector to point at, so offering any action here would be
// inventing one.
const RETRYABLE: ReadonlySet<OtFailureCode> = new Set<OtFailureCode>(["UNAVAILABLE", "FAILED", "RATE_LIMITED", "CONNECTION_FAILED"]);

export function OtFailure({ code, copy, onRetry, retryLabel }: OtFailureProps) {
  const { title, body } = copy[code];
  const canRetry = Boolean(onRetry) && RETRYABLE.has(code);

  return (
    /*
     * PHASE 107 STAGE 6-A — this module already kept its failure codes apart;
     * what it lacked was a way to SAY so to anything but a human reader. The
     * Stage 5 detector searched for error words and found none in "Sign-in
     * required", so it reported 27 healthy cells as unhandled failures.
     * `display: contents` keeps the wrapper out of layout entirely.
     */
    <div data-async-state={asyncStateForFailure(code)} style={{ display: "contents" }}>
      <Alert variant={WARNING_CODES.has(code) ? "warning" : "danger"} title={title}>
        <p>{body}</p>
        {canRetry ? (
          <p className="mt-3">
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          </p>
        ) : null}
      </Alert>
    </div>
  );
}
