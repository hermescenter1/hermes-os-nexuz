/**
 * PHASE 109-C-UI.2 — the Live Operations shell.
 *
 * WHY THIS FILE EXISTS (adversarial loop 3, D-18).
 *
 * A new folder under `src/app/[locale]` inherits only the root locale layout —
 * `<html>`, `<body>`, the consent banner. It gets NO sidebar, NO topbar, NO skip
 * link and no way back. The page shipped that way through two review loops: it
 * rendered correctly and was completely unreachable except by typing the URL,
 * and once open there was nothing to click to leave. Every sibling operational
 * module (assets, cmms, erp, automation, engineering) sits on a shell; this one
 * was about to become the 25th chrome-less authenticated route in the estate.
 *
 * NO `RequireCapability` HERE, DELIBERATELY.
 *
 * The neighbouring layouts wrap themselves in `RequireCapability("authoring")`.
 * Copying that would put a SECOND, differently-shaped gate in front of a page
 * that already proves `view_industrial` against a resolved tenant context — and
 * the two would answer different questions, so the weaker one would silently
 * become the boundary. Authorization stays where it is enforced: middleware,
 * then the page. This layout is chrome, and `AppShell` performs no
 * authorization of its own by design.
 */

import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";

import { AppShell } from "@/components/app-shell";

export default async function LiveOperationsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Standard mode, not "engineering": this is a monitoring surface a reader
  // moves through — to the site, the asset, the alarm centre — not a full-bleed
  // workspace they enter and exit. Removing the sidebar here would cost them
  // exactly the navigation the page's evidence links assume.
  return <AppShell>{children}</AppShell>;
}
