import { noIndexMetadata }              from "@/lib/seo/metadata";
import { getDocumentDashboard }         from "@/lib/document/service";
import { DocumentDashboardClient }      from "@/components/document/DocumentDashboardClient";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("EDMS — Document Management");

export default async function DocumentsDashboardPage() {
  const dashboard = await getDocumentDashboard();
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">EDMS — Document Management</h1>
      <DocumentDashboardClient dashboard={dashboard} />
    </div>
  );
}
