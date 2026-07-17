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
}: {
  actions: SafeAction[];
  LinkComponent: React.ComponentType<{ href: string; className?: string; children: React.ReactNode }>;
}) {
  const Link = LinkComponent;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {actions.map((action) => (
        <li key={action.key}>
          <Link
            href={action.href}
            className={cn(
              "ds-focus flex min-h-[3.25rem] flex-col gap-1 rounded-md border border-border-default bg-surface-primary p-4",
              "transition-colors duration-fast hover:border-border-active hover:bg-surface-interactive",
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
