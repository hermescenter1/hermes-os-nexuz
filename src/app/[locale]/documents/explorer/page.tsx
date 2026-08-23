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
      {/*
        PHASE 107 STAGE 6-B — this layout had no small-screen behaviour at all.

        `flex` + `w-56 shrink-0` + `flex-1` is a desktop two-column layout with
        no breakpoint: at 390px the folder tree held its full 224px, the gap took
        24px, and the explorer column could not shrink below its content because
        a flex item's `min-width` defaults to `auto`. The document scrolled to
        ~641px — a 251px horizontal overflow, the largest in the estate, and the
        reason four interactive links sat entirely outside the document where a
        keyboard could still reach them.

        Below `md` the two panes stack, so the tree takes the full width and the
        explorer starts at the viewport edge. From `md` up the original
        proportions are unchanged. `min-w-0` lets the explorer column actually
        shrink rather than pushing the page wider — without it the breakpoint
        alone would not have been enough.
      */}
      <div className="flex flex-col gap-6 md:flex-row">
        <div className="w-full md:w-56 md:shrink-0">
          <FolderTreeClient folders={folders} />
        </div>
        <div className="min-w-0 flex-1">
          <DocumentExplorerClient documents={documents} folders={folders} />
        </div>
      </div>
    </div>
  );
}
