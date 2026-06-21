import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitch } from "./LanguageSwitch";
import { SiteNav } from "./SiteNav";
import { AuthIndicator } from "./auth/AuthIndicator";
import { HermesLogoMark } from "./HermesLogo";

export function SiteHeader() {
  const b = useTranslations("brand");

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="group flex items-center gap-2.5 leading-none"
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

        <div className="flex items-center gap-3">
          <SiteNav />
          <AuthIndicator />
          <LanguageSwitch />
        </div>
      </div>
    </header>
  );
}
