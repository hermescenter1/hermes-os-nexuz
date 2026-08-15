import type { ReactNode } from "react";
import { cn } from "@/components/ds";

// PHASE 87F — safe-action shortcuts. Each is a real navigation to an existing
// authorized route (never a nonfunctional button); label + description + glyph,
// keyboard-accessible, ≥44px target, locale-preserving via the injected Link.

export interface SafeAction {
  key: string;
  label: string;
  description: string;
  href: string;
  glyph: ReactNode;
}

export function SafeActionGrid({
  actions,
  LinkComponent,
  layout = "viewport",
}: {
  actions: SafeAction[];
  LinkComponent: React.ComponentType<{ href: string; className?: string; children: React.ReactNode }>;
  /**
   * PHASE 104-D2 — "container" makes the grid follow this list's OWN width.
   * Inside a Triad group the viewport variant collapsed four action tracks into
   * roughly 80px, so the container variant deliberately has NO four-column
   * step. Defaults to "viewport": six other command surfaces consume this
   * component and must keep rendering exactly as they do today.
   */
  layout?: "viewport" | "container";
}) {
  const Link = LinkComponent;
  return (
    <ul className={cn("gap-3", layout === "container" ? "hermes-cq-grid" : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4")}>
      {actions.map((action) => (
        <li key={action.key}>
          <Link
            href={action.href}
            className={cn(
              "ds-focus flex min-h-[3.25rem] flex-col gap-1 ds-glass-interactive rounded-lg p-4",
            )}
          >
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="text-brand-primary">{action.glyph}</span>
              <span className="text-body-compact font-semibold text-text-primary" dir="auto">{action.label}</span>
            </span>
            <span className="text-caption text-text-secondary" dir="auto">{action.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
