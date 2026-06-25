import { noIndexMetadata }  from "@/lib/seo/metadata";
import { getCategories }    from "@/lib/document/service";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("Categories — EDMS");

export default async function CategoriesPage() {
  const categories = await getCategories();
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">Document Categories</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {categories.map(cat => (
          <div key={cat.id} className="bg-surface-1 rounded-xl p-4 border border-surface-2">
            <div className="flex items-center gap-2 mb-1">
              {cat.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />}
              <h3 className="font-semibold text-text-primary">{cat.name}</h3>
            </div>
            {cat.description && <p className="text-sm text-text-muted">{cat.description}</p>}
          </div>
        ))}
        {categories.length === 0 && <p className="text-sm text-text-muted">No categories defined.</p>}
      </div>
    </div>
  );
}
