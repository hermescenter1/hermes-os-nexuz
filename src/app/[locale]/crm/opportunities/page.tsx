import type { Metadata }              from "next";
import { noIndexMetadata }            from "@/lib/seo/metadata";
import { OpportunityPipelineClient }  from "@/components/crm/OpportunityPipelineClient";

export const metadata: Metadata = noIndexMetadata("Pipeline — CRM · Hermes OS");

export default function CrmOpportunitiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">CRM · Pipeline</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Opportunity Pipeline</h2>
        <p className="mt-1 text-sm text-muted">Manage deals from discovery to close across 8 pipeline stages.</p>
      </div>
      <OpportunityPipelineClient />
    </div>
  );
}
