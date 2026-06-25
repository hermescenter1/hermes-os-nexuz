import type { Metadata }             from "next";
import { noIndexMetadata }           from "@/lib/seo/metadata";
import { CustomerProjectsClient }    from "@/components/customer-portal/CustomerProjectsClient";

export const metadata: Metadata = noIndexMetadata("Projects — Customer Portal · Hermes OS");

export default function CustomerProjectsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">Projects</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Your Projects</h2>
      </div>
      <CustomerProjectsClient />
    </div>
  );
}
