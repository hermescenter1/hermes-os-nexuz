import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitch } from "./LanguageSwitch";
import { SiteNav } from "./SiteNav";
import { AuthIndicator } from "./auth/AuthIndicator";

export function SiteHeader() {
  const b = useTranslations("brand");

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="group flex flex-col leading-none"
          aria-label="Hermes OS — home"
        >
          <span className="font-display text-lg font-bold tracking-tight">
            <span className="text-signal">Hermes</span>
            <span className="text-muted"> OS</span>
          </span>
          <span className="mt-1 font-body text-[0.65rem] font-medium text-muted/80">
            {b("tagline")}
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
