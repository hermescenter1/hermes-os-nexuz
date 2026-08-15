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
   */
  visualMode?: "standard" | "observatory";
}

export function PublicHeader({ visualMode = "standard" }: PublicHeaderProps = {}) {
  const t = useTranslations("publicSite.header");
  const observatory = visualMode === "observatory";

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
          observatory ? "hh-header" : "sticky top-0 z-40 border-b border-surface-glass-border ds-glass",
        )}
      >
        <PublicPageContainer className={cn("flex items-center gap-3", observatory ? "h-14 md:h-16" : "h-16")}>
          <PublicMobileNav />
          <Link
            href="/"
            aria-label={t("home")}
            dir="ltr"
            className="ds-focus flex shrink-0 items-center gap-2.5 rounded-sm"
          >
            <HermesLogoMark />
            <span className="text-title font-extrabold tracking-tight text-text-primary">
              Hermes <span className="text-brand-primary">OS</span>
            </span>
          </Link>
          {/* 87D.1 — grouped enterprise IA (client island: disclosure menus). */}
          <PublicNavMenus />
          <div className="ms-auto flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            <AuthIndicator />
            <NotificationCenter />
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
