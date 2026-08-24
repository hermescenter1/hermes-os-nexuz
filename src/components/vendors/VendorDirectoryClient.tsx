"use client";

import { useEffect, useState, useCallback, useId } from "react";
import { useLocale, useTranslations }              from "next-intl";
import { useRouter }                               from "@/i18n/navigation";
import { VendorCard }                              from "./VendorCard";
import { track }                                   from "@/lib/analytics/events";
import { VENDOR_TYPES }                            from "@/lib/vendors/types";
import type { VendorListItem, VendorTier }         from "@/lib/vendors/types";

const VENDOR_TIERS: readonly VendorTier[] = ["PREMIUM", "CERTIFIED", "STANDARD"];

export function VendorDirectoryClient() {
  const locale = useLocale();
  const router = useRouter();
  // PHASE 104-I3 — every string on this surface was an English literal, so /de
  // and /fa readers searched an English directory with English filter options.
  const t  = useTranslations("vendors.directory");
  const tt = useTranslations("vendors.types");
  const tr = useTranslations("vendors.tiers");

  // Programmatic labels for the filter controls. The row is a toolbar with no
  // visible headings, so without these the selects announce only their current
  // value and the search field announces nothing at all.
  const searchId = useId();
  const typeId   = useId();
  const tierId   = useId();

  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [type,    setType]    = useState("");
  const [tier,    setTier]    = useState("");

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

  const filtered = Boolean(search || type || tier);

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div
        role="search"
        aria-label={t("searchLabel")}
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex-1 min-w-[200px]">
          <label htmlFor={searchId} className="mb-1.5 block text-xs font-mono uppercase tracking-wider text-muted">
            {t("searchLabel")}
          </label>
          <input
            id={searchId}
            type="search"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void fetchVendors()}
            className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-signal/50 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor={typeId} className="mb-1.5 block text-xs font-mono uppercase tracking-wider text-muted">
            {t("typeLabel")}
          </label>
          <select
            id={typeId}
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-signal/50 focus:outline-none sm:w-56"
          >
            <option value="">{t("allTypes")}</option>
            {/* The VALUE stays the canonical enum the API filters on; only the
                label is localized, so translating the UI can never change the query. */}
            {VENDOR_TYPES.map((v) => (
              <option key={v} value={v}>{tt(v)}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={tierId} className="mb-1.5 block text-xs font-mono uppercase tracking-wider text-muted">
            {t("tierLabel")}
          </label>
          <select
            id={tierId}
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-signal/50 focus:outline-none sm:w-44"
          >
            <option value="">{t("allTiers")}</option>
            {VENDOR_TIERS.map((v) => (
              <option key={v} value={v}>{tr(v)}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void fetchVendors()}
          className="ds-focus inline-flex min-h-11 items-center justify-center rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-bg transition-colors hover:bg-signal/90"
        >
          {t("searchSubmit")}
        </button>
      </div>

      {/* Results. aria-live so a filter change is announced rather than silently
          swapping the grid underneath a screen-reader user. */}
      <div aria-live="polite" aria-busy={loading}>
        {loading ? (
          <>
            <span className="sr-only">{t("loading")}</span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 rounded-2xl border border-line bg-surface animate-pulse" aria-hidden="true" />
              ))}
            </div>
          </>
        ) : vendors.length === 0 ? (
          /* Two distinct truths: "your filters matched nothing" and "nothing is
             published yet". Collapsing them into one message misreports an empty
             directory as a failed search. */
          <div className="rounded-2xl border border-line bg-surface px-8 py-16 text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-muted">{t("emptyEyebrow")}</p>
            <p className="mt-3 text-lg font-semibold text-ink">
              {filtered ? t("emptyFiltered") : t("emptyNone")}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
              {filtered ? t("emptyFilteredBody") : t("emptyNoneBody")}
            </p>
            {!filtered && (
              <button
                type="button"
                onClick={() => router.push("/vendors/apply")}
                className="ds-focus mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-signal px-6 py-2.5 text-sm font-semibold text-bg transition-colors hover:bg-signal/90"
              >
                {t("emptyCta")}
                <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="font-mono text-xs text-muted">
              {vendors.length === 1 ? t("resultCountOne") : t("resultCount", { count: vendors.length })}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vendors.map((v) => (
                <VendorCard key={v.id} vendor={v} locale={locale} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
