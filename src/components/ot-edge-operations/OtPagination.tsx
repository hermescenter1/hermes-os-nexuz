"use client";

// PHASE 94C1 — bounded pagination over a SERVER total.
//
// Nothing here recalculates a count. `total` is the number of rows the server
// says match the current filter for this actor; the page count derives from it
// and from the requested page size, and no client-side arithmetic ever revises
// what the server reported.
//
// Deliberately not infinite scroll: an operator needs a stable, linkable page —
// "the third page of stale gateways at this site" has to survive being pasted
// into a ticket.

import { Button, cn } from "@/components/ds";
import { pageCount } from "@/lib/ot-operations/query";

export interface OtPaginationProps {
  page: number;
  pageSize: number;
  /** The server's count for the current filter. Never recomputed locally. */
  total: number;
  onPageChange: (page: number) => void;
  labels: {
    label: string;
    previous: string;
    next: string;
    /** ICU string with {page} and {pages}. */
    status: string;
    /** Already-formatted "N matching records". */
    resultCount: string;
  };
  disabled?: boolean;
  className?: string;
}

export function OtPagination({
  page,
  pageSize,
  total,
  onPageChange,
  labels,
  disabled = false,
  className,
}: OtPaginationProps) {
  const pages = pageCount(total, pageSize);
  const atFirst = page <= 1;
  const atLast = page >= pages;

  return (
    <nav
      aria-label={labels.label}
      className={cn("flex flex-wrap items-center justify-between gap-3 pt-4", className)}
    >
      {/* The count is a live region: after a filter is applied the number of
          matches is the answer the operator is waiting for, and it must be
          announced without them having to go looking for it. */}
      <p role="status" aria-live="polite" className="text-label text-text-secondary">
        {labels.resultCount}
      </p>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || atFirst}
        >
          {labels.previous}
        </Button>
        <span className="min-w-[8rem] text-center text-label text-text-secondary">{labels.status}</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || atLast}
        >
          {labels.next}
        </Button>
      </div>
    </nav>
  );
}
