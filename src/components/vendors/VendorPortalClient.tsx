"use client";

import { useEffect, useState } from "react";
import { Link }                from "@/i18n/navigation";

interface VendorProfile {
  id:              string;
  nameEn:          string;
  nameFa:          string;
  status:          string;
  tier:            string;
  complianceStatus: string;
  _count:          { services: number; products: number };
}

export function VendorPortalClient() {
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/vendor/profile")
      .then((r) => r.json())
      .then((d: { profile?: VendorProfile | null }) => setProfile(d.profile ?? null))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-line bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-8 py-16 text-center space-y-4">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Vendor Portal</p>
        <h2 className="text-xl font-bold text-ink">No Vendor Profile Found</h2>
        <p className="text-sm text-muted max-w-sm mx-auto">
          Your application may still be under review, or you have not yet submitted an application to join the Hermes OS Vendor Ecosystem.
        </p>
        <Link
          href="/vendors/apply"
          className="mt-4 inline-flex items-center rounded-lg bg-signal px-6 py-2.5 text-sm font-semibold text-bg hover:bg-signal/90 transition-colors"
        >
          Apply to Become a Partner →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div className="rounded-xl border border-line bg-surface p-6 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted">Vendor Profile</p>
            <h2 className="mt-1 text-xl font-bold text-ink">{profile.nameEn}</h2>
          </div>
          <span className={`rounded border px-3 py-1 text-xs font-mono font-semibold ${
            profile.status === "APPROVED"
              ? "border-signal/30 bg-signal/10 text-signal"
              : "border-amber-400/30 bg-amber-400/10 text-amber-400"
          }`}>
            {profile.status}
          </span>
        </div>
        <div className="flex gap-4 text-sm text-muted">
          <span>Tier: <span className="text-ink font-medium">{profile.tier}</span></span>
          <span>Compliance: <span className="text-ink font-medium">{profile.complianceStatus}</span></span>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Services",    value: profile._count.services },
          { label: "Products",    value: profile._count.products },
          { label: "Tier",        value: profile.tier },
          { label: "Compliance",  value: profile.complianceStatus },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4 text-center">
            <p className="text-xl font-bold text-ink">{value}</p>
            <p className="mt-1 text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Coming soon */}
      <div className="rounded-xl border border-line bg-surface p-6 text-center space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">Coming Soon</p>
        <p className="text-sm text-muted">
          Full profile editing, service management, product catalog, and compliance document uploads are coming in the next phase.
        </p>
        <Link href="/vendors" className="mt-2 inline-block text-sm text-signal hover:underline">
          View your public profile →
        </Link>
      </div>
    </div>
  );
}
