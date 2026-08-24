"use client";

import { useTranslations } from "next-intl";
import type { VendorListItem, VendorTier } from "@/lib/vendors/types";
import { Link } from "@/i18n/navigation";

const TIER_COLORS: Record<VendorTier, string> = {
  PREMIUM:   "border-amber-400/30 bg-amber-400/10 text-amber-400",
  CERTIFIED: "border-signal/30 bg-signal/10 text-signal",
  STANDARD:  "border-line bg-surface/50 text-muted",
};

interface VendorCardProps {
  vendor: VendorListItem;
  locale: string;
}

export function VendorCard({ vendor, locale }: VendorCardProps) {
  // PHASE 104-I3 — the card's own chrome (badges, stat captions, partner type,
  // tier) is UI text and is localized. The vendor's NAME, city and country are
  // partner-supplied domain records and are never translated or invented: the
  // schema stores nameEn/nameFa only, so a German reader correctly sees the
  // English trade name rather than a fabricated German one.
  const t  = useTranslations("vendors.card");
  const tt = useTranslations("vendors.types");
  const tr = useTranslations("vendors.tiers");

  const name = locale === "fa" && vendor.nameFa ? vendor.nameFa : vendor.nameEn;
  const compliant = vendor.complianceStatus === "COMPLIANT";

  return (
    <Link
      href={`/vendors/${vendor.slug}`}
      aria-label={t("open", { name })}
      className="ds-focus group block space-y-4 rounded-2xl border border-line bg-surface p-5 transition-all duration-200 hover:border-signal/40 hover:bg-surface/80"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {vendor.isFeatured && (
              <span className="inline-flex items-center rounded border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-amber-400">
                {t("featured")}
              </span>
            )}
            {vendor.isVerified && (
              <span className="inline-flex items-center gap-1 rounded border border-signal/30 bg-signal/10 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-signal">
                <span aria-hidden="true">✓</span>{t("verified")}
              </span>
            )}
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold leading-snug text-ink transition-colors group-hover:text-signal">
            {name}
          </h3>
          {vendor.headquartersCity && (
            <p className="mt-0.5 text-[11px] text-muted">
              {vendor.headquartersCity}, {vendor.headquartersCountry}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 rounded border px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider ${TIER_COLORS[vendor.tier]}`}
          title={t("tierLabel", { tier: tr(vendor.tier) })}
        >
          {tr(vendor.tier)}
        </span>
      </div>

      {/* Type + Category */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex rounded-full border border-line bg-bg/60 px-2.5 py-0.5 text-[11px] text-muted">
          {tt(vendor.vendorType)}
        </span>
        {vendor.category && (
          /* Category names come from the vendor taxonomy table, which stores
             nameEn/nameFa only — shown as stored, never machine-translated. */
          <span className="inline-flex rounded-full border border-line bg-bg/60 px-2.5 py-0.5 text-[11px] text-muted">
            {locale === "fa" && vendor.category.nameFa ? vendor.category.nameFa : vendor.category.nameEn}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 border-t border-line pt-4">
        <div className="text-center">
          <p className="text-xs font-bold tabular-nums text-ink">{vendor._count.services}</p>
          <p className="mt-0.5 text-[10px] text-muted">{t("services")}</p>
        </div>
        <div className="border-x border-line text-center">
          <p className="text-xs font-bold tabular-nums text-ink">{vendor._count.capabilities}</p>
          <p className="mt-0.5 text-[10px] text-muted">{t("skills")}</p>
        </div>
        <div className="text-center">
          {/* Colour alone never carries the compliance outcome: the glyph differs
              and the accessible name spells the state out. */}
          <p className={`text-xs font-bold tabular-nums ${compliant ? "text-signal" : "text-muted"}`}>
            <span aria-hidden="true">{compliant ? "✓" : "—"}</span>
            <span className="sr-only">{compliant ? t("compliant") : t("notCompliant")}</span>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{t("compliance")}</p>
        </div>
      </div>
    </Link>
  );
}
