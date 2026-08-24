import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { noIndexMetadata } from "@/lib/seo/metadata";

/**
 * PHASE 107 — Multi-Site Intelligence on the canonical authenticated shell.
 *
 * The six routes under this segment rendered with NO chrome at all: no
 * sidebar, no topbar, no `<main>` landmark and therefore no way to navigate
 * anywhere else in the workspace once the user arrived. Middleware protected
 * them, so they were reachable only when signed in — which made the missing
 * navigation a dead end rather than a public-page simplification.
 *
 * The shell is added HERE rather than in each page so the segment cannot drift
 * again as routes are added, and so the pages themselves stay untouched: every
 * page already supplies its own `p-6` container, and AppShell's `<main>`
 * deliberately carries no padding of its own.
 *
 * Standard mode (sidebar + topbar) rather than engineering mode: these are
 * dense, sub-navigable operational dashboards whose sibling routes must remain
 * one click apart, not immersive full-bleed canvases.
 */
export const metadata = noIndexMetadata("Multi-Site Intelligence");

export default function MultiSiteLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
