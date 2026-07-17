"use client";

// PHASE 87D.1 — desktop grouped public navigation (disclosure pattern, APG).
//
// Five group buttons (Platform / Intelligence / Knowledge / Resources /
// Company) each toggling a panel of links. Accessibility contract:
//   - buttons carry aria-expanded + aria-controls; the open panel is a real
//     conditional render (nothing hidden-but-focusable in the DOM);
//   - Escape closes the open panel and restores focus to its trigger;
//   - outside pointerdown and focus leaving the nav close the panel;
//   - ArrowDown from a trigger opens and focuses the first link; Arrow keys
//     cycle within the panel;
//   - route change closes everything;
//   - current-page state: aria-current="page" on the active link and
//     aria-current="true" on its group trigger.
// RTL: logical positioning (start-0) mirrors panels automatically.

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/components/ds";
import { PUBLIC_NAV_GROUPS } from "./nav";

export function PublicNavMenus() {
  const t = useTranslations("publicSite.header");
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const baseId = useId();

  // Close when the route changes (after a link is activated).
  useEffect(() => {
    setOpen(null);
  }, [pathname]);

  // Outside pointerdown closes the open panel.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const isItemActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      ref={navRef}
      aria-label={t("navLabel")}
      className="ms-6 hidden lg:block"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          const trigger = document.getElementById(`${baseId}-btn-${open}`);
          setOpen(null);
          trigger?.focus();
        }
      }}
      onBlur={(e) => {
        // Focus left the whole nav → close (Tab past the last item).
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(null);
      }}
    >
      <ul className="flex items-center gap-1">
        {PUBLIC_NAV_GROUPS.map((group) => {
          const isOpen = open === group.groupKey;
          const groupActive = group.items.some((it) => isItemActive(it.href));
          const btnId = `${baseId}-btn-${group.groupKey}`;
          const panelId = `${baseId}-panel-${group.groupKey}`;
          return (
            <li key={group.groupKey} className="relative">
              <button
                id={btnId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-current={groupActive ? "true" : undefined}
                className={cn(
                  "ds-focus flex h-9 items-center gap-1.5 rounded-sm px-3 text-label font-medium",
                  "transition-colors duration-standard ease-hermes",
                  isOpen || groupActive
                    ? "text-text-primary"
                    : "text-text-secondary hover:text-text-primary",
                )}
                onClick={() => setOpen(isOpen ? null : group.groupKey)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setOpen(group.groupKey);
                    requestAnimationFrame(() =>
                      document.getElementById(panelId)?.querySelector("a")?.focus(),
                    );
                  }
                }}
              >
                {t(`groups.${group.groupKey}`)}
                <span
                  aria-hidden="true"
                  className={cn("text-[10px] leading-none transition-transform duration-fast", isOpen && "rotate-180")}
                >
                  ▾
                </span>
              </button>
              {isOpen ? (
                <div
                  id={panelId}
                  className={cn(
                    "absolute start-0 top-full z-50 mt-2 min-w-52 rounded-md border border-border-default",
                    "bg-surface-elevated p-1.5 shadow-e3",
                  )}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                    e.preventDefault();
                    const links = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("a"));
                    const idx = links.indexOf(document.activeElement as HTMLElement);
                    const next =
                      e.key === "ArrowDown"
                        ? links[(idx + 1) % links.length]
                        : links[(idx - 1 + links.length) % links.length];
                    next?.focus();
                  }}
                >
                  <ul className="flex flex-col">
                    {group.items.map((item) => {
                      const active = isItemActive(item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "ds-focus flex min-h-9 items-center whitespace-nowrap rounded-sm px-3 text-label",
                              "transition-colors duration-fast",
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
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
