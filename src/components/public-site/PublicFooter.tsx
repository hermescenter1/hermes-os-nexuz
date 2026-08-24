// PHASE 87D — premium public-site footer (server component).
//
// PHASE 104-I1 — recomposed from a generic five-column link dump into the
// HERMES SYSTEM REGISTRY, in three declared layers:
//
//   1  OPERATIONAL IDENTITY  mark, industrial proposition, language access
//   2  SYSTEM REGISTRY       every destination, ruled like an index: a
//                            monospaced column key over hairline-separated
//                            rows, instead of five floating link lists
//   3  TRUST AND CLOSURE     the existing trust badges, the legal line, and a
//                            code-native network-closure seal
//
// No destination is lost or invented: the rows are still derived from the
// tested `PUBLIC_FOOTER_COLUMNS` registry (5 columns / 17 links), every label
// still resolves from `publicSite.footer.links.*`, and `TrustBadgesSection`
// keeps its own network behaviour (an external badge timeout is reported by
// that component, never hidden here).
//
// The registry rows are deliberately dense: a footer must close the page, not
// compete with it, so this layout is shorter per destination than the five
// stacked lists it replaces.

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

/**
 * The closure seal: a bus line entering a closed ring — the "handoff complete"
 * mark of the estate, drawn in code so it carries no image dependency and no
 * language. Decorative, therefore `aria-hidden`; the legal line beside it
 * carries the actual information.
 */
function ClosureSeal() {
  return (
    <svg className="hf-seal" viewBox="0 0 64 20" role="presentation" aria-hidden="true" focusable="false">
      <path className="hf-seal-stroke" d="M0 10 H26" />
      <circle className="hf-seal-stroke" cx="36" cy="10" r="7.5" />
      <circle className="hf-seal-core" cx="36" cy="10" r="2.5" />
      <path className="hf-seal-stroke" d="M46 10 H64" />
      <path className="hf-seal-stroke" d="M58 5.5 V14.5" />
      <path className="hf-seal-stroke" d="M62 7.5 V12.5" />
    </svg>
  );
}

export function PublicFooter({ visualMode = "standard" }: PublicFooterProps = {}) {
  const t = useTranslations("publicSite.footer");
  const observatory = visualMode === "observatory";
  const journal = visualMode === "journal";

  return (
    <footer
      data-visual-mode={visualMode}
      data-footer-composition="system-registry"
      className={
        observatory ? "hh-footer" : journal ? "hj-footer" : "border-t border-border-subtle bg-background-deep"
      }
    >
      <PublicPageContainer className="py-12">
        {/* ── 1 · OPERATIONAL IDENTITY ─────────────────────────────────── */}
        <div className="hf-identity">
          <div className="min-w-0">
            {/* `HermesLogoMark` carries no intrinsic size: it is a 32-unit
                viewBox with no width/height, so an unconstrained parent lets it
                fill the whole line. The 87D layout hid that by putting it in a
                narrow grid column; this identity layer is full-width, so the
                size is stated explicitly here. */}
            <div className="flex items-center gap-2.5" dir="ltr">
              <HermesLogoMark className="h-8 w-8 shrink-0" />
              <span className="text-title font-extrabold tracking-tight text-text-primary">
                Hermes <span className="text-brand-primary">OS</span>
              </span>
            </div>
            <p className="mt-3 max-w-md text-body-compact text-text-secondary">{t("tagline")}</p>
          </div>
          <FooterLangSwitch />
        </div>

        {/* ── 2 · SYSTEM REGISTRY ──────────────────────────────────────── */}
        <div className="hf-registry">
          {PUBLIC_FOOTER_COLUMNS.map((column) => (
            <nav key={column.columnKey} aria-label={t(`columns.${column.columnKey}`)} className="hf-reg-col">
              <h2 className="hf-reg-key">{t(`columns.${column.columnKey}`)}</h2>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href} className="hf-reg-row">
                    <Link href={link.href} className="hf-reg-link ds-focus rounded-xs">
                      {t(`links.${link.labelKey}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/*
          ── 3 · TRUST AND CLOSURE ──────────────────────────────────────
          Trust & Verification. Shared between both public footers so the layout
          never diverges. Sits after the navigation registry and before the
          legal row, keeping the hierarchy identity → registry → trust → legal.
        */}
        <TrustBadgesSection />
        {/*
          Legal row, now the closure layer: the seal, the copyright and the
          domain on one ruled line. Flow-relative alignment follows the
          document direction (RTL/LTR).
        */}
        <div className="hf-closure">
          <ClosureSeal />
          <p className="text-caption text-text-muted">{t("copyright")}</p>
          <p className="text-caption text-text-muted ms-auto">
            <TechnicalValue mono={false}>{t("domain")}</TechnicalValue>
          </p>
        </div>
      </PublicPageContainer>
    </footer>
  );
}
