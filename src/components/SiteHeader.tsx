import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitch } from "./LanguageSwitch";
import { SiteNav } from "./SiteNav";
import { AuthIndicator } from "./auth/AuthIndicator";
import { HermesLogoMark } from "./HermesLogo";
import { NotificationCenter } from "./NotificationCenter";

export function SiteHeader() {
  const b = useTranslations("brand");

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center px-6 py-4">

        {/* Logo — inner span carries dir="ltr" so the logomark is always visually left of the text */}
        <Link
          href="/"
          className="group shrink-0 leading-none"
          aria-label="Hermes OS — home"
        >
          <span className="flex items-center gap-2.5" dir="ltr">
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
          </span>
        </Link>

        {/* Nav + action cluster — ms-auto pushes it to the logical inline-end in both LTR and RTL */}
        <div className="ms-auto flex items-center gap-3">
          {/* Desktop nav / mobile hamburger */}
          <SiteNav />

          {/* Thin separator — desktop only */}
          <div
            className="hidden h-5 w-px shrink-0 bg-line/50 md:block"
            aria-hidden="true"
          />

          {/* Sign In + Notifications + Language switcher */}
          <div className="flex shrink-0 items-center gap-2">
            <AuthIndicator />
            <NotificationCenter />
            <LanguageSwitch />
          </div>
        </div>

      </div>
    </header>
  );
}
