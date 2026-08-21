import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { noIndexMetadata } from "@/lib/seo/metadata";

/**
 * PHASE 107 — Knowledge Engine on the canonical authenticated shell.
 *
 * This segment was half-shelled: the overview page wrapped ITSELF in AppShell
 * (Phase 87C) while its four sub-pages — articles, cases, failures,
 * procedures — rendered bare. Clicking a module card therefore dropped the
 * user out of the workspace frame entirely.
 *
 * Hoisting the shell to the segment root fixes all five at once and makes the
 * inconsistency structurally impossible to reintroduce. The overview's own
 * `<AppShell>` wrapper is removed in the same change — leaving it would nest
 * two shells, producing two sidebars and two topbars.
 */
export const metadata = noIndexMetadata("Knowledge Engine");

export default function KnowledgeLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
