import type { ReactNode } from "react";
import { cn } from "@/components/ds";

// PHASE 87D — centered public-site content column: 1248px per the Figma
// handoff (1440 − 2×96 margins), with responsive gutters below that width.

export interface PublicPageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PublicPageContainer({ children, className }: PublicPageContainerProps) {
  return <div className={cn("mx-auto w-full max-w-[78rem] px-5 md:px-10", className)}>{children}</div>;
}
