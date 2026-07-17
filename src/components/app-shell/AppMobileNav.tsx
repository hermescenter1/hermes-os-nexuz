"use client";

// PHASE 87C — mobile navigation: hamburger trigger + ds Drawer (side="start").
//
// Task-focused mobile shell per the Figma mobile frames: the drawer carries the
// grouped navigation with the workspace context on top; it closes on route
// change, Escape, and backdrop (ds Drawer provides focus trap/restore and
// body-scroll lock). Touch targets ≥44px (IconButton lg, 44px rows).

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn, Drawer, IconButton } from "@/components/ds";
import { activeAppNavHref, type AppNavGroup } from "@/lib/navigation/app-nav";
import { OrganizationSelector, SiteSelector } from "./OrganizationSelector";

export interface AppMobileNavProps {
  groups: AppNavGroup[];
  organizationName?: string | null;
  siteName?: string | null;
}

export function AppMobileNav({ groups, organizationName, siteName }: AppMobileNavProps) {
  const t = useTranslations("appShell");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const activeHref = activeAppNavHref(pathname, groups);

  // Close when the route changes (after a nav link is tapped).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <IconButton
        aria-label={t("shell.openMenu")}
        aria-expanded={open}
        variant="tertiary"
        size="lg"
        className="lg:hidden"
        onClick={() => setOpen(true)}
        icon={<span aria-hidden="true">☰</span>}
      />
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="start"
        width={320}
        title={t("shell.mobileNavTitle")}
      >
        <div className="-m-1 flex flex-col gap-2 pb-2">
          <OrganizationSelector name={organizationName} />
          <SiteSelector name={siteName} />
        </div>
        <nav aria-label={t("shell.primaryNavLabel")}>
          {groups.map((group) => (
            <div key={group.groupKey} className="mt-4">
              <p className="mb-1 text-label-compact font-semibold uppercase tracking-wide text-text-muted">
                {t(`nav.groups.${group.groupKey}`)}
              </p>
              <ul className="flex flex-col">
                {group.items.map((item) => {
                  const active = item.href === activeHref;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "ds-focus flex min-h-11 items-center rounded-sm px-2.5 text-body transition-colors duration-fast",
                          active
                            ? "bg-surface-interactive font-semibold text-text-primary"
                            : "text-text-secondary hover:bg-surface-interactive hover:text-text-primary",
                        )}
                      >
                        {t(`nav.items.${item.labelKey}`)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </Drawer>
    </>
  );
}
