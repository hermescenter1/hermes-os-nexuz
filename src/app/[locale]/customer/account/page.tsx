import type { Metadata }           from "next";
import { noIndexMetadata }         from "@/lib/seo/metadata";
import { CustomerAccountClient }   from "@/components/customer-portal/CustomerAccountClient";

export const metadata: Metadata = noIndexMetadata("Account — Customer Portal · Hermes OS");

export default function CustomerAccountPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">Account</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Account Details</h2>
      </div>
      <CustomerAccountClient />
    </div>
  );
}
