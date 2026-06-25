import type { Metadata }           from "next";
import { noIndexMetadata }         from "@/lib/seo/metadata";
import { CustomerSupportClient }   from "@/components/customer-portal/CustomerSupportClient";

export const metadata: Metadata = noIndexMetadata("Support — Customer Portal · Hermes OS");

export default function CustomerSupportPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">Support</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Support Center</h2>
        <p className="mt-1 text-sm text-muted">Open and manage support requests. Our team typically responds within SLA windows.</p>
      </div>
      <CustomerSupportClient />
    </div>
  );
}
