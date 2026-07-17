// PHASE 87C — canonical page content frame for shell pages.
//
// Figma content region: 32px padding, page title 28/700 with a 14/400
// secondary description. Supports executive pages (max-w-7xl) AND dense
// engineering consoles (full width, tighter padding) — the shell never imposes
// marketing widths on engineering surfaces. Server component; no state.

import type { ReactNode } from "react";
import { cn } from "@/components/ds";
import { AppBreadcrumbs, type BreadcrumbItem } from "./AppBreadcrumbs";

export interface AppPageProps {
  title: ReactNode;
  description?: ReactNode;
  /** Optional page-level crumbs (topbar crumbs remain registry-derived). */
  breadcrumbs?: BreadcrumbItem[];
  /** Primary actions (end of the header row). */
  actions?: ReactNode;
  /** Secondary strip under the header (status strips, filters). */
  contextStrip?: ReactNode;
  /** "default" = centered max-w-7xl; "full" = full-width workspaces. */
  width?: "default" | "full";
  /** Dense engineering spacing (16px) instead of the standard 32px. */
  dense?: boolean;
  children: ReactNode;
  className?: string;
}

export function AppPage({
  title,
  description,
  breadcrumbs,
  actions,
  contextStrip,
  width = "default",
  dense = false,
  children,
  className,
}: AppPageProps) {
  return (
    <div
      className={cn(
        dense ? "px-4 py-4" : "px-6 py-8",
        width === "default" && "mx-auto w-full max-w-7xl",
        className,
      )}
    >
      {breadcrumbs ? <AppBreadcrumbs items={breadcrumbs} className={dense ? "mb-2" : "mb-4"} /> : null}
      <header className={cn("flex flex-wrap items-start justify-between gap-4", dense ? "mb-4" : "mb-6")}>
        <div className="min-w-0">
          <h1 className="text-role-h2 font-bold text-text-primary">{title}</h1>
          {description ? <p className="mt-1.5 max-w-2xl text-subtitle text-text-secondary">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
      </header>
      {contextStrip ? <div className={dense ? "mb-4" : "mb-6"}>{contextStrip}</div> : null}
      {children}
    </div>
  );
}
