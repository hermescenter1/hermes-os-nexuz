import type { Metadata }            from "next";
import { noIndexMetadata }          from "@/lib/seo/metadata";
import { CustomerSettingsClient }   from "@/components/customer-portal/CustomerSettingsClient";

export const metadata: Metadata = noIndexMetadata("Settings — Customer Portal · Hermes OS");

export default function CustomerSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">Settings</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Portal Settings</h2>
        <p className="mt-1 text-sm text-muted">Notification preferences, display settings, and privacy controls.</p>
      </div>
      <CustomerSettingsClient />
    </div>
  );
}
