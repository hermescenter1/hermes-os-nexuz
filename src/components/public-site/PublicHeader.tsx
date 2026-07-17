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
import { PUBLIC_NAV_ITEMS } from "./nav";
import { PublicPageContainer } from "./PublicPageContainer";
import { PublicMobileNav } from "./PublicMobileNav";

export function PublicHeader() {
  const t = useTranslations("publicSite.header");

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
      <header className="sticky top-0 z-40 border-b border-surface-glass-border ds-glass">
        <PublicPageContainer className="flex h-16 items-center gap-3">
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
          <nav aria-label={t("navLabel")} className="ms-6 hidden lg:block">
            <ul className="flex items-center gap-6">
              {PUBLIC_NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "ds-focus rounded-sm text-label font-medium text-text-secondary",
                      "transition-colors duration-standard ease-hermes hover:text-text-primary",
                    )}
                  >
                    {t(`nav.${item.labelKey}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ms-auto flex shrink-0 items-center gap-2.5">
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
