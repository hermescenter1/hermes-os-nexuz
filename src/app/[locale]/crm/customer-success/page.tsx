import type { Metadata }          from "next";
import { noIndexMetadata }        from "@/lib/seo/metadata";
import { CustomerSuccessClient }  from "@/components/crm/CustomerSuccessClient";

export const metadata: Metadata = noIndexMetadata("Customer Success — CRM · Hermes OS");

export default function CustomerSuccessPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">CRM · Customer Success</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Customer Success Center</h2>
        <p className="mt-1 text-sm text-muted">Health monitoring, churn risk, renewal forecasting, expansion opportunities, and CSM assignments.</p>
      </div>
      <CustomerSuccessClient />
    </div>
  );
}
