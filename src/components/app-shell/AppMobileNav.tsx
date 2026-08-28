"use client";

// PHASE 87C — mobile navigation: hamburger trigger + ds Drawer (side="start").
//
// Task-focused mobile shell per the Figma mobile frames: the drawer carries the
// grouped navigation with the workspace context on top; it closes on route
// change, Escape, and backdrop (ds Drawer provides focus trap/restore and
// body-scroll lock). Touch targets ≥44px (IconButton lg, 44px rows).
//
// PHASE 104-H — closure, not redesign:
//   · the trigger now names the panel it controls (aria-controls), so AT can
//     announce and jump to the drawer; the id is generated once with useId and
//     shared with the ds Drawer, which is what keeps SSR and client markup
//     identical (no hydration diff);
//   · the active destination carries a STRUCTURAL Beacon (the
//     .hermes-mobile-nav-item[aria-current] inline-start bar) in addition to
//     aria-current, surface lift and weight — colour is never the only channel;
//   · selecting a destination closes the drawer immediately, including the
//     already-active one (the pathname effect alone could not close that case);
//   · the trigger stays a single IconButton: accessible name, aria-expanded,
//     44×44, no nested interactive element. Focus in/trap/Escape/restore stay
//     in the ds primitive; nothing is re-implemented here.

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn, Drawer, IconButton } from "@/components/ds";
import { activeAppNavHref, type AppNavGroup } from "@/lib/navigation/app-nav";
import { OrganizationSelector, SiteSelector } from "./OrganizationSelector";

export interface AppMobileNavProps {
  groups: AppNavGroup[];
  organizationName?: string | null;
  organizationUnavailable?: boolean;
  siteName?: string | null;
}

export function AppMobileNav({ groups, organizationName, organizationUnavailable, siteName }: AppMobileNavProps) {
  const t = useTranslations("appShell");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
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
        aria-controls={panelId}
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
        id={panelId}
      >
        <div className="-m-1 flex flex-col gap-2 pb-2">
          <OrganizationSelector name={organizationName} unavailable={organizationUnavailable} />
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
                        onClick={() => setOpen(false)}
                        className={cn(
                          "hermes-mobile-nav-item ds-focus flex min-h-11 items-center rounded-sm ps-3 pe-2.5 text-body transition-colors duration-fast motion-reduce:transition-none",
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
