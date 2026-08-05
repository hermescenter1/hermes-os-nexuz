// Shared "Trust & Verification" section (server component).
//
// One source of truth for the trust-badge layout so the two public footers
// (PublicFooter, SiteFooter) never drift into two different designs. Renders
// three EQUAL cards in a centred responsive grid:
//
//   eNAMAD  ·  SaaSHub  ·  ProvenExpert   (DOM order)
//
// The grid follows the document direction, so this single DOM order yields the
// required visual order in BOTH directions with no per-locale reordering:
//   • RTL (Persian): eNAMAD right · SaaSHub centre · ProvenExpert left
//   • LTR (EN/DE)  : eNAMAD left  · SaaSHub centre · ProvenExpert right
// SaaSHub is the middle grid item, so it is always centred.

import { useTranslations } from "next-intl";
import ProvenExpertSeal from "./ProvenExpertSeal";
import { SaaSHubBadge } from "./SaaSHubBadge";

/**
 * A single equal-height trust card. All three badges sit inside an identical
 * frame so no badge can dominate the footer or float in isolation. Uses design
 * system tokens (no hard-coded colours) and a subtle hover/focus border.
 */
function TrustCard({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group flex min-h-[248px] min-w-0 flex-col items-center justify-start gap-4 overflow-hidden rounded-2xl border border-border-subtle bg-surface-elevated px-5 py-6 transition-colors duration-fast hover:border-brand-primary/40 focus-within:border-brand-primary/50">
      <h3 className="text-center text-label-compact font-semibold uppercase tracking-wider text-text-muted">
        {heading}
      </h3>
      <div className="flex w-full flex-1 items-center justify-center">
        {children}
      </div>
    </div>
  );
}

export function TrustBadgesSection() {
  const t = useTranslations("trustBadges");

  return (
    <section
      aria-label={t("sectionTitle")}
      className="mt-12 border-t border-border-subtle pt-10"
    >
      <h2 className="mb-6 text-center text-label-compact font-semibold uppercase tracking-[0.18em] text-text-muted">
        {t("sectionTitle")}
      </h2>

      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
        {/*
          eNAMAD — official Iranian electronic trust seal (id=761266).
          Root-cause fix for the "empty dark square" seen in production:
          the seal artwork was sitting on a dark panel with an empty `alt`, so
          any failed/slow load — or a seal whose transparent regions render dark
          — left a blank square. The seal image now sits on a LIGHT chip so the
          official artwork is legible, keeps its NATURAL aspect ratio (no forced
          square that distorts it), and the visible card heading labels the cell
          even before the external image resolves.

          Every eNAMAD verification parameter is preserved verbatim: both URLs,
          `referrerPolicy="origin"` on the anchor AND the image, `target=_blank`,
          the empty `alt` (the seal is decorative; the anchor carries the
          accessible name), `cursor:pointer`, and the non-standard lowercase
          `code` attribute. eNAMAD explicitly forbids `rel="noopener noreferrer"`
          here, so this anchor deliberately carries NO `rel` attribute at all.
        */}
        <TrustCard heading={t("enamadHeading")}>
          <a
            referrerPolicy="origin"
            target="_blank"
            href="https://trustseal.enamad.ir/?id=761266&Code=MFGRdDzn6UCFPL3FOx24Dj5yabncQMST"
            aria-label="eNAMAD Electronic Trust Seal — Hermes Novin"
            className="ds-focus inline-flex rounded-xl"
          >
            {/* Light chip so the official seal is legible on the dark footer. */}
            <span className="flex items-center justify-center rounded-xl bg-white p-2.5">
              {/*
                eslint-disable-next-line @next/next/no-img-element --
                intentional: next/image would proxy this request through the
                optimizer, dropping the `origin` referrer that eNAMAD checks when
                serving and validating the seal. Explicit width/height give the
                same layout-shift protection the rule enforces.
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
                // Natural aspect ratio: fix the WIDTH (~88–96px) and let the
                // height follow the seal's intrinsic proportions (h-auto), so
                // the official artwork is never stretched into a square.
                className="h-auto w-[88px] sm:w-[96px]"
              />
            </span>
          </a>
        </TrustCard>

        {/* SaaSHub — official "Approved" badge, centred (middle grid item). */}
        <TrustCard heading={t("saashubHeading")}>
          <SaaSHubBadge />
        </TrustCard>

        {/*
          ProvenExpert — official review widget. It renders at its own natural
          size and is much taller than the other badges, so it is contained in a
          reserved-height wrapper and scaled down with transform-origin centre.
          `overflow-hidden` + the fixed height keep it from dictating the footer
          width or growing its card taller than the peers. The widget content,
          URLs and configuration are untouched.
        */}
        <TrustCard heading={t("provenExpertHeading")}>
          <div className="flex h-[176px] w-full items-center justify-center overflow-hidden">
            {/* w-full (not a fixed width) so the widget never forces its grid
                column wider than the card — combined with min-w-0 on the card
                this prevents any horizontal overflow. */}
            <div className="w-full origin-center scale-[0.72]">
              <ProvenExpertSeal />
            </div>
          </div>
        </TrustCard>
      </div>
    </section>
  );
}
