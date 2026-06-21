import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitch } from "./LanguageSwitch";
import { SiteNav } from "./SiteNav";
import { AuthIndicator } from "./auth/AuthIndicator";
import { HermesLogoMark } from "./HermesLogo";

/**
 * Site-wide header.
 *
 * Layout strategy:
 *   justify-between on the outer flex puts the logo on the logical inline-start
 *   and the nav+action cluster on the logical inline-end.
 *
 *   /en (ltr inherited from <html dir="ltr">):
 *     [Logo ←]  ···  [Nav | · | Sign In  Language →]
 *
 *   /fa (rtl inherited from <html dir="rtl">):
 *     [← Language  Sign In | · | Nav]  ···  [Logo →]
 *
 *   The logo link carries dir="ltr" explicitly so the logomark is always
 *   to the LEFT of the brand text regardless of page direction.
 */
export function SiteHeader() {
  const b = useTranslations("brand");

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-4">

        {/* Logo — force ltr so mark always precedes brand text */}
        <Link
          href="/"
          dir="ltr"
          className="group flex shrink-0 items-center gap-2.5 leading-none"
          aria-label="Hermes OS — home"
        >
          <HermesLogoMark className="h-8 w-8 shrink-0" />
          <span className="flex flex-col">
            <span className="font-display text-lg font-bold tracking-tight">
              <span className="text-signal">Hermes</span>
              <span className="text-muted"> OS</span>
            </span>
            <span className="font-body text-[0.6rem] font-medium leading-none text-muted/70">
              {b("tagline")}
            </span>
          </span>
        </Link>

        {/* Nav + action cluster — sits at the inline-end (justify-between) */}
        <div className="flex items-center gap-3">
          {/* Desktop nav / mobile hamburger */}
          <SiteNav />

          {/* Thin separator — desktop only */}
          <div
            className="hidden h-5 w-px shrink-0 bg-line/50 md:block"
            aria-hidden="true"
          />

          {/* Sign In + Language switcher */}
          <div className="flex shrink-0 items-center gap-2">
            <AuthIndicator />
            <LanguageSwitch />
          </div>
        </div>

      </div>
    </header>
  );
}
