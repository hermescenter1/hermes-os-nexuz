import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { noIndexMetadata } from "@/lib/seo/metadata";

/**
 * PHASE 107 — Industrial Knowledge Graph on the canonical authenticated shell.
 *
 * These five routes rendered bare while their SIBLINGS under
 * /dashboard/industrial (assets, sites, telemetry, connectors, gateways) each
 * wrapped themselves in a shell — so moving between two pages of the same
 * module changed the entire page frame. The shell is attached at this segment
 * root, which is the narrowest point that covers all five without touching the
 * siblings' own arrangement.
 *
 * Standard mode is used deliberately. AppShell's engineering mode names the
 * knowledge graph as an intended consumer, but that mode drops the sidebar in
 * favour of a single exit link, and these pages are card-and-list dashboards
 * that navigate between each other constantly. Engineering mode remains
 * available for a genuinely immersive graph canvas if one is built later.
 */
export const metadata = noIndexMetadata("Industrial Knowledge Graph");

export default function KnowledgeGraphLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
