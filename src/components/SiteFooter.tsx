import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { HermesLogoMark } from "./HermesLogo";

export function SiteFooter() {
  const t = useTranslations("footer");

  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Top row: brand + nav links */}
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          {/* Brand block */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <HermesLogoMark className="h-7 w-7 shrink-0" />
              <span className="font-display text-base font-bold">
                <span className="text-signal">Hermes</span>
                <span className="text-muted"> OS</span>
              </span>
            </div>
            <p className="max-w-xs font-body text-xs leading-relaxed text-muted/70">
              {t("tagline")}
            </p>
            <p className="font-mono text-xs text-muted/50">
              🇮🇷 فارسی &nbsp;|&nbsp; 🇬🇧 English
            </p>
          </div>

          {/* Footer navigation */}
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              <li>
                <Link
                  href="/about"
                  className="font-body text-sm text-muted/70 transition-colors hover:text-signal"
                >
                  {t("navAbout")}
                </Link>
              </li>
              <li>
                <Link
                  href="/"
                  className="font-body text-sm text-muted/70 transition-colors hover:text-signal"
                >
                  {t("navPlatform")}
                </Link>
              </li>
              <li>
                <Link
                  href="/architecture"
                  className="font-body text-sm text-muted/70 transition-colors hover:text-signal"
                >
                  {t("navDocs")}
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="font-body text-sm text-muted/70 transition-colors hover:text-signal"
                >
                  {t("navContact")}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="my-6 border-t border-line/50" />

        <p className="font-mono text-xs text-muted/50">{t("copyright")}</p>
      </div>
    </footer>
  );
}
