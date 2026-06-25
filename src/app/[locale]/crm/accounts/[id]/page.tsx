import type { Metadata }        from "next";
import { noIndexMetadata }     from "@/lib/seo/metadata";
import { AccountDetailClient } from "@/components/crm/AccountDetailClient";

export const metadata: Metadata = noIndexMetadata("Account — CRM · Hermes OS");

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">CRM · Accounts</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Account Profile</h2>
      </div>
      <AccountDetailClient accountId={id} />
    </div>
  );
}
