import { cn, TechnicalValue } from "@/components/ds";
import type { Severity } from "@/lib/services/types";
import { SEVERITY_DOT, SEVERITY_TEXT, SEVERITY_GLYPH } from "./severity";

// PHASE 87F — prioritized attention list. Each item: severity (dot + glyph +
// text label, never color alone), affected object, concise reason, optional
// technical identifier (bidi-safe), optional timestamp, and a destination
// link. Renders a calm empty state (not fake-healthy metrics) when clear.

export interface AttentionItem {
  id: string;
  severity: Severity;
  /** Localized severity word (e.g. "Critical"). */
  severityLabel: string;
  /** Localized object / title. */
  object: string;
  /** Localized reason. */
  reason: string;
  /** Optional technical identifier rendered LTR-isolated. */
  identifier?: string;
  /** Optional already-formatted meta (timestamp / due). */
  meta?: string;
  href: string;
  viewLabel: string;
}

export function AttentionPanel({
  items,
  emptyLabel,
  LinkComponent,
}: {
  items: AttentionItem[];
  emptyLabel: string;
  LinkComponent: React.ComponentType<{ href: string; className?: string; children: React.ReactNode }>;
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-status-success-border bg-status-success-subtle px-4 py-4">
        <span aria-hidden="true" className="text-status-success">✓</span>
        <p className="text-body-compact text-text-secondary">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => {
        const Link = LinkComponent;
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              className={cn(
                "ds-focus flex items-start gap-3 rounded-md border border-border-default bg-surface-primary p-3",
                "transition-colors duration-fast hover:border-border-active hover:bg-surface-interactive",
              )}
            >
              <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
                <span aria-hidden="true" className={cn("inline-block h-2 w-2 rounded-full", SEVERITY_DOT[item.severity])} />
                <span aria-hidden="true" className={cn("text-caption", SEVERITY_TEXT[item.severity])}>
                  {SEVERITY_GLYPH[item.severity]}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-body-compact font-semibold text-text-primary" dir="auto">
                    {item.object}
                  </span>
                  {item.identifier ? (
                    <TechnicalValue className="text-caption text-text-muted">{item.identifier}</TechnicalValue>
                  ) : null}
                  <span className={cn("text-caption font-medium", SEVERITY_TEXT[item.severity])}>
                    {item.severityLabel}
                  </span>
                </span>
                <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-caption text-text-secondary">
                  <span dir="auto">{item.reason}</span>
                  {item.meta ? (
                    <TechnicalValue mono={false} className="text-text-muted">{item.meta}</TechnicalValue>
                  ) : null}
                </span>
              </span>
              <span aria-hidden="true" className="mt-0.5 shrink-0 text-label text-brand-primary rtl:-scale-x-100">→</span>
              <span className="sr-only">{item.viewLabel}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
