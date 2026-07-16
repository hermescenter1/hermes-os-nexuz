import { cn } from "./cn";

export type SkeletonShape = "text" | "rect" | "circle";

const SHAPE: Record<SkeletonShape, string> = {
  text: "rounded-xs h-3.5",
  rect: "rounded-md",
  circle: "rounded-full",
};

export interface SkeletonProps {
  shape?: SkeletonShape;
  width?: number | string;
  height?: number | string;
  className?: string;
}

/**
 * Skeleton — loading placeholder using the `.ds-skeleton` shimmer (static under
 * prefers-reduced-motion). Decorative: mark the surrounding region aria-busy.
 */
export function Skeleton({ shape = "rect", width, height, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("ds-skeleton block", SHAPE[shape], className)}
      style={{ width, height }}
    />
  );
}
