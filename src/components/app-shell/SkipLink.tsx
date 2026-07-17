// PHASE 87C — skip-to-content link (the app's first). Visually hidden until
// keyboard-focused; targets the shell's <main id="app-content">. Plain sync
// component (label injected) so it is directly testable under jsdom.

import { cn } from "@/components/ds";

export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#app-content"
      className={cn(
        "sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[120]",
        "focus:rounded-sm focus:bg-brand-primary focus:px-4 focus:py-2",
        "focus:text-label focus:font-semibold focus:text-brand-on-brand",
      )}
    >
      {label}
    </a>
  );
}
