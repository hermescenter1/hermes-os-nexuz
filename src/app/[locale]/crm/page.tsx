import type { Metadata }        from "next";
import { noIndexMetadata }      from "@/lib/seo/metadata";
import { CrmDashboardClient }   from "@/components/crm/CrmDashboardClient";

export const metadata: Metadata = noIndexMetadata("CRM Dashboard — Hermes OS");

export default function CrmDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">CRM</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Dashboard</h2>
        <p className="mt-1 text-sm text-muted">Pipeline overview, lead funnel, customer health, and revenue forecast.</p>
      </div>
      <CrmDashboardClient />
    </div>
  );
}
