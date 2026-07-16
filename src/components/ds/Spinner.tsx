import { cn } from "./cn";

/**
 * Spinner — minimal indeterminate ring used by loading buttons/states.
 * `currentColor` so it inherits the surrounding text colour. Decorative:
 * callers own the aria-busy / status text.
 */
export function Spinner({
  className,
  size = 14,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
