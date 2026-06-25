"use client";

import { useEffect, useState, useCallback } from "react";
import { useLocale }                        from "next-intl";
import { useRouter }                        from "@/i18n/navigation";
import { VendorCard }                       from "./VendorCard";
import { track }                            from "@/lib/analytics/events";
import type { VendorListItem }              from "@/lib/vendors/types";

const VENDOR_TYPES = [
  { value: "TECHNOLOGY_PROVIDER", label: "Technology Provider" },
  { value: "SYSTEM_INTEGRATOR",   label: "System Integrator" },
  { value: "SERVICE_PROVIDER",    label: "Service Provider" },
  { value: "MANUFACTURER",        label: "Manufacturer" },
  { value: "DISTRIBUTOR",         label: "Distributor" },
  { value: "CONSULTANT",          label: "Consultant" },
  { value: "TRAINING_PROVIDER",   label: "Training Provider" },
];

const VENDOR_TIERS = [
  { value: "PREMIUM",   label: "Premium" },
  { value: "CERTIFIED", label: "Certified" },
  { value: "STANDARD",  label: "Standard" },
];

export function VendorDirectoryClient() {
  const locale  = useLocale();
  const router  = useRouter();

  const [vendors,  setVendors]  = useState<VendorListItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [type,     setType]     = useState("");
  const [tier,     setTier]     = useState("");

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (type)   q.set("type",   type);
    if (tier)   q.set("tier",   tier);
    try {
      const res  = await fetch(`/api/vendors?${q}`);
      const data = await res.json() as { vendors: VendorListItem[] };
      setVendors(data.vendors ?? []);
    } catch {
      setVendors([]);
    } finally {
      setLoading(false);
    }
  }, [search, type, tier]);

  useEffect(() => {
    void fetchVendors();
    track.vendorDirectoryView();
  }, [fetchVendors]);

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <input
          type="search"
          placeholder="Search vendors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchVendors()}
          className="flex-1 min-w-[200px] rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-signal/50 focus:outline-none"
          dir="ltr"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-signal/50 focus:outline-none"
        >
          <option value="">All Types</option>
          {VENDOR_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-signal/50 focus:outline-none"
        >
          <option value="">All Tiers</option>
          {VENDOR_TIERS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <button
          onClick={() => void fetchVendors()}
          className="rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-bg hover:bg-signal/90 transition-colors"
        >
          Search
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 rounded-2xl border border-line bg-surface animate-pulse" />
          ))}
        </div>
      ) : vendors.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface px-8 py-16 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">Vendor Directory</p>
          <p className="mt-3 text-lg font-semibold text-ink">No vendors found</p>
          <p className="mt-2 text-sm text-muted max-w-sm mx-auto">
            {search || type || tier
              ? "Try adjusting your filters to find vendors."
              : "The vendor ecosystem is growing. Be the first to apply."}
          </p>
          <button
            onClick={() => router.push("/vendors/apply")}
            className="mt-6 inline-flex items-center rounded-lg bg-signal px-6 py-2.5 text-sm font-semibold text-bg hover:bg-signal/90 transition-colors"
          >
            Become a Partner →
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted font-mono">
            {vendors.length} vendor{vendors.length !== 1 ? "s" : ""} found
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((v) => (
              <VendorCard key={v.id} vendor={v} locale={locale} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
