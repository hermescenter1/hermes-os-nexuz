import type { Metadata }          from "next";
import { noIndexMetadata }        from "@/lib/seo/metadata";
import { CustomerOverviewClient } from "@/components/customer-portal/CustomerOverviewClient";

export const metadata: Metadata = noIndexMetadata("Overview — Customer Portal · Hermes OS");

export default function CustomerPortalPage() {
  return (
    <div className="space-y-2">
      <p className="font-mono text-xs uppercase tracking-widest text-faint">Overview</p>
      <CustomerOverviewClient />
    </div>
  );
}
