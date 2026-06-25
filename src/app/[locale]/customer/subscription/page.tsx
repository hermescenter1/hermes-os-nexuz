import type { Metadata }                  from "next";
import { noIndexMetadata }                from "@/lib/seo/metadata";
import { CustomerSubscriptionClient }     from "@/components/customer-portal/CustomerSubscriptionClient";

export const metadata: Metadata = noIndexMetadata("Subscription — Customer Portal · Hermes OS");

export default function CustomerSubscriptionPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">Subscription</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Subscription & Usage</h2>
        <p className="mt-1 text-sm text-muted">Monitor your plan, usage limits, and billing status.</p>
      </div>
      <CustomerSubscriptionClient />
    </div>
  );
}
