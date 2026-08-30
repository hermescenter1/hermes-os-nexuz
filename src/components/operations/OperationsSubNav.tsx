"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";

/**
 * PHASE 104-I.D2 — Operations family navigation.
 *
 * Gate A.1 §3A. At 320–390px the rail overflowed and the ACTIVE tab could sit
 * outside the visible strip, so "ALARM CENTER" read as "ALARM CEN" and the user
 * had no way to tell which surface they were on. Three things fix that, and
 * none of them shrinks the label:
 *
 *   1. the rail owns its own horizontal scroll, so the page never scrolls;
 *   2. the active tab is scrolled into view on mount and on navigation;
 *   3. an edge fade signals that the strip continues.
 *
 * Labels are never truncated or ellipsised — a half-read destination is worse
 * than one the user must scroll to.
 */
const TABS = [
  { href: "/dashboard/operations", key: "globalOps", routeId: "global-ops" },
  { href: "/dashboard/operations/sites", key: "siteMonitor", routeId: "sites" },
  { href: "/dashboard/operations/alerts", key: "alertCenter", routeId: "alerts" },
  { href: "/dashboard/operations/intelligence", key: "intelligence", routeId: "intelligence" },
  { href: "/dashboard/operations/war-room", key: "warRoom", routeId: "war-room" },
] as const;

/**
 * Gate A.1.1 §4 — stable capture instrumentation.
 *
 * The Gate A.1 harness selected the rail with `nav[aria-label]`, which returns
 * the FIRST labelled nav in the document — the AppShell sidebar. Every rail
 * measurement was therefore taken against the wrong element, and the Alarm
 * Center rows recorded their active tab as "Operations Center" (a sidebar item)
 * instead of "ALARM CENTER". "Active tab fully visible" was true of something
 * nobody was asking about.
 *
 * These attributes give the rail and its tabs an identity that cannot be
 * confused with any other navigation, and a route id that is stable across
 * locales so the expected active tab can be asserted without matching
 * translated text.
 */
export const OPERATIONS_RAIL_ATTR = "data-phase104-operations-rail";
export const OPERATIONS_TAB_ATTR = "data-phase104-operations-tab";

export function OperationsSubNav() {
  const pathname = usePathname();
  const t = useTranslations("dashboard.operations.nav");
  const railRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  const isActive = (href: string) =>
    href === "/dashboard/operations"
      ? pathname === "/dashboard/operations"
      : pathname.startsWith(href);

  useEffect(() => {
    const rail = railRef.current;
    const active = activeRef.current;
    if (!rail || !active) return;

    // Scroll the RAIL, never the page: `scrollIntoView` would also scroll the
    // document and fight the layout. Direction-agnostic, so it behaves the same
    // under RTL.
    const railBox = rail.getBoundingClientRect();
    const tabBox = active.getBoundingClientRect();
    const overflowsRight = tabBox.right > railBox.right;
    const overflowsLeft = tabBox.left < railBox.left;
    if (!overflowsRight && !overflowsLeft) return;

    // Overshoot generously; the rail clamps to its own scroll range, so a
    // larger margin can only help the tab clear the edge.
    const delta = overflowsRight
      ? tabBox.right - railBox.right + 24
      : tabBox.left - railBox.left - 24;
    rail.scrollBy({ left: delta, behavior: "auto" });
  }, [pathname]);

  return (
    // The fade is decorative and sits on a wrapper so it cannot scroll away with
    // the content, and cannot intercept a tap.
    <div className="relative mb-6">
      {/*
        `pe-2` matters: at maximum scroll the last tab's trailing edge landed
        flush against the rail's own edge, and rounding left ~0.5px of it outside
        the visible strip (measured 99.57% for the German "LAGEZENTRUM"). A small
        trailing pad extends scrollWidth so the final tab clears the edge
        completely rather than almost.
      */}
      <nav
        ref={railRef}
        {...{ [OPERATIONS_RAIL_ATTR]: "true" }}
        className="flex items-center gap-0 overflow-x-auto overscroll-x-contain border-b border-line pe-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={t("label")}
      >
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              ref={active ? activeRef : undefined}
              aria-current={active ? "page" : undefined}
              {...{ [OPERATIONS_TAB_ATTR]: tab.routeId }}
              data-phase104-operations-tab-active={active ? "true" : "false"}
              className={
                "inline-flex min-h-11 flex-shrink-0 items-center whitespace-nowrap border-b-2 px-4 transition-colors " +
                (active
                  ? "border-signal text-signal"
                  : "border-transparent text-muted hover:text-ink")
              }
            >
              <span className="kpi-label">{t(tab.key)}</span>
            </Link>
          );
        })}
      </nav>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 end-0 w-8 bg-gradient-to-l from-bg to-transparent rtl:bg-gradient-to-r"
      />
    </div>
  );
}
