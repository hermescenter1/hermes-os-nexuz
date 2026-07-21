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
        {/*
          Legal / trust indicators. Sits after the navigation columns and
          before the copyright line, so the footer hierarchy stays
          branding → navigation → trust → copyright. The separator moved here
          from the copyright row so the two blocks share one rule instead of
          stacking two.

          Plain <a>/<img> rather than next/image on purpose: the seal is a
          dynamic verification endpoint that must receive the request directly
          with an `origin` referrer, which is exactly what eNAMAD validates.
          Routing it through the Next image optimizer would strip that referrer
          and require a remote-image allowlist for no benefit.

          Alignment is intentionally flow-relative (default `justify-start`),
          so it follows the document direction: start-aligned in Persian RTL
          and English LTR alike, and correct for German automatically.
        */}
        <div className="mt-10 flex border-t border-border-subtle pt-6">
          {/*
            PHASE 93D — official eNAMAD seal (id=761266). eNAMAD requires the
            code to be placed WITHOUT altering its verification parameters, and
            explicitly requires that `rel="noopener noreferrer"` NOT be present,
            so this anchor deliberately carries NO `rel` attribute at all.

            Everything eNAMAD verifies is reproduced verbatim: both URLs, an
            origin referrer policy on the anchor and the image, `target=_blank`,
            the empty `alt`, `cursor:pointer`, and the non-standard lowercase
            `code` attribute. The remaining attributes (aria-label, intrinsic
            width/height, lazy/async decoding, layout classes) are additive —
            they touch no verification parameter and preserve the accessibility
            and layout-stability guarantees the footer already had.

            Because `alt` must be empty per the official code, the image is
            DECORATIVE and the accessible name comes from the anchor's
            aria-label — otherwise this would be a link with no accessible name.
          */}
          <a
            referrerPolicy="origin"
            target="_blank"
            href="https://trustseal.enamad.ir/?id=761266&Code=MFGRdDzn6UCFPL3FOx24Dj5yabncQMST"
            aria-label="eNAMAD Electronic Trust Seal — Hermes Novin"
            className="ds-focus inline-flex rounded-md border border-border-subtle bg-surface-elevated p-2 transition-opacity duration-fast hover:opacity-90"
          >
            {/*
              eslint-disable-next-line @next/next/no-img-element --
              intentional: next/image would proxy this request through the
              optimizer, dropping the `origin` referrer that eNAMAD checks when
              serving and validating the seal. Explicit width/height below give
              the same layout-shift protection the rule is there to enforce.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              referrerPolicy="origin"
              src="https://trustseal.enamad.ir/logo.aspx?id=761266&Code=MFGRdDzn6UCFPL3FOx24Dj5yabncQMST"
              alt=""
              style={{ cursor: "pointer" }}
              // `code` is a non-standard lowercase attribute mandated by the
              // official snippet; a narrow spread keeps it type-safe in TSX
              // while rendering the attribute exactly as eNAMAD published it.
              {...{ code: "MFGRdDzn6UCFPL3FOx24Dj5yabncQMST" }}
              width={88}
              height={88}
              loading="lazy"
              decoding="async"
              className="h-[76px] w-[76px] sm:h-[88px] sm:w-[88px]"
            />
          </a>
        </div>
        <div className="mt-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="text-caption text-text-muted">{t("copyright")}</p>
          <p className="text-caption text-text-muted">
            <TechnicalValue mono={false}>{t("domain")}</TechnicalValue>
          </p>
        </div>
      </PublicPageContainer>
    </footer>
  );
}
