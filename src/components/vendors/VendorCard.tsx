import type { VendorListItem, VendorType, VendorTier } from "@/lib/vendors/types";
import { Link } from "@/i18n/navigation";

const TYPE_LABELS: Record<VendorType, string> = {
  TECHNOLOGY_PROVIDER: "Technology Provider",
  SYSTEM_INTEGRATOR:   "System Integrator",
  SERVICE_PROVIDER:    "Service Provider",
  MANUFACTURER:        "Manufacturer",
  DISTRIBUTOR:         "Distributor",
  CONSULTANT:          "Consultant",
  TRAINING_PROVIDER:   "Training Provider",
};

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
  const name = locale === "fa" && vendor.nameFa ? vendor.nameFa : vendor.nameEn;

  return (
    <Link
      href={`/vendors/${vendor.slug}`}
      className="group block rounded-2xl border border-line bg-surface hover:border-signal/40 hover:bg-surface/80 transition-all duration-200 p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {vendor.isFeatured && (
              <span className="inline-flex items-center rounded border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-amber-400 uppercase tracking-widest">
                Featured
              </span>
            )}
            {vendor.isVerified && (
              <span className="inline-flex items-center gap-1 rounded border border-signal/30 bg-signal/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-signal uppercase tracking-widest">
                ✓ Verified
              </span>
            )}
          </div>
          <h3 className="mt-1 font-semibold text-ink text-sm leading-snug group-hover:text-signal transition-colors truncate">
            {name}
          </h3>
          {vendor.headquartersCity && (
            <p className="text-[11px] text-muted mt-0.5">{vendor.headquartersCity}, {vendor.headquartersCountry}</p>
          )}
        </div>
        <span className={`shrink-0 rounded border px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider ${TIER_COLORS[vendor.tier]}`}>
          {vendor.tier}
        </span>
      </div>

      {/* Type + Category */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex rounded-full border border-line bg-bg/60 px-2.5 py-0.5 text-[11px] text-muted">
          {TYPE_LABELS[vendor.vendorType]}
        </span>
        {vendor.category && (
          <span className="inline-flex rounded-full border border-line bg-bg/60 px-2.5 py-0.5 text-[11px] text-muted">
            {vendor.category.nameEn}
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 border-t border-line pt-4">
        <div className="text-center">
          <p className="text-xs font-bold text-ink tabular-nums">{vendor._count.services}</p>
          <p className="text-[10px] text-muted mt-0.5">Services</p>
        </div>
        <div className="text-center border-x border-line">
          <p className="text-xs font-bold text-ink tabular-nums">{vendor._count.capabilities}</p>
          <p className="text-[10px] text-muted mt-0.5">Skills</p>
        </div>
        <div className="text-center">
          <p className={`text-xs font-bold tabular-nums ${vendor.complianceStatus === "COMPLIANT" ? "text-signal" : "text-muted"}`}>
            {vendor.complianceStatus === "COMPLIANT" ? "✓" : "—"}
          </p>
          <p className="text-[10px] text-muted mt-0.5">Compliance</p>
        </div>
      </div>
    </Link>
  );
}
