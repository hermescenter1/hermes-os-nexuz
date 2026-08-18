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
import { TrustBadgesSection } from "@/components/trust/TrustBadgesSection";
import { PUBLIC_FOOTER_COLUMNS } from "./nav";
import { PublicPageContainer } from "./PublicPageContainer";

export interface PublicFooterProps {
  /**
   * PHASE 104-E — footer shell treatment. `"standard"` is the shipped 87D
   * footer and stays the DEFAULT for every public route. The homepage opts
   * into `"observatory"` explicitly: an Edge top rule and a base→deep gradient
   * that lands the closing scene, instead of a hard border on flat deep navy.
   * Contents, links, columns and landmarks are unchanged.
   *
   * PHASE 104-F — `"journal"`: the Industrial Journal colophon, ruled like the
   * end of a printed dossier (heavy rule, then the columns on the page
   * ground). Opted into only by the public Journal reading shell.
   */
  visualMode?: "standard" | "observatory" | "journal";
}

export function PublicFooter({ visualMode = "standard" }: PublicFooterProps = {}) {
  const t = useTranslations("publicSite.footer");
  const observatory = visualMode === "observatory";
  const journal = visualMode === "journal";

  return (
    <footer
      data-visual-mode={visualMode}
      className={
        observatory ? "hh-footer" : journal ? "hj-footer" : "border-t border-border-subtle bg-background-deep"
      }
    >
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
        {/*
          Trust & Verification. Shared between both public footers so the layout
          never diverges. Sits after the navigation columns and before the legal
          row, keeping the hierarchy branding → navigation → trust → legal.
        */}
        <TrustBadgesSection />
        {/*
          Legal row — visually separated from the trust grid by its own rule and
          spacing, so the copyright/domain line no longer floats disconnected.
          Flow-relative alignment follows the document direction (RTL/LTR).
        */}
        <div className="mt-8 flex flex-col gap-2 border-t border-border-subtle pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-text-muted">{t("copyright")}</p>
          <p className="text-caption text-text-muted">
            <TechnicalValue mono={false}>{t("domain")}</TechnicalValue>
          </p>
        </div>
      </PublicPageContainer>
    </footer>
  );
}
