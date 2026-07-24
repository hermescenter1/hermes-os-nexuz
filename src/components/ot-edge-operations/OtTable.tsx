// PHASE 94C1 — an accessible, responsive table shell for the OT lists.
//
// WHY A TABLE AND NOT A CARD GRID
// These are records an operator compares: lifecycle against site, capability
// against last observation. A real <table> gives that comparison to assistive
// technology for free — row/column relationships, a caption, sortable column
// semantics — which a grid of <div>s has to reinvent badly.
//
// HOW IT STAYS USABLE ON A PHONE
// The table scrolls INSIDE its own container rather than widening the page, so
// the document never overflows at 320px. The scroller is focusable and labelled
// so a keyboard user can reach and pan it; that is a WCAG requirement, not a
// nicety, and it is why `tabIndex={0}` sits on a region with an accessible name.
//
// DATA IS RENDERED ONCE. There is no parallel mobile markup: a second copy of
// every row would double the DOM and, worse, drift from the first.

import type { ReactNode } from "react";
import { cn } from "@/components/ds";

export interface OtColumn<T> {
  key: string;
  header: string;
  /** Rendered for each row. Kept a function so no cell escapes localization. */
  cell: (row: T) => ReactNode;
  /** Hidden below `sm` when the column is secondary. */
  optional?: boolean;
  /** Numeric/technical columns read better left-aligned even in RTL. */
  technical?: boolean;
}

export interface OtTableProps<T> {
  caption: string;
  columns: Array<OtColumn<T>>;
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Announced to assistive technology while a new result set is loading. */
  busy?: boolean;
}

export function OtTable<T>({ caption, columns, rows, rowKey, busy = false }: OtTableProps<T>) {
  return (
    <div
      // A labelled, focusable scroll region: the table may exceed the viewport
      // on a phone, and a pointer-free user must still be able to pan it.
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="ds-focus overflow-x-auto rounded-lg border border-border-default"
    >
      <table className="w-full min-w-[44rem] border-collapse text-body" aria-busy={busy || undefined}>
        {/* Visible to assistive technology only: sighted users already have the
            page heading, but a screen-reader user meets the table cold. */}
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border-default bg-surface-secondary">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-4 py-3 text-start text-label font-semibold text-text-secondary whitespace-nowrap",
                  column.optional && "hidden sm:table-cell",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border-subtle last:border-b-0 hover:bg-surface-interactive">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-3 align-middle text-text-primary",
                    column.optional && "hidden sm:table-cell",
                    column.technical && "font-mono text-label",
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
