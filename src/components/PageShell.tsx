import type { ReactNode } from "react";
import { SiteHeader }        from "./SiteHeader";
import { SiteFooter }        from "./SiteFooter";
import { AmbientBackground } from "./ui/AmbientBackground";

interface PageShellProps {
  children:    ReactNode;
  ambient?:    1 | 2 | 3;
  noAmbient?:  boolean;
  /**
   * PHASE 93 — opt-in horizontal-overflow guard. `overflow-x: clip` (NOT hidden,
   * so the sticky header keeps working) prevents any descendant — e.g. the
   * shared marketing header's edge on a narrow viewport — from producing a
   * horizontal scrollbar. Opt-in so only the pages that request it are affected.
   */
  clipX?: boolean;
}

export function PageShell({ children, ambient = 1, noAmbient, clipX }: PageShellProps) {
  return (
    <div className={`relative flex min-h-screen flex-col bg-bg${clipX ? " overflow-x-clip" : ""}`}>
      {!noAmbient && <AmbientBackground intensity={ambient} />}
      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
