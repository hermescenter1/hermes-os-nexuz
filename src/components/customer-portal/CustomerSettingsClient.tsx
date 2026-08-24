"use client";

// PHASE 107 STAGE 6-A — two invisible failures closed here.
//   1. The load fed an error body into the form, so a signed-out user was told
//      "No Account Found" instead of being asked to sign in.
//   2. The save checked `r.ok` but did nothing when it was false, and its catch
//      was empty. A rejected save looked exactly like a successful one, except
//      the confirmation never appeared — the worst possible outcome for a write.
// The PATCH body, the endpoint and the default preferences are unchanged.

import { useEffect, useState } from "react";
import { Link }                from "@/i18n/navigation";
import type { CustomerPortalPreference } from "@/lib/customer-portal/types";
import { ResourceFailureNotice, useResourceFailureCopy } from "@/components/ui/ResourceFailureNotice";
import { useResource } from "@/lib/client/use-resource";
import { requestJson, ResourceRequestError, type ResourceFailureCode } from "@/lib/client/resource-request";

/** Used when the account exists but has never stored a preference row. */
const DEFAULT_PREFERENCE = {
  id: "", accountId: "", userId: null,
  language: "en", timezone: "Asia/Tehran",
  emailNotifications: true, ticketUpdates: true,
  projectUpdates: true, documentAlerts: true, marketingEmails: false,
} as CustomerPortalPreference;

/** A short, localized line beside the save button. */
function SaveFailure({ code }: { code: ResourceFailureCode }) {
  const { title } = useResourceFailureCopy(code);
  return <p role="alert" className="text-sm text-status-danger">{title}</p>;
}

export function CustomerSettingsClient() {
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [saveFailure, setSaveFailure]   = useState<ResourceFailureCode | null>(null);

  const prefsState = useResource<CustomerPortalPreference | null>(
    (signal) => requestJson(
      "/api/customer/settings",
      (body) => {
        /*
         * PHASE 107 STAGE 6-A.2 — ABSENT is not the same as NULL.
         *
         * `d.preference ?? DEFAULT_PREFERENCE` turned a 2xx body that mentions
         * no preference at all into a full set of default settings. The reader
         * then saw a populated, editable form built from nothing the server
         * sent, and saving it would have written those invented values back.
         *
         * The route's contract (src/app/api/customer/settings/route.ts) has
         * exactly two success shapes, and both are honoured here:
         *   { preference: null, noAccount: true }  — no portal account
         *   { preference }                         — may itself be null
         * Anything else is a broken contract, and `undefined` makes
         * `requestJson` raise FAILED rather than invent data.
         */
        if (!body || typeof body !== "object") return undefined;
        const d = body as { preference?: CustomerPortalPreference | null; noAccount?: boolean };

        /*
         * PHASE 107 STAGE 6-A.3 — the PRESENCE CHECK COMES FIRST.
         *
         * This previously accepted `d.noAccount` before proving that the
         * documented `preference` key existed at all, so a malformed
         * `200 {"noAccount": true}` short-circuited to `null` and the reader was
         * shown a confident "No Account Found" — a statement about their
         * account derived from a body that never described it.
         *
         * Both documented success envelopes carry `preference`:
         *     { preference: null, noAccount: true }   no portal account
         *     { preference }                          may itself be null
         * so its absence is a broken contract in EVERY shape, and checking it
         * first is what makes that true for the no-account path too.
         */
        if (!("preference" in d)) return undefined;

        // The API's own "this org has no portal account" signal.
        if (d.noAccount) return null;

        // Present but null IS legitimate: the account exists with no saved row
        // yet, and seeding the form with defaults is the intended behaviour.
        return d.preference ?? DEFAULT_PREFERENCE;
      },
      { signal },
    ),
    [],
  );

  // The form is editable, so the loaded record seeds a local draft rather than
  // being rendered directly.
  const [prefs, setPrefs] = useState<CustomerPortalPreference | null>(null);
  useEffect(() => { setPrefs(prefsState.data); }, [prefsState.data]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!prefs) return;
    setSaving(true);
    setSaveFailure(null);
    try {
      const updated = await requestJson<CustomerPortalPreference>(
        "/api/customer/settings",
        /*
         * PHASE 107 STAGE 6-A.2 — a save is confirmed by what came BACK.
         *
         * This read `.preference ?? null`, and the caller then ran
         * `if (updated) setPrefs(updated); setSaved(true);` unconditionally. A
         * 2xx carrying no preference — a proxy's empty 200, a truncated body,
         * a route regression — therefore showed "Saved" for a write nobody
         * could confirm had happened, which is the one lie a settings form
         * must never tell.
         *
         * The route returns the upserted record on every success, so requiring
         * a real object here matches the contract exactly. `undefined` raises
         * FAILED, and the existing `SaveFailure` line renders in place.
         */
        (body) => {
          if (!body || typeof body !== "object") return undefined;
          const d = body as { preference?: CustomerPortalPreference | null };
          if (!d.preference || typeof d.preference !== "object") return undefined;
          return d.preference;
        },
        {
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
        },
      );
      // `updated` is now guaranteed non-null by the selector above; a response
      // that failed to carry the saved record never reaches this line.
      setPrefs(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      // A save that did not happen must never look like one that did.
      setSaveFailure(error instanceof ResourceRequestError ? error.code : "FAILED");
    } finally {
      setSaving(false);
    }
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

  if (prefsState.status === "LOADING") return <div data-async-state="loading" className="h-64 rounded-xl border border-line bg-surface animate-pulse" />;

  if (prefsState.status === "ERROR" && prefsState.failure) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <ResourceFailureNotice code={prefsState.failure} onRetry={prefsState.retry} />
      </div>
    );
  }

  if (!prefs) {
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
        <p className="font-mono text-xs uppercase tracking-widest text-metadata mb-4">Notification Preferences</p>
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
        <p className="font-mono text-xs uppercase tracking-widest text-metadata">Portal Preferences</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-metadata block mb-1">Language</label>
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
            <label className="text-xs text-metadata block mb-1">Timezone</label>
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
        <p className="font-mono text-xs uppercase tracking-widest text-metadata">Privacy & Compliance</p>
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
        {saveFailure && <SaveFailure code={saveFailure} />}
      </div>
    </form>
  );
}
