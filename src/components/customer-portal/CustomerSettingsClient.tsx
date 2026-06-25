"use client";

import { useEffect, useState } from "react";
import { Link }                from "@/i18n/navigation";
import type { CustomerPortalPreference } from "@/lib/customer-portal/types";

export function CustomerSettingsClient() {
  const [prefs, setPrefs]         = useState<CustomerPortalPreference | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [noAccount, setNoAccount] = useState(false);

  useEffect(() => {
    fetch("/api/customer/settings")
      .then((r) => r.json())
      .then((d: { preference?: CustomerPortalPreference | null; noAccount?: boolean }) => {
        if (d.noAccount) { setNoAccount(true); return; }
        setPrefs(d.preference ?? {
          id: "", accountId: "", userId: null,
          language: "en", timezone: "Asia/Tehran",
          emailNotifications: true, ticketUpdates: true,
          projectUpdates: true, documentAlerts: true, marketingEmails: false,
        } as CustomerPortalPreference);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!prefs) return;
    setSaving(true);
    try {
      const r = await fetch("/api/customer/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language:           prefs.language,
          timezone:           prefs.timezone,
          emailNotifications: prefs.emailNotifications,
          ticketUpdates:      prefs.ticketUpdates,
          projectUpdates:     prefs.projectUpdates,
          documentAlerts:     prefs.documentAlerts,
          marketingEmails:    prefs.marketingEmails,
        }),
      });
      if (r.ok) {
        const d = await r.json() as { preference?: CustomerPortalPreference };
        if (d.preference) setPrefs(d.preference);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  function Toggle({ label, field }: { label: string; field: keyof CustomerPortalPreference }) {
    const val = prefs ? Boolean(prefs[field]) : false;
    return (
      <label className="flex items-center justify-between py-3 cursor-pointer">
        <span className="text-sm text-ink">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={val}
          onClick={() => prefs && setPrefs({ ...prefs, [field]: !val })}
          className={`relative h-6 w-11 rounded-full border transition-colors ${
            val ? "border-signal bg-signal" : "border-line bg-surface-2"
          }`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg transition-transform ${val ? "left-5" : "left-0.5"}`} />
        </button>
      </label>
    );
  }

  if (loading) return <div className="h-64 rounded-xl border border-line bg-surface animate-pulse" />;

  if (noAccount || !prefs) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center">
        <h2 className="text-lg font-bold text-ink">No Account Found</h2>
        <p className="mt-2 text-sm text-muted">Settings require an active customer portal account.</p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
      {/* Notification preferences */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-faint mb-4">Notification Preferences</p>
        <div className="divide-y divide-line">
          <Toggle label="Email Notifications"          field="emailNotifications" />
          <Toggle label="Ticket Status Updates"        field="ticketUpdates" />
          <Toggle label="Project Progress Updates"     field="projectUpdates" />
          <Toggle label="New Document Alerts"          field="documentAlerts" />
          <Toggle label="Marketing & Product Updates"  field="marketingEmails" />
        </div>
      </div>

      {/* Portal preferences */}
      <div className="rounded-xl border border-line bg-surface p-6 space-y-4">
        <p className="font-mono text-xs uppercase tracking-widest text-faint">Portal Preferences</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-faint block mb-1">Language</label>
            <select
              value={prefs.language}
              onChange={(e) => setPrefs({ ...prefs, language: e.target.value })}
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink focus:border-signal focus:outline-none"
            >
              <option value="en">English</option>
              <option value="fa">Persian (فارسی)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-faint block mb-1">Timezone</label>
            <select
              value={prefs.timezone}
              onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink focus:border-signal focus:outline-none"
            >
              <option value="Asia/Tehran">Asia/Tehran (IRST)</option>
              <option value="UTC">UTC</option>
              <option value="Europe/London">Europe/London</option>
              <option value="America/New_York">America/New_York</option>
            </select>
          </div>
        </div>
      </div>

      {/* Privacy links */}
      <div className="rounded-xl border border-line bg-surface p-6 space-y-3">
        <p className="font-mono text-xs uppercase tracking-widest text-faint">Privacy & Compliance</p>
        <div className="flex flex-col gap-2 text-sm">
          <Link href="/cookies"      className="text-signal hover:underline">Manage Cookie Preferences</Link>
          <Link href="/privacy"      className="text-muted hover:text-ink hover:underline">Privacy Policy</Link>
          <Link href="/data-request" className="text-muted hover:text-ink hover:underline">Submit a Data Request (GDPR)</Link>
          <Link href="/gdpr"         className="text-muted hover:text-ink hover:underline">GDPR Rights Center</Link>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-signal px-6 py-2.5 text-sm font-semibold text-bg disabled:opacity-50 hover:bg-signal/90 transition-colors"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {saved && <p className="text-sm text-signal">Settings saved.</p>}
      </div>
    </form>
  );
}
