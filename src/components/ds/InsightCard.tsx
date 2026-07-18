import type { ReactNode } from "react";
import { cn } from "./cn";

export interface InsightCardProps {
  /** Small azure eyebrow — this is an intelligence/analytics surface. */
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  /** Confidence line (e.g. "Confidence: HIGH · 0.86") — stated in text. */
  confidence?: ReactNode;
  /** Evidence/source attribution. */
  source?: ReactNode;
  className?: string;
}

/**
 * InsightCard — a model-assisted intelligence surface. Azure accent bar marks
 * it as analytics (not brand), keeping the reasoning colour language intact.
 */
export function InsightCard({ eyebrow, title, children, confidence, source, className }: InsightCardProps) {
  return (
    <div
      className={cn(
        "ds-glass-card rounded-lg border-s-2 border-s-reasoning-evidence p-5",
        "flex flex-col gap-2",
        className,
      )}
    >
      {eyebrow ? (
        <span className="text-label-compact font-semibold uppercase tracking-wide text-reasoning-evidence">
          {eyebrow}
        </span>
      ) : null}
      <h3 className="text-title font-semibold text-text-primary">{title}</h3>
      {children ? <div className="text-body text-text-secondary">{children}</div> : null}
      {confidence ? <p className="text-caption font-semibold text-status-success">{confidence}</p> : null}
      {source ? <p className="text-caption text-text-muted">{source}</p> : null}
    </div>
  );
}
