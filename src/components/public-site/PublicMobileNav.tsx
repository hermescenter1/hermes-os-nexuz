"use client";

// PHASE 87D — public-site mobile navigation: hamburger trigger + ds Drawer
// (side="start", full focus trap / Escape / focus restore via the ds overlay
// behavior, body-scroll lock). Mirrors the 87C AppMobileNav contract: closes
// on route change, Escape, and backdrop; touch targets ≥44px.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn, Drawer, IconButton, buttonVariants } from "@/components/ds";
import { PUBLIC_NAV_ITEMS } from "./nav";

export function PublicMobileNav() {
  const t = useTranslations("publicSite.header");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close when the route changes (after a nav link is tapped).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <IconButton
        aria-label={t("menuOpen")}
        aria-expanded={open}
        variant="tertiary"
        size="lg"
        className="lg:hidden"
        onClick={() => setOpen(true)}
        icon={<span aria-hidden="true">☰</span>}
      />
      <Drawer open={open} onClose={() => setOpen(false)} side="start" width={320}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-title-lg font-semibold text-text-primary">{t("menuTitle")}</p>
          <IconButton
            aria-label={t("menuClose")}
            variant="tertiary"
            size="lg"
            onClick={() => setOpen(false)}
            icon={<span aria-hidden="true">✕</span>}
          />
        </div>
        <nav aria-label={t("navLabel")} className="mt-4">
          <ul className="flex flex-col gap-0.5">
            {PUBLIC_NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
                    {t(`nav.${item.labelKey}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <Link href="/demo" className={cn(buttonVariants("primary", "lg"), "mt-6 w-full")}>
          {t("requestDemo")}
        </Link>
      </Drawer>
    </>
  );
}
