import type { Metadata }           from "next";
import { noIndexMetadata }         from "@/lib/seo/metadata";
import { OpportunityDetailClient } from "@/components/crm/OpportunityDetailClient";

export const metadata: Metadata = noIndexMetadata("Opportunity — CRM · Hermes OS");

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">CRM · Pipeline</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Opportunity Detail</h2>
      </div>
      <OpportunityDetailClient oppId={id} />
    </div>
  );
}
