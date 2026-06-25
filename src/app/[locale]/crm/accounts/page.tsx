import type { Metadata }     from "next";
import { noIndexMetadata }  from "@/lib/seo/metadata";
import { AccountListClient } from "@/components/crm/AccountListClient";

export const metadata: Metadata = noIndexMetadata("Accounts — CRM · Hermes OS");

export default function CrmAccountsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">CRM · Accounts</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Account Management</h2>
        <p className="mt-1 text-sm text-muted">All CRM accounts with health scores, deal activity, and tier classification.</p>
      </div>
      <AccountListClient />
    </div>
  );
}
