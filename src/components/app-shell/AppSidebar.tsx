"use client";

// PHASE 87C — Hermes application sidebar (Figma: Dashboard/Desktop Shell/Sidebar).
//
// Geometry from the inspected frame: expanded 264px on bg-surface-primary with
// border-inline-end; org/site context rows 36px on surface-interactive r6;
// search trigger 32px on background-base r6 with the ⌘K hint; group labels
// 11/600 muted uppercase; items 32px r6 — active = surface-interactive fill +
// 3×18px cyan start bar + primary 13/600 text. Collapsed mode is a 64px icon
// rail with portaled end-side tooltips. All layout uses LOGICAL utilities so a
// single markup mirrors under RTL (sidebar right, bar on the inline start).
//
// The groups arrive ALREADY role-filtered from the server (SiteHeader pattern:
// no flash, no client role fetch, no hydration mismatch). Visibility here is
// presentation only — middleware/route guards remain the security boundary.

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn, IconButton } from "@/components/ds";
import { activeAppNavHref, type AppNavGroup } from "@/lib/navigation/app-nav";
import { SideTooltip } from "./SideTooltip";
import { OrganizationSelector, SiteSelector } from "./OrganizationSelector";

const COLLAPSE_KEY = "hermes.appshell.sidebar.collapsed";

export interface AppSidebarProps {
  /** Role-filtered groups (server-resolved — never filter on the client). */
  groups: AppNavGroup[];
  organizationName?: string | null;
  siteName?: string | null;
  className?: string;
}

export function AppSidebar({ groups, organizationName, siteName, className }: AppSidebarProps) {
  const t = useTranslations("appShell");
  const locale = useLocale();
  const pathname = usePathname();
  const activeHref = activeAppNavHref(pathname, groups);

  const [collapsed, setCollapsed] = useState(false);
  // Persisted preference; read after mount so SSR markup stays deterministic.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {
      /* storage unavailable — keep default */
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const openPalette = () => window.dispatchEvent(new CustomEvent("hermes:command-palette"));

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-e border-border-default bg-surface-primary lg:flex",
        "transition-[width] duration-standard ease-hermes motion-reduce:transition-none",
        collapsed ? "w-16" : "w-[264px]",
        className,
      )}
    >
      {/* ── Brand mark ── */}
      <div className={cn("flex h-14 shrink-0 items-center", collapsed ? "justify-center" : "px-4")}>
        <Link
          href="/dashboard"
          className="ds-focus rounded-sm text-[16px] font-extrabold tracking-tight text-text-primary"
          aria-label="Hermes OS"
        >
          <span aria-hidden="true" className="text-brand-primary">◆</span>
          {!collapsed && <span className="ms-2">HERMES OS</span>}
        </Link>
      </div>

      {/* ── Workspace context (org / site) + search ── */}
      {!collapsed && (
        <div className="flex shrink-0 flex-col gap-2 px-4 pb-3">
          <OrganizationSelector name={organizationName} />
          <SiteSelector name={siteName} />
          <button
            type="button"
            onClick={openPalette}
            className={cn(
              "ds-focus flex h-8 w-full items-center gap-2 rounded-sm border border-border-default",
              "bg-background-base px-3 text-label text-text-muted transition-colors duration-fast",
              "hover:border-border-active hover:text-text-secondary",
            )}
          >
            <span className="flex-1 text-start">{t("shell.searchHint")}</span>
            <kbd dir="ltr" className="ds-code text-label-compact font-semibold text-text-muted">
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      {/* ── Primary navigation ── */}
      <nav
        aria-label={t("shell.primaryNavLabel")}
        className={cn("min-h-0 flex-1 overflow-y-auto pb-4", collapsed ? "px-2" : "px-4")}
      >
        {groups.map((group) => (
          <div key={group.groupKey} className="mt-4 first:mt-1">
            {collapsed ? (
              <div aria-hidden="true" className="mx-1 mb-2 border-t border-border-default" />
            ) : (
              <p className="mb-2 text-label-compact font-semibold uppercase tracking-wide text-text-muted">
                {t(`nav.groups.${group.groupKey}`)}
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => {
                const active = item.href === activeHref;
                const label = t(`nav.items.${item.labelKey}`);
                const link = (
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "ds-focus relative flex h-8 items-center rounded-sm text-label transition-colors duration-fast",
                      collapsed ? "justify-center" : "px-2.5",
                      active
                        ? "bg-surface-interactive font-semibold text-text-primary"
                        : "font-medium text-text-secondary hover:bg-surface-interactive hover:text-text-primary",
                    )}
                  >
                    {/* Active bar — 3×18 cyan on the inline start (Figma ActiveBar). */}
                    {active && !collapsed && (
                      <span aria-hidden="true" className="absolute inset-y-[7px] start-0 w-[3px] rounded-full bg-brand-primary" />
                    )}
                    {collapsed ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-xs border text-label-compact font-semibold",
                          active
                            ? "border-border-active bg-surface-interactive text-brand-primary"
                            : "border-border-default text-text-secondary",
                        )}
                      >
                        {[...label][0]}
                      </span>
                    ) : (
                      <span className={cn("truncate", active && "ps-2")}>{label}</span>
                    )}
                    {collapsed && <span className="sr-only">{label}</span>}
                  </Link>
                );
                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <SideTooltip content={label} enabled>
                        {link}
                      </SideTooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Collapse / expand control ── */}
      <div className={cn("shrink-0 border-t border-border-default p-2", !collapsed && "px-4")}>
        <IconButton
          aria-label={collapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar")}
          aria-expanded={!collapsed}
          variant="tertiary"
          size="md"
          onClick={toggleCollapsed}
          icon={
            // Chevron encodes "toward content" — flip for RTL via rtl: variants,
            // and for collapse state. Persian locale mirrors the direction.
            <span aria-hidden="true" className="inline-block">
              {(collapsed ? locale !== "fa" : locale === "fa") ? "»" : "«"}
            </span>
          }
          className="w-full"
        />
      </div>
    </aside>
  );
}
