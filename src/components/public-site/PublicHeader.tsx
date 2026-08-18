// PHASE 87D — premium public-site header (server component).
//
// Figma: 64px sticky glass bar — logo, five flat nav items, then the action
// cluster (auth indicator · notifications · language · "Request a Demo").
// The auth/notification/language islands are the EXISTING public components
// reused as-is so signed-in behavior on marketing pages stays byte-identical
// to the legacy SiteHeader. The skip link is the public surface's first
// (WCAG 2.4.1); pages provide the <main id="public-content"> target.

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ds";
// Deep import: the ds barrel re-exports buttonVariants through the client
// Button module, which a Server Component must not CALL — the JSX-free logic
// core is the server-safe path (same precedent as the 87C overlay import).
import { buttonVariants } from "@/components/ds/logic";
import { HermesLogoMark } from "@/components/HermesLogo";
import { AuthIndicator } from "@/components/auth/AuthIndicator";
import { NotificationCenter } from "@/components/NotificationCenter";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { PublicPageContainer } from "./PublicPageContainer";
import { PublicMobileNav } from "./PublicMobileNav";
import { PublicNavMenus } from "./PublicNavMenus";

export interface PublicHeaderProps {
  /**
   * PHASE 104-E — which shell treatment this route's header renders.
   *
   * `"standard"` is the shipped 87D glass bar and stays the DEFAULT, because
   * every public route shares this header. The homepage opts in explicitly, so
   * the Observatory treatment cannot leak into the Journal, Platform, Services
   * or any other surface before those are redesigned and approved.
   *
   * `"observatory"` drops the opaque glass fill and the hard bottom border so
   * the bar reads as an instrument rail floating INSIDE the hero's deep field
   * instead of a strip pasted across it — the "old header cuts the hero"
   * defect from the first visual review. Height, contents, focus order,
   * landmarks and the skip link are all unchanged; a soft scrim keeps text
   * legible once content scrolls underneath.
   *
   * PHASE 104-F — `"journal"` is the Industrial Journal masthead rail: the
   * same sticky bar, but ruled like a publication's running head (a heavy top
   * rule and a hairline below) on the page ground rather than glass. It is
   * opted into ONLY by the public Journal reading shell; the default remains
   * `"standard"`, and Observatory remains the homepage's alone. A third mode
   * was chosen over overloading `observatory` because the two surfaces are
   * different publications and must be able to diverge without coupling.
   */
  visualMode?: "standard" | "observatory" | "journal";
}

export function PublicHeader({ visualMode = "standard" }: PublicHeaderProps = {}) {
  const t = useTranslations("publicSite.header");
  const observatory = visualMode === "observatory";
  const journal = visualMode === "journal";

  return (
    <>
      <a
        href="#public-content"
        className={cn(
          "sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[110]",
          "focus:rounded-sm focus:bg-brand-primary focus:px-4 focus:py-2",
          "focus:text-label focus:font-semibold focus:text-brand-on-brand",
        )}
      >
        {t("skipToContent")}
      </a>
      <header
        data-visual-mode={visualMode}
        className={cn(
          // Observatory: `.hh-header` is a thin instrument rail — coordinate
          // ticks and an Edge rule along its bottom continue the hero plate,
          // and it compacts with a scrim as the page scrolls (scroll-driven
          // CSS where supported, static scrim otherwise). Same height, same
          // contents, same focus order and landmarks as the standard bar.
          observatory
            ? "hh-header"
            : journal
              ? "hj-header"
              : "sticky top-0 z-40 border-b border-surface-glass-border ds-glass",
        )}
      >
        {/* PHASE 104-H (owner decision C) — 320px budget of this row, measured on the
            production build: gutter 20 + trigger 44 + logo (32 emblem + gap + 53
            wordmark) + auth 49–56 + bell 44 + language 44 + gutter 20. With every
            target at 44px the only levers that keep an ≥8px logical inset to the
            viewport edge WITHOUT hiding or shrinking a control are the small-screen
            gaps: container 12→4, cluster 6→4 and the emblem/wordmark gap 10→8, all
            below `sm` only (`sm:` restores the approved values). Result: 310px used,
            10px inset (en/de), 18px (fa). No overflow rule, no clipping, no
            locale-specific CSS. */}
        <PublicPageContainer className={cn("flex items-center gap-1 sm:gap-3", observatory ? "h-14 md:h-16" : "h-16")}>
          <PublicMobileNav />
          <Link
            href="/"
            aria-label={t("home")}
            dir="ltr"
            className="ds-focus flex min-h-11 shrink-0 items-center gap-2 rounded-sm sm:gap-2.5"
          >
            <HermesLogoMark />
            <span className="text-title font-extrabold tracking-tight text-text-primary">
              Hermes <span className="text-brand-primary">OS</span>
            </span>
          </Link>
          {/* 87D.1 — grouped enterprise IA (client island: disclosure menus). */}
          <PublicNavMenus />
          <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2.5">
            <AuthIndicator />
            {/* same scoped 44px hit-target wrapper as the app-shell / legacy headers;
                the shared NotificationCenter itself is untouched. */}
            <span className="hermes-topbar-bell inline-flex">
              <NotificationCenter />
            </span>
            <LanguageSwitch />
            <Link href="/demo" className={cn(buttonVariants("primary", "md"), "hidden sm:inline-flex")}>
              {t("requestDemo")}
            </Link>
          </div>
        </PublicPageContainer>
      </header>
    </>
  );
}
