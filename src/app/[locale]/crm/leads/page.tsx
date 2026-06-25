import type { Metadata }    from "next";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { LeadListClient }  from "@/components/crm/LeadListClient";

export const metadata: Metadata = noIndexMetadata("Leads — CRM · Hermes OS");

export default function CrmLeadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">CRM · Leads</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Lead Management</h2>
        <p className="mt-1 text-sm text-muted">Track, qualify, and convert inbound leads.</p>
      </div>
      <LeadListClient />
    </div>
  );
}
