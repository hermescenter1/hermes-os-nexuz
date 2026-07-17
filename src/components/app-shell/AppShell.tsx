// PHASE 87C — the canonical authenticated Hermes application shell.
//
// SERVER component: resolves the current user once (getCurrentUser, same
// try/catch pattern as SiteHeader), filters the nav registry by role
// server-side (no flash, no client role fetch), and composes the layout:
//
//   standard mode (Figma Dashboard/Desktop):
//     [ AppSidebar 264px | AppTopbar 56px / <main> ]  on bg-background-base
//   engineering mode (Figma IndustrialBrain topbar):
//     56px deep topbar (title · slot · exit) over full-bleed content on
//     bg-background-deep — for Industrial Brain / Knowledge Graph / Digital
//     Twin class workspaces. No sidebar; context is preserved by the exit link.
//
// Security: the shell performs NO authorization. Middleware + existing route
// guards stay the enforcement boundary; the shell only presents what the
// middleware policy already authorizes (registry-derived visibility).
//
// Organization/site context: no client-facing org/site listing or switching
// backend exists (87C audit) — the selectors render their honest empty state
// until a later phase supplies data. Nothing is fabricated.

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { visibleAppNavGroups } from "@/lib/navigation/app-nav";
import { Link } from "@/i18n/navigation";
import { AppSidebar } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";
import { AppCommandPalette } from "./AppCommandPalette";
import { SkipLink } from "./SkipLink";

export interface AppShellProps {
  children: ReactNode;
  /** "standard" (sidebar + topbar) or "engineering" (full-screen workspace). */
  mode?: "standard" | "engineering";
  /** Engineering mode: workspace title shown in the deep topbar. */
  workspaceTitle?: ReactNode;
  /** Engineering mode: where the exit control returns to. Default /dashboard. */
  exitHref?: string;
  /** Topbar page-actions slot (standard) / topbar end slot (engineering). */
  topbarActions?: ReactNode;
}

export async function AppShell({
  children,
  mode = "standard",
  workspaceTitle,
  exitHref = "/dashboard",
  topbarActions,
}: AppShellProps) {
  const t = await getTranslations("appShell.shell");

  // Same resilience pattern as SiteHeader: an auth hiccup must never take the
  // shell down — it degrades to a signed-out presentation (middleware already
  // gated the route itself).
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }
  const groups = visibleAppNavGroups(user?.role ?? null);

  // No org/site context backend is available to the shell yet (see header note).
  const organizationName: string | null = null;
  const siteName: string | null = null;

  const skipLink = <SkipLink label={t("skipToContent")} />;

  if (mode === "engineering") {
    return (
      <div className="flex min-h-screen flex-col bg-background-deep text-text-primary">
        {skipLink}
        <header
          aria-label={t("engineeringModeLabel")}
          className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border-default bg-background-deep px-6"
        >
          <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-text-primary">
            <span aria-hidden="true" className="text-brand-primary">◆ </span>
            {workspaceTitle}
          </p>
          {topbarActions ? <div className="flex shrink-0 items-center gap-2">{topbarActions}</div> : null}
          <Link
            href={exitHref}
            className="ds-focus shrink-0 rounded-sm text-label font-medium text-text-secondary transition-colors duration-fast hover:text-text-primary"
          >
            <span aria-hidden="true">✕ </span>
            {t("exitEngineering")}
          </Link>
        </header>
        <main id="app-content" tabIndex={-1} className="min-h-0 flex-1 outline-none">
          {children}
        </main>
        <AppCommandPalette groups={groups} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-base text-text-primary">
      {skipLink}
      <div className="flex">
        <AppSidebar groups={groups} organizationName={organizationName} siteName={siteName} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <AppTopbar
            groups={groups}
            user={user ? { name: user.name, email: user.email, role: user.role } : null}
            organizationName={organizationName}
            siteName={siteName}
            actions={topbarActions}
          />
          <main id="app-content" tabIndex={-1} className="min-h-0 flex-1 outline-none">
            {children}
          </main>
        </div>
      </div>
      <AppCommandPalette groups={groups} />
    </div>
  );
}
