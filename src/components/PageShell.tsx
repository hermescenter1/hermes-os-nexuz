import type { ReactNode } from "react";
import { SiteHeader }        from "./SiteHeader";
import { SiteFooter }        from "./SiteFooter";
import { AmbientBackground } from "./ui/AmbientBackground";

interface PageShellProps {
  children:    ReactNode;
  ambient?:    1 | 2 | 3;
  noAmbient?:  boolean;
}

export function PageShell({ children, ambient = 1, noAmbient }: PageShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-bg">
      {!noAmbient && <AmbientBackground intensity={ambient} />}
      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
