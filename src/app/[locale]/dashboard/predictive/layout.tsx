import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { noIndexMetadata } from "@/lib/seo/metadata";

/**
 * PHASE 107 — Predictive Maintenance on the canonical authenticated shell.
 *
 * Same defect as the multi-site segment: five signed-in routes with no
 * sidebar, no topbar and no `<main>` landmark. The pages are READ/ANALYZE-only
 * surfaces (no control commands), and nothing about that intent required them
 * to be rendered without navigation.
 *
 * Added at the segment root so the overview and its four sub-pages share one
 * shell instance; each page already provides its own padded container.
 */
export const metadata = noIndexMetadata("Predictive Maintenance");

export default function PredictiveLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
