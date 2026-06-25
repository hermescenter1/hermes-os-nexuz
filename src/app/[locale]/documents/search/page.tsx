import { noIndexMetadata }   from "@/lib/seo/metadata";
import { searchDocuments }   from "@/lib/document/service";
import { SearchClient }      from "@/components/document/SearchClient";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("Search — EDMS");

export default async function SearchPage() {
  const initial = await searchDocuments({ page: 1, pageSize: 20 });
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">Search Documents</h1>
      <SearchClient initial={initial} />
    </div>
  );
}
