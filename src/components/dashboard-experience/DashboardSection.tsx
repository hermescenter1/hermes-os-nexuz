import type { ReactNode } from "react";
import { cn } from "@/components/ds";

// PHASE 87F — dashboard section wrapper: an h2-titled region with an optional
// eyebrow and an action slot. Presentational; used to give the command surface
// a clear, landmark-friendly heading hierarchy (page h1 → section h2).

export interface DashboardSectionProps {
  title: string;
  id?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Associate the region with its heading for assistive tech. */
  labelledBy?: string;
}

export function DashboardSection({
  title,
  id,
  eyebrow,
  action,
  children,
  className,
  labelledBy,
}: DashboardSectionProps) {
  const headingId = labelledBy ?? (id ? `${id}-title` : undefined);
  return (
    <section aria-labelledby={headingId} className={cn("mb-6", className)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          {eyebrow ? (
            <p className="text-label-compact font-semibold uppercase tracking-[0.12em] text-text-muted">
              {eyebrow}
            </p>
          ) : null}
          <h2 id={headingId} className="text-title-lg font-semibold text-text-primary">
            {title}
          </h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
