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
  /**
   * PHASE 104-I1 — chrome treatment for this route. `"standard"` stays the
   * DEFAULT for every public route; the Company family (About, Contact,
   * Careers, Demo) opts into `"company"` explicitly, exactly as Observatory
   * and Journal opt into theirs. Header and footer receive the same value so
   * a surface can never open in one mode and close in another.
   */
  visualMode?: "standard" | "company";
}

export function PublicPageShell({ children, ambient = 1, noAmbient, visualMode = "standard" }: PublicPageShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background-base">
      {!noAmbient && <AmbientBackground intensity={ambient} />}
      <div className="relative z-10 flex min-h-screen flex-col">
        <PublicHeader visualMode={visualMode} />
        <main id="public-content" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <PublicFooter />
      </div>
    </div>
  );
}
