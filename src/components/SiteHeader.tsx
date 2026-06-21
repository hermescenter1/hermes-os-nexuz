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
      <div className="relative mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
        {/* Logo — always on the inline-start side (left in LTR, right in RTL) */}
        <Link
          href="/"
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

        {/* Nav — occupies remaining space, aligns to inline-end on desktop */}
        <div className="flex flex-1 items-center justify-end gap-3">
          <SiteNav />

          {/* Thin separator between nav and action buttons (desktop only) */}
          <div className="hidden h-5 w-px shrink-0 bg-line/50 md:block" aria-hidden="true" />

          {/* Action buttons: Sign In + Language */}
          <div className="flex shrink-0 items-center gap-2">
            <AuthIndicator />
            <LanguageSwitch />
          </div>
        </div>
      </div>
    </header>
  );
}
