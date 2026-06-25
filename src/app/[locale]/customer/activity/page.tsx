import type { Metadata }            from "next";
import { noIndexMetadata }          from "@/lib/seo/metadata";
import { CustomerActivityClient }   from "@/components/customer-portal/CustomerActivityClient";

export const metadata: Metadata = noIndexMetadata("Activity — Customer Portal · Hermes OS");

export default function CustomerActivityPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">Activity</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Activity Log</h2>
        <p className="mt-1 text-sm text-muted">A chronological log of all actions performed in your customer portal.</p>
      </div>
      <CustomerActivityClient />
    </div>
  );
}
