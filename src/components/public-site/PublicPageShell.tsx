import type { ReactNode } from "react";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { PublicHeader } from "./PublicHeader";
import { PublicFooter } from "./PublicFooter";

// PHASE 87D (delta) — drop-in public shell adapter.
//
// Byte-compatible with the legacy PageShell contract (children / ambient /
// noAmbient) so a compatible PUBLIC route migrates by swapping one import —
// no page-body rewrites. Renders the canonical 87D PublicHeader/PublicFooter
// and the skip-link target (<main id="public-content">) instead of the legacy
// SiteHeader/SiteFooter. PageShell itself is intentionally untouched: it
// remains the wrapper for authenticated/dashboard consumers and the
// RequireCapability fallback states, which must NOT receive the public shell.

export interface PublicPageShellProps {
  children:   ReactNode;
  ambient?:   1 | 2 | 3;
  noAmbient?: boolean;
}

export function PublicPageShell({ children, ambient = 1, noAmbient }: PublicPageShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background-base">
      {!noAmbient && <AmbientBackground intensity={ambient} />}
      <div className="relative z-10 flex min-h-screen flex-col">
        <PublicHeader />
        <main id="public-content" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <PublicFooter />
      </div>
    </div>
  );
}
