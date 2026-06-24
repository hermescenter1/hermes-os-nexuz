import { useTranslations } from "next-intl";
import { Link }            from "@/i18n/navigation";
import { LanguageSwitch }  from "./LanguageSwitch";
import { SiteNav }         from "./SiteNav";
import { AuthIndicator }   from "./auth/AuthIndicator";
import { HermesLogoMark }  from "./HermesLogo";
import { NotificationCenter } from "./NotificationCenter";

export function SiteHeader() {
  const b = useTranslations("brand");

  return (
    <header
      className="sticky top-0 z-20 border-b border-line/60"
      style={{
        background: "rgba(7, 9, 13, 0.88)",
        backdropFilter: "blur(24px) saturate(1.3)",
        WebkitBackdropFilter: "blur(24px) saturate(1.3)",
        boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.03), 0 1px 0 rgba(0,0,0,0.4)",
      }}
    >
      <div className="relative mx-auto flex max-w-6xl items-center px-6 py-3.5">

        {/* Subtle top accent line */}
        <div
          className="absolute top-0 inset-x-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)",
          }}
          aria-hidden="true"
        />

        {/* Logo */}
        <Link
          href="/"
          className="group shrink-0 leading-none"
          aria-label="Hermes OS — home"
        >
          <span className="flex items-center gap-2.5" dir="ltr">
            <HermesLogoMark className="h-8 w-8 shrink-0" />
            <span className="flex flex-col">
              <span className="font-display text-[1.05rem] font-bold tracking-tight leading-none">
                <span className="text-ink">Hermes</span>
                <span className="text-signal"> OS</span>
              </span>
              <span className="font-body text-[0.58rem] font-medium leading-none text-muted/60 mt-0.5">
                {b("tagline")}
              </span>
            </span>
          </span>
        </Link>

        {/* Nav + action cluster */}
        <div className="ms-auto flex items-center gap-3">
          <SiteNav />
          <div
            className="hidden h-5 w-px shrink-0 bg-line/40 md:block"
            aria-hidden="true"
          />
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
