import type { ReactNode } from "react";
import { cn } from "./cn";
import { badgeVariants, type BadgeVariant } from "./logic";

export { badgeVariants };
export type { BadgeVariant };

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = "neutral", children, className }: BadgeProps) {
  return <span className={cn(badgeVariants(variant), className)}>{children}</span>;
}
