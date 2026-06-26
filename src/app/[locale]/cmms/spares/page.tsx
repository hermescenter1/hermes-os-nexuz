import { getSpareParts }     from "@/lib/cmms/db";
import { SparePartsClient } from "@/components/cmms/SparePartsClient";
import { noIndexMetadata }  from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Spare Parts");
export const dynamic  = "force-dynamic";

export default async function SparesPage() {
  const parts = await getSpareParts();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Spare Parts Inventory</h1>
        <p className="text-muted-foreground text-sm mt-1">Maintenance spare parts catalog, stock levels, and procurement</p>
      </div>
      <SparePartsClient parts={parts} />
    </div>
  );
}
