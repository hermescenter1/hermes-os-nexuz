"use client";

import { TRACKED_EVENTS } from "@/lib/analytics/events";

interface AnalyticsStats {
  gaConfigured:   boolean;
  gtmConfigured:  boolean;
  measurementId:  string;
  containerId:    string;
  eventsCount:    number;
  privacyMode:    string;
  cspUpdated:     boolean;
  consentGated:   boolean;
  gdprCompliant:  boolean;
}

interface AnalyticsDashboardClientProps {
  stats:  AnalyticsStats;
  labels: Record<string, string>;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-ink tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function StatusChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium ${
      ok
        ? "border-signal/20 bg-signal/5 text-signal"
        : "border-amber-400/20 bg-amber-400/5 text-amber-400"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-signal" : "bg-amber-400"}`} />
      {label}
    </span>
  );
}

export function AnalyticsDashboardClient({ stats, labels }: AnalyticsDashboardClientProps) {
  const maskedGa  = stats.measurementId ? `G-••••••${stats.measurementId.slice(-4)}` : labels.notConfigured ?? "Not Configured";
  const maskedGtm = stats.containerId   ? `GTM-••••${stats.containerId.slice(-4)}`   : labels.notConfigured ?? "Not Configured";

  return (
    <div className="space-y-8">

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label={labels.ga4Status    ?? "GA4 Status"}
          value={stats.gaConfigured  ? (labels.configured ?? "Configured") : (labels.notConfigured ?? "Not Configured")}
          sub={stats.gaConfigured    ? maskedGa : undefined}
        />
        <StatCard
          label={labels.gtmStatus    ?? "GTM Status"}
          value={stats.gtmConfigured ? (labels.configured ?? "Configured") : (labels.notConfigured ?? "Not Configured")}
          sub={stats.gtmConfigured   ? maskedGtm : undefined}
        />
        <StatCard
          label={labels.eventsTracked ?? "Events Tracked"}
          value={stats.eventsCount}
          sub="custom + standard"
        />
        <StatCard
          label={labels.privacyMode ?? "Privacy Mode"}
          value={stats.privacyMode}
        />
      </div>

      {/* Feature flags */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
          {labels.complianceFeatures ?? "Compliance & Privacy Features"}
        </h2>
        <div className="flex flex-wrap gap-3">
          <StatusChip label={`${labels.consentGated ?? "Consent-Gated"} — ${stats.consentGated ? (labels.active ?? "Active") : (labels.inactive ?? "Inactive")}`} ok={stats.consentGated} />
          <StatusChip label={`${labels.gdprCompliant ?? "GDPR Compliant"} — ${stats.gdprCompliant ? (labels.active ?? "Active") : (labels.inactive ?? "Inactive")}`} ok={stats.gdprCompliant} />
          <StatusChip label={`${labels.noPii ?? "No PII Collection"} — ${labels.active ?? "Active"}`} ok={true} />
          <StatusChip label={`${labels.cspUpdated ?? "CSP Updated"} — ${stats.cspUpdated ? (labels.active ?? "Active") : (labels.inactive ?? "Inactive")}`} ok={stats.cspUpdated} />
          <StatusChip label={`${labels.anonymous ?? "Anonymous Only"} — ${labels.active ?? "Active"}`} ok={true} />
        </div>
      </div>

      {/* Integration IDs */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
          {labels.integrationConfig ?? "Integration Configuration"}
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted">{labels.measurementId ?? "GA4 Measurement ID"}</span>
            <span className={`font-mono text-xs ${stats.gaConfigured ? "text-signal" : "text-muted"}`}>
              {maskedGa}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted">{labels.containerId ?? "GTM Container ID"}</span>
            <span className={`font-mono text-xs ${stats.gtmConfigured ? "text-signal" : "text-muted"}`}>
              {maskedGtm}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted">{labels.consentApi ?? "Consent API"}</span>
            <span className="font-mono text-xs text-signal">/api/compliance/cookie-consent</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted">{labels.consentEvent ?? "Consent Event"}</span>
            <span className="font-mono text-xs text-signal">hermes:consent-updated</span>
          </div>
        </div>
      </div>

      {/* Event catalog */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
          {labels.eventCatalog ?? "Tracked Event Catalog"}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <th className="pb-2 text-start">{labels.eventName ?? "Event"}</th>
                <th className="pb-2 text-start">{labels.eventDesc ?? "Description"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {TRACKED_EVENTS.map(({ event, description }) => (
                <tr key={event}>
                  <td className="py-2 font-mono text-xs text-signal whitespace-nowrap">{event}</td>
                  <td className="py-2 text-xs text-muted">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Setup guide */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
          {labels.setupGuide ?? "Setup Guide"}
        </h2>
        <div className="space-y-2 font-mono text-xs text-muted">
          <p><span className="text-signal">NEXT_PUBLIC_GA_MEASUREMENT_ID</span>=G-XXXXXXXXXX</p>
          <p><span className="text-signal">NEXT_PUBLIC_GTM_ID</span>=GTM-XXXXXXX</p>
        </div>
        <p className="mt-4 text-xs text-muted">
          {labels.setupNote ?? "Add these to your .env.local or deployment environment. Analytics automatically enables when either variable is set. See docs/analytics.md for full documentation."}
        </p>
      </div>

    </div>
  );
}
