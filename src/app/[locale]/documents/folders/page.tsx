import { noIndexMetadata }  from "@/lib/seo/metadata";
import { getFolders }       from "@/lib/document/service";
import { FolderTreeClient } from "@/components/document/FolderTreeClient";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("Folders — EDMS");

export default async function FoldersPage() {
  const folders = await getFolders();
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">Document Folders ({folders.length})</h1>
      <div className="max-w-sm">
        <FolderTreeClient folders={folders} />
      </div>
    </div>
  );
}
