// PHASE 87D — premium public-site footer (server component).
//
// Brand block + three link columns + locale switch + legal line. Every href
// comes from the tested `PUBLIC_FOOTER_COLUMNS` registry, which fixes the two
// legacy SiteFooter misdirections (Platform → "/" and Feed → "/articles").

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { TechnicalValue } from "@/components/ds";
import { HermesLogoMark } from "@/components/HermesLogo";
import { FooterLangSwitch } from "@/components/FooterLangSwitch";
import { PUBLIC_FOOTER_COLUMNS } from "./nav";
import { PublicPageContainer } from "./PublicPageContainer";

export function PublicFooter() {
  const t = useTranslations("publicSite.footer");

  return (
    <footer className="border-t border-border-subtle bg-background-deep">
      <PublicPageContainer className="py-12">
        {/* 87D.1 — five link columns: the public site structure at a glance. */}
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[minmax(0,1.3fr)_repeat(5,minmax(0,1fr))]">
          <div>
            <div className="flex items-center gap-2.5" dir="ltr">
              <HermesLogoMark />
              <span className="text-title font-extrabold tracking-tight text-text-primary">
                Hermes <span className="text-brand-primary">OS</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-body-compact text-text-secondary">{t("tagline")}</p>
            <div className="mt-5">
              <FooterLangSwitch />
            </div>
          </div>
          {PUBLIC_FOOTER_COLUMNS.map((column) => (
            <nav key={column.columnKey} aria-label={t(`columns.${column.columnKey}`)}>
              <h2 className="text-label-compact font-semibold uppercase tracking-wider text-text-muted">
                {t(`columns.${column.columnKey}`)}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="ds-focus rounded-xs text-body-compact text-text-secondary transition-colors duration-fast hover:text-text-primary"
                    >
                      {t(`links.${link.labelKey}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border-subtle pt-6 md:flex-row md:items-center md:justify-between">
          <p className="text-caption text-text-muted">{t("copyright")}</p>
          <p className="text-caption text-text-muted">
            <TechnicalValue mono={false}>{t("domain")}</TechnicalValue>
          </p>
        </div>
      </PublicPageContainer>
    </footer>
  );
}
