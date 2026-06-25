import { noIndexMetadata }     from "@/lib/seo/metadata";
import { getAuditLog }         from "@/lib/document/service";
import { AuditTimelineClient } from "@/components/document/AuditTimelineClient";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("Audit Trail — EDMS");

export default async function AuditPage() {
  const entries = await getAuditLog();
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">Audit Trail ({entries.length} entries)</h1>
      <AuditTimelineClient entries={entries} />
    </div>
  );
}
