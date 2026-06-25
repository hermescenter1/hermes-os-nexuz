import type { Metadata }     from "next";
import { noIndexMetadata }  from "@/lib/seo/metadata";
import { LeadDetailClient } from "@/components/crm/LeadDetailClient";

export const metadata: Metadata = noIndexMetadata("Lead Detail — CRM · Hermes OS");

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">CRM · Leads</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Lead Profile</h2>
      </div>
      <LeadDetailClient leadId={leadId} />
    </div>
  );
}
