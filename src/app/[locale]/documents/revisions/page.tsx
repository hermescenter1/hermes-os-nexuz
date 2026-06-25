import { noIndexMetadata }      from "@/lib/seo/metadata";
import { getRevisions }         from "@/lib/document/service";
import { RevisionHistoryClient } from "@/components/document/RevisionHistoryClient";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("Revisions — EDMS");

export default async function RevisionsPage() {
  const revisions = await getRevisions();
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">Revision History ({revisions.length})</h1>
      <RevisionHistoryClient revisions={revisions} />
    </div>
  );
}
