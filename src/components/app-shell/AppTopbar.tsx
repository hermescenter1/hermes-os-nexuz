// PHASE 87C — application top bar (server component composing client islands).
//
// Figma: 56px on surface-primary with border-b; breadcrumb at the start, end
// cluster = notifications · language · avatar (32px). The bar is stable across
// modules and accepts page-provided `actions` (a slot) without knowing any
// product logic. Interactive pieces are small client islands; everything else
// renders on the server.

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/components/ds";
import type { AppNavGroup } from "@/lib/navigation/app-nav";
import { AppBreadcrumbs } from "./AppBreadcrumbs";
import { AppMobileNav } from "./AppMobileNav";
import { AppNotificationCenter } from "./AppNotificationCenter";
import { AppUserMenu } from "./AppUserMenu";
import { SearchTrigger } from "./SearchTrigger";

export interface AppTopbarProps {
  groups: AppNavGroup[];
  user: { name: string; email?: string | null; role?: string | null } | null;
  organizationName?: string | null;
  siteName?: string | null;
  /** Page-provided actions slot (product-agnostic). */
  actions?: ReactNode;
}

export async function AppTopbar({ groups, user, organizationName, siteName, actions }: AppTopbarProps) {
  const t = await getTranslations("appShell.shell");

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border-default",
        "bg-surface-primary px-4 md:px-6",
      )}
    >
      <AppMobileNav groups={groups} organizationName={organizationName} siteName={siteName} />
      <AppBreadcrumbs groups={groups} className="hidden md:block" />
      <div className="min-w-0 flex-1" />
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      <SearchTrigger label={t("search")} />
      <AppNotificationCenter />
      {user ? <AppUserMenu name={user.name} email={user.email} role={user.role} /> : null}
    </header>
  );
}
