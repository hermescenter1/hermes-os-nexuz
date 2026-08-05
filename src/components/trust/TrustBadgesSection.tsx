// Shared "Trust & Verification" strip (server component).
//
// One source of truth for the trust-badge layout so the two public footers
// (PublicFooter, SiteFooter) never drift into two different designs. A single
// COMPACT centred glass panel holds three small badge slots:
//
//   eNAMAD  ·  SaaSHub  ·  ProvenExpert   (DOM order)
//
// The flex row follows the document direction, so this single DOM order yields
// the correct visual placement in BOTH directions with no per-locale
// reordering; SaaSHub is the middle slot, so it is always centred.
//
// Design: premium enterprise strip, not product cards — dark glass surface
// (`bg-surface-glass` is the rgba glass token; Tailwind opacity modifiers do
// NOT work on the hex-var token classes, so never suffix them with /NN),
// subtle borders, tiny muted labels, minimal vertical footprint (~150px).

import { useTranslations } from "next-intl";
import ProvenExpertSeal from "./ProvenExpertSeal";
import { SaaSHubBadge } from "./SaaSHubBadge";

/**
 * A compact badge slot: tiny muted label on top, badge artwork centred below.
 * Fixed footprint (184×116px) keeps the three vendors optically equal — no
 * badge may read as more important than its peers.
 */
function TrustSlot({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[116px] w-[184px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-border-subtle bg-black/10 px-3 py-2 transition-colors duration-fast hover:border-border-default hover:bg-black/20">
      <span className="whitespace-nowrap text-[10px] font-medium tracking-wide text-text-muted">
        {label}
      </span>
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
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
      className="mt-10 border-t border-border-subtle pt-6"
    >
      {/* Single centred glass panel — w-fit, never a full-width grid. */}
      <div className="mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-3 rounded-2xl border border-border-subtle bg-surface-glass px-4 py-3 shadow-sm backdrop-blur-md sm:px-5 sm:py-4">
        {/*
          eNAMAD — official Iranian electronic trust seal (id=761266).

          The seal artwork sits on a SMALL light chip (not a big white card) so
          the official artwork stays legible on the dark footer without a large
          white rectangle. The chip reserves a compact 80×76 box, and a tiny
          muted "eNAMAD" caption sits BEHIND the image: the loaded seal covers
          it (the img carries its own white background), while a genuinely
          failed load collapses to zero height (no width/height attributes, so
          nothing reserves a blank box) and reveals the caption. No unofficial
          seal artwork is ever drawn.

          Every eNAMAD verification parameter is preserved verbatim: both URLs,
          `referrerPolicy="origin"` on the anchor AND the image, `target=_blank`,
          the empty `alt` (the seal is decorative; the anchor carries the
          accessible name), `cursor:pointer`, and the non-standard lowercase
          `code` attribute. eNAMAD explicitly forbids `rel="noopener noreferrer"`
          here, so this anchor deliberately carries NO `rel` attribute at all.
        */}
        <TrustSlot label={t("enamadHeading")}>
          <a
            referrerPolicy="origin"
            target="_blank"
            href="https://trustseal.enamad.ir/?id=761266&Code=MFGRdDzn6UCFPL3FOx24Dj5yabncQMST"
            aria-label="eNAMAD Electronic Trust Seal — Hermes Novin"
            className="ds-focus inline-flex rounded-lg"
          >
            <span className="relative flex min-h-[76px] w-[80px] items-center justify-center overflow-hidden rounded-lg bg-white p-2">
              {/* Fallback caption — only visible when the seal image genuinely
                  fails to load (the loaded image covers it). aria-hidden so it
                  never duplicates the anchor's accessible name. */}
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-black/40"
              >
                eNAMAD
              </span>
              {/*
                eslint-disable-next-line @next/next/no-img-element --
                intentional: next/image would proxy this request through the
                optimizer, dropping the `origin` referrer that eNAMAD checks
                when serving and validating the seal.
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
                loading="lazy"
                decoding="async"
                // Natural aspect ratio (h-auto, fixed width only) — the seal is
                // never stretched into a square. Deliberately NO width/height
                // attributes: a broken load must collapse to zero height so the
                // fallback caption shows instead of a blank white box; the chip's
                // min-h reserves the layout, so there is still no layout shift.
                // Own white background so the loaded (possibly transparent)
                // artwork fully covers the fallback caption behind it.
                className="relative z-10 h-auto w-[64px] bg-white"
              />
            </span>
          </a>
        </TrustSlot>

        {/* SaaSHub — official "Approved" badge (middle slot, always centred). */}
        <TrustSlot label={t("saashubHeading")}>
          <SaaSHubBadge />
        </TrustSlot>

        {/*
          ProvenExpert — official review widget, untouched configuration. The
          widget renders at its own natural size (min 220px tall), far larger
          than the peer badges, so it is contained in a fixed compact viewport
          (116×84) and reduced with a pure transform (scale 0.38, origin
          centre). The reserved viewport prevents layout shift and stops the
          widget from dominating the strip or dictating the footer width.
        */}
        <TrustSlot label={t("provenExpertHeading")}>
          <div className="flex h-[84px] w-[116px] items-center justify-center overflow-hidden">
            <div className="w-[300px] shrink-0 origin-center scale-[0.38]">
              <ProvenExpertSeal />
            </div>
          </div>
        </TrustSlot>
      </div>
    </section>
  );
}
