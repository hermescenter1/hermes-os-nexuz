import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "./cn";
import { cardVariants, type CardVariant } from "./logic";

export { cardVariants };
export type { CardVariant };

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  /** Apply the default card padding (--space-card, 20px). Default true. */
  padded?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = "standard", padded = true, className, ...props },
  ref,
) {
  return <div ref={ref} className={cn(cardVariants(variant, { padded }), className)} {...props} />;
});
