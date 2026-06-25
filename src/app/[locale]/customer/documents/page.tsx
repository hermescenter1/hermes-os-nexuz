import type { Metadata }             from "next";
import { noIndexMetadata }           from "@/lib/seo/metadata";
import { CustomerDocumentsClient }   from "@/components/customer-portal/CustomerDocumentsClient";

export const metadata: Metadata = noIndexMetadata("Documents — Customer Portal · Hermes OS");

export default function CustomerDocumentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">Documents</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Document Library</h2>
        <p className="mt-1 text-sm text-muted">All documents shared by Hermes OS with your organization.</p>
      </div>
      <CustomerDocumentsClient />
    </div>
  );
}
