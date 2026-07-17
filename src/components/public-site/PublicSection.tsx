import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/components/ds";

// PHASE 87D — public-site section band. Tones map to the 87B background
// tokens the Figma frames alternate between (#071018 base / #040A0F deep /
// #0C1720 raised); padding steps cover full sections vs. thin strips.

export type PublicSectionTone = "base" | "deep" | "raised";
export type PublicSectionPadding = "default" | "compact" | "none";

const TONES: Record<PublicSectionTone, string> = {
  base:   "bg-background-base",
  deep:   "bg-background-deep",
  raised: "bg-surface-primary",
};

const PADDINGS: Record<PublicSectionPadding, string> = {
  default: "py-14 md:py-20",
  compact: "py-6 md:py-8",
  none:    "",
};

export interface PublicSectionProps extends ComponentPropsWithoutRef<"section"> {
  tone?: PublicSectionTone;
  padding?: PublicSectionPadding;
}

export function PublicSection({
  tone = "base",
  padding = "default",
  className,
  children,
  ...rest
}: PublicSectionProps) {
  return (
    <section className={cn(TONES[tone], PADDINGS[padding], className)} {...rest}>
      {children}
    </section>
  );
}
