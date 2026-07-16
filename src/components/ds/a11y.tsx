import type { ReactNode } from "react";
import { cn } from "./cn";
import { FOCUS_RING, describedBy } from "./logic";

/**
 * Accessibility foundation for the Hermes Design System (WCAG 2.2 AA).
 * FOCUS_RING and describedBy live in the JSX-free `logic` core and are
 * re-exported here for the component-facing surface.
 */
export { FOCUS_RING, describedBy };

/**
 * VisuallyHidden — content available to screen readers but not shown visually.
 * Uses Tailwind's built-in `sr-only` (already used elsewhere in the repo).
 */
export function VisuallyHidden({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("sr-only", className)}>{children}</span>;
}
