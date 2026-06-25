import { noIndexMetadata }           from "@/lib/seo/metadata";
import { getDocuments, getFolders }  from "@/lib/document/service";
import { DocumentExplorerClient }    from "@/components/document/DocumentExplorerClient";
import { FolderTreeClient }          from "@/components/document/FolderTreeClient";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("Document Explorer — EDMS");

export default async function ExplorerPage() {
  const [documents, folders] = await Promise.all([getDocuments({}), getFolders()]);
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">Document Explorer</h1>
      <div className="flex gap-6">
        <div className="w-56 shrink-0">
          <FolderTreeClient folders={folders} />
        </div>
        <div className="flex-1">
          <DocumentExplorerClient documents={documents} folders={folders} />
        </div>
      </div>
    </div>
  );
}
