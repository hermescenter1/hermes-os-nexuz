"use client";

import { useEffect }               from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link }                    from "@/i18n/navigation";
import { track }                   from "@/lib/analytics/events";
import type { VendorDetailItem, VendorTier } from "@/lib/vendors/types";

// PHASE 104-I3 — the partner-type, tier and compliance LABELS moved to the
// catalogue (vendors.types / vendors.tiers / vendors.compliance). Only the
// colour mapping stays here: it is presentation, not language.
const TIER_COLORS: Record<VendorTier, string> = {
  PREMIUM:   "border-amber-400/30 bg-amber-400/10 text-amber-400",
  CERTIFIED: "border-signal/30 bg-signal/10 text-signal",
  STANDARD:  "border-line bg-surface/50 text-muted",
};

interface VendorDetailClientProps {
  vendor: VendorDetailItem;
}

export function VendorDetailClient({ vendor }: VendorDetailClientProps) {
  const locale = useLocale();
  const t   = useTranslations("vendors.detail");
  const tt  = useTranslations("vendors.types");
  const tr  = useTranslations("vendors.tiers");
  const tc  = useTranslations("vendors.compliance");

  const name        = locale === "fa" && vendor.nameFa ? vendor.nameFa : vendor.nameEn;
  const description = locale === "fa" && vendor.descriptionFa ? vendor.descriptionFa : vendor.descriptionEn;

  useEffect(() => {
    track.vendorProfileView(vendor.id);
  }, [vendor.id]);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded border px-2.5 py-1 text-xs font-mono font-semibold uppercase tracking-wider ${TIER_COLORS[vendor.tier]}`}>
              {tr(vendor.tier)}
            </span>
            {vendor.isVerified && (
              <span className="inline-flex items-center gap-1 rounded border border-signal/30 bg-signal/10 px-2.5 py-1 text-xs font-mono text-signal">
                <span aria-hidden="true">✓</span> {t("verifiedPartner")}
              </span>
            )}
            {vendor.isFeatured && (
              <span className="rounded border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-mono text-amber-400">
                Featured
              </span>
            )}
          </div>
          <h1 className="type-page-title">{name}</h1>
          <p className="text-sm text-muted">{tt(vendor.vendorType)}</p>
          {vendor.headquartersCity && (
            <p className="text-sm text-muted">{vendor.headquartersCity}, {vendor.headquartersCountry}</p>
          )}
          {vendor.websiteUrl && (
            <a
              href={vendor.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm text-signal hover:underline"
              dir="ltr"
            >
              {vendor.websiteUrl} →
            </a>
          )}
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {vendor.contactEmail && (
            <a
              href={`mailto:${vendor.contactEmail}`}
              onClick={() => track.vendorContactClicked(vendor.id)}
              className="rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-bg hover:bg-signal/90 transition-colors text-center"
            >
              Contact Vendor
            </a>
          )}
          <Link
            href="/vendors/apply"
            className="rounded-lg border border-line px-5 py-2.5 text-sm text-muted hover:text-ink hover:border-signal/40 transition-colors text-center"
          >
            Become a Partner
          </Link>
        </div>
      </div>

      {/* Description */}
      {description && (
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{t("about")}</h2>
          <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{description}</p>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: t("services"),     value: vendor._count.services },
          { label: t("products"),     value: vendor._count.products },
          { label: t("capabilities"), value: vendor._count.capabilities },
          { label: t("compliance"),   value: tc(vendor.complianceStatus) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4 text-center">
            <p className="text-xl font-bold text-ink tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Services */}
      {vendor.services.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">{t("services")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {vendor.services.map((s) => (
              <div key={s.id} className="rounded-lg border border-line bg-bg/60 p-4">
                <p className="text-sm font-semibold text-ink">{locale === "fa" && s.nameFa ? s.nameFa : s.nameEn}</p>
                {(locale === "fa" ? s.descriptionFa : s.descriptionEn) && (
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    {locale === "fa" ? s.descriptionFa : s.descriptionEn}
                  </p>
                )}
                {s.category && (
                  <span className="mt-2 inline-block rounded-full border border-line px-2 py-0.5 text-[10px] text-muted">{s.category}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Products */}
      {vendor.products.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">{t("products")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {vendor.products.map((p) => (
              <div key={p.id} className="rounded-lg border border-line bg-bg/60 p-4">
                <p className="text-sm font-semibold text-ink">{locale === "fa" && p.nameFa ? p.nameFa : p.nameEn}</p>
                {p.skuCode && <p className="font-mono text-[10px] text-muted mt-0.5">SKU: {p.skuCode}</p>}
                {(locale === "fa" ? p.descriptionFa : p.descriptionEn) && (
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    {locale === "fa" ? p.descriptionFa : p.descriptionEn}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capabilities */}
      {vendor.capabilities.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">{t("capabilities")}</h2>
          <div className="flex flex-wrap gap-2">
            {vendor.capabilities.map((c) => (
              <span
                key={c.id}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  c.isVerified
                    ? "border-signal/30 bg-signal/5 text-signal"
                    : "border-line bg-surface/50 text-ink"
                }`}
              >
                {c.isVerified && <span className="text-signal">✓</span>}
                {locale === "fa" && c.nameFa ? c.nameFa : c.nameEn}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Compliance Records */}
      {vendor.complianceRecords.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">{t("compliance")}</h2>
          <div className="space-y-3">
            {vendor.complianceRecords.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-bg/60 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{r.complianceType}</p>
                  {r.certBody && <p className="text-xs text-muted mt-0.5">{r.certBody}{r.certNumber ? ` · ${r.certNumber}` : ""}</p>}
                </div>
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  r.status === "COMPLIANT" ? "border-signal/30 bg-signal/10 text-signal"
                  : r.status === "NON_COMPLIANT" ? "border-red-400/30 bg-red-400/10 text-red-400"
                  : "border-line text-muted"
                }`}>
                  {tc(r.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regions */}
      {vendor.regionsServed.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">{t("regions")}</h2>
          <div className="flex flex-wrap gap-2">
            {vendor.regionsServed.map((r) => (
              <span key={r} className="rounded-full border border-line bg-surface/50 px-3 py-1 text-xs text-ink">
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
