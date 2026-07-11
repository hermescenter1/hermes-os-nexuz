"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations }                  from "next-intl";
import { track }                            from "@/lib/analytics/events";
import type { VendorListItem, VendorOnboardingRequestItem } from "@/lib/vendors/types";

type Tab = "pending" | "approved" | "rejected";

export function VendorAdminClient() {
  // Named tv (not t): load()'s callback parameter is already `t: Tab`.
  const tv = useTranslations("adminOperations.vendors");
  const [tab,      setTab]      = useState<Tab>("pending");
  const [requests, setRequests] = useState<VendorOnboardingRequestItem[]>([]);
  const [vendors,  setVendors]  = useState<VendorListItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/vendors?tab=${t}`);
      const data = await res.json() as {
        requests?: VendorOnboardingRequestItem[];
        vendors?:  VendorListItem[];
      };
      setRequests(data.requests ?? []);
      setVendors(data.vendors   ?? []);
    } catch {
      setError(tv("loadError"));
    } finally {
      setLoading(false);
    }
  }, [tv]);

  useEffect(() => { void load(tab); }, [tab, load]);

  async function approve(id: string) {
    setActing(id);
    try {
      const res = await fetch(`/api/admin/vendors/${id}/approve`, { method: "POST" });
      if (res.ok) {
        track.vendorAdminApproved(id);
        void load(tab);
      }
    } finally { setActing(null); }
  }

  async function reject(id: string) {
    const reason = window.prompt(tv("rejectPrompt"));
    setActing(id);
    try {
      const res = await fetch(`/api/admin/vendors/${id}/reject`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ reason: reason ?? "" }),
      });
      if (res.ok) {
        track.vendorAdminRejected(id);
        void load(tab);
      }
    } finally { setActing(null); }
  }

  async function updateStatus(id: string, status: string) {
    setActing(id);
    try {
      await fetch(`/api/admin/vendors/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status }),
      });
      void load(tab);
    } finally { setActing(null); }
  }

  const df = new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-line pb-0">
        {(["pending", "approved", "rejected"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? "border-signal text-signal"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t === "pending" ? tv("tabPending") : t === "approved" ? tv("tabApproved") : tv("tabRejected")}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl border border-line bg-surface animate-pulse" />
          ))}
        </div>
      ) : tab === "pending" || tab === "rejected" ? (
        requests.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-sm text-muted">
            {tab === "pending" ? tv("noPending") : tv("noRejected")}
          </p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="rounded-xl border border-line bg-surface p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1 min-w-0">
                    <p className="font-semibold text-ink">{r.companyNameEn}</p>
                    <p className="text-xs text-muted">{r.contactEmail} · {r.vendorType.replace(/_/g, " ")}</p>
                    {r.headquartersCity && <p className="text-xs text-muted">{r.headquartersCity}, {r.headquartersCountry}</p>}
                    {r.companyDescEn && (
                      <p className="text-xs text-muted/80 line-clamp-2 mt-1">{r.companyDescEn}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {r.servicesOffered.slice(0, 4).map((s) => (
                        <span key={s} className="rounded-full border border-line px-2 py-0.5 text-[10px] text-muted">{s}</span>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted/60 mt-1" dir="ltr">
                      {tv("submitted", { date: df.format(new Date(r.createdAt)) })}
                    </p>
                  </div>
                  {tab === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        disabled={acting === r.id}
                        onClick={() => approve(r.id)}
                        className="rounded-lg bg-signal px-4 py-2 text-xs font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50"
                      >
                        {acting === r.id ? "…" : tv("approve")}
                      </button>
                      <button
                        disabled={acting === r.id}
                        onClick={() => reject(r.id)}
                        className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-400/20 transition-colors disabled:opacity-50"
                      >
                        {tv("reject")}
                      </button>
                    </div>
                  )}
                  {tab === "rejected" && r.rejectionReason && (
                    <div className="shrink-0 max-w-xs rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2">
                      <p className="text-xs text-red-400/80">{r.rejectionReason}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        vendors.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-sm text-muted">
            {tv("noApproved")}
          </p>
        ) : (
          <div className="space-y-3">
            {vendors.map((v) => (
              <div key={v.id} className="rounded-xl border border-line bg-surface p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-ink">{v.nameEn}</p>
                      <span className="rounded border border-signal/30 bg-signal/10 px-2 py-0.5 text-[10px] font-mono text-signal">
                        {v.tier}
                      </span>
                      {v.isVerified && (
                        <span className="text-xs text-signal">{tv("verified")}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted">{v.vendorType.replace(/_/g, " ")} · {v.complianceStatus}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      disabled={acting === v.id}
                      onClick={() => updateStatus(v.id, v.status === "APPROVED" ? "SUSPENDED" : "APPROVED")}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-ink hover:border-signal/30 transition-colors disabled:opacity-50"
                    >
                      {v.status === "SUSPENDED" ? tv("reinstate") : tv("suspend")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
